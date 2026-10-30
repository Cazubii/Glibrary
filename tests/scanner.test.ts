import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scanFolders, classifyFound } from '../src/main/services/scanner';
import type { Repo } from '../src/shared/types';

let root: string;

async function mkRepo(...segments: string[]): Promise<string> {
  const dir = join(root, ...segments);
  await fs.mkdir(join(dir, '.git'), { recursive: true });
  return dir;
}

beforeAll(async () => {
  root = join(tmpdir(), `glib-scan-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(root, { recursive: true });

  await mkRepo('a-repo');
  await mkRepo('nested', 'b-repo');
  await mkRepo('deep', 'l1', 'l2', 'c-repo');
  // além da profundidade máxima (4): deep/l1/l2/l3/l4/d-repo
  await mkRepo('deep', 'l1', 'l2', 'l3', 'l4', 'd-repo');
  // dentro de node_modules deve ser ignorado
  await mkRepo('e-repo', 'node_modules', 'ignored');
  // pasta oculta (exceto .git) ignorada
  await mkRepo('.hidden-repo');
  // repo dentro de dist ignorado
  await mkRepo('f-repo', 'dist', 'ignored');
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('scanFolders', () => {
  it('encontra repos e respeita profundidade/ignorados', async () => {
    const found = await scanFolders({ folders: [root], maxDepth: 4 });
    const names = found.map((f) => f.localPath.slice(root.length + 1).replace(/\\/g, '/')).sort();
    expect(names).toEqual(['a-repo', 'deep/l1/l2/c-repo', 'nested/b-repo']);
    expect(names.some((n) => n.includes('node_modules'))).toBe(false);
    expect(names.some((n) => n.includes('dist'))).toBe(false);
    expect(names.some((n) => n.includes('hidden'))).toBe(false);
    expect(names.some((n) => n.includes('l4'))).toBe(false);
  });

  it('não desce dentro de um repositório encontrado', async () => {
    const outer = await mkRepo('outer');
    await mkRepo('outer', 'inner');
    const found = await scanFolders({ folders: [outer] });
    expect(found).toHaveLength(1);
    expect(found[0]?.localPath.endsWith('outer')).toBe(true);
  });

  it('respeita cancelamento', async () => {
    const found = await scanFolders({ folders: [root], isCancelled: () => true });
    expect(found).toHaveLength(0);
  });
});

describe('classifyFound', () => {
  function existingRepos(): Repo[] {
    return [
      {
        id: 'r1',
        name: 'a-repo',
        localPath: join(root, 'a-repo'),
        remoteUrl: 'https://github.com/owner/b-repo.git',
        status: 'installed',
        tags: [],
        favorite: false,
        addedAt: new Date().toISOString()
      }
    ];
  }

  it('marca duplicata por caminho', () => {
    const result = classifyFound(
      [{ localPath: join(root, 'a-repo') }],
      existingRepos(),
      process.platform,
    );
    expect(result[0]?.duplicateOf).toBe('path');
    expect(result[0]?.existingRepoId).toBe('r1');
  });

  it('marca duplicata por URL normalizada (git@ == https)', () => {
    const result = classifyFound(
      [{ localPath: join(root, 'outra-pasta'), remoteUrl: 'git@github.com:owner/b-repo' }],
      existingRepos(),
      process.platform,
    );
    expect(result[0]?.duplicateOf).toBe('url');
  });

  it('não marca novo repositório', () => {
    const result = classifyFound(
      [{ localPath: join(root, 'novo'), remoteUrl: 'https://github.com/x/y' }],
      existingRepos(),
      process.platform,
    );
    expect(result[0]?.duplicateOf).toBeUndefined();
  });
});
