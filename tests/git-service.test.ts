import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { simpleGit } from 'simple-git';
import { createHash } from 'node:crypto';
import { githubAuthConfig, GitService } from '../src/main/services/git-service';
import type { AgentFileChange } from '../src/shared/types';

let root: string;
let origin: string;

beforeAll(async () => {
  root = join(tmpdir(), `glib-git-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(root, { recursive: true });
  origin = join(root, 'origin');
  await fs.mkdir(origin, { recursive: true });
  const git = simpleGit({ baseDir: origin });
  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', 'Teste');
  await git.addConfig('user.email', 'teste@example.test');
  await fs.writeFile(join(origin, 'README.md'), '# demo\n');
  await git.add('.');
  await git.commit('initial');
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('GitService', () => {
  it('clona com progresso e cria a pasta', async () => {
    const service = new GitService();
    const stages: string[] = [];
    const target = await service.clone('r1', origin, root, 'clone-demo', (p) => {
      stages.push(p.stage);
    });
    expect(target).toBe(join(root, 'clone-demo'));
    await expect(fs.stat(target)).resolves.toBeTruthy();
    expect(stages.length).toBeGreaterThan(0);
    expect(service.isCloning('r1')).toBe(false);
  });

  it('formata a config auth no formato que simple-git recebe', async () => {
    const config = githubAuthConfig('test-token');
    expect(config).toEqual([
      `http.extraHeader=Authorization: basic ${Buffer.from('x-access-token:test-token').toString('base64')}`
    ]);
    await expect(simpleGit({ baseDir: origin, config }).status()).resolves.toMatchObject({
      current: 'main'
    });
  });

  it('fetchStatus reflete limpo e sem atraso', async () => {
    const service = new GitService();
    await service.clone('r2', origin, root, 'status-demo', () => undefined);
    const status = await service.fetchStatus(join(root, 'status-demo'));
    expect(status.dirty).toBe(false);
    expect(status.behindBy).toBe(0);
    expect(status.ahead).toBe(0);
  });

  it('pull detecta atualização quando o remoto avança', async () => {
    const service = new GitService();
    await service.clone('r3', origin, root, 'pull-demo', () => undefined);

    const originGit = simpleGit({ baseDir: origin });
    await fs.writeFile(join(origin, 'novidade.txt'), 'x\n');
    await originGit.add('.');
    await originGit.commit('second');

    const status = await service.fetchStatus(join(root, 'pull-demo'));
    expect(status.behindBy).toBe(1);

    const result = await service.pull(join(root, 'pull-demo'));
    expect(result.updated).toBe(true);
    const after = await service.fetchStatus(join(root, 'pull-demo'));
    expect(after.behindBy).toBe(0);
  }, 15_000);

  it('getRemoteUrl e getCurrentBranch funcionam', async () => {
    const service = new GitService();
    await service.clone('r4', origin, root, 'meta-demo', () => undefined);
    const url = await service.getRemoteUrl(join(root, 'meta-demo'));
    expect(url).not.toBeNull();
    expect(url).toContain('origin');
    const branch = await service.getCurrentBranch(join(root, 'meta-demo'));
    expect(branch).toBe('main');
  });

  it('lista branches locais/remotas, cria a partir da padrão e faz checkout remoto', async () => {
    const branchOrigin = join(root, 'branch-origin');
    await fs.mkdir(branchOrigin, { recursive: true });
    const source = simpleGit({ baseDir: branchOrigin });
    await source.init(['--initial-branch=main']);
    await source.addConfig('user.name', 'Teste');
    await source.addConfig('user.email', 'teste@example.test');
    await fs.writeFile(join(branchOrigin, 'README.md'), '# branches\n');
    await source.add('.');
    await source.commit('inicial');
    await source.checkoutLocalBranch('feature/remota');
    await fs.writeFile(join(branchOrigin, 'feature.txt'), 'branch\n');
    await source.add('.');
    await source.commit('branch remota');
    await source.checkout('main');

    const service = new GitService();
    const clone = await service.clone('r5', branchOrigin, root, 'branch-clone', () => undefined);
    const branches = await service.listBranches(clone);
    expect(branches.local.map((branch) => branch.name)).toContain('main');
    expect(branches.remote).toContainEqual({ name: 'feature/remota', remote: 'origin', ref: 'origin/feature/remota' });

    await service.checkoutBranch(clone, 'origin/feature/remota');
    expect(await service.getCurrentBranch(clone)).toBe('feature/remota');
    await service.checkoutBranch(clone, 'main');
    await service.createBranch(clone, 'feature/nova', 'main');
    expect(await service.getCurrentBranch(clone)).toBe('feature/nova');
    await expect(service.createBranch(clone, '-inválida', 'main')).rejects.toThrow('Nome de branch inválido.');
  }, 15_000);

  it('shows tracked and new files and rejects a changed review before commit', async () => {
    const service = new GitService();
    const clone = await service.clone('r6', origin, root, 'review-demo', () => undefined);
    const git = simpleGit({ baseDir: clone });
    const originalCommit = (await git.log()).latest?.message;
    await git.addConfig('user.name', 'Teste');
    await git.addConfig('user.email', 'teste@example.test');
    await fs.writeFile(join(clone, 'README.md'), '# demo\nchanged line\n');
    await fs.writeFile(join(clone, 'new file.txt'), 'new content\n');

    const preview = await service.previewChanges(clone);
    expect(preview.files.map((file) => file.path)).toEqual(expect.arrayContaining(['README.md', 'new file.txt']));
    expect(preview.files).toHaveLength(2);
    expect(preview.diff).toContain('+changed line');
    expect(preview.newFiles).toEqual([{ path: 'new file.txt', content: 'new content\n', binary: false, truncated: false }]);

    await fs.appendFile(join(clone, 'README.md'), 'changed after review\n');
    await expect(service.commitReviewed(clone, 'Save reviewed change', preview.revision)).rejects.toThrow('As alterações mudaram');
    expect((await git.log()).latest?.message).toBe(originalCommit);
  }, 15_000);

  it('limits an agent review to the paths captured for that execution', async () => {
    const service = new GitService();
    const clone = await service.clone('r-review-agent', origin, root, 'agent-review-filter-demo', () => undefined);
    await fs.writeFile(join(clone, 'from-agent.txt'), 'agent output\n');
    await fs.writeFile(join(clone, 'unrelated.txt'), 'other work\n');

    const preview = await service.previewChanges(clone, ['from-agent.txt']);

    expect(preview.files.map((file) => file.path)).toEqual(['from-agent.txt']);
    expect(preview.newFiles.map((file) => file.path)).toEqual(['from-agent.txt']);
  }, 15_000);

  it('creates a unique Glibrary work branch from main', async () => {
    const service = new GitService();
    const clone = await service.clone('r7', origin, root, 'safe-branch-demo', () => undefined);
    const date = new Date('2026-11-13T12:00:00.000Z');
    const first = await service.ensureWorkingBranch(clone, 'Corrige login', date);
    expect(first).toBe('glibrary/2026-11-13-corrige-login');
    await service.checkoutBranch(clone, 'main');
    const second = await service.ensureWorkingBranch(clone, 'Corrige login', date);
    expect(second).toBe('glibrary/2026-11-13-corrige-login-2');
    expect(await service.getCurrentBranch(clone)).toBe(second);
  }, 15_000);

  it('undoes an unpushed commit while keeping its files in the workspace', async () => {
    const service = new GitService();
    const clone = await service.clone('r8', origin, root, 'undo-demo', () => undefined);
    const git = simpleGit({ baseDir: clone });
    await git.addConfig('user.name', 'Teste');
    await git.addConfig('user.email', 'teste@example.test');
    await fs.writeFile(join(clone, 'undo.txt'), 'keep this work\n');
    await git.add('.');
    await git.commit('Local change');

    await service.undoLastUnsentCommit(clone);
    expect((await git.status()).ahead).toBe(0);
    expect((await fs.readFile(join(clone, 'undo.txt'), 'utf8'))).toBe('keep this work\n');
    expect((await git.status()).files.map((file) => file.path)).toContain('undo.txt');
  }, 15_000);

  it('reverts a sent commit into a new local commit without pushing it', async () => {
    const service = new GitService();
    const clone = await service.clone('r9', origin, root, 'revert-demo', () => undefined);
    const git = simpleGit({ baseDir: clone });
    await git.addConfig('user.name', 'Teste');
    await git.addConfig('user.email', 'teste@example.test');
    const original = await fs.readFile(join(clone, 'README.md'), 'utf8');
    await fs.appendFile(join(clone, 'README.md'), 'sent change\n');
    await git.add('README.md');
    await git.commit('Sent change');
    await simpleGit({ baseDir: origin }).addConfig('receive.denyCurrentBranch', 'updateInstead');
    await git.push('origin', 'main');

    const result = await service.revertLastSentCommit(clone);
    expect(result.commit).toMatch(/^[a-f0-9]{7,40}$/i);
    expect((await fs.readFile(join(clone, 'README.md'), 'utf8'))).toBe(original);
    expect((await git.log()).latest?.message).toContain('Revert');
    expect((await git.status()).ahead).toBe(1);
  }, 15_000);

  it('captures only new agent changes and preserves edits made after the snapshot', async () => {
    const service = new GitService();
    const clone = await service.clone('r10', origin, root, 'agent-changes-demo', () => undefined);
    const git = simpleGit({ baseDir: clone });
    await git.addConfig('user.name', 'Teste');
    await git.addConfig('user.email', 'teste@example.test');
    await fs.writeFile(join(clone, 'tracked.txt'), 'base content\n');
    await git.add('tracked.txt');
    await git.commit('Add tracked file');

    await fs.appendFile(join(clone, 'README.md'), 'pre-existing edit\n');
    const baseline = new Set((await service.listChanges(clone)).files.map((file) => file.path));
    await fs.appendFile(join(clone, 'README.md'), 'agent touched pre-existing file\n');
    await fs.writeFile(join(clone, 'tracked.txt'), 'agent tracked edit\n');
    await fs.writeFile(join(clone, 'new agent file.txt'), 'agent new file\n');

    const changes = await service.captureAgentChanges(clone, baseline);
    expect(changes.map((change) => change.path)).toEqual(expect.arrayContaining(['tracked.txt', 'new agent file.txt']));
    expect(changes.map((change) => change.path)).not.toContain('README.md');
    await fs.writeFile(join(clone, 'new agent file.txt'), 'user edited after snapshot\n');

    const result = await service.discardAgentChanges(clone, changes);
    expect(result.discarded).toEqual(['tracked.txt']);
    expect(result.skipped).toEqual(['new agent file.txt']);
    expect((await fs.readFile(join(clone, 'tracked.txt'), 'utf8')).replace(/\r\n/g, '\n')).toBe('base content\n');
    expect(await fs.readFile(join(clone, 'new agent file.txt'), 'utf8')).toBe('user edited after snapshot\n');
    expect(await fs.readFile(join(clone, 'README.md'), 'utf8')).toContain('agent touched pre-existing file');
  }, 15_000);

  it('never discards a snapshot path outside the repository root', async () => {
    const service = new GitService();
    const clone = await service.clone('r11', origin, root, 'agent-path-safety-demo', () => undefined);
    const outsidePath = join(root, 'outside-agent-file.txt');
    const outsideContent = 'keep outside the project\n';
    await fs.writeFile(outsidePath, outsideContent);
    const changes: AgentFileChange[] = [{
      path: '../outside-agent-file.txt',
      kind: 'untracked',
      sha256: createHash('sha256').update(outsideContent).digest('hex')
    }];

    const result = await service.discardAgentChanges(clone, changes);

    expect(result.discarded).toEqual([]);
    expect(result.skipped).toEqual(['../outside-agent-file.txt']);
    expect(await fs.readFile(outsidePath, 'utf8')).toBe(outsideContent);
  }, 15_000);
});

