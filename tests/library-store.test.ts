import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { LibraryStore, emptyLibrary } from '../src/main/services/library-store';
import type { Repo } from '../src/shared/types';

let dir: string;
let counter = 0;

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: `repo-${counter++}`,
    name: 'demo',
    status: 'cloned',
    tags: [],
    favorite: false,
    addedAt: new Date().toISOString(),
    ...overrides
  };
}

beforeEach(async () => {
  dir = join(tmpdir(), `glib-test-${Date.now()}-${counter++}`);
  await fs.mkdir(dir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('LibraryStore', () => {
  it('cria library.json vazio no primeiro load', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    const lib = await store.load();
    expect(lib.version).toBe(1);
    expect(lib.repos).toEqual([]);
    const raw = await fs.readFile(join(dir, 'library.json'), 'utf-8');
    expect(JSON.parse(raw).version).toBe(1);
  });

  it('persiste repos e recarrega após "reiniciar"', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.addRepo(makeRepo({ id: 'a', name: 'alpha' }));
    await store.addRepo(makeRepo({ id: 'b', name: 'beta' }));

    const store2 = new LibraryStore(dir, join(dir, 'repos'));
    const lib = await store2.load();
    expect(lib.repos.map((r) => r.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('updateRepo faz merge e mantém o id', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.addRepo(makeRepo({ id: 'a', name: 'alpha' }));
    const updated = await store.updateRepo('a', { favorite: true, tags: ['x'] });
    expect(updated.favorite).toBe(true);
    expect(updated.tags).toEqual(['x']);
    expect(updated.name).toBe('alpha');
  });

  it('removeRepo remove e persiste', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.addRepo(makeRepo({ id: 'a' }));
    await store.removeRepo('a');
    expect(store.listRepos()).toEqual([]);
    const store2 = new LibraryStore(dir, join(dir, 'repos'));
    await store2.load();
    expect(store2.listRepos()).toEqual([]);
  });

  it('cria backup a cada salvamento', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.addRepo(makeRepo({ id: 'a', name: 'alpha' }));
    const backupRaw = await fs.readFile(join(dir, 'library.backup.json'), 'utf-8');
    expect(JSON.parse(backupRaw).repos).toHaveLength(1);
  });

  it('recupera do backup quando library.json está corrompido', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.addRepo(makeRepo({ id: 'a', name: 'alpha' }));

    await fs.writeFile(join(dir, 'library.json'), '{ corrompido', 'utf-8');

    const store2 = new LibraryStore(dir, join(dir, 'repos'));
    const lib = await store2.load();
    expect(lib.repos.map((r) => r.id)).toEqual(['a']);
  });

  it('applyStartupFixes marca pastas que sumiram', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.addRepo(makeRepo({ id: 'a', status: 'installed', localPath: join(dir, 'nao-existe') }));

    const changed = await store.applyStartupFixes(() => false);
    expect(changed.map((r) => r.id)).toEqual(['a']);
    expect(store.getRepo('a')?.status).toBe('missing');
  });

  it('updateSettings persiste alterações', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    const settings = await store.updateSettings({ theme: 'light', checkUpdatesOnStart: false });
    expect(settings.theme).toBe('light');
    expect(settings.checkUpdatesOnStart).toBe(false);
  });

  it('emptyLibrary tem settings padrão', () => {
    const lib = emptyLibrary('/home/user/Glibrary');
    expect(lib.settings.reposRoot).toBe('/home/user/Glibrary');
    expect(lib.settings.viewMode).toBe('grid');
    expect(lib.settings.theme).toBe('dark');
  });

  it('rejeita repo inválido no addRepo', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await expect(store.addRepo({ ...makeRepo(), name: '' })).rejects.toThrow();
  });

  it('lança erro ao atualizar repo inexistente', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await expect(store.updateRepo('nope', { favorite: true })).rejects.toThrow();
  });
});
