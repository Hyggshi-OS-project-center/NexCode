import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
        about: resolve(__dirname, 'src/renderer/about.html'),
        easterEgg: resolve(__dirname, 'src/renderer/easterEgg.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@modules': resolve(__dirname, 'src/renderer/modules'),
      '@icons': resolve(__dirname, 'src/icons'),
    },
  },
  optimizeDeps: {
    include: ['monaco-editor'],
  },
});
