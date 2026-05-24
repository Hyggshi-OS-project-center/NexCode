/**
 * Minimal preload for the About dialog window.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { AboutInfo } from '../../shared/types';

contextBridge.exposeInMainWorld('aboutAPI', {
  getInfo: (): Promise<AboutInfo> => ipcRenderer.invoke('about:getInfo'),
  close: (): void => ipcRenderer.send('about:close'),
});
