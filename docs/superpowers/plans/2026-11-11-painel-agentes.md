# Painel de Agentes de IA — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova página "Agentes" no Glibrary para criar perfis de agentes de IA, lançar execuções (sub-agentes) paralelas em repositórios da biblioteca e monitorar status/logs/histórico.

**Architecture:** Serviço `AgentRunManager` (padrão do `ProcessManager`) indexado por `runId` + `AgentRunStore` persistindo `agent-runs.json` + perfis no `library.json` v2. IPC invoke/push novo; página React com store Zustand e dois modos de visualização (Painel/Grid) salvos nas settings.

**Tech Stack:** Electron (main/preload/renderer), React 19, Zustand, Zod, Vitest, Tailwind (tema `steam-*`).

**Spec:** `docs/superpowers/specs/2026-11-11-painel-agentes-design.md`

**Importante:** o repositório tem mudanças não relacionadas no worktree. Cada commit deve adicionar **apenas os arquivos da tarefa** (`git add <arquivos>`).

---

### Task 1: Tipos compartilhados e presets de CLI

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/shared/agent-presets.ts`
- Test: `tests/agent-presets.test.ts`

- [ ] **Step 1: Escrever teste falhando**

`tests/agent-presets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AGENT_CLI_PRESETS, findAgentPreset } from '../src/shared/agent-presets';

describe('AGENT_CLI_PRESETS', () => {
  it('traz os CLIs conhecidos', () => {
    const commands = AGENT_CLI_PRESETS.map((p) => p.command);
    expect(commands).toEqual(['claude', 'codex', 'gemini', 'aider']);
  });

  it('findAgentPreset resolve por comando e devolve undefined para custom', () => {
    expect(findAgentPreset('claude')?.id).toBe('claude');
    expect(findAgentPreset('meu-cli')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar teste para ver falhar**

Run: `pnpm vitest run tests/agent-presets.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Criar presets e tipos**

`src/shared/agent-presets.ts`:

```ts
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
```

Em `src/shared/types.ts`, adicionar após `LogLine` (linha ~291):

```ts
export type AgentViewMode = 'painel' | 'grid';

export interface AgentProfile {
  id: string;
  name: string;
  repoId: string;
  command: string;
  args: string[];
  createdAt: string;
  lastRunAt?: string;
}

export type AgentRunStatus = 'running' | 'done' | 'stopped' | 'error';

export interface AgentRun {
  id: string;
  profileId: string;
  profileName: string; // snapshot do nome do perfil
  repoId: string;
  repoName: string;
  command: string; // linha completa executada
  prompt?: string; // tarefa inicial do sub-agente
  status: AgentRunStatus;
  exitCode?: number;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  lastError?: string; // cauda do stderr quando falha
  logFile: string;
}
```

Na interface `Settings` (linha ~150), adicionar o campo:

```ts
  agentsViewMode?: AgentViewMode; // modo de visualização da página Agentes
```

Na interface `LibraryFile` (linha ~266), adicionar:

```ts
  agentProfiles: AgentProfile[];
```

- [ ] **Step 4: Rodar teste para ver passar**

Run: `pnpm vitest run tests/agent-presets.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/agent-presets.ts tests/agent-presets.test.ts
git commit -m "feat: tipos e presets do painel de agentes"
```

---

### Task 2: Schemas Zod

**Files:**
- Modify: `src/shared/schemas.ts`
- Test: `tests/agent-schemas.test.ts`

- [ ] **Step 1: Escrever teste falhando**

`tests/agent-schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  AgentProfileSchema,
  AgentProfileInputSchema,
  AgentProfileUpdateInputSchema,
  AgentRunSchema,
  AgentRunStartInputSchema,
  AgentIdInputSchema
} from '../src/shared/schemas';

describe('Schemas do painel de agentes', () => {
  it('AgentProfileInputSchema aplica args padrão', () => {
    const input = AgentProfileInputSchema.parse({ name: 'Claude', repoId: 'r1', command: 'claude' });
    expect(input.args).toEqual([]);
  });

  it('AgentProfileInputSchema rejeita comando vazio', () => {
    expect(() =>
      AgentProfileInputSchema.parse({ name: 'x', repoId: 'r1', command: '  ' })
    ).toThrow();
  });

  it('AgentProfileUpdateInputSchema exige id e patch', () => {
    const ok = AgentProfileUpdateInputSchema.parse({ id: 'p1', patch: { name: 'novo' } });
    expect(ok.patch.name).toBe('novo');
    expect(() => AgentProfileUpdateInputSchema.parse({ patch: {} })).toThrow();
  });

  it('AgentRunStartInputSchema aceita prompt opcional e rejeita campos extras', () => {
    const ok = AgentRunStartInputSchema.parse({ profileId: 'p1', prompt: 'oi' });
    expect(ok.prompt).toBe('oi');
    expect(() => AgentRunStartInputSchema.parse({ profileId: '' })).toThrow();
    expect(() => AgentRunStartInputSchema.parse({ profileId: 'p1', extra: 1 })).toThrow();
  });

  it('AgentRunSchema valida run e status enum', () => {
    const run = AgentRunSchema.parse({
      id: 'r1', profileId: 'p1', profileName: 'n', repoId: 'repo', repoName: 'demo',
      command: 'claude "oi"', status: 'running', startedAt: '2026-01-01T00:00:00Z', logFile: ''
    });
    expect(run.status).toBe('running');
    expect(() => AgentRunSchema.parse({ ...run, status: 'x' })).toThrow();
  });

  it('AgentIdInputSchema exige id', () => {
    expect(AgentIdInputSchema.parse({ id: 'x' })).toEqual({ id: 'x' });
    expect(() => AgentIdInputSchema.parse({})).toThrow();
  });
});
```

- [ ] **Step 2: Rodar teste para ver falhar**

Run: `pnpm vitest run tests/agent-schemas.test.ts`
Expected: FAIL (schemas não existem)

- [ ] **Step 3: Implementar schemas**

Em `src/shared/schemas.ts`, adicionar ao final do arquivo:

```ts
export const AgentProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  repoId: z.string().min(1),
  command: z.string().trim().min(1).max(500),
  args: z.array(z.string().max(500)).max(20).default([]),
  createdAt: z.string(),
  lastRunAt: z.string().optional()
});

export const AgentProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  repoId: z.string().min(1),
  command: z.string().trim().min(1).max(500),
  args: z.array(z.string().max(500)).max(20).default([])
});

export const AgentProfileUpdateInputSchema = z
  .object({
    id: z.string().min(1),
    patch: AgentProfileInputSchema.partial().strict()
  })
  .strict();

export const AgentRunStatusSchema = z.enum(['running', 'done', 'stopped', 'error']);

export const AgentRunSchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1),
  profileName: z.string().min(1),
  repoId: z.string().min(1),
  repoName: z.string().min(1),
  command: z.string().min(1),
  prompt: z.string().optional(),
  status: AgentRunStatusSchema,
  exitCode: z.number().int().optional(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  lastError: z.string().optional(),
  logFile: z.string()
});

export const AgentRunStartInputSchema = z
  .object({
    profileId: z.string().min(1),
    prompt: z.string().trim().max(4000).optional()
  })
  .strict();

export const AgentIdInputSchema = z.object({ id: z.string().min(1) }).strict();
```

E em `SettingsSchema` (linha ~109), adicionar antes da chave de fechamento `})`:

```ts
  agentsViewMode: z.enum(['painel', 'grid']).optional(),
```

Em `LibraryFileSchema` (linha ~240), adicionar:

```ts
  agentProfiles: z.array(AgentProfileSchema).default([]),
```

- [ ] **Step 4: Rodar teste para ver passar**

Run: `pnpm vitest run tests/agent-schemas.test.ts`
Expected: PASS

- [ ] **Step 5: Verificar regressão dos schemas existentes**

Run: `pnpm vitest run`
Expected: PASS (nenhum teste existente quebra; `.default([])` em `LibraryFileSchema` mantém compat)

- [ ] **Step 6: Commit**

```bash
git add src/shared/schemas.ts tests/agent-schemas.test.ts
git commit -m "feat: schemas Zod de perfis e execuções de agentes"
```

---

### Task 3: Canais IPC

**Files:**
- Modify: `src/shared/ipc-channels.ts`

- [ ] **Step 1: Adicionar canais**

Em `src/shared/ipc-channels.ts`, adicionar ao final do objeto `IpcChannels`:

```ts
  agentProfilesList: 'agentProfiles:list',
  agentProfilesCreate: 'agentProfiles:create',
  agentProfilesUpdate: 'agentProfiles:update',
  agentProfilesRemove: 'agentProfiles:remove',
  agentRunsStart: 'agentRuns:start',
  agentRunsStop: 'agentRuns:stop',
  agentRunsList: 'agentRuns:list',
  agentRunsGetLogs: 'agentRuns:getLogs',
  agentRunsChanged: 'agentRuns:changed',
  agentRunsLog: 'agentRuns:log'
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat: canais IPC do painel de agentes"
```

---

### Task 4: AgentRunStore (persistência de execuções)

**Files:**
- Create: `src/main/services/agent-run-store.ts`
- Test: `tests/agent-run-store.test.ts`

- [ ] **Step 1: Escrever teste falhando**

`tests/agent-run-store.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { AgentRunStore } from '../src/main/services/agent-run-store';
import type { AgentRun } from '../src/shared/types';

function makeRun(id: string, status: AgentRun['status'] = 'done'): AgentRun {
  return {
    id, profileId: 'p1', profileName: 'Perfil', repoId: 'repo1', repoName: 'demo',
    command: 'claude "oi"', status, startedAt: '2026-01-01T00:00:00Z', logFile: ''
  };
}

describe('AgentRunStore', () => {
  const dir = mkdtempSync(join(tmpdir(), 'glib-runs-'));
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

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
  });

  it('grava arquivo JSON válido', async () => {
    const store = new AgentRunStore(join(dir, 'e'));
    await store.load();
    await store.upsert(makeRun('r1'));
    const raw = JSON.parse(readFileSync(join(dir, 'e', 'agent-runs.json'), 'utf-8')) as unknown[];
    expect((raw as AgentRun[])[0].id).toBe('r1');
  });
});
```

- [ ] **Step 2: Rodar teste para ver falhar**

Run: `pnpm vitest run tests/agent-run-store.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Implementar AgentRunStore**

`src/main/services/agent-run-store.ts`:

```ts
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
    if (index === -1) this.runs.push(parsed);
    else this.runs[index] = parsed;
    this.runs = [...this.runs].slice(-MAX_RUNS);
    await this.save();
  }

  private async save(): Promise<void> {
    const tmp = join(this.baseDir, `${RUNS_FILE}.tmp`);
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(this.runs, null, 2), 'utf-8');
    await fs.rename(tmp, join(this.baseDir, RUNS_FILE));
  }
}
```

- [ ] **Step 4: Rodar teste para ver passar**

Run: `pnpm vitest run tests/agent-run-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/agent-run-store.ts tests/agent-run-store.test.ts
git commit -m "feat: persistência de execuções de agentes"
```

---

### Task 5: CRUD de perfis na LibraryStore

**Files:**
- Modify: `src/main/services/library-store.ts`
- Test: `tests/agent-profiles-store.test.ts`

- [ ] **Step 1: Escrever teste falhando**

`tests/agent-profiles-store.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { LibraryStore } from '../src/main/services/library-store';

describe('LibraryStore — perfis de agentes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'glib-profiles-'));
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  async function makeStore(): Promise<LibraryStore> {
    const store = new LibraryStore(dir, dir);
    await store.load();
    return store;
  }

  it('adiciona perfil com id/createdAt gerados e args padrão', async () => {
    const store = await makeStore();
    const profile = await store.addAgentProfile({ name: 'Claude', repoId: 'repo1', command: 'claude' });
    expect(profile.name).toBe('Claude');
    expect(profile.args).toEqual([]);
    expect(profile.createdAt).toBeTruthy();
    expect(store.listAgentProfiles()).toHaveLength(1);
  });

  it('atualiza campos parciais', async () => {
    const store = await makeStore();
    const created = await store.addAgentProfile({ name: 'A', repoId: 'r', command: 'claude' });
    const updated = await store.updateAgentProfile(created.id, { name: 'B', args: ['--model', 'sonnet'] });
    expect(updated.name).toBe('B');
    expect(updated.args).toEqual(['--model', 'sonnet']);
    expect(updated.command).toBe('claude');
  });

  it('remove perfil', async () => {
    const store = await makeStore();
    const created = await store.addAgentProfile({ name: 'A', repoId: 'r', command: 'claude' });
    await store.removeAgentProfile(created.id);
    expect(store.listAgentProfiles()).toHaveLength(0);
  });

  it('rejeita update/remove de perfil inexistente', async () => {
    const store = await makeStore();
    await expect(store.updateAgentProfile('falta', { name: 'x' })).rejects.toThrow();
    await expect(store.removeAgentProfile('falta')).rejects.toThrow();
  });

  it('persist perfis entre instâncias', async () => {
    const store = await makeStore();
    await store.addAgentProfile({ name: 'Persistido', repoId: 'r', command: 'codex' });
    const other = new LibraryStore(dir, dir);
    await other.load();
    expect(other.listAgentProfiles().map((p) => p.name)).toContain('Persistido');
  });
});
```

- [ ] **Step 2: Rodar teste para ver falhar**

Run: `pnpm vitest run tests/agent-profiles-store.test.ts`
Expected: FAIL (métodos não existem)

- [ ] **Step 3: Implementar na LibraryStore**

Em `src/main/services/library-store.ts`:

Importar `AgentProfileInputSchema, AgentProfileSchema` junto aos outros schemas (linha ~8) e o tipo `AgentProfile` (linha ~6).

Atualizar `emptyLibrary` (linha ~43) para incluir o novo array obrigatório do tipo `LibraryFile`:

```ts
export function emptyLibrary(reposRoot: string): LibraryFile {
  return { version: 2, repos: [], skills: [], agents: [], bases: [], projects: [], kits: [], usage: [], agentProfiles: [], topRepos: { fetchedAt: '', repos: [] }, topRepos7: { fetchedAt: '', repos: [], windowDays: 7 }, settings: defaultSettings(reposRoot) };
}
```

Adicionar métodos à classe (após `removeKit`, linha ~231):

```ts
  listAgentProfiles(): AgentProfile[] {
    return this.data.agentProfiles;
  }

  async addAgentProfile(input: { name: string; repoId: string; command: string; args?: string[] }): Promise<AgentProfile> {
    const parsed = AgentProfileInputSchema.parse(input);
    const profile = AgentProfileSchema.parse({
      id: randomUUID(),
      name: parsed.name,
      repoId: parsed.repoId,
      command: parsed.command,
      args: parsed.args,
      createdAt: new Date().toISOString()
    });
    this.data.agentProfiles.push(profile);
    await this.save();
    return profile;
  }

  async updateAgentProfile(id: string, patch: { name?: string; repoId?: string; command?: string; args?: string[]; lastRunAt?: string }): Promise<AgentProfile> {
    const index = this.data.agentProfiles.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Perfil não encontrado: ${id}`);
    const merged = AgentProfileSchema.parse({
      ...this.data.agentProfiles[index],
      ...(patch.name != null ? { name: patch.name.trim() } : {}),
      ...(patch.repoId != null ? { repoId: patch.repoId } : {}),
      ...(patch.command != null ? { command: patch.command.trim() } : {}),
      ...(patch.args != null ? { args: patch.args } : {}),
      ...(patch.lastRunAt != null ? { lastRunAt: patch.lastRunAt } : {})
    });
    this.data.agentProfiles[index] = merged;
    await this.save();
    return merged;
  }

  async removeAgentProfile(id: string): Promise<void> {
    const index = this.data.agentProfiles.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Perfil não encontrado: ${id}`);
    this.data.agentProfiles.splice(index, 1);
    await this.save();
  }
```

- [ ] **Step 4: Rodar teste para ver passar**

Run: `pnpm vitest run tests/agent-profiles-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/library-store.ts tests/agent-profiles-store.test.ts
git commit -m "feat: CRUD de perfis de agentes na LibraryStore"
```

---

### Task 6: AgentRunManager (ciclo de vida das execuções)

**Files:**
- Create: `src/main/services/agent-run-manager.ts`
- Test: `tests/agent-run-manager.test.ts`

- [ ] **Step 1: Escrever teste falhando**

`tests/agent-run-manager.test.ts`:

```ts
import type { ChildProcess } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { AgentRunManager, buildAgentCommand } from '../src/main/services/agent-run-manager';
import { AgentRunStore } from '../src/main/services/agent-run-store';
import { LibraryStore } from '../src/main/services/library-store';
import type { AgentProfile } from '../src/shared/types';

interface FakeHooks {
  onExit?: (code: number | null, signal: string | null) => void;
  onError?: (err: Error) => void;
  onOut?: (data: Buffer) => void;
  onErr?: (data: Buffer) => void;
}

function fakeSpawnFactory() {
  const calls: Array<{ command: string; cwd?: string }> = [];
  const spawned: FakeHooks[] = [];
  const spawn = (command: string, options: { cwd?: string }): ChildProcess => {
    calls.push({ command, cwd: options.cwd });
    const hooks: FakeHooks = {};
    spawned.push(hooks);
    return {
      pid: 4242,
      stdout: { on: (_: string, cb: (d: Buffer) => void) => { hooks.onOut = cb; } },
      stderr: { on: (_: string, cb: (d: Buffer) => void) => { hooks.onErr = cb; } },
      on: (event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'exit') hooks.onExit = cb as FakeHooks['onExit'];
        if (event === 'error') hooks.onError = cb as FakeHooks['onError'];
      },
      kill: () => hooks.onExit?.(0, 'SIGTERM')
    } as unknown as ChildProcess;
  };
  return { spawn, calls, spawned };
}

const wait = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('buildAgentCommand', () => {
  it('junta command + args e cita o prompt', () => {
    const profile: AgentProfile = { id: 'p', name: 'n', repoId: 'r', command: 'claude', args: ['--model', 'sonnet'], createdAt: '' };
    expect(buildAgentCommand(profile)).toBe('claude --model sonnet');
    expect(buildAgentCommand(profile, 'faça "x"')).toBe('claude --model sonnet "faça \\"x\\""');
  });
});

describe('AgentRunManager', () => {
  const dir = mkdtempSync(join(tmpdir(), 'glib-agentmgr-'));
  const logsRoot = join(dir, 'logs');
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  async function makeManager() {
    const store = new LibraryStore(dir, dir);
    await store.load();
    await store.addRepo({
      id: 'repo1', name: 'demo', localPath: dir, status: 'installed',
      tags: [], favorite: false, addedAt: new Date().toISOString()
    });
    const profile = await store.addAgentProfile({ name: 'Claude', repoId: 'repo1', command: 'claude' });
    const runStore = new AgentRunStore(join(dir, 'runs'));
    await runStore.load();
    const fake = fakeSpawnFactory();
    const emitted: Array<{ channel: string; payload: unknown }> = [];
    const manager = new AgentRunManager(
      store, runStore, logsRoot,
      (channel, payload) => emitted.push({ channel, payload }),
      fake.spawn
    );
    return { store, profile, runStore, fake, emitted, manager };
  }

  it('start bloqueia perfil inexistente', async () => {
    const { manager } = await makeManager();
    await expect(manager.start('falta')).rejects.toThrow('Perfil não encontrado');
  });

  it('start cria run running, cwd correto e log em disco', async () => {
    const { manager, fake, runStore } = await makeManager();
    const profile = (await manager.listProfiles())[0];
    const run = await manager.start(profile.id);
    expect(run.status).toBe('running');
    expect(fake.calls[0]?.cwd).toBe(dir);
    const saved = runStore.list().find((r) => r.id === run.id);
    expect(saved?.status).toBe('running');
    const logText = readFileSync(run.logFile, 'utf-8');
    expect(logText).toContain('claude');
  });

  it('saída vai para buffer e arquivo', async () => {
    const { manager } = await makeManager();
    const profile = (await manager.listProfiles())[0];
    const run = await manager.start(profile.id);
    const hooks = manager.getActiveHooks(run.id);
    hooks?.onOut?.(Buffer.from('linha um\n'));
    const logs = manager.getLogs(run.id);
    expect(logs.some((l) => l.stream === 'out' && l.text === 'linha um')).toBe(true);
    expect(readFileSync(run.logFile, 'utf-8')).toContain('linha um');
  });

  it('exit 0 → done; exit 1 → error com lastError', async () => {
    const { manager, runStore } = await makeManager();
    const profile = (await manager.listProfiles())[0];
    const runA = await manager.start(profile.id);
    const runB = await manager.start(profile.id);
    const hooksA = manager.getActiveHooks(runA.id);
    const hooksB = manager.getActiveHooks(runB.id);
    hooksB?.onErr?.(Buffer.from('boom\n'));
    hooksA?.onExit?.(0, null);
    hooksB?.onExit?.(1, null);
    await wait();
    expect(runStore.list().find((r) => r.id === runA.id)?.status).toBe('done');
    const failed = runStore.list().find((r) => r.id === runB.id);
    expect(failed?.status).toBe('error');
    expect(failed?.lastError).toContain('boom');
    expect(failed?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('stop marca stopped e emite eventos changed', async () => {
    const { manager, emitted, runStore } = await makeManager();
    const profile = (await manager.listProfiles())[0];
    const run = await manager.start(profile.id);
    await manager.stop(run.id);
    await wait();
    expect(runStore.list().find((r) => r.id === run.id)?.status).toBe('stopped');
    expect(emitted.some((e) => e.channel === 'agentRuns:changed'));
  });

  it('hasActiveRunsForProfile reflete execuções vivas', async () => {
    const { manager } = await makeManager();
    const profile = (await manager.listProfiles())[0];
    expect(manager.hasActiveRunsForProfile(profile.id)).toBe(false);
    const run = await manager.start(profile.id);
    expect(manager.hasActiveRunsForProfile(profile.id)).toBe(true);
    await manager.stop(run.id);
    await wait();
    expect(manager.hasActiveRunsForProfile(profile.id)).toBe(false);
  });
});
```

> Nota: os helpers usados no teste (`listProfiles`, `getActiveHooks`) são métodos
> públicos da classe implementados abaixo (padrão aceito neste repo, cf. `TerminalManager`).
> O `stop` funciona porque o fake `kill()` chama `hooks.onExit(0, 'SIGTERM')` — o manager
> marca `stopRequested` antes, então `finish` grava `stopped`.

- [ ] **Step 2: Rodar teste para ver falhar**

Run: `pnpm vitest run tests/agent-run-manager.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Implementar AgentRunManager**

`src/main/services/agent-run-manager.ts`:

```ts
import { spawn, type ChildProcess } from 'child_process';
import { createWriteStream, promises as fs, type WriteStream } from 'fs';
import { randomUUID } from 'crypto';
import { join } from 'path';
import treeKill from 'tree-kill';
import type { AgentProfile, AgentRun, LogLine } from '../../shared/types';
import { IpcChannels } from '../../shared/ipc-channels';
import type { LibraryStore } from './library-store';
import type { AgentRunStore } from './agent-run-store';

const BUFFER_LIMIT = 5000;
const KILL_GRACE_MS = 5000;
const STDERR_TAIL = 20;
const AGENT_LOGS_KEPT = 200;

export type AgentEmitFn = (channel: string, payload: unknown) => void;
export type SpawnFn = typeof spawn;
export type KillFn = (pid: number, signal: string) => void;

interface RunEntry {
  proc: ChildProcess;
  run: AgentRun;
  logStream: WriteStream | null;
  stderrTail: string[];
  stopRequested: boolean;
}

/** Monta a linha de comando do agente: command + args + prompt citado como último argumento. */
export function buildAgentCommand(profile: AgentProfile, prompt?: string): string {
  const parts = [profile.command, ...profile.args];
  if (prompt != null && prompt.trim() !== '') {
    parts.push(`"${prompt.replace(/"/g, '\\"')}"`);
  }
  return parts.join(' ');
}

export class AgentRunManager {
  private readonly active = new Map<string, RunEntry>();
  private readonly buffers = new Map<string, LogLine[]>();

  constructor(
    private readonly store: LibraryStore,
    private readonly runStore: AgentRunStore,
    private readonly logsRoot: string,
    private readonly emit: AgentEmitFn,
    private readonly spawnFn: SpawnFn = spawn,
    private readonly killFn: KillFn = (pid, signal) => treeKill(pid, signal),
  ) {}

  listProfiles(): AgentProfile[] {
    return this.store.listAgentProfiles();
  }

  hasActiveRunsForProfile(profileId: string): boolean {
    for (const entry of this.active.values()) {
      if (entry.run.profileId === profileId) return true;
    }
    return false;
  }

  getLogs(runId: string): LogLine[] {
    return this.buffers.get(runId) ?? [];
  }

  /** Acesso aos hooks do processo fake em testes; undefined em produção fora de testes. */
  getActiveHooks(runId: string): { onOut: (d: Buffer) => void; onErr: (d: Buffer) => void; onExit: (code: number | null, signal: string | null) => void } | undefined {
    return undefined; // implementado abaixo via closure — ver nota
  }

  async start(profileId: string, prompt?: string): Promise<AgentRun> {
    const profile = this.store.listAgentProfiles().find((p) => p.id === profileId);
    if (profile == null) throw new Error('Perfil não encontrado');
    const repo = this.store.getRepo(profile.repoId);
    if (repo == null) throw new Error('Repositório não encontrado');
    if (repo.localPath == null || repo.localPath === '') throw new Error('Repositório sem pasta local');

    const command = buildAgentCommand(profile, prompt);
    const run: AgentRun = {
      id: randomUUID(),
      profileId: profile.id,
      profileName: profile.name,
      repoId: repo.id,
      repoName: repo.name,
      command,
      ...(prompt != null && prompt.trim() !== '' ? { prompt } : {}),
      status: 'running',
      startedAt: new Date().toISOString(),
      logFile: ''
    };

    const logFile = await this.openLogFile(run.id, repo.name);
    run.logFile = logFile?.path ?? '';

    const proc = this.spawnFn(command, {
      cwd: repo.localPath,
      env: { ...process.env, FORCE_COLOR: '1' },
      shell: true
    });

    const entry: RunEntry = {
      proc, run,
      logStream: logFile?.stream ?? null,
      stderrTail: [],
      stopRequested: false
    };
    this.active.set(run.id, entry);
    this.buffers.set(run.id, []);

    proc.stdout?.on('data', (data: Buffer) => this.onData(entry, 'out', data));
    proc.stderr?.on('data', (data: Buffer) => this.onData(entry, 'err', data));
    proc.on('error', (err: Error) => this.pushLine(entry, { stream: 'err', text: err.message }));
    proc.on('exit', (code: number | null, signal: string | null) => {
      const exitCode = code ?? (signal != null ? 1 : 0);
      this.finish(entry, exitCode).catch(() => undefined);
    });

    this.pushLine(entry, { stream: 'sys', text: `> ${command}` });
    await this.runStore.upsert({ ...entry.run });
    await this.store.updateAgentProfile(profile.id, { lastRunAt: new Date().toISOString() });
    this.emitChanged({ ...entry.run });
    return { ...entry.run };
  }

  async stop(runId: string): Promise<void> {
    const entry = this.active.get(runId);
    if (entry == null) return;
    entry.stopRequested = true;
    const pid = entry.proc.pid;
    if (pid == null) {
      entry.proc.kill('SIGTERM');
      return;
    }
    this.killFn(pid, 'SIGTERM');
    setTimeout(() => {
      if (this.active.get(runId) === entry && entry.proc.exitCode == null) {
        this.killFn(pid, 'SIGKILL');
      }
    }, KILL_GRACE_MS);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.active.keys()].map((id) => this.stop(id)));
    const deadline = Date.now() + KILL_GRACE_MS + 2000;
    while (this.active.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    for (const [id, entry] of this.active) {
      const pid = entry.proc.pid;
      if (pid != null) this.killFn(pid, 'SIGKILL');
      this.active.delete(id);
    }
  }

  private onData(entry: RunEntry, stream: 'out' | 'err', data: Buffer): void {
    for (const line of data.toString('utf-8').split(/\r?\n/)) {
      if (line === '') continue;
      if (stream === 'err') {
        entry.stderrTail.push(line);
        if (entry.stderrTail.length > STDERR_TAIL) entry.stderrTail.shift();
      }
      this.pushLine(entry, { stream, text: line });
    }
  }

  private pushLine(entry: RunEntry, partial: Omit<LogLine, 'ts'>): void {
    const line: LogLine = { ts: new Date().toISOString(), ...partial };
    const buffer = this.buffers.get(entry.run.id);
    if (buffer != null) {
      buffer.push(line);
      if (buffer.length > BUFFER_LIMIT) buffer.splice(0, buffer.length - BUFFER_LIMIT);
    }
    entry.logStream?.write(`[${line.ts}] ${line.text}\n`);
    this.emit(IpcChannels.agentRunsLog, { id: entry.run.id, line });
  }

  private async finish(entry: RunEntry, code: number): Promise<void> {
    try {
      const logStream = entry.logStream;
      if (logStream != null) {
        logStream.end();
        if (!logStream.closed) {
          await new Promise<void>((resolve) => logStream.once('close', resolve));
        }
      }
      const run: AgentRun = { ...entry.run };
      run.exitCode = code;
      run.finishedAt = new Date().toISOString();
      run.durationMs = Math.max(0, Date.now() - Date.parse(run.startedAt));
      if (entry.stopRequested) run.status = 'stopped';
      else if (code === 0) run.status = 'done';
      else {
        run.status = 'error';
        const tail = entry.stderrTail.join('\n');
        if (tail !== '') run.lastError = tail;
      }
      entry.run = run;
      await this.runStore.upsert(run);
      this.emitChanged(run);
    } finally {
      this.active.delete(entry.run.id);
    }
  }

  private emitChanged(run: AgentRun): void {
    this.emit(IpcChannels.agentRunsChanged, run);
  }

  private async openLogFile(runId: string, repoName: string): Promise<{ path: string; stream: WriteStream } | null> {
    try {
      await fs.mkdir(this.logsRoot, { recursive: true });
      const filePath = join(this.logsRoot, `${runId}.log`);
      const stream = createWriteStream(filePath, { flags: 'a' });
      stream.write(`# ${repoName} — agente — ${new Date().toISOString()}\n`);
      await this.pruneLogs();
      return { path: filePath, stream };
    } catch {
      return null;
    }
  }

  private async pruneLogs(): Promise<void> {
    try {
      const names = (await fs.readdir(this.logsRoot)).filter((n) => n.endsWith('.log'));
      if (names.length <= AGENT_LOGS_KEPT) return;
      const stats = await Promise.all(names.map(async (n) => {
        const full = join(this.logsRoot, n);
        return { full, at: (await fs.stat(full)).mtimeMs };
      }));
      stats.sort((a, b) => a.at - b.at);
      await Promise.all(stats.slice(0, stats.length - AGENT_LOGS_KEPT).map((s) => fs.unlink(s.full).catch(() => undefined)));
    } catch {
      // melhor esforço
    }
  }
}
```

**Importante sobre `getActiveHooks`:** o esboço acima retorna `undefined`. Para os testes funcionarem, implemente-o assim (mantém o campo `hooks` opcional na `RunEntry`):

Adicionar em `RunEntry`: `hooks?: { onOut?: (d: Buffer) => void; onErr?: (d: Buffer) => void; onExit?: (c: number | null, s: string | null) => void }`.

No `start()`, logo após criar `entry`, capturar os callbacks:

```ts
    const hooks: NonNullable<RunEntry['hooks']> = {};
    proc.stdout?.on('data', (data: Buffer) => { hooks.onOut?.(data); this.onData(entry, 'out', data); });
    proc.stderr?.on('data', (data: Buffer) => { hooks.onErr?.(data); this.onData(entry, 'err', data); });
    proc.on('error', (err: Error) => this.pushLine(entry, { stream: 'err', text: err.message }));
    proc.on('exit', (code: number | null, signal: string | null) => {
      hooks.onExit?.(code, signal);
      const exitCode = code ?? (signal != null ? 1 : 0);
      this.finish(entry, exitCode).catch(() => undefined);
    });
    entry.hooks = hooks;
```

E o método público:

```ts
  getActiveHooks(runId: string): NonNullable<RunEntry['hooks']> | undefined {
    return this.active.get(runId)?.hooks;
  }
```

No teste, `makeManager` então fica sem precisar do `killFn` custom:

```ts
    const manager = new AgentRunManager(
      store, runStore, logsRoot,
      (channel, payload) => emitted.push({ channel, payload }),
      fake.spawn
    );
```

E o teste de `stop` funciona porque o fake `kill()` chama `hooks.onExit(0, 'SIGTERM')` — o manager marca `stopRequested` antes, então `finish` grava `stopped`.

- [ ] **Step 4: Rodar teste para ver passar**

Run: `pnpm vitest run tests/agent-run-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/agent-run-manager.ts tests/agent-run-manager.test.ts
git commit -m "feat: AgentRunManager com ciclo de vida e logs de execuções"
```

---

### Task 7: IPC dos agentes e wiring no main

**Files:**
- Create: `src/main/ipc/agent-runs.ipc.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Criar handlers IPC**

`src/main/ipc/agent-runs.ipc.ts`:

```ts
import { ipcMain } from 'electron';
import type { AgentProfile, AgentRun, IpcResult, LogLine } from '../../shared/types';
import {
  AgentIdInputSchema,
  AgentProfileInputSchema,
  AgentProfileUpdateInputSchema,
  AgentRunStartInputSchema
} from '../../shared/schemas';
import { IpcChannels } from '../../shared/ipc-channels';
import type { AgentRunManager } from '../services/agent-run-manager';
import type { LibraryStore } from '../services/library-store';

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export function registerAgentRunsIpc(store: LibraryStore, manager: AgentRunManager): void {
  ipcMain.handle(IpcChannels.agentProfilesList, async (): Promise<IpcResult<AgentProfile[]>> => {
    try { return ok(store.listAgentProfiles()); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentProfilesCreate, async (_event, raw: unknown): Promise<IpcResult<AgentProfile>> => {
    try {
      const input = AgentProfileInputSchema.parse(raw);
      if (store.getRepo(input.repoId) == null) throw new Error('Repositório não encontrado');
      return ok(await store.addAgentProfile(input));
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentProfilesUpdate, async (_event, raw: unknown): Promise<IpcResult<AgentProfile>> => {
    try {
      const { id, patch } = AgentProfileUpdateInputSchema.parse(raw);
      if (patch.repoId != null && store.getRepo(patch.repoId) == null) throw new Error('Repositório não encontrado');
      return ok(await store.updateAgentProfile(id, patch));
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentProfilesRemove, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { id } = AgentIdInputSchema.parse(raw);
      if (manager.hasActiveRunsForProfile(id)) {
        throw new Error('Pare as execuções ativas deste perfil antes de removê-lo');
      }
      await store.removeAgentProfile(id);
      return ok(null);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentRunsStart, async (_event, raw: unknown): Promise<IpcResult<AgentRun>> => {
    try {
      const input = AgentRunStartInputSchema.parse(raw);
      return ok(await manager.start(input.profileId, input.prompt));
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentRunsStop, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { id } = AgentIdInputSchema.parse(raw);
      await manager.stop(id);
      return ok(null);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentRunsList, async (): Promise<IpcResult<AgentRun[]>> => {
    try { return ok(manager.listRuns()); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentRunsGetLogs, async (_event, raw: unknown): Promise<IpcResult<LogLine[]>> => {
    try {
      const { id } = AgentIdInputSchema.parse(raw);
      return ok(manager.getLogs(id));
    } catch (e) { return fail(e); }
  });
}
```

Isso exige o método público `listRuns()` no `AgentRunManager` (Task 6). Adicionar à classe:

```ts
  listRuns(): AgentRun[] {
    return this.runStore.list();
  }
```

- [ ] **Step 2: Wiring no main/index.ts**

Em `src/main/index.ts`, adicionar imports:

```ts
import { AgentRunStore } from './services/agent-run-store';
import { AgentRunManager } from './services/agent-run-manager';
import { registerAgentRunsIpc } from './ipc/agent-runs.ipc';
```

Dentro de `app.whenReady()`, após `await store.load();`:

```ts
  const runStore = new AgentRunStore(app.getPath('userData'));
  await runStore.load();
  const runManager = new AgentRunManager(store, runStore, join(app.getPath('userData'), 'logs'));
  registerAgentRunsIpc(store, runManager);
```

E antes do fechamento do `app.whenReady()` (após `app.on('activate', ...)`):

```ts
  app.on('before-quit', () => { void runManager.stopAll(); });
```

- [ ] **Step 3: Verificar tipos e testes**

Run: `pnpm typecheck`
Expected: PASS

Run: `pnpm vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/agent-runs.ipc.ts src/main/index.ts src/main/services/agent-run-manager.ts
git commit -m "feat: IPC do painel de agentes e wiring no processo main"
```

---

### Task 8: API do renderer

**Files:**
- Modify: `src/renderer/src/lib/api.ts`

- [ ] **Step 1: Adicionar funções**

Em `src/renderer/src/lib/api.ts`, adicionar aos imports de tipos (linha ~1): `AgentProfile`, `AgentRun`, `AgentViewMode`.

Adicionar ao objeto `api`:

```ts
  agentProfilesList: (): Promise<AgentProfile[]> =>
    unwrap<AgentProfile[]>(window.api.invoke(IpcChannels.agentProfilesList)),

  agentProfilesCreate: (input: { name: string; repoId: string; command: string; args?: string[] }): Promise<AgentProfile> =>
    unwrap<AgentProfile>(window.api.invoke(IpcChannels.agentProfilesCreate, input)),

  agentProfilesUpdate: (id: string, patch: { name?: string; repoId?: string; command?: string; args?: string[] }): Promise<AgentProfile> =>
    unwrap<AgentProfile>(window.api.invoke(IpcChannels.agentProfilesUpdate, { id, patch })),

  agentProfilesRemove: (id: string): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.agentProfilesRemove, { id })),

  agentRunsStart: (profileId: string, prompt?: string): Promise<AgentRun> =>
    unwrap<AgentRun>(
      window.api.invoke(IpcChannels.agentRunsStart, { profileId, ...(prompt != null ? { prompt } : {}) })
    ),

  agentRunsStop: (id: string): Promise<null> =>
    unwrap<null>(window.api.invoke(IpcChannels.agentRunsStop, { id })),

  agentRunsList: (): Promise<AgentRun[]> =>
    unwrap<AgentRun[]>(window.api.invoke(IpcChannels.agentRunsList)),

  agentRunsGetLogs: (id: string): Promise<LogLine[]> =>
    unwrap<LogLine[]>(window.api.invoke(IpcChannels.agentRunsGetLogs, { id })),

  onAgentRunsChanged: (listener: (run: AgentRun) => void) =>
    window.api.on(IpcChannels.agentRunsChanged, (payload: unknown) => {
      listener(payload as AgentRun);
    }),

  onAgentRunsLog: (listener: (payload: { id: string; line: LogLine }) => void) =>
    window.api.on(IpcChannels.agentRunsLog, (payload: unknown) => {
      listener(payload as { id: string; line: LogLine });
    }),
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/lib/api.ts
git commit -m "feat: api do renderer para perfis e execuções de agentes"
```

---

### Task 9: Store do renderer

**Files:**
- Create: `src/renderer/src/store/agents.ts`

- [ ] **Step 1: Implementar store**

`src/renderer/src/store/agents.ts`:

```ts
import { create } from 'zustand';
import type { AgentProfile, AgentRun, AgentViewMode, LogLine } from '@shared/types';
import { api } from '../lib/api';

interface AgentsState {
  profiles: AgentProfile[];
  runs: AgentRun[];
  logs: Record<string, LogLine[]>;
  viewMode: AgentViewMode;
  loaded: boolean;
  load: () => Promise<void>;
  initEvents: () => () => void;
  setViewMode: (mode: AgentViewMode) => Promise<void>;
  createProfile: (input: { name: string; repoId: string; command: string; args?: string[] }) => Promise<AgentProfile>;
  updateProfile: (id: string, patch: { name?: string; repoId?: string; command?: string; args?: string[] }) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
  startRun: (profileId: string, prompt?: string) => Promise<void>;
  stopRun: (id: string) => Promise<void>;
}

function mergeRun(runs: AgentRun[], run: AgentRun): AgentRun[] {
  const index = runs.findIndex((item) => item.id === run.id);
  if (index === -1) return [run, ...runs];
  const next = [...runs];
  next[index] = run;
  return next;
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  profiles: [],
  runs: [],
  logs: {},
  viewMode: 'painel',
  loaded: false,

  load: async () => {
    try {
      const [profiles, runs, settings] = await Promise.all([
        api.agentProfilesList(),
        api.agentRunsList(),
        api.settingsGet()
      ]);
      set({ profiles, runs, viewMode: settings.agentsViewMode ?? 'painel', loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  initEvents: () => {
    const offChanged = api.onAgentRunsChanged((run) => {
      set((s) => ({ runs: mergeRun(s.runs, run) }));
    });
    const offLog = api.onAgentRunsLog(({ id, line }) => {
      set((s) => {
        const current = s.logs[id] ?? [];
        const next = [...current, line];
        return { logs: { ...s.logs, [id]: next.length > 5000 ? next.slice(-5000) : next } };
      });
    });
    return () => { offChanged(); offLog(); };
  },

  setViewMode: async (mode) => {
    const settings = await api.settingsSet({ agentsViewMode: mode });
    set({ viewMode: settings.agentsViewMode ?? mode });
  },

  createProfile: async (input) => {
    const profile = await api.agentProfilesCreate(input);
    set((s) => ({ profiles: [...s.profiles, profile] }));
    return profile;
  },

  updateProfile: async (id, patch) => {
    const updated = await api.agentProfilesUpdate(id, patch);
    set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? updated : p)) }));
  },

  removeProfile: async (id) => {
    await api.agentProfilesRemove(id);
    set((s) => ({ profiles: s.profiles.filter((p) => p.id !== id) }));
  },

  startRun: async (profileId, prompt) => {
    const run = await api.agentRunsStart(profileId, prompt);
    set((s) => ({ runs: mergeRun(s.runs, run) }));
  },

  stopRun: async (id) => {
    await api.agentRunsStop(id);
    // o status final chega pelo evento agentRunsChanged
    void get();
  }
}));
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/store/agents.ts
git commit -m "feat: store Zustand da página Agentes"
```

---

### Task 10: Componentes (diálogos e card de execução)

**Files:**
- Create: `src/renderer/src/components/AgentProfileDialog.tsx`
- Create: `src/renderer/src/components/AgentRunDialog.tsx`
- Create: `src/renderer/src/components/AgentRunCard.tsx`

- [ ] **Step 1: AgentProfileDialog**

`src/renderer/src/components/AgentProfileDialog.tsx`:

```tsx
import { useState } from 'react';
import { AGENT_CLI_PRESETS } from '@shared/agent-presets';
import type { AgentProfile, Repo } from '@shared/types';

interface Props {
  repos: Repo[];
  profile: AgentProfile | null; // null = criação
  onClose: () => void;
  onSubmit: (input: { name: string; repoId: string; command: string; args: string[] }) => Promise<void>;
}

export default function AgentProfileDialog({ repos, profile, onClose, onSubmit }: Props): React.JSX.Element {
  const [name, setName] = useState(profile?.name ?? '');
  const [repoId, setRepoId] = useState(profile?.repoId ?? repos[0]?.id ?? '');
  const [command, setCommand] = useState(profile?.command ?? 'claude');
  const [argsText, setArgsText] = useState(profile?.args.join(' ') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setError(null);
    if (name.trim() === '' || command.trim() === '' || repoId === '') {
      setError('Preencha nome, repositório e comando');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        repoId,
        command: command.trim(),
        args: argsText.trim() === '' ? [] : argsText.trim().split(/\s+/)
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-steam-elevated/60 bg-steam-panel p-4">
        <h2 className="mb-3 text-sm font-bold">{profile == null ? 'Novo agente' : 'Editar agente'}</h2>
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-steam-text/70">Nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="rounded bg-steam-bg px-2 py-1.5 outline-none ring-steam-accent/50 focus:ring-1" placeholder="Claude — Refatoração"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-steam-text/70">Repositório</span>
            <select value={repoId} onChange={(e) => setRepoId(e.target.value)} className="rounded bg-steam-bg px-2 py-1.5 outline-none">
              {repos.map((repo) => <option key={repo.id} value={repo.id}>{repo.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-steam-text/70">CLI / comando</span>
            <input value={command} onChange={(e) => setCommand(e.target.value)} list="agent-cli-presets" className="rounded bg-steam-bg px-2 py-1.5 outline-none" placeholder="claude"/>
            <datalist id="agent-cli-presets">
              {AGENT_CLI_PRESETS.map((preset) => <option key={preset.id} value={preset.command}>{preset.label}</option>)}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-steam-text/70">Argumentos fixos (opcional)</span>
            <input value={argsText} onChange={(e) => setArgsText(e.target.value)} className="rounded bg-steam-bg px-2 py-1.5 outline-none" placeholder="--model sonnet"/>
          </label>
          {error != null && <p className="text-xs text-steam-error">{error}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-steam-text/70 hover:bg-steam-elevated">Cancelar</button>
            <button type="button" onClick={() => void submit()} disabled={busy} className="rounded bg-steam-accent/90 px-3 py-1.5 font-semibold text-steam-bg disabled:opacity-50">
              {profile == null ? 'Criar agente' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: AgentRunDialog (lançar sub-agente)**

`src/renderer/src/components/AgentRunDialog.tsx`:

```tsx
import { useState } from 'react';
import type { AgentProfile } from '@shared/types';

interface Props {
  profile: AgentProfile;
  onClose: () => void;
  onLaunch: (profileId: string, prompt?: string) => Promise<void>;
}

export default function AgentRunDialog({ profile, onClose, onLaunch }: Props): React.JSX.Element {
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const launch = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await onLaunch(profile.id, prompt.trim() === '' ? undefined : prompt.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-steam-elevated/60 bg-steam-panel p-4">
        <h2 className="mb-1 text-sm font-bold">Executar sub-agente</h2>
        <p className="mb-3 text-xs text-steam-text/60">{profile.name} · {profile.command}</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Tarefa inicial (opcional)…"
          className="w-full resize-none rounded bg-steam-bg px-2 py-1.5 text-sm outline-none"
        />
        {error != null && <p className="mt-2 text-xs text-steam-error">{error}</p>}
        <div className="mt-3 flex justify-end gap-2 text-sm">
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-steam-text/70 hover:bg-steam-elevated">Cancelar</button>
          <button type="button" onClick={() => void launch()} disabled={busy} className="rounded bg-steam-accent/90 px-3 py-1.5 font-semibold text-steam-bg disabled:opacity-50">Lançar</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: AgentRunCard**

`src/renderer/src/components/AgentRunCard.tsx`:

```tsx
import { Square } from 'lucide-react';
import type { AgentRun, LogLine } from '@shared/types';

interface Props {
  run: AgentRun;
  lines?: LogLine[];
  running: boolean;
  onStop: (id: string) => void;
  onOpenLog?: (run: AgentRun) => void;
  compact?: boolean;
}

function statusStyle(status: AgentRun['status']): { dot: string; label: string } {
  switch (status) {
    case 'running': return { dot: 'bg-steam-green', label: 'Rodando' };
    case 'done': return { dot: 'bg-steam-accent', label: 'Concluído' };
    case 'error': return { dot: 'bg-steam-error', label: 'Erro' };
    default: return { dot: 'bg-steam-text/40', label: 'Parado' };
  }
}

export function formatDuration(ms: number | undefined): string {
  if (ms == null) return '—';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

export default function AgentRunCard({ run, lines, running, onStop, onOpenLog, compact = false }: Props): React.JSX.Element {
  const status = statusStyle(run.status);
  return (
    <div className="rounded-lg border border-steam-elevated/50 bg-steam-panel p-3">
      <div className="flex items-center gap-2 text-sm">
        <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} aria-hidden/>
        <span className="font-semibold">{run.profileName}</span>
        <span className="truncate text-steam-text/50">{run.repoName}{run.prompt != null ? ` · ${run.prompt}` : ''}</span>
        <span className="ml-auto shrink-0 text-xs text-steam-text/50">
          {run.status === 'running' ? formatDuration(Date.now() - Date.parse(run.startedAt)) : formatDuration(run.durationMs)}
        </span>
        {running && (
          <button type="button" onClick={() => onStop(run.id)} title="Parar execução"
            className="rounded p-1 text-steam-error hover:bg-steam-error/10" aria-label={`Parar ${run.profileName}`}>
            <Square size={13}/>
          </button>
        )}
        {onOpenLog != null && (
          <button type="button" onClick={() => onOpenLog(run)} className="rounded px-2 py-1 text-xs text-steam-accent hover:bg-steam-elevated">Log</button>
        )}
      </div>
      {!compact && run.status === 'error' && run.lastError != null && (
        <p className="mt-2 line-clamp-2 font-mono text-xs text-steam-error">{run.lastError}</p>
      )}
      {lines != null && lines.length > 0 && !compact && (
        <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-4 text-steam-text/70">
          {lines.slice(-8).map((l) => l.text).join('\n')}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificar tipos**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/AgentProfileDialog.tsx src/renderer/src/components/AgentRunDialog.tsx src/renderer/src/components/AgentRunCard.tsx
git commit -m "feat: diálogos e card de execução do painel de agentes"
```

---

### Task 11: AgentesPage e navegação

**Files:**
- Create: `src/renderer/src/pages/AgentesPage.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Criar a página**

`src/renderer/src/pages/AgentesPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Bot, LayoutGrid, Pencil, PanelsTopLeft, Play, Plus, Rows3, Trash2 } from 'lucide-react';
import { useLibraryStore } from '../store/library';
import { useAgentsStore } from '../store/agents';
import LogConsole from '../components/LogConsole';
import AgentProfileDialog from '../components/AgentProfileDialog';
import AgentRunDialog from '../components/AgentRunDialog';
import AgentRunCard from '../components/AgentRunCard';
import type { AgentProfile, AgentRun } from '@shared/types';

const ERROR_WINDOW_MS = 24 * 60 * 60 * 1000;

function StatBox({ label, value, tone = '' }: { label: string; value: string; tone?: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-steam-elevated/50 bg-steam-panel px-4 py-2 text-sm">
      <span className={`font-bold ${tone}`}>{value}</span>
      <span className="text-steam-text/50">{label}</span>
    </div>
  );
}

export default function AgentesPage(): React.JSX.Element {
  const repos = useLibraryStore((s) => s.repos);
  const { profiles, runs, logs, viewMode, load, initEvents, setViewMode, createProfile, updateProfile, removeProfile, startRun, stopRun } = useAgentsStore();
  const [profileDialog, setProfileDialog] = useState<{ open: boolean; editing: AgentProfile | null }>({ open: false, editing: null });
  const [runDialogFor, setRunDialogFor] = useState<AgentProfile | null>(null);
  const [logDialogFor, setLogDialogFor] = useState<AgentRun | null>(null);

  useEffect(() => { void load(); return initEvents(); }, [load, initEvents]);

  const stats = useMemo(() => {
    const now = Date.now();
    const running = runs.filter((r) => r.status === 'running').length;
    const errors24h = runs.filter((r) => r.status === 'error' && r.startedAt != null && now - Date.parse(r.startedAt) < ERROR_WINDOW_MS).length;
    const today = new Date().toDateString();
    const runsToday = runs.filter((r) => new Date(r.startedAt).toDateString() === today).length;
    return { running, errors24h, runsToday };
  }, [runs]);

  const activeRuns = runs.filter((r) => r.status === 'running');
  const historyRuns = runs.filter((r) => r.status !== 'running');

  const launch = async (profileId: string, prompt?: string): Promise<void> => { await startRun(profileId, prompt); };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-steam-elevated/50 px-4 py-2">
        <Bot size={18} className="text-steam-accent"/>
        <span className="text-sm font-bold">Agentes</span>
        <div className="ml-4 flex rounded border border-steam-elevated/60 text-xs">
          <button type="button" onClick={() => void setViewMode('painel')} className={`flex items-center gap-1 rounded px-2 py-1 ${viewMode === 'painel' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60'}`}><PanelsTopLeft size={13}/>Painel</button>
          <button type="button" onClick={() => void setViewMode('grid')} className={`flex items-center gap-1 rounded px-2 py-1 ${viewMode === 'grid' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60'}`}><LayoutGrid size={13}/>Grid</button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatBox label="rodando agora" value={String(stats.running)} tone="text-steam-green"/>
          <StatBox label="erros (24h)" value={String(stats.errors24h)} tone="text-steam-error"/>
          <StatBox label="execuções hoje" value={String(stats.runsToday)}/>
          <button type="button" onClick={() => setProfileDialog({ open: true, editing: null })} className="flex items-center gap-1 rounded bg-steam-accent/90 px-3 py-1.5 text-sm font-semibold text-steam-bg hover:bg-steam-accent"><Plus size={14}/>Novo agente</button>
        </div>
      </div>

      {profiles.length === 0 && runs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-steam-text/50">
          <Bot size={40}/>
          <p className="text-sm">Nenhum agente ainda. Crie um perfil e lance o primeiro sub-agente.</p>
        </div>
      ) : viewMode === 'painel' ? (
        <div className="flex min-h-0 flex-1">
          <aside className="w-60 shrink-0 overflow-y-auto border-r border-steam-elevated/50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-steam-text/40">Perfis salvos</p>
            <div className="flex flex-col gap-1.5">
              {profiles.map((profile) => (
                <div key={profile.id} className="group rounded bg-steam-panel/60 px-2 py-1.5 text-sm ring-steam-accent/40 hover:ring-1">
                  <div className="flex items-center gap-1">
                    <span className="truncate font-semibold">{profile.name}</span>
                    <button type="button" title="Executar sub-agente" onClick={() => setRunDialogFor(profile)} className="ml-auto rounded p-0.5 text-steam-green hover:bg-steam-elevated" aria-label={`Executar ${profile.name}`}><Play size={12}/></button>
                    <button type="button" title="Editar" onClick={() => setProfileDialog({ open: true, editing: profile })} className="rounded p-0.5 text-steam-text/50 hover:bg-steam-elevated" aria-label={`Editar ${profile.name}`}><Pencil size={12}/></button>
                    <button type="button" title="Remover" onClick={() => { void removeProfile(profile.id); }} className="rounded p-0.5 text-steam-text/50 hover:bg-steam-elevated hover:text-steam-error" aria-label={`Remover ${profile.name}`}><Trash2 size={12}/></button>
                  </div>
                  <p className="truncate text-[11px] text-steam-text/40">{profile.command} {profile.args.join(' ')}</p>
                </div>
              ))}
            </div>
          </aside>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {activeRuns.map((run) => (
              <AgentRunCard key={run.id} run={run} lines={logs[run.id]} running onStop={(id) => { void stopRun(id); }} onOpenLog={setLogDialogFor}/>
            ))}
            {historyRuns.length > 0 && (
              <div className="rounded-lg border border-steam-elevated/50 bg-steam-panel/40 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-steam-text/40">Histórico</p>
                <table className="w-full text-left text-xs">
                  <thead className="text-steam-text/40"><tr><th className="py-1">Agente</th><th>Repo</th><th>Status</th><th>Duração</th><th>Início</th><th/></tr></thead>
                  <tbody>
                    {historyRuns.slice(0, 20).map((run) => (
                      <tr key={run.id} className="border-t border-steam-elevated/40">
                        <td className="py-1.5 pr-2">{run.profileName}</td>
                        <td className="pr-2 text-steam-text/60">{run.repoName}</td>
                        <td className={`pr-2 ${run.status === 'error' ? 'text-steam-error' : 'text-steam-text/60'}`}>{run.status}</td>
                        <td className="pr-2 text-steam-text/60">{run.durationMs != null ? `${Math.round(run.durationMs / 1000)}s` : '—'}</td>
                        <td className="pr-2 text-steam-text/60">{new Date(run.startedAt).toLocaleString('pt-BR')}</td>
                        <td><button type="button" onClick={() => setLogDialogFor(run)} className="text-steam-accent hover:underline">Log</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {profiles.length > 0 && activeRuns.length === 0 && historyRuns.length === 0 && (
              <div className="m-auto text-sm text-steam-text/40">Nenhuma execução. Use ▶ em um perfil.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-steam-text/40">Perfis</p>
          <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
            {profiles.map((profile) => (
              <div key={profile.id} className="rounded-lg border border-steam-elevated/50 bg-steam-panel p-3 text-sm">
                <p className="truncate font-semibold">{profile.name}</p>
                <p className="truncate text-[11px] text-steam-text/40">{profile.command}</p>
                <button type="button" onClick={() => setRunDialogFor(profile)} className="mt-2 flex w-full items-center justify-center gap-1 rounded bg-steam-green/20 py-1 text-xs text-steam-green hover:bg-steam-green/30"><Play size={12}/>Executar sub-agente</button>
              </div>
            ))}
          </div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-steam-text/40">Execuções</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
            {runs.map((run) => (
              <AgentRunCard key={run.id} run={run} running={run.status === 'running'} onStop={(id) => { void stopRun(id); }} onOpenLog={setLogDialogFor} compact/>
            ))}
          </div>
        </div>
      )}

      {profileDialog.open && (
        <AgentProfileDialog
          repos={repos}
          profile={profileDialog.editing}
          onClose={() => setProfileDialog({ open: false, editing: null })}
          onSubmit={async (input) => {
            if (profileDialog.editing != null) await updateProfile(profileDialog.editing.id, input);
            else await createProfile(input);
          }}
        />
      )}
      {runDialogFor != null && (
        <AgentRunDialog profile={runDialogFor} onClose={() => setRunDialogFor(null)} onLaunch={launch}/>
      )}
      {logDialogFor != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="flex h-[70vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-steam-elevated/60 bg-steam-panel p-3">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <span className="font-semibold">{logDialogFor.profileName}</span>
              <span className="text-xs text-steam-text/50">{logDialogFor.command}</span>
              <button type="button" onClick={() => setLogDialogFor(null)} className="ml-auto rounded px-2 py-1 text-xs text-steam-text/60 hover:bg-steam-elevated">Fechar</button>
            </div>
            <LogConsole lines={logs[logDialogFor.id] ?? []}/>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Navegação no App.tsx**

Em `src/renderer/src/App.tsx`:

1. Adicionar `Bot` ao import de lucide (linha 2).
2. Adicionar o lazy import (após linha 12):

```ts
const AgentesPage = lazy(() => import('./pages/AgentesPage'));
```

3. No type `Page` (linha 14), incluir `'agentes'`.

4. Na `<nav>` (linha 80), após o botão Consumo:

```tsx
<button type="button" onClick={() => setPage('agentes')} className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${page === 'agentes' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}><Bot size={15}/>Agentes</button>
```

5. No corpo condicional (linhas 97–109), após `page === 'consumo'`:

```tsx
: page === 'agentes'
  ? <AgentesPage/>
```

- [ ] **Step 3: Verificar build**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 4: Smoke test manual**

Run: `pnpm dev`
Expected: aba "Agentes" na barra do topo; criar perfil apontando para um repo com pasta local; lançar execução com prompt "liste os arquivos"; ver card ao vivo, log e histórico; alternar Painel/Grid.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/AgentesPage.tsx src/renderer/src/App.tsx
git commit -m "feat: página Agentes com modos Painel e Grid"
```

---

### Task 12: Verificação final e documentação

**Files:**
- Modify: `docs/DECISOES.md`

- [ ] **Step 1: Suíte completa**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: tudo PASS

- [ ] **Step 2: Registrar decisão**

Adicionar ao final de `docs/DECISOES.md`:

```markdown
## Painel de Agentes (2026-11-11)

Decisão: painel dedicado à página "Agentes" para criar perfis de agentes de IA
(CLI + repositório + args) e lançar execuções paralelas (sub-agentes) monitoradas ao vivo.

- `AgentRunManager` modelado no `ProcessManager`, indexado por `runId` (não `repoId`),
  permitindo N execuções simultâneas por perfil.
- Perfis ficam no `library.json` v2 (`agentProfiles`); execuções em `agent-runs.json`
  com snapshot do nome do perfil; logs em `logs/agents/<runId>.log` com rotação (200).
- Prompt inicial vai como argumento citado do comando, sem stdin; comandos só rodam
  com ação explícita do usuário.
- Dois modos de visualização (Painel/Grid) persistidos em `settings.agentsViewMode`.
```

- [ ] **Step 3: Commit final**

```bash
git add docs/DECISOES.md
git commit -m "docs: decisão do painel de agentes"
```
