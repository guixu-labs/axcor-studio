import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  base: './',
  // Forge packages the repository's .vite directory. Vite resolves relative
  // output paths against the renderer root (src).
  build: { outDir: path.resolve(__dirname, '.vite/renderer/main_window') },
  plugins: [react()],
});
