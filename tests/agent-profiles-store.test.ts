import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { LibraryStore } from '../src/main/services/library-store';

describe('LibraryStore — perfis de agentes', () => {
  const dirs: string[] = [];
  afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

  async function makeStore(): Promise<LibraryStore> {
    const dir = mkdtempSync(join(tmpdir(), 'glib-profiles-'));
    dirs.push(dir);
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
    const dir = mkdtempSync(join(tmpdir(), 'glib-profiles-'));
    dirs.push(dir);
    const store = new LibraryStore(dir, dir);
    await store.load();
    await store.addAgentProfile({ name: 'Persistido', repoId: 'r', command: 'codex' });
    const other = new LibraryStore(dir, dir);
    await other.load();
    expect(other.listAgentProfiles().map((p) => p.name)).toContain('Persistido');
  });
});
