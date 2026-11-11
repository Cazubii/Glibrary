import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';
import type { GlibraryApi } from '../shared/types';

const terminalSendChannels = new Set<string>([
  IpcChannels.terminalInput,
  IpcChannels.terminalResize,
  IpcChannels.terminalKill
]);

const api: GlibraryApi = {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(channel, ...args),
  send: (channel: string, ...args: unknown[]): void => {
    if (!terminalSendChannels.has(channel)) throw new Error(`Canal IPC de envio não permitido: ${channel}`);
    ipcRenderer.send(channel, ...args);
  },
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
