/**
 * Minimal preload for the Easter Egg window — exposes only the lookup for a
 * project's optional `.nexcode/custom/easter-egg.json` override.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { CustomEasterEggConfig } from '../../shared/types';

contextBridge.exposeInMainWorld('easterEggAPI', {
    getCustomConfig: (): Promise<CustomEasterEggConfig | null> =>
        ipcRenderer.invoke('easterEgg:getCustomConfig'),
});