import { defineConfig } from 'electron-vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    build: {
      outDir: 'dist-electron',
      lib: {
        entry: resolve('electron/main.ts'),
        formats: ['cjs'],
        fileName: () => 'main.js',
      },
      rollupOptions: {
        external: ['@remotion/renderer', '@remotion/bundler'],
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
