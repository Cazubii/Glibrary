import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { AgentRunStore } from '../src/main/services/agent-run-store';
import type { AgentRun } from '../src/shared/types';

// startedAt determinístico e distinto por id, para ordenar de forma estável
function makeRun(id: string, status: AgentRun['status'] = 'done'): AgentRun {
  const index = Number(id.replace(/^r/, '')) || 0;
  return {
    id,
    profileId: 'p1',
    profileName: 'Perfil',
    repoId: 'repo1',
    repoName: 'demo',
    command: 'claude "oi"',
    status,
    startedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    logFile: ''
  };
}

describe('AgentRunStore', () => {
  const dir = mkdtempSync(join(tmpdir(), 'glib-runs-'));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('carrega lista vazia quando o arquivo não existe', async () => {
    const store = new AgentRunStore(join(dir, 'a'));
    expect(await store.load()).toEqual([]);
    expect(store.list()).toEqual([]);
  });

  it('persiste upsert e recarrega entre instâncias', async () => {
    const store = new AgentRunStore(join(dir, 'b'));
    await store.load();
    const run = makeRun('r1', 'running');
    await store.upsert(run);
    const other = new AgentRunStore(join(dir, 'b'));
    expect((await other.load()).map((r) => r.id)).toEqual(['r1']);
  });

  it('execuções "running" de sessão anterior viram error no load', async () => {
    const store = new AgentRunStore(join(dir, 'c'));
    await store.load();
    await store.upsert(makeRun('r2', 'running'));
    const other = new AgentRunStore(join(dir, 'c'));
    const loaded = await other.load();
    expect(loaded.find((r) => r.id === 'r2')?.status).toBe('error');
  });

  it('lista mais recente primeiro e limita a 500 execuções', async () => {
    const store = new AgentRunStore(join(dir, 'd'));
    await store.load();
    for (let i = 0; i < 520; i += 1) {
      await store.upsert(makeRun(`r${i}`));
    }
    const list = store.list();
    expect(list).toHaveLength(500);
    expect(list[0].id).toBe('r519');
  }, 30_000);

  it('grava arquivo JSON válido', async () => {
    const store = new AgentRunStore(join(dir, 'e'));
    await store.load();
    await store.upsert(makeRun('r1'));
    const raw = JSON.parse(
      readFileSync(join(dir, 'e', 'agent-runs.json'), 'utf-8')
    ) as unknown[];
    expect((raw as AgentRun[])[0].id).toBe('r1');
  });
});
