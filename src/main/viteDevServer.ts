import { resolve } from 'path';

export interface ViteDevServer {
  resolvedUrls: { local: string[] };
  listen: () => Promise<void>;
  close: () => Promise<void>;
}

export async function startViteDevServer(): Promise<ViteDevServer> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — Vite 8 uses modern package exports; resolved at runtime by Node, not by tsc.
  const { createServer } = await import('vite');

  const server = await createServer({
    root: resolve(__dirname, '../../src/renderer'),
    configFile: resolve(__dirname, '../../vite.config.ts'),
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: false,
      hmr: {
        port: 24678,
      },
    },
  });

  await server.listen();

  return {
    resolvedUrls: server.resolvedUrls ?? { local: ['http://localhost:5173'] },
    listen: async () => {
      await server.listen();
    },
    close: async () => {
      await server.close();
    },
  };
}
