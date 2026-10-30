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
  });

  it('getRemoteUrl e getCurrentBranch funcionam', async () => {
    const service = new GitService();
    await service.clone('r4', origin, root, 'meta-demo', () => undefined);
    const url = await service.getRemoteUrl(join(root, 'meta-demo'));
    expect(url).not.toBeNull();
    expect(url).toContain('origin');
    const branch = await service.getCurrentBranch(join(root, 'meta-demo'));
    expect(branch).toBe('main');
  });
});
