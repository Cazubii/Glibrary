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
  scanFolders: string[]; // pastas que o scanner varre
  githubToken?: string; // opcional; salvar com safeStorage
  editorCommand: string; // padrão: "code"
  terminalPreference: 'auto' | string;
  theme: 'dark' | 'light'; // padrão: dark (estilo Steam)
  viewMode: 'grid' | 'list';
  checkUpdatesOnStart: boolean;
}

export interface LibraryFile {
  version: 1;
  repos: Repo[];
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
