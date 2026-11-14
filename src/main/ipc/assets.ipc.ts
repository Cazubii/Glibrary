import { app, ipcMain, shell, dialog, BrowserWindow } from 'electron';
import { translateError } from '../services/error-translator';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { mkdir, stat, writeFile } from 'fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'path';
import { z } from 'zod';
import type { Agent, BaseItem, IpcResult, Kit, ProjectRef, Skill, SkillsScanResult, AgentsScanResult, TopRepos, TopScope, UsageEvent, RepoAnalysis } from '../../shared/types';
import { IpcChannels } from '../../shared/ipc-channels';
import {
  AgentUpdateInputSchema,
  BaseUpdateInputSchema,
  KitApplyInputSchema,
  ProjectUpdateInputSchema,
  SkillUpdateInputSchema,
  TagNameInputSchema,
  TagRenameInputSchema,
  ToolRunInputSchema,
  TopWindowInputSchema
} from '../../shared/schemas';
import { isSafeDirectoryName } from '../../shared/validators';
import type { LibraryStore } from '../services/library-store';
import type { GitService } from '../services/git-service';
import { isValidGitUrl } from '../../shared/git-utils';
import { discoverAgents, discoverSkills } from '../services/skills-scan';
import { fetchJson, fetchText } from '../services/github-api';
import { getGithubAccessToken } from '../services/github-oauth';
import { fetchTopRepos, searchGithubRepos } from '../services/top-repos';
import type { GithubSearchResponse } from '../services/top-repos';
import { searchAgentRepos } from '../services/agent-search';
import { analyzeGithubRepo } from '../services/repo-analysis';
import type { AgentSearchResponse } from '../services/agent-search';
import { importAgentsFromGithub, importSkillFromGithub } from '../services/import-github';
import { runDetached, trimOutput } from '../services/tool-run';
import { createStarterProject } from '../services/project-template';

const exec = promisify(execCb);

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
  return { ok: false, error: translateError(error) };
}

export function registerAssetsIpc(store: LibraryStore, git: GitService): void {
  // libraryGet/settingsGet/settingsSet/dialogPickFolder são registrados por
  // registerRepoIpc (src/main/ipc/repos.ipc.ts) — handler único, fonte canônica.
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

/** Se nenhuma pasta de destino existir, pergunta ao usuário e salva em settings. Lança erro se cancelado. */
async function ensureImportFolder(store: LibraryStore, kind: 'skill' | 'agent'): Promise<string[]> {
  const settings = store.getSettings();
  const folders = kind === 'skill' ? settings.skillFolders : settings.agentFolders;
  if (folders.length > 0) return folders;
  const choice = await dialog.showOpenDialog({
    title: kind === 'skill' ? 'Escolha a pasta de Skills para importações' : 'Escolha a pasta de Agents para importações',
    buttonLabel: 'Usar esta pasta',
    properties: ['openDirectory', 'createDirectory']
  });
  const picked = choice.filePaths[0];
  if (!picked) throw new Error('Importação cancelada: nenhuma pasta de destino foi escolhida');
  if (kind === 'skill') {
    const skillFolders = folders.includes(picked) ? folders : [...folders, picked];
    await store.updateSettings({ skillFolders });
    return skillFolders;
  }
  const agentFolders = folders.includes(picked) ? folders : [...folders, picked];
  await store.updateSettings({ agentFolders });
  return agentFolders;
}

  ipcMain.handle(IpcChannels.skillImport, async (_event, raw: unknown): Promise<IpcResult<Skill>> => {
    try {
      const { url } = UrlInput.parse(raw);
      const skillFolders = await ensureImportFolder(store, 'skill');
      const imported = await importSkillFromGithub({
        remoteUrl: url,
        skillFolders,
        existingSkills: store.listSkills(),
        fetchJson,
        fetchText,
        token: await getGithubAccessToken(store)
      });
      const rescan = await discoverSkills(skillFolders, store.listSkills());
      await store.replaceAssets({ skills: rescan.skills });
      const importedSkill = rescan.skills.find((item) => join(item.path, 'SKILL.md').toLowerCase() === imported.skillFile.toLowerCase());
      if (!importedSkill) throw new Error('Skill importada não apareceu no rescan');
      return ok(importedSkill);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentImport, async (_event, raw: unknown): Promise<IpcResult<Agent[]>> => {
    try {
      const { url } = UrlInput.parse(raw);
      const agentFolders = await ensureImportFolder(store, 'agent');
      const imported = await importAgentsFromGithub({
        remoteUrl: url,
        agentFolders,
        existingAgents: store.listAgents(),
        fetchJson,
        fetchText,
        token: await getGithubAccessToken(store)
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

  ipcMain.handle(IpcChannels.projectCreateStarter, async (): Promise<IpcResult<string>> => {
    try {
      const source = join(app.getAppPath(), 'resources', 'templates', 'site-starter');
      return ok(await createStarterProject(source, store.getSettings().basesRoot));
    } catch (error) {
      return fail(error);
    }
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
    IpcChannels.usageRecord,
    async (_event, raw: unknown): Promise<IpcResult<UsageEvent>> => {
      try {
        const input = z.object({ kind: z.enum(['skill', 'agent']), id: z.string().min(1) }).parse(raw);
        return ok(await store.recordUsage(input.kind, input.id));
      } catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(
    IpcChannels.userToolRun,
    async (_event, raw: unknown): Promise<IpcResult<{ started: boolean; code?: number; output?: string }>> => {
      try {
        const { toolId, projectId } = ToolRunInputSchema.parse(raw);
        const tool = store.getSettings().userTools?.find((t) => t.id === toolId);
        if (tool == null) throw new Error('Ferramenta não encontrada');
        const project = store.listProjects().find((p) => p.id === projectId);
        if (project?.localPath == null || !existsSync(project.localPath)) {
          throw new Error('Projeto sem pasta local válida');
        }
        if (tool.keepAlive === true) {
          runDetached(tool.command, project.localPath);
          return ok({ started: true });
        }
        try {
          const { stdout, stderr } = await exec(tool.command, {
            cwd: project.localPath,
            timeout: 180_000,
            maxBuffer: 8 * 1024 * 1024,
            windowsHide: true
          });
          return ok({ started: false, code: 0, output: trimOutput(`${stdout}\n${stderr}`) });
        } catch (err) {
          const e = err as { stdout?: string; stderr?: string; message: string; code?: number };
          return ok({
            started: false,
            code: typeof e.code === 'number' ? e.code : 1,
            output: trimOutput(`${e.stdout ?? ''}\n${e.stderr ?? ''}\n${e.message}`)
          });
        }
      } catch (e) { return fail(e); }
    }
  );

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
      return ok(store.getTopRepos(input.windowDays ?? 30, input.scope ?? 'all'));
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(IpcChannels.topReposRefresh, async (_event, raw: unknown): Promise<IpcResult<TopRepos>> => {
    try {
      const input = TopWindowInputSchema.default({}).parse(raw ?? {});
      return ok(await refreshTopReposAndBroadcast(store, input.windowDays ?? 30, input.scope ?? 'all'));
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
      const token = await getGithubAccessToken(store);
      return ok(await searchGithubRepos(fetchJson, { query: input.query, ...(input.language ? { language: input.language } : {}), limit: input.limit, token }));
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(IpcChannels.githubAgentSearch, async (_event, raw: unknown): Promise<IpcResult<AgentSearchResponse>> => {
    try {
      const { input } = z.object({ input: z.string().min(1) }).parse(raw);
      const token = await getGithubAccessToken(store);
      return ok(await searchAgentRepos(fetchJson, { input, token }));
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain.handle(IpcChannels.githubRepoAnalyze, async (_event, raw: unknown): Promise<IpcResult<RepoAnalysis>> => {
    try {
      const { url } = z.object({ url: z.string().min(1) }).parse(raw);
      if (!isValidGitUrl(url)) throw new Error('URL Git inválida');
      const analysis = await analyzeGithubRepo(fetchJson, {
        remoteUrl: url,
        token: await getGithubAccessToken(store)
      });
      return ok(analysis);
    } catch (e) {
      return fail(e);
    }
  });
}

/** Busca a lista de repos em alta na janela e escopo pedidos, persiste e avisa o renderer. */
export async function refreshTopReposAndBroadcast(store: LibraryStore, windowDays = 30, scope: TopScope = 'all'): Promise<TopRepos> {
  const token = await getGithubAccessToken(store);
  const fetched = await fetchTopRepos(fetchJson, { token, limit: 25, windowDays, scope });
  await store.setTopRepos({ ...fetched, windowDays, scope });
  const payload = ok(store.getTopRepos(windowDays, scope));
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.topReposChanged, payload);
  }
  return store.getTopRepos(windowDays, scope);
}

