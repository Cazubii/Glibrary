import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { homedir } from 'os';
import { z } from 'zod';
import type { Agent, AgentProfile, BaseItem, Kit, LibraryFile, ProjectRef, Repo, Settings, Skill, ToolEntry, TopRepos, UsageEvent } from '../../shared/types';
import {
  AgentProfileInputSchema,
  AgentProfileSchema,
  AgentSchema,
  BaseItemSchema,
  KitInputSchema,
  KitSchema,
  LibraryFileSchema,
  ProjectRefSchema,
  RepoSchema,
  SettingsPatchSchema,
  SkillSchema,
  ToolEntrySchema,
  ToolInputSchema,
  TopReposSchema
} from '../../shared/schemas';
import { normalizeTag, normalizeTagList, tagKey } from '../../shared/tags';
import { applyStartupCorrections } from '../../shared/status';

const LIBRARY_FILE = 'library.json';
const BACKUP_FILE = 'library.backup.json';
const TMP_FILE = 'library.json.tmp';

const BUILTIN_TOOLS: ToolEntry[] = [
  {
    id: 'builtin-omniroute',
    name: 'OmniRoute',
    gitUrl: 'https://github.com/cheaper-inference/OmniRoute',
    source: 'builtin',
    createdAt: '2026-11-11T00:00:00.000Z'
  },
  {
    id: 'builtin-habblaud',
    name: 'Habblaud',
    gitUrl: 'https://github.com/marmottajr/habblaud',
    source: 'builtin',
    createdAt: '2026-11-11T00:00:00.000Z'
  }
];

export function defaultSettings(reposRoot: string): Settings {
  return {
    reposRoot,
    basesRoot: join(homedir(), 'BASES'),
    skillFolders: [join(homedir(), '.claude', 'skills'), join(homedir(), '.opencode', 'skills'), join(homedir(), '.agents', 'skills')],
    agentFolders: [join(homedir(), '.claude', 'agents'), join(homedir(), '.opencode', 'agent'), join(homedir(), '.agents', 'agents')],
    scanFolders: [],
    editorCommand: 'code',
    terminalPreference: 'auto',
    theme: 'dark',
    viewMode: 'grid',
    checkUpdatesOnStart: true,
    inheritTags: true
  };
}

export function emptyLibrary(reposRoot: string): LibraryFile {
  return { version: 2, repos: [], skills: [], agents: [], bases: [], projects: [], kits: [], usage: [], agentProfiles: [], tools: [], topRepos: { fetchedAt: '', repos: [] }, topRepos7: { fetchedAt: '', repos: [], windowDays: 7 }, settings: defaultSettings(reposRoot) };
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
          ...(repo.remoteUrl ? { remoteUrl: repo.remoteUrl } : {}), tags: repo.tags, favorite: repo.favorite, skillIds: [], agentIds: [], baseIds: [],
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
  private saveQueue: Promise<void> = Promise.resolve();

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
      this.seedBuiltinTools();
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
    if (this.seedBuiltinTools()) await this.save();
    return this.data;
  }

  private seedBuiltinTools(): boolean {
    let added = false;
    for (const builtin of BUILTIN_TOOLS) {
      if (!this.data.tools.some((tool) => tool.id === builtin.id)) {
        this.data.tools.push({ ...builtin });
        added = true;
      }
    }
    return added;
  }

  async save(): Promise<void> {
    const run = async (): Promise<void> => {
      const json = JSON.stringify(this.data, null, 2);
      await fs.writeFile(this.tmpPath, json, 'utf-8');
      await fs.rename(this.tmpPath, this.filePath);
      await fs.copyFile(this.filePath, this.backupPath);
    };
    const next = this.saveQueue.then(run, run);
    this.saveQueue = next;
    await next;
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
  listKits(): Kit[] { return this.data.kits; }
  getKit(id: string): Kit | undefined { return this.data.kits.find((kit) => kit.id === id); }
  listUsage(): UsageEvent[] { return this.data.usage; }

  async addKit(input: { name: string; description?: string; skillIds?: string[]; agentIds?: string[]; baseIds?: string[]; tags?: string[] }): Promise<Kit> {
    const parsed = KitInputSchema.parse(input);
    if (this.data.kits.some((kit) => kit.name.trim().toLowerCase() === parsed.name.toLowerCase())) {
      throw new Error(`Coleção já existe: ${parsed.name}`);
    }
    const kit = KitSchema.parse({
      id: randomUUID(),
      name: parsed.name,
      ...(parsed.description ? { description: parsed.description } : {}),
      skillIds: parsed.skillIds ?? [],
      agentIds: parsed.agentIds ?? [],
      baseIds: parsed.baseIds ?? [],
      tags: parsed.tags ?? [],
      addedAt: new Date().toISOString()
    });
    this.data.kits.push(kit);
    await this.save();
    return kit;
  }

  async updateKit(
    id: string,
    patch: { name?: string; description?: string; skillIds?: string[]; agentIds?: string[]; baseIds?: string[]; tags?: string[] }
  ): Promise<Kit> {
    const index = this.data.kits.findIndex((kit) => kit.id === id);
    if (index === -1) throw new Error(`Coleção não encontrada: ${id}`);
    const current = this.data.kits[index];
    const name = patch.name != null ? patch.name.trim() : current.name;
    if (this.data.kits.some((kit) => kit.id !== id && kit.name.trim().toLowerCase() === name.toLowerCase())) {
      throw new Error(`Coleção já existe: ${name}`);
    }
    const merged = KitSchema.parse({
      ...current,
      ...(patch.name != null ? { name } : {}),
      ...(patch.description !== undefined ? { description: patch.description === '' ? undefined : patch.description } : {}),
      ...(patch.skillIds != null ? { skillIds: patch.skillIds } : {}),
      ...(patch.agentIds != null ? { agentIds: patch.agentIds } : {}),
      ...(patch.baseIds != null ? { baseIds: patch.baseIds } : {}),
      ...(patch.tags != null ? { tags: normalizeTagList(patch.tags) } : {})
    });
    this.data.kits[index] = merged;
    await this.save();
    return merged;
  }

  async removeKit(id: string): Promise<void> {
    const index = this.data.kits.findIndex((kit) => kit.id === id);
    if (index === -1) throw new Error(`Coleção não encontrada: ${id}`);
    this.data.kits.splice(index, 1);
    await this.save();
  }

  listAgentProfiles(): AgentProfile[] {
    return this.data.agentProfiles;
  }

  async addAgentProfile(input: { name: string; repoId: string; command: string; args?: string[] }): Promise<AgentProfile> {
    const parsed = AgentProfileInputSchema.parse(input);
    const profile = AgentProfileSchema.parse({
      id: randomUUID(),
      name: parsed.name,
      repoId: parsed.repoId,
      command: parsed.command,
      args: parsed.args,
      createdAt: new Date().toISOString()
    });
    this.data.agentProfiles.push(profile);
    await this.save();
    return profile;
  }

  async updateAgentProfile(id: string, patch: { name?: string; repoId?: string; command?: string; args?: string[]; lastRunAt?: string }): Promise<AgentProfile> {
    const index = this.data.agentProfiles.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Perfil não encontrado: ${id}`);
    const merged = AgentProfileSchema.parse({
      ...this.data.agentProfiles[index],
      ...(patch.name != null ? { name: patch.name.trim() } : {}),
      ...(patch.repoId != null ? { repoId: patch.repoId } : {}),
      ...(patch.command != null ? { command: patch.command.trim() } : {}),
      ...(patch.args != null ? { args: patch.args } : {}),
      ...(patch.lastRunAt != null ? { lastRunAt: patch.lastRunAt } : {})
    });
    this.data.agentProfiles[index] = merged;
    await this.save();
    return merged;
  }

  async removeAgentProfile(id: string): Promise<void> {
    const index = this.data.agentProfiles.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Perfil não encontrado: ${id}`);
    this.data.agentProfiles.splice(index, 1);
    await this.save();
  }

  listTools(): ToolEntry[] {
    return this.data.tools;
  }

  async addTool(url: string): Promise<ToolEntry> {
    const input = ToolInputSchema.parse({ url });
    const normalizedUrl = input.url.replace(/\/$/, '');
    const repoSlug = normalizedUrl.split('/').at(-1)?.replace(/\.git$/i, '') ?? '';
    const duplicate = this.data.tools.some((tool) => {
      const existingSlug = tool.gitUrl.replace(/\/$/, '').split('/').at(-1)?.replace(/\.git$/i, '') ?? '';
      return existingSlug.toLowerCase() === repoSlug.toLowerCase();
    });
    if (duplicate) throw new Error(`J\u00e1 existe uma ferramenta com o nome de pasta "${repoSlug}"`);

    const tool = ToolEntrySchema.parse({
      id: randomUUID(),
      name: repoSlug,
      gitUrl: normalizedUrl,
      source: 'custom',
      createdAt: new Date().toISOString()
    });
    this.data.tools.push(tool);
    await this.save();
    return tool;
  }

  async removeTool(id: string): Promise<void> {
    const index = this.data.tools.findIndex((tool) => tool.id === id);
    if (index === -1) throw new Error(`Ferramenta n\u00e3o encontrada: ${id}`);
    if (this.data.tools[index]?.source === 'builtin') {
      throw new Error('Ferramentas integradas n\u00e3o podem ser removidas');
    }
    this.data.tools.splice(index, 1);
    await this.save();
  }

  /** Aplica uma coleção a um projeto: união de skill/agent/base ids + (opcional) herança de tags. */
  async applyKit(
    kitId: string,
    projectId: string,
    inheritTags: boolean
  ): Promise<ProjectRef> {
    const kit = this.data.kits.find((item) => item.id === kitId);
    if (!kit) throw new Error(`Coleção não encontrada: ${kitId}`);
    const index = this.data.projects.findIndex((item) => item.id === projectId);
    if (index === -1) throw new Error(`Projeto não encontrado: ${projectId}`);
    const project = this.data.projects[index];
    const known = new Set([
      ...this.data.skills.map((s) => s.id),
      ...this.data.agents.map((a) => a.id),
      ...this.data.bases.map((b) => b.id)
    ]);
    if ([...kit.skillIds, ...kit.agentIds, ...kit.baseIds].some((id) => !known.has(id))) {
      throw new Error('A coleção usa itens que não existem mais');
    }
    const mergedTags: string[] = [];
    for (const tag of project.tags) mergedTags.push(tag);
    if (inheritTags) {
      const byId = new Map<string, { tags: string[] }>();
      for (const skill of this.data.skills) byId.set(skill.id, skill);
      for (const agent of this.data.agents) byId.set(agent.id, agent);
      for (const base of this.data.bases) byId.set(base.id, base);
      for (const id of [...kit.skillIds, ...kit.agentIds, ...kit.baseIds]) {
        const asset = byId.get(id);
        if (!asset) continue;
        for (const tag of asset.tags) mergedTags.push(tag);
      }
      for (const tag of kit.tags) mergedTags.push(tag);
    }
    const merged = ProjectRefSchema.parse({
      ...project,
      skillIds: [...new Set([...project.skillIds, ...kit.skillIds])],
      agentIds: [...new Set([...project.agentIds, ...kit.agentIds])],
      baseIds: [...new Set([...project.baseIds, ...kit.baseIds])],
      tags: normalizeTagList(mergedTags)
    });
    this.data.projects[index] = merged;
    await this.save();
    return merged;
  }

  /** Registra um evento de uso (abrir skill/agent). Mantém no máximo 500 eventos. */
  async recordUsage(kind: 'skill' | 'agent', assetId: string): Promise<UsageEvent> {
    const exists = kind === 'skill'
      ? this.data.skills.some((skill) => skill.id === assetId)
      : this.data.agents.some((agent) => agent.id === assetId);
    if (!exists) throw new Error(`${kind === 'skill' ? 'Skill não encontrada' : 'Agente não encontrado'}: ${assetId}`);
    const event: UsageEvent = { id: randomUUID(), kind, assetId, at: new Date().toISOString() };
    this.data.usage = [...this.data.usage, event].slice(-500);
    await this.save();
    return event;
  }
  getRepo(id: string): Repo | undefined {
    return this.data.repos.find((r) => r.id === id);
  }

  listSkills(): Skill[] { return this.data.skills; }
  listAgents(): Agent[] { return this.data.agents; }
  listBases(): BaseItem[] { return this.data.bases; }
  listProjects(): ProjectRef[] { return this.data.projects; }
  getTopRepos(windowDays = 30): TopRepos {
    return windowDays === 7
      ? (this.data.topRepos7 ?? { fetchedAt: '', repos: [], windowDays: 7 })
      : this.data.topRepos;
  }

  /** Substitui a lista de top repos (busca do GitHub no startup ou manual), por janela de dias. */
  async setTopRepos(next: { fetchedAt: string; repos: LibraryFile['topRepos']['repos']; windowDays?: number }): Promise<void> {
    const parsed = TopReposSchema.parse(next);
    if (parsed.windowDays === 7) {
      this.data = LibraryFileSchema.parse({ ...this.data, topRepos7: parsed });
    } else {
      this.data.topRepos = parsed;
    }
    await this.save();
  }

  async replaceAssets(input: { skills?: Skill[]; agents?: Agent[]; bases?: BaseItem[]; projects?: ProjectRef[]; kits?: Kit[] }): Promise<LibraryFile> {
    const next = { ...this.data, ...input };
    this.data = LibraryFileSchema.parse(next);
    await this.save();
    return this.data;
  }

  async updateSkill(
    id: string,
    patch: { category?: Skill['category']; tags?: string[]; favorite?: boolean }
  ): Promise<Skill> {
    const index = this.data.skills.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Skill não encontrada: ${id}`);
    const merged = SkillSchema.parse({
      ...this.data.skills[index],
      ...(patch.category != null ? { category: patch.category } : {}),
      ...(patch.tags != null ? { tags: normalizeTagList(patch.tags) } : {}),
      ...(patch.favorite != null ? { favorite: patch.favorite } : {})
    });
    this.data.skills[index] = merged;
    await this.save();
    return merged;
  }

  async updateAgent(
    id: string,
    patch: { category?: Agent['category']; tags?: string[]; favorite?: boolean }
  ): Promise<Agent> {
    const index = this.data.agents.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Agente não encontrado: ${id}`);
    const merged = AgentSchema.parse({
      ...this.data.agents[index],
      ...(patch.category != null ? { category: patch.category } : {}),
      ...(patch.tags != null ? { tags: normalizeTagList(patch.tags) } : {}),
      ...(patch.favorite != null ? { favorite: patch.favorite } : {})
    });
    this.data.agents[index] = merged;
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
      agentIds?: string[];
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
      ...(patch.agentIds != null ? { agentIds: patch.agentIds } : {}),
      ...(patch.baseIds != null ? { baseIds: patch.baseIds } : {}),
      ...(patch.notes != null ? { notes: patch.notes } : {}),
      ...(patch.tags != null ? { tags: normalizeTagList(patch.tags) } : {}),
      ...(patch.favorite != null ? { favorite: patch.favorite } : {})
    });
    this.data.projects[index] = merged;
    await this.save();
    return merged;
  }

  async renameTag(from: string, to: string): Promise<void> {
    const source = normalizeTag(from);
    const target = normalizeTag(to);
    if (source == null || target == null) throw new Error('Tag inválida');
    const keyFrom = tagKey(source);
    const keyTo = tagKey(target);
    const all = [...this.data.skills, ...this.data.agents, ...this.data.bases, ...this.data.projects];
    const hasKey = (key: string): boolean =>
      all.some((item) => item.tags.some((tag) => tagKey(tag) === key));
    if (!hasKey(keyFrom)) throw new Error(`Tag não encontrada: ${source}`);
    if (keyTo !== keyFrom && hasKey(keyTo)) throw new Error(`Tag já existe: ${target}`);
    const rewrite = (tags: string[]): string[] => {
      const out: string[] = [];
      let replaced = false;
      for (const tag of tags) {
        if (tagKey(tag) !== keyFrom) {
          out.push(tag);
          continue;
        }
        if (replaced) continue;
        replaced = true;
        out.push(target);
      }
      return out;
    };
    this.data.skills = this.data.skills.map((item) => ({ ...item, tags: rewrite(item.tags) }));
    this.data.agents = this.data.agents.map((item) => ({ ...item, tags: rewrite(item.tags) }));
    this.data.bases = this.data.bases.map((item) => ({ ...item, tags: rewrite(item.tags) }));
    this.data.projects = this.data.projects.map((item) => ({ ...item, tags: rewrite(item.tags) }));
    await this.save();
  }

  async deleteTag(name: string): Promise<void> {
    const target = normalizeTag(name);
    if (target == null) throw new Error('Tag inválida');
    const key = tagKey(target);
    const all = [...this.data.skills, ...this.data.agents, ...this.data.bases, ...this.data.projects];
    if (!all.some((item) => item.tags.some((tag) => tagKey(tag) === key))) {
      throw new Error(`Tag não encontrada: ${target}`);
    }
    const strip = (tags: string[]): string[] => tags.filter((tag) => tagKey(tag) !== key);
    this.data.skills = this.data.skills.map((item) => ({ ...item, tags: strip(item.tags) }));
    this.data.agents = this.data.agents.map((item) => ({ ...item, tags: strip(item.tags) }));
    this.data.bases = this.data.bases.map((item) => ({ ...item, tags: strip(item.tags) }));
    this.data.projects = this.data.projects.map((item) => ({ ...item, tags: strip(item.tags) }));
    await this.save();
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
