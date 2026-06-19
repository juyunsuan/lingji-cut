import { defineConfig } from 'electron-vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'node:fs';

// Plugin: copy stealth.min.js into dist-electron/ so that
// electron/publish/stealth.ts can resolve it at runtime via __dirname.
function copyStealthPlugin() {
  return {
    name: 'copy-stealth-min-js',
    closeBundle() {
      mkdirSync('dist-electron', { recursive: true });
      copyFileSync(
        resolve('electron/publish/stealth.min.js'),
        resolve('dist-electron/stealth.min.js'),
      );
    },
  };
}

export default defineConfig({
  main: {
    plugins: [copyStealthPlugin()],
    build: {
      outDir: 'dist-electron',
      emptyOutDir: false,
      lib: {
        entry: resolve('electron/main.ts'),
        formats: ['cjs'],
        fileName: () => 'main.js',
      },
      rollupOptions: {
        external: ['zod'],
      },
    },
  },
  preload: {
    build: {
      outDir: 'dist-electron',
      emptyOutDir: false,
      lib: {
        entry: resolve('electron/preload.ts'),
        formats: ['cjs'],
        fileName: () => 'preload.js',
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [react(), tailwindcss()],
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: resolve('index.html'),
      },
    },
  },
});
