import type {
  DetectionResult,
  GithubAccountStatus,
  GithubRepoPage,
  IpcResult,
  LibraryFile,
  Agent,
  AgentsScanResult,
  BaseItem,
  Kit,
  ProjectRef,
  Skill,
  SkillsScanResult,
  LogLine,
  ProcessKind,
  Repo,
  RunHandle,
  ScanFolderSuggestion,
  ScanProgress,
  ScannedRepo,
  Settings,
  TopRepos,
  TopRepo,
  UsageEvent
} from '../../../shared/types';
import type { ToolStatus } from '../../../shared/tools';
import { IpcChannels } from '../../../shared/ipc-channels';

async function unwrap<T>(promise: Promise<unknown>): Promise<T> {
  const result = (await promise) as IpcResult<T>;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export const api = {
  assetsGet: (): Promise<{
    skills: Skill[];
    agents: Agent[];
    bases: BaseItem[];
    projects: ProjectRef[];
    kits: Kit[];
    usage: UsageEvent[];
  }> => unwrap(window.api.invoke(IpcChannels.assetsGet)),
  skillsScan: (): Promise<SkillsScanResult> => unwrap(window.api.invoke(IpcChannels.skillsScan)),
  skillRemove: (id: string): Promise<null> => unwrap(window.api.invoke(IpcChannels.skillRemove, { id })),
  skillOpen: (id: string): Promise<null> => unwrap(window.api.invoke(IpcChannels.skillOpen, { id })),
  skillImport: (url: string): Promise<Skill> =>
    unwrap(window.api.invoke(IpcChannels.skillImport, { url })),
  agentsScan: (): Promise<AgentsScanResult> => unwrap(window.api.invoke(IpcChannels.agentsScan)),
  agentRemove: (id: string): Promise<null> => unwrap(window.api.invoke(IpcChannels.agentRemove, { id })),
  agentOpen: (id: string): Promise<null> => unwrap(window.api.invoke(IpcChannels.agentOpen, { id })),
  agentImport: (url: string): Promise<Agent[]> =>
    unwrap(window.api.invoke(IpcChannels.agentImport, { url })),
  kitAdd: (input: {
    name: string;
    description?: string;
    skillIds?: string[];
    agentIds?: string[];
    baseIds?: string[];
    tags?: string[];
  }): Promise<Kit> => unwrap(window.api.invoke(IpcChannels.kitAdd, input)),
  kitUpdate: (id: string, patch: {
    name?: string;
    description?: string;
    skillIds?: string[];
    agentIds?: string[];
    baseIds?: string[];
    tags?: string[];
  }): Promise<Kit> => unwrap(window.api.invoke(IpcChannels.kitUpdate, { id, ...patch })),
  kitRemove: (id: string): Promise<null> => unwrap(window.api.invoke(IpcChannels.kitRemove, { id })),
  kitApply: (kitId: string, projectId: string, inheritTags?: boolean): Promise<ProjectRef> =>
    unwrap(
      window.api.invoke(
        IpcChannels.kitApply,
        { kitId, projectId, ...(inheritTags != null ? { inheritTags } : {}) }
      )
    ),
  dashboardExport: (content: string, suggestedName = 'dashboard.md'): Promise<string | null> =>
    unwrap(window.api.invoke(IpcChannels.dashboardExport, { content, suggestedName })),
  settingsSet: (patch: Partial<Settings>): Promise<Settings> =>
    unwrap(window.api.invoke(IpcChannels.settingsSet, patch)),
  baseAdd: (input: Pick<BaseItem, 'name'> & Partial<Pick<BaseItem, 'remoteUrl' | 'localPath' | 'description'>>): Promise<BaseItem> =>
    unwrap(window.api.invoke(IpcChannels.baseAdd, input)),
  baseRemove: (id: string): Promise<null> => unwrap(window.api.invoke(IpcChannels.baseRemove, { id })),
  baseClone: (id: string): Promise<BaseItem> => unwrap(window.api.invoke(IpcChannels.baseClone, { id })),
  projectUpdate: (
    id: string,
    patch: Partial<Pick<ProjectRef, 'skillIds' | 'agentIds' | 'baseIds' | 'notes' | 'tags' | 'favorite'>>
  ): Promise<ProjectRef> =>
    unwrap(window.api.invoke(IpcChannels.projectUpdate, { id, ...patch })),
  skillUpdate: (id: string, patch: { category?: Skill['category']; tags?: string[]; favorite?: boolean }): Promise<Skill> =>
    unwrap(window.api.invoke(IpcChannels.skillUpdate, { id, patch })),
  agentUpdate: (id: string, patch: { category?: Agent['category']; tags?: string[]; favorite?: boolean }): Promise<Agent> =>
    unwrap(window.api.invoke(IpcChannels.agentUpdate, { id, patch })),
  baseUpdate: (
    id: string,
    patch: { name?: string; description?: string; tags?: string[]; favorite?: boolean }
  ): Promise<BaseItem> =>
    unwrap(window.api.invoke(IpcChannels.baseUpdate, { id, patch })),
  tagsRename: (from: string, to: string): Promise<null> =>
    unwrap(window.api.invoke(IpcChannels.tagsRename, { from, to })),
  tagsDelete: (name: string): Promise<null> =>
    unwrap(window.api.invoke(IpcChannels.tagsDelete, { name })),
  topReposGet: (windowDays?: number): Promise<TopRepos> =>
    unwrap(window.api.invoke(IpcChannels.topReposGet, { windowDays })),
  githubSearch: (query: string, language?: string, limit = 25): Promise<{ fetchedAt: string; totalCount: number; repos: TopRepo[] }> =>
    unwrap(
      window.api.invoke(IpcChannels.githubSearch, {
        query,
        ...(language ? { language } : {}),
        limit
      })
    ),
  githubAccountStatus: (): Promise<GithubAccountStatus> =>
    unwrap(window.api.invoke(IpcChannels.githubAccountStatus)),
  githubAccountConnect: (token: string): Promise<GithubAccountStatus> =>
    unwrap(window.api.invoke(IpcChannels.githubAccountConnect, { token })),
  githubAccountDisconnect: (): Promise<GithubAccountStatus> =>
    unwrap(window.api.invoke(IpcChannels.githubAccountDisconnect)),
  githubReposList: (page: number): Promise<GithubRepoPage> =>
    unwrap(window.api.invoke(IpcChannels.githubReposList, { page })),
  topReposRefresh: (windowDays?: number): Promise<TopRepos> =>
    unwrap(window.api.invoke(IpcChannels.topReposRefresh, { windowDays })),
  onTopReposChanged: (listener: (payload: IpcResult<TopRepos>) => void) =>
    window.api.on(IpcChannels.topReposChanged, (payload: unknown) => {
      listener(payload as IpcResult<TopRepos>);
    }),
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

  onStatusChanged: (listener: (payload: { id: string; status: Repo['status'] }) => void) =>
    window.api.on(IpcChannels.repoStatusChanged, (payload: unknown) => {
      listener(payload as { id: string; status: Repo['status'] });
    })
};
