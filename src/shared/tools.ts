import { AGENT_CLI_PRESETS } from './agent-presets';

export interface ToolDef {
  id: string;
  name: string;
  command: string;
  args: string[];
  downloadUrl?: string;
  /** Comandos alternativos tentados em ordem quando o principal falha. */
  fallbacks?: { command: string; args: string[] }[];
}

export interface ToolStatus {
  id: string;
  installed: boolean;
  version?: string;
}

/** Lista fixa da seção 8 da spec. */
export const TOOLS: ToolDef[] = [
  { id: 'git', name: 'Git', command: 'git', args: ['--version'], downloadUrl: 'https://git-scm.com/downloads' },
  { id: 'node', name: 'Node.js', command: 'node', args: ['--version'], downloadUrl: 'https://nodejs.org' },
  { id: 'npm', name: 'npm', command: 'npm', args: ['--version'] },
  { id: 'pnpm', name: 'pnpm', command: 'pnpm', args: ['--version'], downloadUrl: 'https://pnpm.io/installation' },
  { id: 'yarn', name: 'Yarn', command: 'yarn', args: ['--version'], downloadUrl: 'https://yarnpkg.com' },
  { id: 'bun', name: 'Bun', command: 'bun', args: ['--version'], downloadUrl: 'https://bun.sh' },
  {
    id: 'python',
    name: 'Python',
    command: 'python',
    args: ['--version'],
    downloadUrl: 'https://python.org',
    fallbacks: [
      { command: 'python3', args: ['--version'] },
      { command: 'py', args: ['--version'] }
    ]
  },
  { id: 'pip', name: 'pip', command: 'pip', args: ['--version'] },
  { id: 'poetry', name: 'Poetry', command: 'poetry', args: ['--version'], downloadUrl: 'https://python-poetry.org' },
  { id: 'uv', name: 'uv', command: 'uv', args: ['--version'], downloadUrl: 'https://docs.astral.sh/uv' },
  { id: 'docker', name: 'Docker', command: 'docker', args: ['--version'], downloadUrl: 'https://docker.com/get-started' },
  { id: 'cargo', name: 'Rust/Cargo', command: 'cargo', args: ['--version'], downloadUrl: 'https://rustup.rs' },
  { id: 'go', name: 'Go', command: 'go', args: ['version'], downloadUrl: 'https://go.dev/dl' },
  { id: 'dotnet', name: '.NET', command: 'dotnet', args: ['--version'], downloadUrl: 'https://dot.net' },
  { id: 'java', name: 'Java', command: 'java', args: ['-version'], downloadUrl: 'https://adoptium.net' },
  { id: 'mvn', name: 'Maven', command: 'mvn', args: ['-v'] },
  { id: 'make', name: 'Make', command: 'make', args: ['--version'] },
  { id: 'code', name: 'VS Code', command: 'code', args: ['--version'], downloadUrl: 'https://code.visualstudio.com' },
  ...AGENT_CLI_PRESETS.map((preset) => ({
    id: `agent-cli-${preset.id}`,
    name: `${preset.label} CLI`,
    command: preset.command,
    args: ['--version']
  }))
];

export const TOOLS_BY_ID: Record<string, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.id, t])
);
