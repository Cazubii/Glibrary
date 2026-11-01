import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { z } from 'zod';
import type { BaseItem, LibraryFile, ProjectRef, Repo, Settings, Skill } from '../../shared/types';
import {
  BaseItemSchema,
  LibraryFileSchema,
  ProjectRefSchema,
  RepoSchema,
  SettingsPatchSchema,
  SkillSchema
} from '../../shared/schemas';
import { normalizeTagList } from '../../shared/tags';
import { applyStartupCorrections } from '../../shared/status';

const LIBRARY_FILE = 'library.json';
const BACKUP_FILE = 'library.backup.json';
const TMP_FILE = 'library.json.tmp';

export function defaultSettings(reposRoot: string): Settings {
  return {
    reposRoot,
    basesRoot: join(homedir(), 'BASES'),
    skillFolders: [join(homedir(), '.claude', 'skills'), join(homedir(), '.opencode', 'skills'), join(homedir(), '.agents', 'skills')],
    scanFolders: [],
    editorCommand: 'code',
    terminalPreference: 'auto',
    theme: 'dark',
    viewMode: 'grid',
    checkUpdatesOnStart: true
  };
}

export function emptyLibrary(reposRoot: string): LibraryFile {
  return { version: 2, repos: [], skills: [], bases: [], projects: [], settings: defaultSettings(reposRoot) };
}

export function migrateLibrary(raw: unknown): LibraryFile {
  if (raw == null || typeof raw !== 'object') {
    throw new Error('library.json inválido: não é um objeto');
  }
  const record = raw as Record<string, unknown>;
  const version = record['version'];
  if (version === 1) {
    const old = zLegacyLibrary.parse(raw);
    const projects: ProjectRef[] = [];
    const bases: BaseItem[] = [];
    for (const repo of old.repos) {
      if (repo.localPath == null && repo.remoteUrl != null) {
        bases.push({ id: repo.id, name: repo.name, remoteUrl: repo.remoteUrl, tags: repo.tags,
          favorite: repo.favorite, addedAt: repo.addedAt,
          ...(repo.description ? { description: repo.description } : {}), ...(repo.notes ? { notes: repo.notes } : {}) });
      } else {
        projects.push({ id: repo.id, name: repo.name, ...(repo.description ? { description: repo.description } : {}), ...(repo.localPath ? { localPath: repo.localPath } : {}),
          ...(repo.remoteUrl ? { remoteUrl: repo.remoteUrl } : {}), tags: repo.tags, favorite: repo.favorite, skillIds: [], baseIds: [],
          ...(repo.notes ? { notes: repo.notes } : {}), addedAt: repo.addedAt });
      }
    }
    return LibraryFileSchema.parse({
      version: 2, repos: [], skills: [], bases, projects,
      settings: { ...old.settings, basesRoot: join(homedir(), 'BASES'), skillFolders: defaultSettings(old.settings.reposRoot).skillFolders }
    });
  }
  if (version === 2) {
    const settings = record['settings'] != null && typeof record['settings'] === 'object'
      ? record['settings'] as Record<string, unknown> : {};
    const parsed = LibraryFileSchema.parse({
      ...record,
      settings: { ...defaultSettings(String(settings['reposRoot'] ?? '')), ...settings }
    });
    return { ...parsed, settings: { ...defaultSettings(parsed.settings.reposRoot), ...parsed.settings } };
  }
  if (version == null || typeof version === 'number') {
    // versões futuras: migrações vão aqui; por enquanto só aceitamos v1
    throw new Error(`Versão desconhecida do library.json: ${String(version)}`);
  }
  throw new Error(`library.json inválido: version=${String(version)}`);
}

const zLegacyLibrary = z.object({
  version: z.literal(1), repos: z.array(RepoSchema), settings: z.object({
    reposRoot: z.string(), scanFolders: z.array(z.string()).default([]), githubToken: z.string().optional(),
    editorCommand: z.string().default('code'), terminalPreference: z.string().default('auto'),
    theme: z.enum(['dark', 'light']).default('dark'), viewMode: z.enum(['grid', 'list']).default('grid'),
    checkUpdatesOnStart: z.boolean().default(true)
  })
});

export class LibraryStore {
  private readonly filePath: string;
  private readonly backupPath: string;
  private readonly tmpPath: string;
  private data: LibraryFile;

  constructor(
    private readonly baseDir: string,
    defaultReposRoot: string,
  ) {
    this.filePath = join(baseDir, LIBRARY_FILE);
    this.backupPath = join(baseDir, BACKUP_FILE);
    this.tmpPath = join(baseDir, TMP_FILE);
    this.data = emptyLibrary(defaultReposRoot);
  }

  async load(): Promise<LibraryFile> {
    await fs.mkdir(this.baseDir, { recursive: true });
    let raw: string | null = null;
    try {
      raw = await fs.readFile(this.filePath, 'utf-8');
    } catch {
      raw = null;
    }
    if (raw == null) {
      this.data = emptyLibrary(this.data.settings.reposRoot);
      await this.save();
      return this.data;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      this.data = migrateLibrary(parsed);
      if (parsed != null && typeof parsed === 'object' && (parsed as Record<string, unknown>)['version'] === 1) {
        await this.save();
      }
    } catch {
      try {
        const backupRaw = await fs.readFile(this.backupPath, 'utf-8');
        this.data = migrateLibrary(JSON.parse(backupRaw));
        await this.save();
      } catch {
        this.data = emptyLibrary(this.data.settings.reposRoot);
        await this.save();
      }
    }
    return this.data;
  }

  async save(): Promise<void> {
    const json = JSON.stringify(this.data, null, 2);
    await fs.writeFile(this.tmpPath, json, 'utf-8');
    await fs.rename(this.tmpPath, this.filePath);
    await fs.copyFile(this.filePath, this.backupPath);
  }

  get(): LibraryFile {
    return this.data;
  }

  getSettings(): Settings {
    return this.data.settings;
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const parsed = SettingsPatchSchema.parse(patch);
    this.data.settings = { ...this.data.settings, ...parsed };
    await this.save();
    return this.data.settings;
  }

  listRepos(): Repo[] {
    return this.data.repos;
  }

  getRepo(id: string): Repo | undefined {
    return this.data.repos.find((r) => r.id === id);
  }

  listSkills(): Skill[] { return this.data.skills; }
  listBases(): BaseItem[] { return this.data.bases; }
  listProjects(): ProjectRef[] { return this.data.projects; }

  async replaceAssets(input: { skills?: Skill[]; bases?: BaseItem[]; projects?: ProjectRef[] }): Promise<LibraryFile> {
    const next = { ...this.data, ...input };
    this.data = LibraryFileSchema.parse(next);
    await this.save();
    return this.data;
  }

  async updateSkill(
    id: string,
    patch: { tags?: string[]; favorite?: boolean }
  ): Promise<Skill> {
    const index = this.data.skills.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Skill não encontrada: ${id}`);
    const merged = SkillSchema.parse({
      ...this.data.skills[index],
      ...(patch.tags != null ? { tags: normalizeTagList(patch.tags) } : {}),
      ...(patch.favorite != null ? { favorite: patch.favorite } : {})
    });
    this.data.skills[index] = merged;
    await this.save();
    return merged;
  }

  async updateBase(
    id: string,
    patch: { name?: string; description?: string; tags?: string[]; favorite?: boolean }
  ): Promise<BaseItem> {
    const index = this.data.bases.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Base não encontrada: ${id}`);
    const merged = BaseItemSchema.parse({
      ...this.data.bases[index],
      ...(patch.name != null ? { name: patch.name } : {}),
      ...(patch.description != null ? { description: patch.description } : {}),
      ...(patch.tags != null ? { tags: normalizeTagList(patch.tags) } : {}),
      ...(patch.favorite != null ? { favorite: patch.favorite } : {})
    });
    this.data.bases[index] = merged;
    await this.save();
    return merged;
  }

  async updateProject(
    id: string,
    patch: {
      skillIds?: string[];
      baseIds?: string[];
      notes?: string;
      tags?: string[];
      favorite?: boolean;
    }
  ): Promise<ProjectRef> {
    const index = this.data.projects.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Projeto não encontrado: ${id}`);
    const merged = ProjectRefSchema.parse({
      ...this.data.projects[index],
      ...(patch.skillIds != null ? { skillIds: patch.skillIds } : {}),
      ...(patch.baseIds != null ? { baseIds: patch.baseIds } : {}),
      ...(patch.notes != null ? { notes: patch.notes } : {}),
      ...(patch.tags != null ? { tags: normalizeTagList(patch.tags) } : {}),
      ...(patch.favorite != null ? { favorite: patch.favorite } : {})
    });
    this.data.projects[index] = merged;
    await this.save();
    return merged;
  }

  async addRepo(repo: Repo): Promise<Repo> {
    const parsed = RepoSchema.parse(repo);
    if (this.data.repos.some((r) => r.id === parsed.id)) {
      throw new Error(`Repositório já existe: ${parsed.id}`);
    }
    this.data.repos.push(parsed);
    await this.save();
    return parsed;
  }

  async updateRepo(id: string, patch: Partial<Repo>): Promise<Repo> {
    const index = this.data.repos.findIndex((r) => r.id === id);
    if (index === -1) throw new Error(`Repositório não encontrado: ${id}`);
    const merged = { ...this.data.repos[index], ...patch, id };
    const parsed = RepoSchema.parse(merged);
    this.data.repos[index] = parsed;
    await this.save();
    return parsed;
  }

  async removeRepo(id: string): Promise<void> {
    const index = this.data.repos.findIndex((r) => r.id === id);
    if (index === -1) throw new Error(`Repositório não encontrado: ${id}`);
    this.data.repos.splice(index, 1);
    await this.save();
  }

  /**
   * Correções de startup (seção 5.2/13.3): status presos e pastas que sumiram.
   * `folderExists` recebe um predicado síncrono por repo.
   */
  async applyStartupFixes(folderExists: (repo: Repo) => boolean): Promise<Repo[]> {
    const changed: Repo[] = [];
    for (const repo of this.data.repos) {
      const { status, changed: didChange } = applyStartupCorrections(repo, folderExists(repo));
      if (didChange) {
        repo.status = status;
        changed.push(repo);
      }
    }
    if (changed.length > 0) await this.save();
    return changed;
  }
}
