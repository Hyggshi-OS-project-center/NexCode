/// <reference types="vite/client" />

declare module '*?worker' {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}

import type { ElectronAPI } from '../shared/types';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
