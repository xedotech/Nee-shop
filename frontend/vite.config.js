/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // This proxies API requests to the backend, useful for development
    // when the backend is running on a different port.
    // The lovable.dev environment might handle this differently.
    proxy: {
      '/api': 'http://localhost:3001' // Assuming backend runs on 3001
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.js',
  }
})
