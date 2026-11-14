import { describe, expect, it } from 'vitest';
import { AGENT_CLI_PRESETS } from '../src/shared/agent-presets';
import { TOOLS } from '../src/shared/tools';

describe('detecção das ferramentas de primeira abertura', () => {
  it('verifica os CLIs suportados sem definir um recomendado', () => {
    const agentTools = TOOLS.filter((tool) => tool.id.startsWith('agent-cli-'));

    expect(agentTools.map((tool) => tool.command)).toEqual(AGENT_CLI_PRESETS.map((preset) => preset.command));
    expect(agentTools.every((tool) => tool.args.includes('--version'))).toBe(true);
  });
});
