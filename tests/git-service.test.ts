import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { simpleGit } from 'simple-git';
import { GitService } from '../src/main/services/git-service';

let root: string;
let origin: string;

beforeAll(async () => {
  root = join(tmpdir(), `glib-git-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(root, { recursive: true });
  origin = join(root, 'origin');
  await fs.mkdir(origin, { recursive: true });
  const git = simpleGit({ baseDir: origin });
  await git.init(['--initial-branch=main']);
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
});
