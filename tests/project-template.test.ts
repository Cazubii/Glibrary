import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStarterProject } from '../src/main/services/project-template';

const roots: string[] = [];

async function makeFixture(): Promise<{ root: string; source: string }> {
  const root = join(tmpdir(), `glibrary-template-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const source = join(root, 'packed-template');
  await fs.mkdir(source, { recursive: true });
  await fs.writeFile(join(source, 'index.html'), '<h1>Olá</h1>\n');
  roots.push(root);
  return { root, source };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('createStarterProject', () => {
  it('copies the packaged site to the configured models folder', async () => {
    const { root, source } = await makeFixture();
    const destination = await createStarterProject(source, join(root, 'BASES'));

    expect(destination).toBe(join(root, 'BASES', 'meu-primeiro-site'));
    expect(await fs.readFile(join(destination, 'index.html'), 'utf8')).toBe('<h1>Olá</h1>\n');
  });

  it('chooses a new folder without overwriting a prior project', async () => {
    const { root, source } = await makeFixture();
    const projectsRoot = join(root, 'BASES');
    const existing = join(projectsRoot, 'meu-primeiro-site');
    await fs.mkdir(existing, { recursive: true });
    await fs.writeFile(join(existing, 'my-work.txt'), 'preserve this\n');

    const destination = await createStarterProject(source, projectsRoot);

    expect(destination).toBe(join(projectsRoot, 'meu-primeiro-site-2'));
    expect(await fs.readFile(join(existing, 'my-work.txt'), 'utf8')).toBe('preserve this\n');
    expect(await fs.readFile(join(destination, 'index.html'), 'utf8')).toBe('<h1>Olá</h1>\n');
  });

  it('rejects a missing packaged template', async () => {
    const { root } = await makeFixture();
    await expect(createStarterProject(join(root, 'missing'), join(root, 'BASES'))).rejects.toThrow('não está disponível');
  });
});
