import { contextBridge, ipcRenderer } from 'electron';
import type { GlibraryApi } from '../shared/types';

const api: GlibraryApi = {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: unknown[]) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
      listener(...args);
    };
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  }
};

contextBridge.exposeInMainWorld('api', api);
