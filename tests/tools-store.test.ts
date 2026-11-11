import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { LibraryStore } from '../src/main/services/library-store';

describe('LibraryStore tools', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function makeStore(): Promise<{ dir: string; store: LibraryStore }> {
    const dir = await mkdtemp(join(tmpdir(), 'glib-tools-store-'));
    dirs.push(dir);
    const store = new LibraryStore(dir, dir);
    await store.load();
    return { dir, store };
  }

  it('seeds the two stable built-in tools on an empty library', async () => {
    const { dir, store } = await makeStore();
    expect(store.listTools().map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'builtin-omniroute', name: 'OmniRoute' },
      { id: 'builtin-habblaud', name: 'Habblaud' }
    ]);

    const persisted = JSON.parse(await readFile(join(dir, 'library.json'), 'utf8')) as { tools: Array<{ id: string }> };
    expect(persisted.tools.map(({ id }) => id)).toEqual(['builtin-omniroute', 'builtin-habblaud']);
  });

  it('adds a custom tool with its repository slug as the name', async () => {
    const { store } = await makeStore();
    const tool = await store.addTool('https://github.com/example/my-cli');
    expect(tool).toMatchObject({
      name: 'my-cli',
      gitUrl: 'https://github.com/example/my-cli',
      source: 'custom'
    });
    expect(tool.id).not.toBe('');
    expect(store.listTools()).toContainEqual(tool);
  });

  it('rejects URLs outside the GitHub owner/repository form', async () => {
    const { store } = await makeStore();
    await expect(store.addTool('https://gitlab.com/example/my-cli')).rejects.toThrow();
    await expect(store.addTool('https://github.com/example')).rejects.toThrow();
    await expect(store.addTool('https://github.com/example/my-cli/issues')).rejects.toThrow();
  });

  it('rejects repository slugs that cannot be used as safe folder names', async () => {
    const { store } = await makeStore();
    await expect(store.addTool('https://github.com/example/..')).rejects.toThrow();
  });

  it('removes custom entries but never removes built-ins', async () => {
    const { store } = await makeStore();
    const tool = await store.addTool('https://github.com/example/my-cli');
    await store.removeTool(tool.id);
    expect(store.listTools()).not.toContainEqual(tool);
    await expect(store.removeTool('builtin-omniroute')).rejects.toThrow();
    expect(store.listTools().some(({ id }) => id === 'builtin-omniroute')).toBe(true);
  });
});
