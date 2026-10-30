import type {
  IpcResult,
  LibraryFile,
  Repo,
  Settings
} from '../../../shared/types';
import { IpcChannels } from '../../../shared/ipc-channels';

async function unwrap<T>(promise: Promise<unknown>): Promise<T> {
  const result = (await promise) as IpcResult<T>;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export const api = {
  libraryGet: (): Promise<LibraryFile> =>
    unwrap<LibraryFile>(window.api.invoke(IpcChannels.libraryGet)),

  repoAddLocal: (path: string): Promise<Repo> =>
    unwrap<Repo>(window.api.invoke(IpcChannels.repoAddLocal, { path })),

  repoUpdate: (id: string, patch: Partial<Repo>): Promise<Repo> =>
    unwrap<Repo>(window.api.invoke(IpcChannels.repoUpdate, { id, patch })),

  repoRemove: (id: string, deleteFolder: boolean): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.repoRemove, { id, deleteFolder })),

  dialogPickFolder: (): Promise<string | null> =>
    unwrap<string | null>(window.api.invoke(IpcChannels.dialogPickFolder)),

  settingsGet: (): Promise<Settings> =>
    unwrap<Settings>(window.api.invoke(IpcChannels.settingsGet)),

  settingsSet: (patch: Partial<Settings>): Promise<Settings> =>
    unwrap<Settings>(window.api.invoke(IpcChannels.settingsSet, patch)),

  onStatusChanged: (listener: (payload: { id: string; status: Repo['status'] }) => void) =>
    window.api.on(IpcChannels.repoStatusChanged, (payload: unknown) => {
      listener(payload as { id: string; status: Repo['status'] });
    })
};
