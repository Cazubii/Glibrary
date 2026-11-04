/** Agentes de código conhecidos e as consultas de busca do GitHub por ecossistema. */
export interface KnownAgentDef {
  id: string;
  label: string;
  aliases: string[];
  queries: string[];
}

export const KNOWN_AGENTS: KnownAgentDef[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    aliases: ['claude code', 'claudecode', 'claude'],
    queries: [
      'topic:claude-code OR topic:claude-skills OR topic:claude-code-skills',
      '"claude code" in:name,description,topics'
    ]
  },
  {
    id: 'codex',
    label: 'Codex (OpenAI)',
    aliases: ['codex', 'openai codex'],
    queries: [
      'topic:openai-codex OR topic:codex-cli',
      '"openai codex" OR codex in:name,description,topics'
    ]
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    aliases: ['opencode', 'open code'],
    queries: [
      'topic:opencode',
      'opencode in:name,description,topics'
    ]
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    aliases: ['gemini cli', 'geminicli', 'gemini'],
    queries: [
      'topic:gemini-cli OR topic:gemini-cli-tools',
      '"gemini cli" in:name,description,topics'
    ]
  },
  {
    id: 'cursor',
    label: 'Cursor',
    aliases: ['cursor'],
    queries: [
      'topic:cursor-rules OR topic:cursor-ai OR topic:cursor',
      'cursor rules in:name,description,topics'
    ]
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    aliases: ['windsurf', 'codeium'],
    queries: [
      'topic:windsurf OR topic:windsurf-rules',
      'windsurf rules in:name,description,topics'
    ]
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    aliases: ['copilot', 'github copilot'],
    queries: [
      'topic:github-copilot OR topic:copilot-extensions',
      '"github copilot" in:name,description,topics'
    ]
  },
  {
    id: 'aider',
    label: 'Aider',
    aliases: ['aider'],
    queries: [
      'topic:aider OR topic:aider-config',
      'aider in:name,description,topics'
    ]
  },
  {
    id: 'cline',
    label: 'Cline',
    aliases: ['cline'],
    queries: [
      'topic:cline OR topic:clines',
      'cline in:name,description,topics'
    ]
  },
  {
    id: 'goose',
    label: 'Goose',
    aliases: ['goose', 'block goose'],
    queries: [
      'topic:goose-ai OR topic:block-goose',
      'goose ai agent in:name,description,topics'
    ]
  }
];

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Encontra um agente conhecido a partir de texto livre (bordas de palavra, case-insensitive). */
export function findKnownAgent(input: string): KnownAgentDef | null {
  const normalized = input.trim().toLowerCase();
  if (normalized === '') return null;
  for (const agent of KNOWN_AGENTS) {
    for (const alias of agent.aliases) {
      if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(alias)}([^\\p{L}\\p{N}]|$)`, 'u').test(normalized)) {
        return agent;
      }
    }
  }
  return null;
}

/** Consultas para texto livre: tópico derivado do texto + busca literal. */
export function genericAgentQueries(input: string): string[] {
  const trimmed = input.trim();
  const slug = trimmed.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const queries = [`"${trimmed}" OR topic:${slug || trimmed}`];
  if (slug !== '' && slug !== trimmed.toLowerCase()) {
    queries.push(`${slug} in:name,description,topics`);
  }
  return queries;
}
