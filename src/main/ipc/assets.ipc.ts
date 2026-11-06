import { ipcMain, shell, dialog, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, stat, writeFile } from 'fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'path';
import { z } from 'zod';
import type { Agent, BaseItem, IpcResult, Kit, ProjectRef, Skill, SkillsScanResult, AgentsScanResult, TopRepos, UsageEvent } from '../../shared/types';
import { IpcChannels } from '../../shared/ipc-channels';
import {
  AgentUpdateInputSchema,
  BaseUpdateInputSchema,
  KitApplyInputSchema,
  ProjectUpdateInputSchema,
  SettingsPatchSchema,
  SkillUpdateInputSchema,
  TagNameInputSchema,
  TagRenameInputSchema,
  TopWindowInputSchema
} from '../../shared/schemas';
import { isSafeDirectoryName } from '../../shared/validators';
import type { LibraryStore } from '../services/library-store';
import type { GitService } from '../services/git-service';
import { isValidGitUrl } from '../../shared/git-utils';
import { discoverAgents, discoverSkills } from '../services/skills-scan';
import { decodeToken, fetchJson, fetchText } from '../services/github-api';
import { fetchTopRepos, searchGithubRepos } from '../services/top-repos';
import type { GithubSearchResponse } from '../services/top-repos';
import { searchAgentRepos } from '../services/agent-search';
import type { AgentSearchResponse } from '../services/agent-search';
import { importAgentsFromGithub, importSkillFromGithub } from '../services/import-github';

const BaseInput = z.object({
  name: z.string().trim().min(1).refine(isSafeDirectoryName, 'Nome de base inválido'),
  remoteUrl: z.string().optional().refine((url) => url == null || isValidGitUrl(url), 'URL Git inválida'),
  localPath: z.string().optional(), description: z.string().optional()
}).refine((input) => input.remoteUrl != null || input.localPath != null, 'Informe uma URL Git ou selecione uma pasta');
const ProjectInput = z.object({ path: z.string().min(1) });
const RemoveInput = z.object({ id: z.string().min(1) });
const UrlInput = z.object({ url: z.string().min(1) });
const KitUpdateInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  skillIds: z.array(z.string()).optional(),
  agentIds: z.array(z.string()).optional(),
  baseIds: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
});
const KitAddInput = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  skillIds: z.array(z.string()).optional(),
  agentIds: z.array(z.string()).optional(),
  baseIds: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
});
function ok<T>(data: T): IpcResult<T> { return { ok: true, data }; }
function fail(error: unknown): IpcResult<never> {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues.map((issue) => issue.message).join('; ') };
  }
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export function registerAssetsIpc(store: LibraryStore, git: GitService): void {
  ipcMain.handle(IpcChannels.libraryGet, async () => ok(store.get()));
  ipcMain.handle(IpcChannels.settingsGet, async () => ok(store.getSettings()));
  ipcMain.handle(IpcChannels.settingsSet, async (_event, raw: unknown) => {
    try { return ok(await store.updateSettings(SettingsPatchSchema.parse(raw))); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.dialogPickFolder, async (): Promise<IpcResult<string | null>> => {
    try { const win = BrowserWindow.getFocusedWindow(); const options = { properties: ['openDirectory' as const] }; const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options); return ok(result.canceled ? null : result.filePaths[0] ?? null); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.assetsGet, async (): Promise<IpcResult<Pick<ReturnType<LibraryStore['get']>, 'skills' | 'agents' | 'bases' | 'projects' | 'kits' | 'usage'>>> => {
    try { const { skills, agents, bases, projects, kits, usage } = store.get(); return ok({ skills, agents, bases, projects, kits, usage }); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.skillsScan, async (): Promise<IpcResult<SkillsScanResult>> => {
    try {
      const result = await discoverSkills(store.getSettings().skillFolders, store.listSkills());
      await store.replaceAssets({ skills: result.skills });
      return ok(result);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(IpcChannels.agentsScan, async (): Promise<IpcResult<AgentsScanResult>> => {
    try {
      const result = await discoverAgents(store.getSettings().agentFolders, store.listAgents());
      await store.replaceAssets({ agents: result.agents });
      return ok(result);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(IpcChannels.skillImport, async (_event, raw: unknown): Promise<IpcResult<Skill>> => {
    try {
      const { url } = UrlInput.parse(raw);
      const settings = store.getSettings();
      const imported = await importSkillFromGithub({
        remoteUrl: url,
        skillFolders: settings.skillFolders,
        existingSkills: store.listSkills(),
        fetchJson,
        fetchText,
        token: decodeToken(settings.githubToken)
      });
      const rescan = await discoverSkills(settings.skillFolders, store.listSkills());
      await store.replaceAssets({ skills: rescan.skills });
      const importedSkill = rescan.skills.find((item) => join(item.path, 'SKILL.md').toLowerCase() === imported.skillFile.toLowerCase());
      if (!importedSkill) throw new Error('Skill importada não apareceu no rescan');
      return ok(importedSkill);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentImport, async (_event, raw: unknown): Promise<IpcResult<Agent[]>> => {
    try {
      const { url } = UrlInput.parse(raw);
      const settings = store.getSettings();
      const imported = await importAgentsFromGithub({
        remoteUrl: url,
        agentFolders: settings.agentFolders,
        existingAgents: store.listAgents(),
        fetchJson,
        fetchText,
        token: decodeToken(settings.githubToken)
      });
      if (imported.agents.length === 0) throw new Error('Agentes baixados não aparecem no rescan');
      await store.replaceAssets({ agents: [...store.listAgents(), ...imported.agents.filter((agent) => !store.listAgents().some((item) => item.file.toLowerCase() === agent.file.toLowerCase()))] });
      return ok(imported.agents);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.skillRemove, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { id } = RemoveInput.parse(raw);
      await store.replaceAssets({
        skills: store.listSkills().filter((item) => item.id !== id),
        projects: store.listProjects().map((p) => ({ ...p, skillIds: p.skillIds.filter((item) => item !== id) })),
        kits: store.listKits().map((kit) => ({ ...kit, skillIds: kit.skillIds.filter((item) => item !== id) }))
      });
      return ok(null);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentRemove, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { id } = RemoveInput.parse(raw);
      await store.replaceAssets({
        agents: store.listAgents().filter((item) => item.id !== id),
        projects: store.listProjects().map((p) => ({ ...p, agentIds: p.agentIds.filter((item) => item !== id) })),
        kits: store.listKits().map((kit) => ({ ...kit, agentIds: kit.agentIds.filter((item) => item !== id) }))
      });
      return ok(null);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.baseAdd, async (_event, raw: unknown): Promise<IpcResult<BaseItem>> => {
    try {
      const input = BaseInput.parse(raw);
      const localPath = input.localPath ? resolve(input.localPath) : undefined;
      if (localPath && (!existsSync(localPath) || !(await stat(localPath)).isDirectory())) throw new Error('Pasta da base não encontrada');
      const duplicate = store.listBases().some((item) =>
        (input.remoteUrl != null && item.remoteUrl === input.remoteUrl) ||
        (localPath != null && item.localPath?.toLowerCase() === localPath.toLowerCase()));
      if (duplicate) throw new Error('Esta base já está na biblioteca');
      const item: BaseItem = { id: randomUUID(), name: input.name, ...(input.remoteUrl ? { remoteUrl: input.remoteUrl } : {}), ...(localPath ? { localPath } : {}), ...(input.description ? { description: input.description } : {}), tags: [], favorite: false, addedAt: new Date().toISOString() };
      await store.replaceAssets({ bases: [...store.listBases(), item] }); return ok(item);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.baseRemove, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { id } = RemoveInput.parse(raw);
      await store.replaceAssets({
        bases: store.listBases().filter((item) => item.id !== id),
        projects: store.listProjects().map((p) => ({ ...p, baseIds: p.baseIds.filter((item) => item !== id) })),
        kits: store.listKits().map((kit) => ({ ...kit, baseIds: kit.baseIds.filter((item) => item !== id) }))
      });
      return ok(null);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.baseClone, async (_event, raw: unknown): Promise<IpcResult<BaseItem>> => {
    try {
      const { id } = RemoveInput.parse(raw); const base = store.listBases().find((item) => item.id === id);
      if (!base?.remoteUrl) throw new Error('Base sem URL remota');
      if (!isValidGitUrl(base.remoteUrl) || !isSafeDirectoryName(base.name)) throw new Error('Dados da base inválidos para clonar');
      if (base.localPath && existsSync(base.localPath)) throw new Error('A pasta desta base já existe');
      const root = store.getSettings().basesRoot; await mkdir(root, { recursive: true });
      const target = resolve(root, base.name);
      const relativeTarget = relative(resolve(root), target);
      if (!relativeTarget || relativeTarget.startsWith('..') || isAbsolute(relativeTarget)) throw new Error('Destino de clone inválido');
      const localPath = await git.clone(`base-${id}`, base.remoteUrl, root, base.name, () => undefined);
      const updated = { ...base, localPath };
      await store.replaceAssets({ bases: store.listBases().map((item) => item.id === id ? updated : item) });
      return ok(updated);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(
    IpcChannels.projectUpdate,
    async (_event, raw: unknown): Promise<IpcResult<ProjectRef>> => {
      try {
        const input = ProjectUpdateInputSchema.parse(raw);
        const { id, ...patch } = input;
        const project = store.listProjects().find((item) => item.id === id);
        if (!project) throw new Error('Projeto não encontrado');
        if (patch.skillIds?.some((skillId) => !store.listSkills().some((item) => item.id === skillId)))
          throw new Error('A associação contém uma Skill desconhecida');
        if (patch.agentIds?.some((agentId) => !store.listAgents().some((item) => item.id === agentId)))
          throw new Error('A associação contém um Agent desconhecido');
        if (patch.baseIds?.some((baseId) => !store.listBases().some((item) => item.id === baseId)))
          throw new Error('A associação contém uma Base desconhecida');
        return ok(await store.updateProject(id, patch));
      } catch (e) {
        return fail(e);
      }
    }
  );

  ipcMain.handle(IpcChannels.projectAdd, async (_event, raw: unknown): Promise<IpcResult<ProjectRef>> => {
    try {
      const { path } = ProjectInput.parse(raw); const localPath = resolve(path);
      if (!existsSync(localPath) || !(await stat(localPath)).isDirectory()) throw new Error('Pasta do projeto não encontrada');
      if (store.listProjects().some((item) => item.localPath?.toLowerCase() === localPath.toLowerCase())) throw new Error('Este projeto já está na biblioteca');
      const project: ProjectRef = { id: randomUUID(), name: basename(localPath), localPath, tags: [], favorite: false, skillIds: [], agentIds: [], baseIds: [], addedAt: new Date().toISOString() };
      await store.replaceAssets({ projects: [...store.listProjects(), project] }); return ok(project);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.skillOpen, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try { const { id } = RemoveInput.parse(raw); const skill = store.listSkills().find((item) => item.id === id); if (!skill) throw new Error('Skill não encontrada'); const error = await shell.openPath(join(skill.path, 'SKILL.md')); if (error) throw new Error(error); await store.recordUsage('skill', id); return ok(null); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentOpen, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try { const { id } = RemoveInput.parse(raw); const agent = store.listAgents().find((item) => item.id === id); if (!agent) throw new Error('Agente não encontrado'); const error = await shell.openPath(agent.file); if (error) throw new Error(error); await store.recordUsage('agent', id); return ok(null); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.kitAdd, async (_event, raw: unknown): Promise<IpcResult<Kit>> => {
    try {
      const input = KitAddInput.parse(raw);
      validateKitRefs(input);
      return ok(await store.addKit(input));
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.kitUpdate, async (_event, raw: unknown): Promise<IpcResult<Kit>> => {
    try {
      const { id, ...patch } = KitUpdateInput.parse(raw);
      validateKitRefs(patch);
      return ok(await store.updateKit(id, patch));
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.kitRemove, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try { const { id } = RemoveInput.parse(raw); await store.removeKit(id); return ok(null); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.kitApply, async (_event, raw: unknown): Promise<IpcResult<ProjectRef>> => {
    try {
      const { kitId, projectId, inheritTags } = KitApplyInputSchema.parse(raw);
      const effective = inheritTags ?? store.getSettings().inheritTags;
      return ok(await store.applyKit(kitId, projectId, effective));
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.usageList, async (): Promise<IpcResult<UsageEvent[]>> => {
    try { return ok(store.listUsage()); } catch (e) { return fail(e); }
  });

  ipcMain.handle(
    IpcChannels.dashboardExport,
    async (_event, raw: unknown): Promise<IpcResult<string | null>> => {
      try {
        const { content, suggestedName } = z
          .object({ content: z.string().min(1), suggestedName: z.string().min(1).default('dashboard.md') })
          .parse(raw);
        const win = BrowserWindow.getFocusedWindow();
        const result = win
          ? await dialog.showSaveDialog(win, { defaultPath: suggestedName, filters: [{ name: 'Markdown', extensions: ['md'] }] })
          : await dialog.showSaveDialog({ defaultPath: suggestedName });
        if (result.canceled || !result.filePath) return ok(null);
        await writeFile(result.filePath, content, 'utf8');
        return ok(result.filePath);
      } catch (e) { return fail(e); }
    }
  );

  async function validateKitRefs(input: {
    name?: string;
    description?: string;
    skillIds?: string[];
    agentIds?: string[];
    baseIds?: string[];
    tags?: string[];
  }): Promise<void> {
    if (input.skillIds?.some((skillId) => !store.listSkills().some((item) => item.id === skillId)))
      throw new Error('A coleção contém uma Skill desconhecida');
    if (input.agentIds?.some((agentId) => !store.listAgents().some((item) => item.id === agentId)))
      throw new Error('A coleção contém um Agent desconhecido');
    if (input.baseIds?.some((baseId) => !store.listBases().some((item) => item.id === baseId)))
      throw new Error('A coleção contém uma Base desconhecida');
  }

  ipcMain.handle(IpcChannels.skillUpdate, async (_event, raw: unknown): Promise<IpcResult<Skill>> => {
    try {
      const { id, patch } = SkillUpdateInputSchema.parse(raw);
      return ok(await store.updateSkill(id, patch));
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(IpcChannels.agentUpdate, async (_event, raw: unknown): Promise<IpcResult<Agent>> => {
    try {
      const { id, patch } = AgentUpdateInputSchema.parse(raw);
      return ok(await store.updateAgent(id, patch));
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(
    IpcChannels.baseUpdate,
    async (_event, raw: unknown): Promise<IpcResult<BaseItem>> => {
      try {
        const { id, patch } = BaseUpdateInputSchema.parse(raw);
        return ok(await store.updateBase(id, patch));
      } catch (e) {
        return fail(e);
      }
    }
  );

  ipcMain.handle(IpcChannels.tagsRename, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { from, to } = TagRenameInputSchema.parse(raw);
      await store.renameTag(from, to);
      return ok(null);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(IpcChannels.tagsDelete, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { name } = TagNameInputSchema.parse(raw);
      await store.deleteTag(name);
      return ok(null);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(IpcChannels.topReposGet, async (_event, raw: unknown): Promise<IpcResult<TopRepos>> => {
    try {
      const input = TopWindowInputSchema.default({}).parse(raw ?? {});
      return ok(store.getTopRepos(input.windowDays ?? 30));
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(IpcChannels.topReposRefresh, async (_event, raw: unknown): Promise<IpcResult<TopRepos>> => {
    try {
      const input = TopWindowInputSchema.default({}).parse(raw ?? {});
      return ok(await refreshTopReposAndBroadcast(store, input.windowDays ?? 30));
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(IpcChannels.githubSearch, async (_event, raw: unknown): Promise<IpcResult<GithubSearchResponse>> => {
    try {
      const input = z
        .object({
          query: z.string().min(1),
          language: z.string().optional(),
          limit: z.number().int().positive().max(50).optional()
        })
        .parse(raw);
      const token = decodeToken(store.getSettings().githubToken);
      return ok(await searchGithubRepos(fetchJson, { query: input.query, ...(input.language ? { language: input.language } : {}), limit: input.limit, token }));
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(IpcChannels.githubAgentSearch, async (_event, raw: unknown): Promise<IpcResult<AgentSearchResponse>> => {
    try {
      const { input } = z.object({ input: z.string().min(1) }).parse(raw);
      const token = decodeToken(store.getSettings().githubToken);
      return ok(await searchAgentRepos(fetchJson, { input, token }));
    } catch (e) {
      return fail(e);
    }
  });
}

/** Busca a lista de repos em alta na janela pedida (7 ou 30 dias), persiste e avisa o renderer. */
export async function refreshTopReposAndBroadcast(store: LibraryStore, windowDays = 30): Promise<TopRepos> {
  const token = decodeToken(store.getSettings().githubToken);
  const fetched = await fetchTopRepos(fetchJson, { token, limit: 25, windowDays });
  await store.setTopRepos({ ...fetched, windowDays });
  const payload = ok(store.getTopRepos(windowDays));
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.topReposChanged, payload);
  }
  return store.getTopRepos(windowDays);
}
