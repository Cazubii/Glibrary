import { promises as fs } from 'fs';
import { join } from 'path';
import type { LibraryFile, Repo, Settings } from '../../shared/types';
import { LibraryFileSchema, RepoSchema, SettingsPatchSchema } from '../../shared/schemas';
import { applyStartupCorrections } from '../../shared/status';

const LIBRARY_FILE = 'library.json';
const BACKUP_FILE = 'library.backup.json';
const TMP_FILE = 'library.json.tmp';

export function defaultSettings(reposRoot: string): Settings {
  return {
    reposRoot,
    scanFolders: [],
    editorCommand: 'code',
    terminalPreference: 'auto',
    theme: 'dark',
    viewMode: 'grid',
    checkUpdatesOnStart: true
  };
}

export function emptyLibrary(reposRoot: string): LibraryFile {
  return { version: 1, repos: [], settings: defaultSettings(reposRoot) };
}

function migrate(raw: unknown): LibraryFile {
  if (raw == null || typeof raw !== 'object') {
    throw new Error('library.json inválido: não é um objeto');
  }
  const record = raw as Record<string, unknown>;
  const version = record['version'];
  if (version === 1) {
    return LibraryFileSchema.parse(raw);
  }
  if (version == null || typeof version === 'number') {
    // versões futuras: migrações vão aqui; por enquanto só aceitamos v1
    throw new Error(`Versão desconhecida do library.json: ${String(version)}`);
  }
  throw new Error(`library.json inválido: version=${String(version)}`);
}

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
      this.data = migrate(JSON.parse(raw));
    } catch {
      try {
        const backupRaw = await fs.readFile(this.backupPath, 'utf-8');
        this.data = migrate(JSON.parse(backupRaw));
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
