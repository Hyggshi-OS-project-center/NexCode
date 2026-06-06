import { defineConfig } from 'vite';
import { resolve } from 'path';

const isDev = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER === '1';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: isDev ? '/' : './',
  server: isDev
    ? {
        host: '127.0.0.1',
        port: 5173,
        strictPort: false,
        hmr: {
          port: 24678,
        },
      }
    : undefined,
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
        about: resolve(__dirname, 'src/renderer/about.html'),
        easterEgg: resolve(__dirname, 'src/renderer/easterEgg.html'),
      },
    },
  },
  esbuild: {
    target: 'es2022',
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@modules': resolve(__dirname, 'src/renderer/modules'),
      '@icons': resolve(__dirname, 'src/icons'),
    },
  },
  optimizeDeps: {
    include: ['monaco-editor', 'pdfjs-dist'],
    esbuildOptions: {
      target: 'es2022',
    },
  },
});
