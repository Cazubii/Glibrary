import { promises as fs } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { AgentRunSchema } from '../../shared/schemas';
import type { AgentRun } from '../../shared/types';

const RUNS_FILE = 'agent-runs.json';
const MAX_RUNS = 500;

export class AgentRunStore {
  private runs: AgentRun[] = [];

  constructor(private readonly baseDir: string) {}

  async load(): Promise<AgentRun[]> {
    this.runs = [];
    try {
      const raw = await fs.readFile(join(this.baseDir, RUNS_FILE), 'utf-8');
      const parsed = z.array(AgentRunSchema).parse(JSON.parse(raw) as unknown);
      const now = new Date().toISOString();
      this.runs = parsed.map((run) =>
        run.status === 'running'
          ? { ...run, status: 'error' as const, finishedAt: run.finishedAt ?? now }
          : run
      );
    } catch {
      this.runs = [];
    }
    return this.list();
  }

  list(): AgentRun[] {
    return [...this.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async upsert(run: AgentRun): Promise<void> {
    const parsed = AgentRunSchema.parse(run);
    const index = this.runs.findIndex((item) => item.id === parsed.id);
    if (index === -1) {
      this.runs.push(parsed);
    } else {
      this.runs[index] = parsed;
    }
    this.runs = [...this.runs].slice(-MAX_RUNS);
    await this.save();
  }

  private async save(): Promise<void> {
    const tmp = join(this.baseDir, `${RUNS_FILE}.tmp`);
    const target = join(this.baseDir, RUNS_FILE);
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(this.runs, null, 2), 'utf-8');
    // No Windows o rename pode falhar (EPERM) se antivírus/indexador segurar o arquivo por um instante
    for (let attempt = 0; ; attempt += 1) {
      try {
        await fs.rename(tmp, target);
        break;
      } catch (error) {
        if (attempt >= 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }
  }
}
