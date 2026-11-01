import { ipcMain, shell, dialog, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, stat } from 'fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'path';
import { z } from 'zod';
import type { BaseItem, IpcResult, ProjectRef, Skill } from '../../shared/types';
import { IpcChannels } from '../../shared/ipc-channels';
import {
  BaseUpdateInputSchema,
  ProjectUpdateInputSchema,
  SettingsPatchSchema,
  SkillUpdateInputSchema,
  TagNameInputSchema,
  TagRenameInputSchema
} from '../../shared/schemas';
import { isSafeDirectoryName } from '../../shared/validators';
import type { LibraryStore } from '../services/library-store';
import type { GitService } from '../services/git-service';
import { isValidGitUrl } from '../../shared/git-utils';
import { discoverSkills } from '../services/skills-scan';

const BaseInput = z.object({
  name: z.string().trim().min(1).refine(isSafeDirectoryName, 'Nome de base inválido'),
  remoteUrl: z.string().optional().refine((url) => url == null || isValidGitUrl(url), 'URL Git inválida'),
  localPath: z.string().optional(), description: z.string().optional()
}).refine((input) => input.remoteUrl != null || input.localPath != null, 'Informe uma URL Git ou selecione uma pasta');
const ProjectInput = z.object({ path: z.string().min(1) });
const RemoveInput = z.object({ id: z.string().min(1) });
function ok<T>(data: T): IpcResult<T> { return { ok: true, data }; }
function fail(error: unknown): IpcResult<never> { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }

export function registerAssetsIpc(store: LibraryStore, git: GitService): void {
  ipcMain.handle(IpcChannels.libraryGet, async () => ok(store.get()));
  ipcMain.handle(IpcChannels.settingsGet, async () => ok(store.getSettings()));
  ipcMain.handle(IpcChannels.settingsSet, async (_event, raw: unknown) => {
    try { return ok(await store.updateSettings(SettingsPatchSchema.parse(raw))); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.dialogPickFolder, async (): Promise<IpcResult<string | null>> => {
    try { const win = BrowserWindow.getFocusedWindow(); const options = { properties: ['openDirectory' as const] }; const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options); return ok(result.canceled ? null : result.filePaths[0] ?? null); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.assetsGet, async (): Promise<IpcResult<Pick<ReturnType<LibraryStore['get']>, 'skills' | 'bases' | 'projects'>>> => {
    try { const { skills, bases, projects } = store.get(); return ok({ skills, bases, projects }); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.skillsScan, async (): Promise<IpcResult<Skill[]>> => {
    try {
      const skills = await discoverSkills(store.getSettings().skillFolders, store.listSkills());
      await store.replaceAssets({ skills });
      return ok(skills);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(IpcChannels.skillRemove, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try { const { id } = RemoveInput.parse(raw); await store.replaceAssets({ skills: store.listSkills().filter((item) => item.id !== id), projects: store.listProjects().map((p) => ({ ...p, skillIds: p.skillIds.filter((item) => item !== id) })) }); return ok(null); } catch (e) { return fail(e); }
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
    try { const { id } = RemoveInput.parse(raw); await store.replaceAssets({ bases: store.listBases().filter((item) => item.id !== id), projects: store.listProjects().map((p) => ({ ...p, baseIds: p.baseIds.filter((item) => item !== id) })) }); return ok(null); } catch (e) { return fail(e); }
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
      const project: ProjectRef = { id: randomUUID(), name: basename(localPath), localPath, tags: [], favorite: false, skillIds: [], baseIds: [], addedAt: new Date().toISOString() };
      await store.replaceAssets({ projects: [...store.listProjects(), project] }); return ok(project);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.skillOpen, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try { const { id } = RemoveInput.parse(raw); const skill = store.listSkills().find((item) => item.id === id); if (!skill) throw new Error('Skill não encontrada'); const error = await shell.openPath(join(skill.path, 'SKILL.md')); if (error) throw new Error(error); return ok(null); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.skillUpdate, async (_event, raw: unknown): Promise<IpcResult<Skill>> => {
    try {
      const { id, patch } = SkillUpdateInputSchema.parse(raw);
      return ok(await store.updateSkill(id, patch));
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
}
