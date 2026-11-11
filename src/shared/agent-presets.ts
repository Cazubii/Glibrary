export interface AgentCliPreset {
  id: string;
  label: string;
  command: string;
}

export const AGENT_CLI_PRESETS: AgentCliPreset[] = [
  { id: 'claude', label: 'Claude Code', command: 'claude' },
  { id: 'codex', label: 'Codex CLI', command: 'codex' },
  { id: 'gemini', label: 'Gemini CLI', command: 'gemini' },
  { id: 'aider', label: 'Aider', command: 'aider' }
];

export function findAgentPreset(command: string): AgentCliPreset | undefined {
  return AGENT_CLI_PRESETS.find((preset) => preset.command === command);
}
