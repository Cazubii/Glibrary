import type { AssetCategory } from './categories';

export type { AssetCategory } from './categories';

export interface TopRepo {
  owner: string;
  name: string;
  remoteUrl: string;
  description?: string;
  stars: number;
  language?: string;
  topics?: string[];
  pushedAt?: string;
  createdAt?: string;
}

export interface TopRepos {
  fetchedAt: string; // ISO da última busca; '' = nunca buscado
  repos: TopRepo[];
  /** Janela (em dias) desta lista; ausente = 30 (legado). */
  windowDays?: number;
  /** Escopo de ecossistema desta lista; ausente = 'all' (legado). */
  scope?: TopScope;
}

/** Janelas suportadas da aba Top GitHub. */
export const TOP_WINDOWS = [7, 30] as const;
export type TopWindow = (typeof TOP_WINDOWS)[number];

/** Escopos de ecossistema da aba Top GitHub. */
export const TOP_SCOPES = ['all', 'claude', 'codex', 'opencode'] as const;
export type TopScope = (typeof TOP_SCOPES)[number];

/** Análise heurística de um repo público do GitHub (área "Análise"). */
export interface RepoAnalysis {
  owner: string;
  name: string;
  fullName: string;
  remoteUrl: string;
  description?: string;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  language?: string;
  topics: string[];
  license?: string;
  createdAt?: string;
  pushedAt?: string;
  archived: boolean;
  homepage?: string;
  defaultBranch?: string;
  readmeSize?: number;
  contributorsCount?: number;
  releasesLastYear: number;
  /** Pontos positivos em pt-BR. */
  pros: string[];
  /** Pontos negativos em pt-BR. */
  cons: string[];
  analysisAt: string;
}

export type RepoStatus =
  | 'not_cloned' // só no catálogo (tem URL, não tem pasta)
  | 'cloning'
  | 'cloned' // pasta existe, dependências não instaladas
  | 'installing'
  | 'installed' // pronto para iniciar
  | 'running'
  | 'error'
  | 'missing'; // estava registrado, mas a pasta sumiu do disco

export type ProjectKind =
  | 'node'
  | 'python'
  | 'docker'
  | 'rust'
  | 'go'
  | 'dotnet'
  | 'java'
  | 'make'
  | 'static'
  | 'unknown';

export interface CommandSpec {
  command: string; // ex: "pnpm install" ou "npm run dev"
  cwd?: string; // relativo à raiz do repo; padrão "."
  env?: Record<string, string>;
}

export interface DetectionResult {
  kinds: ProjectKind[]; // pode ter mais de um (ex: node + docker)
  packageManager?:
    | 'npm'
    | 'pnpm'
    | 'yarn'
    | 'bun'
    | 'pip'
    | 'poetry'
    | 'uv'
    | 'pipenv'
    | 'cargo'
    | 'go'
    | 'dotnet'
    | 'maven'
    | 'gradle';
  installCandidates: CommandSpec[]; // o primeiro é o sugerido
  startCandidates: CommandSpec[];
  requiredTools: string[]; // ids da tabela de ferramentas (seção 8)
  hasEnvExample: boolean; // existe .env.example e não existe .env
  detectedPort?: number; // se achou a porta (vite=5173, next=3000...)
  isMonorepo?: boolean; // workspaces ou pnpm-workspace.yaml (seção 6)
  readmeCommands?: CommandSpec[]; // "Comandos sugeridos pelo README" (seção 6)
}

/** Resultado parcial devolvido por cada detector; o index.ts junta todos. */
export type DetectionPartial = Omit<Partial<DetectionResult>, 'kinds'> & {
  kinds: ProjectKind[];
};

export interface Repo {
  id: string; // uuid
  name: string; // ex: "excalidraw"
  owner?: string; // ex: "excalidraw"
  remoteUrl?: string; // https://github.com/owner/name(.git)
  localPath?: string; // caminho absoluto
  status: RepoStatus;
  description?: string;
  language?: string;
  stars?: number;
  topics?: string[];
  coverPath?: string; // caminho local da imagem da capa
  tags: string[]; // tags do usuário
  favorite: boolean;
  notes?: string; // anotações livres do usuário
  detection?: DetectionResult;
  installCommand?: CommandSpec; // escolhido/editado pelo usuário
  startCommand?: CommandSpec;
  commandsEditedByUser?: boolean; // detecção nunca sobrescreve (seção 6)
  extraCommands?: { label: string; spec: CommandSpec }[]; // ex: "build", "test"
  openUrl?: string; // ex: http://localhost:5173 (botão "Abrir no navegador")
  addedAt: string; // ISO
  installedAt?: string;
  lastRunAt?: string;
  lastPulledAt?: string;
  behindBy?: number; // commits atrás do remoto (último fetch)
  lastError?: string;
  /** Sessão da área de desenvolvimento atualmente ativa para este repositório. */
  devSession?: DevSession | null;
}

export interface DevSession {
  startedAt: string;
  branch: string;
  workspacePath: string;
}

export interface DevWorkspaceStatus {
  branch: string | null;
  changes: number;
  ahead: number;
  behind: number;
}

export interface DevWorkspaceOpenResult {
  workspacePath: string;
  reusedManaged: boolean;
  branch: string;
}

export interface DevWorkspaceCloseResult {
  workspacePath: string | null;
  removed: boolean;
}

export type OnboardingStatus = 'not-started' | 'dismissed' | 'completed';
export type OnboardingChecklistId = 'tools' | 'github' | 'project' | 'agent' | 'publish';

export interface OnboardingProgress {
  status: OnboardingStatus;
  currentStep: number;
  completedChecklist: OnboardingChecklistId[];
  checklistVisible: boolean;
  projectsRoot?: string;
}

export interface Settings {
  reposRoot: string; // pasta padrão para clonar; padrão: ~/Glibrary
  scanFolders: string[];
  basesRoot: string;
  skillFolders: string[];
  agentFolders: string[]; // pastas com arquivos .md de agentes
  githubToken?: string; // opcional; salvar com safeStorage
  githubRefreshToken?: string; // token cifrado de renovação OAuth
  githubTokenExpiresAt?: number;
  githubRefreshTokenExpiresAt?: number;
  editorCommand: string; // padrão: "code"
  terminalPreference: 'auto' | string;
  theme: 'dark' | 'light'; // padrão: dark (estilo Steam)
  showAdvancedResources: boolean; // fallback true até o mantenedor definir o padrão simples
  viewMode: 'grid' | 'list';
  checkUpdatesOnStart: boolean;
  inheritTags: boolean; // projetos herdam tags dos skills/agents/bases associados
  userTools?: UserTool[]; // ferramentas do usuário; ligadas ficam nos projetos
  agentsViewMode?: AgentViewMode; // modo de visualização da página Agentes
  agentRunBudgetUsd?: number;
  agentDailyBudgetUsd?: number;
  onboarding: OnboardingProgress;
}

/** Ferramenta configurada pelo usuário (nome + comando) com chave on/off. */
export interface UserTool {
  id: string;
  name: string;
  command: string;
  description?: string;
  enabled: boolean;
  /** true = processo de longa duração (dev server); roda desacoplado, sem capturar saída. */
  keepAlive?: boolean;
}

export interface UsageEvent {
  id: string;
  kind: 'skill' | 'agent';
  assetId: string;
  at: string; // ISO
}

export interface Kit {
  id: string;
  name: string;
  description?: string;
  skillIds: string[];
  agentIds: string[];
  baseIds: string[];
  tags: string[];
  addedAt: string;
}

export interface ScanIssue {
  type: 'skill' | 'agent';
  path: string;
  name?: string;
  reason: string;
}

export interface SkillsScanResult {
  skills: Skill[];
  issues: ScanIssue[];
}

export interface AgentsScanResult {
  agents: Agent[];
  issues: ScanIssue[];
}

export interface Skill {
  id: string;
  name: string;
  description?: string;
  category: AssetCategory;
  path: string;
  source: string;
  tags: string[];
  favorite: boolean;
  addedAt: string;
  updatedAt?: string;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  category: AssetCategory;
  path: string; // pasta do agente
  file: string; // arquivo .md que o define
  source: string;
  tags: string[];
  favorite: boolean;
  addedAt: string;
  updatedAt?: string;
}

export interface BaseItem {
  id: string;
  name: string;
  description?: string;
  remoteUrl?: string;
  localPath?: string;
  tags: string[];
  favorite: boolean;
  addedAt: string;
  notes?: string;
}

export interface ProjectRef {
  id: string;
  name: string;
  description?: string;
  localPath?: string;
  remoteUrl?: string;
  tags: string[];
  favorite: boolean;
  skillIds: string[];
  agentIds: string[];
  baseIds: string[];
  notes?: string;
  addedAt: string;
}

export interface LibraryFile {
  version: 2;
  repos: Repo[];
  skills: Skill[];
  agents: Agent[];
  bases: BaseItem[];
  projects: ProjectRef[];
  kits: Kit[];
  usage: UsageEvent[];
  agentProfiles: AgentProfile[];
  tools: ToolEntry[];
  topRepos: TopRepos;
  /** Cache da lista de 7 dias; admitido opcional para library.json v2 existente. */
  topRepos7?: TopRepos;
  /** Caches de topo por ecossistema, chaveados como "scope:windowDays". */
  topReposScopes?: Record<string, TopRepos>;
  settings: Settings;
}

export type IpcErrorAction = {
  label: string;
  target: 'tools' | 'projects';
};

export interface IpcError {
  title: string;
  whatHappened: string;
  nextStep: string;
  technicalDetails: string;
  action?: IpcErrorAction;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string | IpcError };

export type ProcessKind = 'install' | 'start' | 'extra';

export interface LogLine {
  ts: string; // ISO
  stream: 'out' | 'err' | 'sys';
  text: string;
}

export type TerminalSessionStatus = 'running' | 'exited';

export interface TerminalSessionSummary {
  id: string;
  cwd: string;
  name: string;
  status: TerminalSessionStatus;
  createdAt: string;
  exitCode?: number;
}

export interface TerminalListResult {
  cwd: string;
  sessions: TerminalSessionSummary[];
}

export interface TerminalAttachResult {
  id: string;
  attachmentId: string;
  snapshot: string;
  sequence: number;
  status: TerminalSessionStatus;
  exitCode?: number;
}

export type AgentViewMode = 'painel' | 'grid';

export type AgentProvider = 'claude-code' | 'opencode' | 'generic';
export type AgentProviderChoice = 'auto' | AgentProvider;

export interface AgentTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  costUsd: number;
  model?: string;
  accountKey?: string;
  accountLabel?: string;
  updatedAt: string;
}

export interface AgentActivity {
  id: string;
  at: string;
  kind: 'status' | 'tool' | 'subagent' | 'usage';
  label: string;
  agentId?: string;
  parentAgentId?: string;
  agentType?: string;
  status?: 'running' | 'done' | 'waiting' | 'error';
}

export interface AgentSubagent {
  id: string;
  parentId?: string;
  name: string;
  status: 'running' | 'done' | 'waiting' | 'error';
  startedAt: string;
  finishedAt?: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  repoId: string;
  command: string;
  args: string[];
  monitorProvider?: AgentProviderChoice;
  createdAt: string;
  lastRunAt?: string;
}

export type AgentRunStatus = 'running' | 'done' | 'stopped' | 'error';

export interface AgentRun {
  id: string;
  profileId: string;
  profileName: string; // snapshot do nome do perfil
  repoId: string;
  repoName: string;
  cwd?: string;
  provider?: AgentProvider;
  providerSessionId?: string;
  accountKey?: string;
  accountLabel?: string;
  tokenUsage?: AgentTokenUsage;
  agentChanges?: AgentFileChange[];
  budgetWarning?: boolean;
  budgetStopReason?: 'execution' | 'daily';
  activity?: AgentActivity[];
  subagents?: AgentSubagent[];
  command: string; // linha completa executada
  prompt?: string; // tarefa inicial do sub-agente
  status: AgentRunStatus;
  exitCode?: number;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  lastError?: string; // cauda do stderr quando falha
  logFile: string;
}

export interface AgentFileChange {
  path: string;
  kind: 'tracked' | 'untracked';
  sha256: string;
}

export interface AgentChangesResolution {
  run: AgentRun;
  discarded: string[];
  skipped: string[];
}

export type ToolSource = 'builtin' | 'custom';
export type ToolStatus = 'not_installed' | 'installing' | 'installed';
export type ToolInstallRunStatus = 'running' | 'done' | 'error' | 'stopped';

export interface ToolEntry {
  id: string;
  name: string;
  gitUrl: string;
  source: ToolSource;
  createdAt: string;
}

export interface ToolInstallRun {
  id: string;
  toolId: string;
  toolName: string;
  command: string;
  status: ToolInstallRunStatus;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  logFile: string;
  prompt: string;
}

export interface RunHandle {
  pid: number;
  logFile: string | null;
}

export interface GlibraryApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  send: (channel: 'terminal:input' | 'terminal:resize', ...args: unknown[]) => void;
  on: (channel: string, listener: (...args: unknown[]) => void) => () => void;
}

export interface FoundRepo {
  localPath: string;
  remoteUrl?: string;
  branch?: string;
}

export interface ScannedRepo extends FoundRepo {
  duplicateOf?: 'path' | 'url';
  existingRepoId?: string;
}

export interface ScanProgress {
  currentPath: string;
  found: number;
  done?: boolean;
}

export interface ScanFolderSuggestion {
  path: string;
  exists: boolean;
}

export interface GithubUser {
  login: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

export interface GithubOAuthDeviceSession {
  sessionId: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  intervalSeconds: number;
}

export type GithubOAuthPollResult =
  | { status: 'pending'; intervalSeconds: number }
  | { status: 'complete'; user: GithubUser }
  | { status: 'expired' }
  | { status: 'denied' };

export type GitFileState = 'staged' | 'modified' | 'untracked';

export interface GitFile {
  path: string;
  state: GitFileState;
}

export interface GitNewFilePreview {
  path: string;
  content: string;
  binary: boolean;
  truncated: boolean;
}

export interface GitChangePreview {
  revision: string;
  files: GitFile[];
  diff: string;
  newFiles: GitNewFilePreview[];
  truncated: boolean;
}

export interface GitStatusDetail {
  branch: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
}
