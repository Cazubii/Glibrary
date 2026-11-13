import type {
  DetectionResult,
  IpcError,
  GitStatusDetail,
  GithubUser,
  IpcResult,
  LibraryFile,
  Agent,
  AgentProfile,
  AgentRun,
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
  TopScope,
  RepoAnalysis,
  UsageEvent,
  ToolEntry,
  ToolInstallRun,
  ToolStatus,
  DevWorkspaceCloseResult,
  DevWorkspaceOpenResult,
  DevWorkspaceStatus,
  TerminalAttachResult,
  TerminalListResult,
  TerminalSessionSummary
} from '../../../shared/types';
import { IpcErrorSchema } from '../../../shared/schemas';
import type { ToolStatus as SystemToolStatus } from '../../../shared/tools';
import { IpcChannels } from '../../../shared/ipc-channels';
import type { DashboardAccount } from '../../../shared/github-dashboard';
import type { ProjectRepoPage, ProjectVisibility } from '../../../shared/github-projects';
import type { GitBranchList } from '../../../shared/git-branches';

export async function unwrap<T>(promise: Promise<unknown>): Promise<T> {
  const result = (await promise) as IpcResult<T>;
  if (!result.ok) {
    const parsedError = IpcErrorSchema.safeParse(result.error);
    if (parsedError.success) throw new GlibraryApiError(parsedError.data);
    if (typeof result.error === 'string') throw new Error(result.error);
    throw new Error('Não foi possível concluir esta ação.');
  }
  return result.data;
}

export class GlibraryApiError extends Error {
  constructor(readonly presentation: IpcError) {
    super(`${presentation.title}. ${presentation.whatHappened} ${presentation.nextStep}`);
    this.name = 'GlibraryApiError';
  }
}

function detectNativeTools(): Promise<Record<string, ToolStatus>>;
function detectNativeTools(id: string): Promise<ToolStatus>;
function detectNativeTools(id?: string): Promise<ToolStatus | Record<string, ToolStatus>> {
  return unwrap(window.api.invoke(IpcChannels.toolsDetect, id != null ? { id } : {}));
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
  dashboardAccount: (): Promise<DashboardAccount> =>
    unwrap<DashboardAccount>(window.api.invoke(IpcChannels.dashboardAccount)),
  projectsList: (input: {
    page: number;
    perPage: number;
    sort: 'updated';
    visibility: ProjectVisibility;
    fork: boolean;
  }): Promise<ProjectRepoPage> =>
    unwrap<ProjectRepoPage>(window.api.invoke(IpcChannels.projectsList, input)),
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
  topReposGet: (windowDays?: number, scope?: TopScope): Promise<TopRepos> =>
    unwrap(window.api.invoke(IpcChannels.topReposGet, { windowDays, ...(scope ? { scope } : {}) })),
  githubSearch: (query: string, language?: string, limit = 25): Promise<{ fetchedAt: string; totalCount: number; repos: TopRepo[] }> =>
    unwrap(
      window.api.invoke(IpcChannels.githubSearch, {
        query,
        ...(language ? { language } : {}),
        limit
      })
    ),
  topReposRefresh: (windowDays?: number, scope?: TopScope): Promise<TopRepos> =>
    unwrap(window.api.invoke(IpcChannels.topReposRefresh, { windowDays, ...(scope ? { scope } : {}) })),
  repoAnalyze: (url: string): Promise<RepoAnalysis> =>
    unwrap(window.api.invoke(IpcChannels.githubRepoAnalyze, { url })),
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

  branchesList: (id: string): Promise<GitBranchList> =>
    unwrap<GitBranchList>(window.api.invoke(IpcChannels.branchesList, { id })),

  branchCreate: (id: string, name: string, defaultBranch?: string): Promise<{ branch: string }> =>
    unwrap<{ branch: string }>(window.api.invoke(IpcChannels.branchCreate, { id, name, ...(defaultBranch ? { defaultBranch } : {}) })),

  branchCheckout: (id: string, branch: string): Promise<{ branch: string }> =>
    unwrap<{ branch: string }>(window.api.invoke(IpcChannels.branchCheckout, { id, branch })),

  devWorkspaceOpen: (repoId: string, branch?: string): Promise<DevWorkspaceOpenResult> =>
    unwrap<DevWorkspaceOpenResult>(window.api.invoke(IpcChannels.devWorkspaceOpen, { repoId, ...(branch ? { branch } : {}) })),

  devWorkspaceClose: (repoId: string): Promise<DevWorkspaceCloseResult> =>
    unwrap<DevWorkspaceCloseResult>(window.api.invoke(IpcChannels.devWorkspaceClose, { repoId })),

  devWorkspaceStatus: (repoId: string): Promise<DevWorkspaceStatus> =>
    unwrap<DevWorkspaceStatus>(window.api.invoke(IpcChannels.devWorkspaceStatus, { repoId })),

  devWorkspaceBranches: (repoId: string): Promise<GitBranchList> =>
    unwrap<GitBranchList>(window.api.invoke(IpcChannels.devWorkspaceBranches, { repoId })),

  devWorkspaceSwitchBranch: (repoId: string, branch: string): Promise<{ branch: string }> =>
    unwrap<{ branch: string }>(window.api.invoke(IpcChannels.devWorkspaceSwitchBranch, { repoId, branch })),

  devWorkspaceCreateBranch: (repoId: string, name: string, defaultBranch: string): Promise<{ branch: string }> =>
    unwrap<{ branch: string }>(window.api.invoke(IpcChannels.devWorkspaceCreateBranch, { repoId, name, defaultBranch })),

  devWorkspaceSync: (repoId: string): Promise<{ updated: boolean; summary: string; status: DevWorkspaceStatus }> =>
    unwrap<{ updated: boolean; summary: string; status: DevWorkspaceStatus }>(window.api.invoke(IpcChannels.devWorkspaceSync, { repoId })),

  devWorkspacePush: (repoId: string): Promise<{ branch: string; status: DevWorkspaceStatus }> =>
    unwrap<{ branch: string; status: DevWorkspaceStatus }>(window.api.invoke(IpcChannels.devWorkspacePush, { repoId })),

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

  toolsCheck: (force = false): Promise<SystemToolStatus[]> =>
    unwrap<SystemToolStatus[]>(window.api.invoke(IpcChannels.toolsCheck, { force })),

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
    }),

  githubAuthCheck: (token: string): Promise<GithubUser> =>
    unwrap<GithubUser>(window.api.invoke(IpcChannels.githubAuthCheck, { token })),

  usageRecord: (kind: 'skill' | 'agent', id: string): Promise<UsageEvent> =>
    unwrap<UsageEvent>(window.api.invoke(IpcChannels.usageRecord, { kind, id })),

  userToolRun: (toolId: string, projectId: string): Promise<{ started: boolean; code?: number; output?: string }> =>
    unwrap<{ started: boolean; code?: number; output?: string }>(
      window.api.invoke(IpcChannels.userToolRun, { toolId, projectId })
    ),

  githubAuthMe: (): Promise<GithubUser | null> =>
    unwrap<GithubUser | null>(window.api.invoke(IpcChannels.githubAuthMe)),

  repoGitStatus: (id: string): Promise<GitStatusDetail> =>
    unwrap<GitStatusDetail>(window.api.invoke(IpcChannels.repoGitStatus, { id })),

  repoCommit: (id: string, message: string): Promise<{ commit: string }> =>
    unwrap<{ commit: string }>(window.api.invoke(IpcChannels.repoCommit, { id, message })),

  repoPush: (id: string): Promise<{ branch: string }> =>
    unwrap<{ branch: string }>(window.api.invoke(IpcChannels.repoPush, { id })),

  terminalList: (cwd: string): Promise<TerminalListResult> =>
    unwrap<TerminalListResult>(window.api.invoke(IpcChannels.terminalList, { cwd })),

  terminalCreateSession: (cwd: string): Promise<TerminalSessionSummary> =>
    unwrap<TerminalSessionSummary>(window.api.invoke(IpcChannels.terminalSessionCreate, { cwd })),

  terminalAttach: (id: string, cols?: number, rows?: number): Promise<TerminalAttachResult> =>
    unwrap<TerminalAttachResult>(
      window.api.invoke(IpcChannels.terminalAttach, { id, ...(cols != null ? { cols } : {}), ...(rows != null ? { rows } : {}) })
    ),

  terminalClose: (id: string): Promise<void> =>
    unwrap<null>(window.api.invoke(IpcChannels.terminalClose, { id })).then(() => undefined),

  terminalDetach: (id: string, attachmentId: string): Promise<void> =>
    unwrap<null>(window.api.invoke(IpcChannels.terminalDetach, { id, attachmentId })).then(() => undefined),

  terminalInput: (id: string, data: string): void => {
    window.api.send(IpcChannels.terminalInput, { id, data });
  },

  terminalResize: (id: string, cols: number, rows: number): void => {
    window.api.send(IpcChannels.terminalResize, { id, cols, rows });
  },

  onTerminalOutput: (listener: (payload: { id: string; data: string; sequence?: number }) => void) =>
    window.api.on(IpcChannels.terminalOutput, (payload: unknown) => {
      listener(payload as { id: string; data: string; sequence?: number });
    }),

  onTerminalExit: (listener: (payload: { id: string; exitCode: number }) => void) =>
    window.api.on(IpcChannels.terminalExit, (payload: unknown) => {
      listener(payload as { id: string; exitCode: number });
    }),

  agentProfilesList: (): Promise<AgentProfile[]> =>
    unwrap<AgentProfile[]>(window.api.invoke(IpcChannels.agentProfilesList)),

  agentProfilesCreate: (input: { name: string; repoId: string; command: string; args?: string[]; monitorProvider?: AgentProfile['monitorProvider'] }): Promise<AgentProfile> =>
    unwrap<AgentProfile>(window.api.invoke(IpcChannels.agentProfilesCreate, input)),

  agentProfilesUpdate: (id: string, patch: { name?: string; repoId?: string; command?: string; args?: string[]; monitorProvider?: AgentProfile['monitorProvider'] }): Promise<AgentProfile> =>
    unwrap<AgentProfile>(window.api.invoke(IpcChannels.agentProfilesUpdate, { id, patch })),

  agentProfilesRemove: (id: string): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.agentProfilesRemove, { id })),

  agentRunsStart: (profileId: string, prompt?: string): Promise<AgentRun> =>
    unwrap<AgentRun>(
      window.api.invoke(IpcChannels.agentRunsStart, { profileId, ...(prompt != null ? { prompt } : {}) })
    ),

  agentRunsStop: (id: string): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.agentRunsStop, { id })),

  agentRunsList: (): Promise<AgentRun[]> =>
    unwrap<AgentRun[]>(window.api.invoke(IpcChannels.agentRunsList)),

  agentRunsGetLogs: (id: string): Promise<LogLine[]> =>
    unwrap<LogLine[]>(window.api.invoke(IpcChannels.agentRunsGetLogs, { id })),

  onAgentRunsChanged: (listener: (run: AgentRun) => void) =>
    window.api.on(IpcChannels.agentRunsChanged, (payload: unknown) => {
      listener(payload as AgentRun);
    }),

  onAgentRunsLog: (listener: (payload: { id: string; line: LogLine }) => void) =>
    window.api.on(IpcChannels.agentRunsLog, (payload: unknown) => {
      listener(payload as { id: string; line: LogLine });
    }),

  toolsList: (): Promise<ToolEntry[]> =>
    unwrap<ToolEntry[]>(window.api.invoke(IpcChannels.toolsList)),

  toolsAdd: (url: string): Promise<ToolEntry> =>
    unwrap<ToolEntry>(window.api.invoke(IpcChannels.toolsAdd, { url })),

  toolsRemove: (id: string): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.toolsRemove, { id })),

  toolsInstall: (id: string): Promise<ToolInstallRun> =>
    unwrap<ToolInstallRun>(window.api.invoke(IpcChannels.toolsInstall, { id })),

  toolsOpen: (id: string): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.toolsOpen, { id })),

  toolsDetect: detectNativeTools,

  toolRunsGetLogs: (id: string): Promise<LogLine[]> =>
    unwrap<LogLine[]>(window.api.invoke(IpcChannels.toolRunsGetLogs, { id })),

  onToolRunsChanged: (listener: (run: ToolInstallRun) => void) =>
    window.api.on(IpcChannels.toolRunsChanged, (payload: unknown) => {
      listener(payload as ToolInstallRun);
    }),

  onToolRunsLog: (listener: (payload: { id: string; line: LogLine }) => void) =>
    window.api.on(IpcChannels.toolRunsLog, (payload: unknown) => {
      listener(payload as { id: string; line: LogLine });
    })
};
