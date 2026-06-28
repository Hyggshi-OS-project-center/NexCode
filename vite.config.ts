import { defineConfig } from 'vite';
import { resolve } from 'path';

const isDev = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER === '1';
const noSourcemap = process.env.VITE_NO_SOURCEMAP === '1';

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
    sourcemap: noSourcemap ? false : (isDev ? 'inline' : true),
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
        about: resolve(__dirname, 'src/renderer/about.html'),
        easterEgg: resolve(__dirname, 'src/renderer/easterEgg.html'),
      },
      output: {
        manualChunks(id) {
          // Monaco is separated into feature groups to avoid becoming a single massive block.
          // All esm modules must be in same chunk to avoid circular dependency issues
          if (id.includes('monaco-editor/esm')) {
            return 'monaco-esm';
          }
          if (id.includes('monaco-editor')) {
            return 'monaco-base';
          }
          // PDFJS is also quite heavy, so it's a separate file.
          if (id.includes('pdfjs-dist')) {
            return 'pdfjs';
          }
          // The remaining node_modules go to vendor.
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
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
