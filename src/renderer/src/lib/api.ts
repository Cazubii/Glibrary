import type {
  DetectionResult,
  IpcResult,
  LibraryFile,
  LogLine,
  ProcessKind,
  Repo,
  RunHandle,
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

  repoAddByUrl: (url: string, clone: boolean, name?: string): Promise<Repo> =>
    unwrap<Repo>(
      window.api.invoke(IpcChannels.repoAddByUrl, {
        url,
        clone,
        ...(name != null ? { name } : {})
      }),
    ),

  repoClone: (id: string): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.repoClone, { id })),

  repoPull: (id: string): Promise<{ updated: boolean; summary: string }> =>
    unwrap<{ updated: boolean; summary: string }>(window.api.invoke(IpcChannels.repoPull, { id })),

  repoFetchStatus: (
    id: string,
  ): Promise<{ behindBy: number; ahead: number; dirty: boolean }> =>
    unwrap<{ behindBy: number; ahead: number; dirty: boolean }>(
      window.api.invoke(IpcChannels.repoFetchStatus, { id }),
    ),

  repoRefreshMeta: (id: string): Promise<Repo> =>
    unwrap<Repo>(window.api.invoke(IpcChannels.repoRefreshMeta, { id })),

  repoUpdate: (id: string, patch: Partial<Repo>): Promise<Repo> =>
    unwrap<Repo>(window.api.invoke(IpcChannels.repoUpdate, { id, patch })),

  repoRemove: (id: string, deleteFolder: boolean): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.repoRemove, { id, deleteFolder })),

  repoDetect: (id: string): Promise<DetectionResult> =>
    unwrap<DetectionResult>(window.api.invoke(IpcChannels.repoDetect, { id })),

  repoOpenBrowser: (id: string): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.repoOpenBrowser, { id })),

  processRun: (id: string, kind: ProcessKind, extraIndex?: number): Promise<RunHandle> =>
    unwrap<RunHandle>(
      window.api.invoke(IpcChannels.processRun, {
        id,
        kind,
        ...(extraIndex != null ? { extraIndex } : {})
      }),
    ),

  processStop: (id: string): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.processStop, { id })),

  processGetLogs: (id: string): Promise<LogLine[]> =>
    unwrap<LogLine[]>(window.api.invoke(IpcChannels.processGetLogs, { id })),

  onProcessLog: (listener: (payload: { id: string; line: LogLine }) => void) =>
    window.api.on(IpcChannels.processLog, (payload: unknown) => {
      listener(payload as { id: string; line: LogLine });
    }),

  onProcessExit: (listener: (payload: { id: string; code: number }) => void) =>
    window.api.on(IpcChannels.processExit, (payload: unknown) => {
      listener(payload as { id: string; code: number });
    }),

  onCloneProgress: (
    listener: (payload: { id: string; percent: number | null; stage: string }) => void,
  ) =>
    window.api.on(IpcChannels.cloneProgress, (payload: unknown) => {
      listener(payload as { id: string; percent: number | null; stage: string });
    }),

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
