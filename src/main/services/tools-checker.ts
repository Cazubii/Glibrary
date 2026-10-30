import { execFile } from 'child_process';
import type { ToolDef, ToolStatus } from '../../shared/tools';
import { TOOLS } from '../../shared/tools';

const VERSION_RE = /\d+\.\d+(?:\.\d+)?/;

function runOnce(def: { command: string; args: string[] }): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      def.command,
      def.args,
      {
        timeout: 3000,
        windowsHide: true,
        // No Windows, npm/pnpm/code são .cmd; comandos vêm da lista fixa (seção 8).
        shell: process.platform === 'win32'
      },
      (err, stdout, stderr) => {
        const output = `${stdout ?? ''}\n${stderr ?? ''}`.trim();
        if (output === '') {
          resolve(null);
          return;
        }
        resolve(err != null && VERSION_RE.exec(output) == null ? null : output);
      }
    );
  });
}

async function checkOne(def: ToolDef): Promise<ToolStatus> {
  const candidates = [def, ...(def.fallbacks ?? [])];
  for (const candidate of candidates) {
    const output = await runOnce(candidate);
    const match = output != null ? VERSION_RE.exec(output) : null;
    if (match != null) {
      return { id: def.id, installed: true, version: match[0] };
    }
  }
  return { id: def.id, installed: false };
}

export class ToolsChecker {
  private cache: ToolStatus[] | null = null;

  async check(force = false): Promise<ToolStatus[]> {
    if (this.cache != null && !force) return this.cache;
    this.cache = await this.runAll();
    return this.cache;
  }

  private async runAll(): Promise<ToolStatus[]> {
    const results: ToolStatus[] = new Array(TOOLS.length);
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < TOOLS.length) {
        const index = cursor++;
        const def = TOOLS[index];
        if (def == null) break;
        results[index] = await checkOne(def);
      }
    };
    await Promise.all(Array.from({ length: 4 }, () => worker()));
    return results;
  }
}
