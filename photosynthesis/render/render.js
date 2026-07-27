#!/usr/bin/env node
// Offline renderer: drives the scene one deterministic frame at a time in
// headless Chromium and pipes JPEGs straight into ffmpeg, so nothing large
// ever touches the disk.
//
//   node render/render.js --out out/video.mp4
//   node render/render.js --stills 0.5,12,34 --width 960 --height 540

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SCENE = '/photosynthesis/scene/index.html';

function requirePlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    const globalPath = '/opt/node22/lib/node_modules/playwright';
    return require(globalPath);
  }
}

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const candidates = [
    '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2',
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return 'ffmpeg';
}

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[k] = v;
    }
  }
  return out;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.png': 'image/png',
};

function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(root, path.normalize(url).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  const a = args();
  const width = Number(a.width || 1920);
  const height = Number(a.height || 1080);
  const fps = Number(a.fps || 30);
  const quality = Number(a.quality || 94);
  // --out is relative to where you ran the command, not the repo root.
  const outFile = path.resolve(process.cwd(), a.out || 'photosynthesis/out/video.mp4');

  const { chromium } = requirePlaywright();
  const { server, port } = await serve(ROOT);

  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-lcd-text',
      '--force-color-profile=srgb',
      '--hide-scrollbars',
      '--mute-audio',
    ],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('[page]', m.text());
  });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));

  const url = `http://127.0.0.1:${port}${SCENE}?w=${width}&h=${height}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });

  const film = await page.evaluate(() => window.FILM);
  const duration = Number(a.duration || film.duration);

  const grab = async (t, type, q) =>
    page.evaluate(
      ([time, mime, qq]) => {
        window.renderFrame(time);
        const c = document.querySelector('canvas');
        return c.toDataURL(mime, qq);
      },
      [t, type, q]
    );

  // ---- stills mode: quick look at chosen moments -------------------------
  if (a.stills) {
    const dir = path.resolve(ROOT, 'photosynthesis/out/stills');
    // stills always land in the project's out/ so previews are easy to find
    fs.mkdirSync(dir, { recursive: true });
    for (const s of a.stills.split(',')) {
      const t = Number(s);
      const data = await grab(t, 'image/png', 1);
      const file = path.join(dir, `t${t.toFixed(2)}.png`);
      fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
      console.log('still', file);
    }
    await browser.close();
    server.close();
    return;
  }

  // ---- full render -------------------------------------------------------
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const total = Math.round(duration * fps);
  const ff = spawn(
    ffmpegPath(),
    [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'image2pipe',
      '-framerate', String(fps),
      '-i', '-',
      '-an',
      '-c:v', 'libx264',
      '-preset', a.preset || 'slow',
      '-crf', a.crf || '20',
      '-pix_fmt', 'yuv420p',
      '-profile:v', 'high',
      '-level', '4.2',
      '-movflags', '+faststart',
      outFile,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] }
  );

  const done = new Promise((resolve, reject) => {
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code))));
    ff.on('error', reject);
  });

  const started = Date.now();
  for (let i = 0; i < total; i++) {
    const t = i / fps;
    const data = await grab(t, 'image/jpeg', quality / 100);
    const buf = Buffer.from(data.split(',')[1], 'base64');
    if (!ff.stdin.write(buf)) {
      await new Promise((r) => ff.stdin.once('drain', r));
    }
    if (i % 60 === 0 || i === total - 1) {
      const el = (Date.now() - started) / 1000;
      const rate = (i + 1) / el;
      process.stdout.write(
        `\rframe ${i + 1}/${total}  ${(100 * (i + 1)) / total | 0}%  ${rate.toFixed(1)} fps  eta ${(
          (total - i - 1) /
          Math.max(rate, 0.01)
        ).toFixed(0)}s   `
      );
    }
  }
  process.stdout.write('\n');
  ff.stdin.end();
  await done;

  await browser.close();
  server.close();
  console.log('wrote', outFile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
