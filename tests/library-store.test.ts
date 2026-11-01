import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { LibraryStore, emptyLibrary } from '../src/main/services/library-store';
import type { BaseItem, ProjectRef, Repo, Skill } from '../src/shared/types';

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

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: `skill-${counter++}`,
    name: 'demo',
    path: join(dir, 'skills', 'demo'),
    source: join(dir, 'skills'),
    tags: [],
    favorite: false,
    addedAt: new Date().toISOString(),
    ...overrides
  };
}

function makeBase(overrides: Partial<BaseItem> = {}): BaseItem {
  return {
    id: `base-${counter++}`,
    name: 'starter',
    remoteUrl: 'https://github.com/example/starter.git',
    tags: [],
    favorite: false,
    addedAt: new Date().toISOString(),
    ...overrides
  };
}

function makeProject(overrides: Partial<ProjectRef> = {}): ProjectRef {
  return {
    id: `proj-${counter++}`,
    name: 'app',
    localPath: join(dir, 'app'),
    tags: [],
    favorite: false,
    skillIds: [],
    baseIds: [],
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
    expect(lib.version).toBe(2);
    expect(lib.repos).toEqual([]);
    const raw = await fs.readFile(join(dir, 'library.json'), 'utf-8');
    expect(JSON.parse(raw).version).toBe(2);
  });

  it('migra a v1 preservando projetos locais e convertendo URLs sem pasta em bases', async () => {
    const legacy = {
      version: 1,
      repos: [
        { id: 'local-1', name: 'App local', localPath: join(dir, 'app'), status: 'cloned', tags: ['web'], favorite: true, addedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'remote-1', name: 'Starter kit', remoteUrl: 'https://github.com/example/starter-kit.git', status: 'not_cloned', tags: ['template'], favorite: false, notes: 'Origem remota', addedAt: '2026-01-02T00:00:00.000Z' }
      ],
      settings: { reposRoot: join(dir, 'repos'), scanFolders: [], editorCommand: 'code', terminalPreference: 'auto', theme: 'dark', viewMode: 'grid', checkUpdatesOnStart: true }
    };
    await fs.writeFile(join(dir, 'library.json'), JSON.stringify(legacy), 'utf-8');

    const store = new LibraryStore(dir, join(dir, 'repos'));
    const library = await store.load();

    expect(library.version).toBe(2);
    expect(library.projects).toMatchObject([{ id: 'local-1', name: 'App local', localPath: join(dir, 'app'), tags: ['web'], favorite: true }]);
    expect(library.bases).toMatchObject([{ id: 'remote-1', name: 'Starter kit', remoteUrl: 'https://github.com/example/starter-kit.git', notes: 'Origem remota' }]);
    expect(JSON.parse(await fs.readFile(join(dir, 'library.json'), 'utf-8')).version).toBe(2);
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

  it('updateSkill persiste tags e favorite com normalização', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({ skills: [makeSkill({ id: 's1', name: 'Demo', tags: ['old'] })] });
    const updated = await store.updateSkill('s1', {
      tags: [' Docs ', 'docs', 'deploy'],
      favorite: true
    });
    expect(updated.tags).toEqual(['Docs', 'deploy']);
    expect(updated.favorite).toBe(true);
    const lib = await new LibraryStore(dir, join(dir, 'repos')).load();
    expect(lib.skills[0]).toMatchObject({ tags: ['Docs', 'deploy'], favorite: true });
  });

  it('updateSkill mantém campos não alterados e lança para id inexistente', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({
      skills: [makeSkill({ id: 's1', name: 'Demo', description: 'd' })]
    });
    const updated = await store.updateSkill('s1', { favorite: true });
    expect(updated.name).toBe('Demo');
    expect(updated.description).toBe('d');
    expect(updated.tags).toEqual([]);
    await expect(store.updateSkill('nope', { favorite: true })).rejects.toThrow();
  });

  it('updateBase persiste nome, descrição, tags e favorite', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({ bases: [makeBase({ id: 'b1', name: 'starter' })] });
    const updated = await store.updateBase('b1', {
      name: 'template',
      description: 'd',
      tags: ['x'],
      favorite: true
    });
    expect(updated).toMatchObject({
      name: 'template',
      description: 'd',
      tags: ['x'],
      favorite: true
    });
    await expect(store.updateBase('nope', {})).rejects.toThrow();
  });

  it('updateProject persiste tags, favorite, associações e notas', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({ projects: [makeProject({ id: 'p1', name: 'app' })] });
    const updated = await store.updateProject('p1', {
      skillIds: ['s1'],
      baseIds: ['b1'],
      notes: 'ok',
      tags: ['web'],
      favorite: true
    });
    expect(updated).toMatchObject({
      skillIds: ['s1'],
      baseIds: ['b1'],
      notes: 'ok',
      tags: ['web'],
      favorite: true
    });
    await expect(store.updateProject('nope', {})).rejects.toThrow();
  });

  it('updateSkill aplica favorite:false e tags vazias, e descarta tags só de espaço', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({
      skills: [makeSkill({ id: 's1', tags: ['docs'], favorite: true })]
    });
    const updated = await store.updateSkill('s1', { favorite: false, tags: ['  ', ''] });
    expect(updated.favorite).toBe(false);
    expect(updated.tags).toEqual([]);
  });

  it('updateProject limpa associações com lista vazia', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({
      projects: [makeProject({ id: 'p1', skillIds: ['s1'], baseIds: ['b1'] })]
    });
    const updated = await store.updateProject('p1', { skillIds: [], baseIds: [] });
    expect(updated.skillIds).toEqual([]);
    expect(updated.baseIds).toEqual([]);
  });

  it('renameTag reescreve a tag nos três tipos e persiste', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({
      skills: [makeSkill({ id: 's1', tags: ['docs', 'web'] })],
      bases: [makeBase({ id: 'b1', tags: ['Docs'] })],
      projects: [makeProject({ id: 'p1', tags: ['docs'] })]
    });
    await store.renameTag('docs', 'documentação');
    const lib = await new LibraryStore(dir, join(dir, 'repos')).load();
    expect(lib.skills[0].tags).toEqual(['documentação', 'web']);
    expect(lib.bases[0].tags).toEqual(['documentação']);
    expect(lib.projects[0].tags).toEqual(['documentação']);
  });

  it('renameTag altera só a grafia quando o destino é a mesma tag', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({ skills: [makeSkill({ id: 's1', tags: ['docs'] })] });
    await store.renameTag('docs', 'Docs');
    expect(store.listSkills()[0].tags).toEqual(['Docs']);
  });

  it('renameTag lança erro para tag inexistente ou destino duplicado', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({ skills: [makeSkill({ id: 's1', tags: ['docs', 'web'] })] });
    await expect(store.renameTag('nope', 'x')).rejects.toThrow('Tag não encontrada');
    await expect(store.renameTag('docs', 'WEB')).rejects.toThrow('Tag já existe');
  });

  it('deleteTag remove a tag de todos os tipos e persiste', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({
      skills: [makeSkill({ id: 's1', tags: ['docs', 'web'] })],
      bases: [makeBase({ id: 'b1', tags: ['DOCS'] })],
      projects: [makeProject({ id: 'p1', tags: ['docs'] })]
    });
    await store.deleteTag('docs');
    const lib = await new LibraryStore(dir, join(dir, 'repos')).load();
    expect(lib.skills[0].tags).toEqual(['web']);
    expect(lib.bases[0].tags).toEqual([]);
    expect(lib.projects[0].tags).toEqual([]);
  });

  it('deleteTag lança erro para tag inexistente', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await expect(store.deleteTag('nope')).rejects.toThrow('Tag não encontrada');
  });

  it('renameTag deduplica só as entradas renomeadas e preserva as demais', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({
      skills: [makeSkill({ id: 's1', tags: ['docs', 'Docs', 'web'] })],
      bases: [makeBase({ id: 'b1', tags: ['docs', 'Docs'] })]
    });
    await store.renameTag('docs', 'manual');
    expect(store.listSkills()[0].tags).toEqual(['manual', 'web']);
    expect(store.listBases()[0].tags).toEqual(['manual']);
  });

  it('renameTag não altera tags não relacionadas', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({
      skills: [makeSkill({ id: 's1', tags: ['docs', 'Docs', 'web'] })]
    });
    await store.renameTag('web', 'site');
    expect(store.listSkills()[0].tags).toEqual(['docs', 'Docs', 'site']);
  });

  it('saves concorrentes não se sobrescrevem nem corrompem o arquivo', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({ skills: [makeSkill({ id: 's1', name: 'Demo', tags: [] })] });
    await Promise.all([
      store.updateSkill('s1', { tags: ['a'] }),
      store.updateSkill('s1', { favorite: true })
    ]);
    const lib = await new LibraryStore(dir, join(dir, 'repos')).load();
    expect(lib.skills[0].tags).toEqual(['a']);
    expect(lib.skills[0].favorite).toBe(true);
  });

  it('renameTag rejeita destino vazio', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({ skills: [makeSkill({ id: 's1', tags: ['docs'] })] });
    await expect(store.renameTag('docs', '   ')).rejects.toThrow('Tag inválida');
  });
});
