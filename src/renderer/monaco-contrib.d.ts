/**
 * Type declarations for monaco-editor ESM sub-modules whose .d.ts
 * files ship as `export {}` in monaco-editor 0.55+.
 */
declare module 'monaco-editor/esm/vs/language/typescript/monaco.contribution' {
  import type { Uri } from 'monaco-editor';

  /** Worker client returned by the TypeScript language-service worker factory. */
  interface TsWorkerClient {
    getNavigationTree(fileName: string): Promise<unknown>;
    [key: string]: unknown;
  }

  type WorkerFactory = (uri: Uri) => Promise<TsWorkerClient>;

  export function getTypeScriptWorker(): Promise<WorkerFactory>;
  export function getJavaScriptWorker(): Promise<WorkerFactory>;
}