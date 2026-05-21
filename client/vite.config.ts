/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // Post-build: copia index.html → 404.html en el outDir para que GitHub
    // Pages sirva el SPA cuando el usuario llega directo a /game/XYZ.
    // (GitHub Pages no tiene SPA fallback nativo; el truco del 404 es
    //  estándar — la página 404 sirve el SPA y React Router maneja la ruta.)
    {
      name: 'copy-index-to-404',
      closeBundle() {
        const outDir = path.resolve(__dirname, '../docs');
        const indexHtml = path.join(outDir, 'index.html');
        const notFoundHtml = path.join(outDir, '404.html');
        if (existsSync(indexHtml)) {
          copyFileSync(indexHtml, notFoundHtml);
        }
      },
    },
  ],
  // En producción servimos bajo /olympus-protocol/ (GitHub Pages).
  // En dev (vite serve) usamos / normal.
  base: command === 'build' ? '/olympus-protocol/' : '/',
  build: {
    // Build output en la raíz del repo /docs (configurable como source en
    // GitHub Pages: Settings → Pages → Source: main branch /docs).
    outDir: '../docs',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@server': path.resolve(__dirname, './src/server-logic'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@services': path.resolve(__dirname, './src/services'),
      '@store': path.resolve(__dirname, './src/store'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
}));
