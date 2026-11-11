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

export interface GithubAccountProfile {
  login: string;
  avatarUrl: string;
  htmlUrl: string;
}

export type GithubAccountStatus =
  | { state: 'disconnected'; checkedAt: string }
  | { state: 'connected'; account: GithubAccountProfile; checkedAt: string }
  | {
      state: 'error';
      reason: 'invalid_token' | 'forbidden' | 'rate_limit' | 'network' | 'unknown';
      message: string;
      checkedAt: string;
    };

export interface GithubAccountRepo {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  remoteUrl: string;
  htmlUrl: string;
  private: boolean;
  description?: string;
  language?: string;
  stars: number;
  pushedAt?: string;
  updatedAt: string;
}

export interface GithubRepoPage {
  repos: GithubAccountRepo[];
  page: number;
  hasNextPage: boolean;
}

export type TerminalProvider = 'local';

export interface TerminalSessionSummary {
  id: string;
  repoId: string;
  title: string;
  provider: TerminalProvider;
  state: 'running' | 'exited' | 'error';
  createdAt: string;
  exitCode?: number;
}

export interface TerminalSessionSnapshot extends TerminalSessionSummary {
  buffer: string;
}

export interface TerminalStartInput {
  repoId: string;
  provider: TerminalProvider;
  cols: number;
  rows: number;
}

export interface TerminalOutputEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  exitCode: number | null;
  signal?: number;
}

export interface TopRepos {
  fetchedAt: string; // ISO da última busca; '' = nunca buscado
  repos: TopRepo[];
  /** Janela (em dias) desta lista; ausente = 30 (legado). */
  windowDays?: number;
}

/** Janelas suportadas da aba Top GitHub. */
export const TOP_WINDOWS = [7, 30] as const;
export type TopWindow = (typeof TOP_WINDOWS)[number];

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
}

export interface Settings {
  reposRoot: string; // pasta padrão para clonar; padrão: ~/Glibrary
  scanFolders: string[];
  basesRoot: string;
  skillFolders: string[];
  agentFolders: string[]; // pastas com arquivos .md de agentes
  githubToken?: string; // opcional; salvar com safeStorage
  editorCommand: string; // padrão: "code"
  terminalPreference: 'auto' | string;
  theme: 'dark' | 'light'; // padrão: dark (estilo Steam)
  viewMode: 'grid' | 'list';
  checkUpdatesOnStart: boolean;
  inheritTags: boolean; // projetos herdam tags dos skills/agents/bases associados
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
  topRepos: TopRepos;
  /** Cache da lista de 7 dias; admitido opcional para library.json v2 existente. */
  topRepos7?: TopRepos;
  settings: Settings;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type ProcessKind = 'install' | 'start' | 'extra';

export interface LogLine {
  ts: string; // ISO
  stream: 'out' | 'err' | 'sys';
  text: string;
}

export interface RunHandle {
  pid: number;
  logFile: string | null;
}

export interface GlibraryApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
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
