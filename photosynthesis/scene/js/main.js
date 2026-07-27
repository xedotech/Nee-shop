// Renderer, post chain and the deterministic frame clock.
//
// The page exposes window.renderFrame(seconds) so the offline renderer can
// step the film frame by frame; with no renderer attached it just plays in
// real time for previewing.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildStory, DURATION } from './story.js';
import { makeUiCamera, STAGE_W, STAGE_H } from './ui.js';

const WIDTH = Number(new URLSearchParams(location.search).get('w')) || 1920;
const HEIGHT = Number(new URLSearchParams(location.search).get('h')) || 1080;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.94;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, WIDTH / HEIGHT, 0.1, 2000);

const uiScene = new THREE.Scene();
const uiCamera = makeUiCamera();

const composer = new EffectComposer(renderer);
composer.setSize(WIDTH, HEIGHT);

composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(new THREE.Vector2(WIDTH, HEIGHT), 0.42, 0.55, 0.80);
composer.addPass(bloom);

const output = new OutputPass();
composer.addPass(output);

// Typography goes on after tone mapping so it stays crisp and unbloomed.
const uiPass = new RenderPass(uiScene, uiCamera);
uiPass.clear = false;
uiPass.clearDepth = true;
composer.addPass(uiPass);

// Final grade: vignette, a breath of grain, and a hair of chromatic drift.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.88 },
    uGrain: { value: 0.014 },
    uAberration: { value: 0.0006 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);

      vec2 dir = c * uAberration * (0.35 + r2 * 2.4);
      vec4 col;
      col.r = texture2D(tDiffuse, vUv + dir).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - dir).b;
      col.a = 1.0;

      float vig = 1.0 - uVignette * r2 * (0.72 + r2 * 0.55);
      col.rgb *= clamp(vig, 0.0, 1.0);

      float g = hash(vUv * vec2(1920.0, 1080.0) + uTime * 71.3) - 0.5;
      col.rgb += g * uGrain * (0.35 + 0.65 * (1.0 - length(col.rgb) * 0.4));

      gl_FragColor = col;
    }
  `,
};
const grade = new ShaderPass(GradeShader);
grade.renderToScreen = true;
composer.addPass(grade);

const story = buildStory({ scene, uiScene, camera, uiCamera });

function renderFrame(t) {
  const clamped = Math.max(0, Math.min(DURATION, t));
  grade.uniforms.uTime.value = clamped;
  story.update(clamped);
  camera.aspect = WIDTH / HEIGHT;
  camera.updateProjectionMatrix();
  composer.render();
}

window.renderFrame = renderFrame;
window.FILM = { duration: DURATION, width: WIDTH, height: HEIGHT, stage: [STAGE_W, STAGE_H] };

// Wait for the type to be available before anything is rasterised, otherwise
// the first frames would bake a fallback font into the canvas textures.
async function boot() {
  const weights = [200, 300, 400, 500, 600, 700];
  await Promise.all(weights.map((w) => document.fonts.load(`${w} 64px Inter`)));
  await document.fonts.ready;
  renderFrame(0);
  window.__ready = true;
}
boot();

// Live preview when opened by hand.
const preview = new URLSearchParams(location.search).has('play');
if (preview) {
  const t0 = performance.now();
  const loop = () => {
    const t = ((performance.now() - t0) / 1000) % DURATION;
    if (window.__ready) renderFrame(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
