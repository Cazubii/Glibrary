import type {
  DetectionResult,
  IpcResult,
  LibraryFile,
  BaseItem,
  ProjectRef,
  Skill,
  LogLine,
  ProcessKind,
  Repo,
  RunHandle,
  ScanFolderSuggestion,
  ScanProgress,
  ScannedRepo,
  Settings
} from '../../../shared/types';
import type { ToolStatus } from '../../../shared/tools';
import { IpcChannels } from '../../../shared/ipc-channels';

async function unwrap<T>(promise: Promise<unknown>): Promise<T> {
  const result = (await promise) as IpcResult<T>;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export const api = {
  assetsGet: (): Promise<{ skills: Skill[]; bases: BaseItem[]; projects: ProjectRef[] }> =>
    unwrap(window.api.invoke(IpcChannels.assetsGet)),
  skillsScan: (): Promise<Skill[]> => unwrap(window.api.invoke(IpcChannels.skillsScan)),
  skillRemove: (id: string): Promise<null> => unwrap(window.api.invoke(IpcChannels.skillRemove, { id })),
  skillOpen: (id: string): Promise<null> => unwrap(window.api.invoke(IpcChannels.skillOpen, { id })),
  baseAdd: (input: Pick<BaseItem, 'name'> & Partial<Pick<BaseItem, 'remoteUrl' | 'localPath' | 'description'>>): Promise<BaseItem> =>
    unwrap(window.api.invoke(IpcChannels.baseAdd, input)),
  baseRemove: (id: string): Promise<null> => unwrap(window.api.invoke(IpcChannels.baseRemove, { id })),
  baseClone: (id: string): Promise<BaseItem> => unwrap(window.api.invoke(IpcChannels.baseClone, { id })),
  projectUpdate: (id: string, patch: Pick<ProjectRef, 'skillIds' | 'baseIds'> & Partial<Pick<ProjectRef, 'notes'>>): Promise<ProjectRef> =>
    unwrap(window.api.invoke(IpcChannels.projectUpdate, { id, ...patch })),
  projectAdd: (path: string): Promise<ProjectRef> => unwrap(window.api.invoke(IpcChannels.projectAdd, { path })),
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

  toolsCheck: (force = false): Promise<ToolStatus[]> =>
    unwrap<ToolStatus[]>(window.api.invoke(IpcChannels.toolsCheck, { force })),

  scanStart: (folders?: string[]): Promise<ScannedRepo[]> =>
    unwrap<ScannedRepo[]>(
      window.api.invoke(IpcChannels.scanStart, folders != null ? { folders } : {}),
    ),

  scanCancel: (): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.scanCancel)),

  scanImport: (items: ScannedRepo[]): Promise<Repo[]> =>
    unwrap<Repo[]>(
      window.api.invoke(IpcChannels.scanImport, {
        items: items.map((i) => ({
          localPath: i.localPath,
          ...(i.remoteUrl != null ? { remoteUrl: i.remoteUrl } : {}),
          ...(i.branch != null ? { branch: i.branch } : {})
        }))
      }),
    ),

  onboardingSuggest: (): Promise<ScanFolderSuggestion[]> =>
    unwrap<ScanFolderSuggestion[]>(window.api.invoke(IpcChannels.onboardingSuggest)),

  onScanProgress: (listener: (payload: ScanProgress) => void) =>
    window.api.on(IpcChannels.scanProgress, (payload: unknown) => {
      listener(payload as ScanProgress);
    }),

  repoUpdate: (id: string, patch: Partial<Repo>): Promise<Repo> =>
    unwrap<Repo>(window.api.invoke(IpcChannels.repoUpdate, { id, patch })),

  repoRemove: (id: string, deleteFolder: boolean): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.repoRemove, { id, deleteFolder })),

  repoDetect: (id: string): Promise<DetectionResult> =>
    unwrap<DetectionResult>(window.api.invoke(IpcChannels.repoDetect, { id })),

  repoOpenBrowser: (id: string): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.repoOpenBrowser, { id })),

  repoOpenFolder: (id: string): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.repoOpenFolder, { id })),

  repoOpenEditor: (id: string): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.repoOpenEditor, { id })),

  repoOpenTerminal: (id: string): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.repoOpenTerminal, { id })),

  repoCreateEnv: (id: string): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.repoCreateEnv, { id })),

  repoUninstallDeps: (id: string): Promise<Repo> =>
    unwrap<Repo>(window.api.invoke(IpcChannels.repoUninstallDeps, { id })),

  libraryExport: (): Promise<string | null> =>
    unwrap<string | null>(window.api.invoke(IpcChannels.libraryExport)),

  libraryImport: (): Promise<number> =>
    unwrap<number>(window.api.invoke(IpcChannels.libraryImport)),

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
