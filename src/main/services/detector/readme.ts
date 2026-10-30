import type { CommandSpec } from '../../../shared/types';
import { readText } from './fs-utils';

const INTERESTING = /\b(install|run|start|dev)\b/i;

/**
 * Seção 6: extrair blocos de código do README que contenham install/run/start/dev
 * como "Comandos sugeridos pelo README" (só sugestão clicável, nunca rodar sozinho).
 */
export async function extractReadmeCommands(root: string): Promise<CommandSpec[]> {
  const readme = (await readText(root, 'README.md')) ?? (await readText(root, 'readme.md'));
  if (readme == null) return [];

  const commands: CommandSpec[] = [];
  const seen = new Set<string>();
  const blocks = readme.matchAll(/```[^\n]*\n([\s\S]*?)```/g);
  for (const block of blocks) {
    for (const rawLine of block[1].split(/\r?\n/)) {
      const line = rawLine.replace(/^\s*[$>]\s*/, '').trim();
      if (line === '' || seen.has(line)) continue;
      if (!INTERESTING.test(line)) continue;
      seen.add(line);
      commands.push({ command: line });
    }
  }
  return commands.slice(0, 10);
}
