import { describe, expect, it } from 'vitest';
import { AGENT_CLI_PRESETS, findAgentPreset } from '../src/shared/agent-presets';

describe('AGENT_CLI_PRESETS', () => {
  it('traz os CLIs conhecidos', () => {
    const commands = AGENT_CLI_PRESETS.map((p) => p.command);
    expect(commands).toEqual(['claude', 'opencode', 'codex', 'gemini', 'aider']);
  });

  it('findAgentPreset resolve por comando e devolve undefined para custom', () => {
    expect(findAgentPreset('claude')?.id).toBe('claude');
    expect(findAgentPreset('meu-cli')).toBeUndefined();
  });
});
