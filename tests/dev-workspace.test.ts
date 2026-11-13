import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DevWorkspaceExecutor } from '../src/main/services/dev-workspace';
import { DevWorkspaceManager, parseDevWorkspaceStatus } from '../src/main/services/dev-workspace';
import { LibraryStore } from '../src/main/services/library-store';
import type { Repo } from '../src/shared/types';

const REMOTE = 'https://github.com/example/engine.git';

function makeExecutor() {
  const directories = new Set<string>();
  const repositories = new Set<string>();
  const current = new Map<string, string>();
  const checkouts: Array<{ path: string; branch: string }> = [];
  const clones: Array<{ repoId: string; remoteUrl: string; target: string }> = [];
  const removed: string[] = [];
  let statusOutput = '## feature/ui...origin/feature/ui [ahead 2, behind 1]\n M src/app.ts\n?? notes.txt\n';

  const executor: DevWorkspaceExecutor = {
    exists: async (path) => directories.has(path),
    isRepository: async (path) => repositories.has(path),
    makeDirectory: async (path) => { directories.add(path); },
    remove: async (path) => {
      directories.delete(path);
      repositories.delete(path);
      current.delete(path);
      removed.push(path);
    },
    clone: async (repoId, remoteUrl, target) => {
      clones.push({ repoId, remoteUrl, target });
      directories.add(target);
      repositories.add(target);
      current.set(target, 'main');
    },
    currentBranch: async (path) => current.get(path) ?? null,
    checkoutBranch: async (path, branch) => {
      checkouts.push({ path, branch });
      current.set(path, branch);
      return branch;
    },
    createBranch: async () => undefined,
    listBranches: async () => ({ current: 'main', local: [], remote: [] }),
    statusPorcelain: async () => statusOutput,
    pullRebase: async () => ({ updated: true, summary: 'Sincronizado.' }),
    push: async () => ({ branch: 'main' })
  };

  return {
    executor,
    directories,
    repositories,
    current,
    checkouts,
    clones,
    removed,
    setStatusOutput: (value: string) => { statusOutput = value; }
  };
}

describe('DevWorkspaceManager', () => {
  const tempDirs = new Set<string>();

  afterEach(() => {
    for (const tempDir of tempDirs) rmSync(tempDir, { recursive: true, force: true });
    tempDirs.clear();
  });

  async function setup(localPath?: string) {
    const tempDir = mkdtempSync(join(tmpdir(), 'glib-dev-workspace-'));
    tempDirs.add(tempDir);
    const workspacesRoot = join(tempDir, 'userData', 'workspaces');
    mkdirSync(workspacesRoot, { recursive: true });
    const store = new LibraryStore(join(tempDir, 'userData'), join(tempDir, 'repos'));
    await store.load();
    const repo: Repo = {
      id: 'repo-1',
      name: 'engine',
      owner: 'example',
      remoteUrl: REMOTE,
      ...(localPath != null ? { localPath } : {}),
      status: localPath != null ? 'cloned' : 'not_cloned',
      tags: [],
      favorite: false,
      addedAt: '2026-11-11T00:00:00.000Z'
    };
    await store.addRepo(repo);
    const fake = makeExecutor();
    const manager = new DevWorkspaceManager(store, workspacesRoot, fake.executor);
    return { manager, store, repo, fake, workspacesRoot, tempDir };
  }

  it('cria automaticamente um workspace gerenciado e troca para a branch solicitada', async () => {
    const { manager, store, repo, fake, workspacesRoot } = await setup();
    expect(manager.isBeingEdited(repo.id)).toBe(false);
    const result = await manager.ensureWorkspace(repo, 'feature/ui');

    expect(result).toEqual({
      workspacePath: join(workspacesRoot, 'example-engine'),
      reusedManaged: false,
      branch: 'feature/ui'
    });
    expect(fake.clones).toEqual([{ repoId: repo.id, remoteUrl: REMOTE, target: result.workspacePath }]);
    expect(fake.checkouts).toEqual([{ path: result.workspacePath, branch: 'feature/ui' }]);
    expect(store.getRepo(repo.id)?.devSession).toMatchObject({ branch: 'feature/ui', workspacePath: result.workspacePath });
    expect(manager.isBeingEdited(repo.id)).toBe(true);
  });

  it('reutiliza o clone registrado em localPath', async () => {
    const localPath = join(tmpdir(), 'existing-engine');
    const { manager, repo, fake } = await setup(localPath);
    fake.directories.add(localPath);
    fake.repositories.add(localPath);
    fake.current.set(localPath, 'main');

    const result = await manager.ensureWorkspace(repo, 'main');

    expect(result.workspacePath).toBe(localPath);
    expect(fake.clones).toEqual([]);
  });

  it('descarta workspace gerenciado e preserva o clone cadastrado', async () => {
    const managed = await setup();
    const created = await managed.manager.ensureWorkspace(managed.repo, 'main');
    const discarded = await managed.manager.closeWorkspace(managed.repo.id);
    expect(discarded).toEqual({ workspacePath: created.workspacePath, removed: true });
    expect(managed.fake.removed).toEqual([created.workspacePath]);
    expect(managed.store.getRepo(managed.repo.id)?.devSession).toBeNull();

    const localPath = join(tmpdir(), 'registered-engine');
    const local = await setup(localPath);
    local.fake.directories.add(localPath);
    local.fake.repositories.add(localPath);
    local.fake.current.set(localPath, 'main');
    await local.manager.ensureWorkspace(local.repo, 'main');
    const preserved = await local.manager.closeWorkspace(local.repo.id);
    expect(preserved).toEqual({ workspacePath: localPath, removed: false });
    expect(local.fake.removed).toEqual([]);
  });

  it('interpreta contagem de alterações e ahead/behind do status porcelain', async () => {
    expect(parseDevWorkspaceStatus(
      '## feature/ui...origin/feature/ui [ahead 2, behind 1]\n M src/app.ts\n?? notes.txt\n'
    )).toEqual({ branch: 'feature/ui', changes: 2, ahead: 2, behind: 1 });
    expect(parseDevWorkspaceStatus('## main\n')).toEqual({ branch: 'main', changes: 0, ahead: 0, behind: 0 });
  });

  it('persiste devSession no library.json e mantém o estado após recarregar', async () => {
    const { manager, store, repo, tempDir } = await setup();
    const result = await manager.ensureWorkspace(repo, 'feature/ui');
    const reloaded = new LibraryStore(join(tempDir, 'userData'), join(tempDir, 'repos'));
    await reloaded.load();
    expect(reloaded.getRepo(repo.id)?.devSession).toMatchObject({
      branch: result.branch,
      workspacePath: result.workspacePath
    });
    expect(reloaded.getRepo(repo.id)?.devSession?.startedAt).toBeTruthy();
    expect(store.getRepo(repo.id)?.devSession).toEqual(reloaded.getRepo(repo.id)?.devSession);
  });
});
