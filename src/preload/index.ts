import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

function on(channel: string, listener: (...args: unknown[]) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
    listener(...args);
  };
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

const api = {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => invoke(channel, ...args),
  on: (channel: string, listener: (...args: unknown[]) => void): (() => void) =>
    on(channel, listener),
  channels: IpcChannels
};

export type GlibraryApi = typeof api;

contextBridge.exposeInMainWorld('api', api);
