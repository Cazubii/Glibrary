import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderPlus, Plus, RefreshCw, Layers3, WandSparkles, BriefcaseBusiness } from 'lucide-react';
import type { BaseItem, ProjectRef, Skill } from '@shared/types';
import { countTags, matchesTags, sameTag } from '@shared/tags';
import { api } from '../lib/api';
import { useLibraryStore } from '../store/library';
import TagChips from '../components/TagChips';
import TagManagerDialog from '../components/TagManagerDialog';
import { BaseCard, ProjectCard, SkillCard } from '../components/AssetCards';

type Section = 'skills' | 'bases' | 'projects';
type Assets = { skills: Skill[]; bases: BaseItem[]; projects: ProjectRef[] };
const empty: Assets = { skills: [], bases: [], projects: [] };
const sections: Section[] = ['skills', 'bases', 'projects'];

interface Props { onError: (message: string) => void }
export default function AssetLibraryPage({ onError }: Props): React.JSX.Element {
  const [section, setSection] = useState<Section>('skills');
  const [assets, setAssets] = useState<Assets>(empty);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [baseName, setBaseName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [basePath, setBasePath] = useState('');
  const [showBaseForm, setShowBaseForm] = useState(false);
  const [selected, setSelected] = useState<Record<Section, string[]>>({
    skills: [],
    bases: [],
    projects: []
  });
  const [manageOpen, setManageOpen] = useState(false);
  const settings = useLibraryStore((s) => s.settings);
  const updateSettings = useLibraryStore((s) => s.updateSettings);
  const refresh = useCallback(async () => { try { setAssets(await api.assetsGet()); } catch (e) { onError(e instanceof Error ? e.message : String(e)); } }, [onError]);
  useEffect(() => { void refresh(); }, [refresh]);

  const scanSkills = async (): Promise<void> => {
    const folders = settings?.skillFolders ?? [];
    if (folders.length === 0) {
      const selected = await api.dialogPickFolder();
      if (!selected) return;
      await updateSettings({ skillFolders: [selected] });
    }
    setBusy(true);
    try { await api.skillsScan(); await refresh(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const addFolder = async (): Promise<void> => {
    try {
      const selected = await api.dialogPickFolder(); if (!selected) return;
      const folders = settings?.skillFolders ?? [];
      if (!folders.includes(selected)) await updateSettings({ skillFolders: [...folders, selected] });
      setBusy(true); await api.skillsScan(); await refresh();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const addBase = async (): Promise<void> => {
    try {
      await api.baseAdd({ name: baseName.trim(), ...(baseUrl.trim() ? { remoteUrl: baseUrl.trim() } : {}), ...(basePath ? { localPath: basePath } : {}) });
      setBaseName(''); setBaseUrl(''); setBasePath(''); setShowBaseForm(false); await refresh();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  };

  const sectionTags = useMemo(
    () => ({
      skills: countTags(assets.skills),
      bases: countTags(assets.bases),
      projects: countTags(assets.projects)
    }),
    [assets]
  );
  const globalTags = useMemo(
    () => countTags([...assets.skills, ...assets.bases, ...assets.projects]),
    [assets]
  );

  useEffect(() => {
    setSelected((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of sections) {
        const kept = next[key].filter((tag) =>
          sectionTags[key].some((entry) => sameTag(entry.name, tag))
        );
        if (kept.length !== next[key].length) {
          next[key] = kept;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [sectionTags]);

  const toggleTag = (name: string): void =>
    setSelected((prev) => ({
      ...prev,
      [section]: prev[section].some((tag) => sameTag(tag, name))
        ? prev[section].filter((tag) => !sameTag(tag, name))
        : [...prev[section], name]
    }));
  const clearTags = (): void => setSelected((prev) => ({ ...prev, [section]: [] }));

  const handleRenameTag = async (from: string, to: string): Promise<void> => {
    try {
      await api.tagsRename(from, to);
      setSelected((prev) => {
        const next = { ...prev };
        for (const key of sections) {
          next[key] = next[key].map((tag) => (sameTag(tag, from) ? to : tag));
        }
        return next;
      });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  };

  const handleDeleteTag = async (name: string): Promise<void> => {
    try {
      await api.tagsDelete(name);
      setSelected((prev) => {
        const next = { ...prev };
        for (const key of sections) {
          next[key] = next[key].filter((tag) => !sameTag(tag, name));
        }
        return next;
      });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  };

  const allTagNames = useMemo(() => globalTags.map((tag) => tag.name), [globalTags]);

  const updateSkillTags = async (skill: Skill, tags: string[]): Promise<void> => {
    try {
      await api.skillUpdate(skill.id, { tags });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const toggleSkillFavorite = async (skill: Skill): Promise<void> => {
    try {
      await api.skillUpdate(skill.id, { favorite: !skill.favorite });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const updateBaseTags = async (base: BaseItem, tags: string[]): Promise<void> => {
    try {
      await api.baseUpdate(base.id, { tags });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const toggleBaseFavorite = async (base: BaseItem): Promise<void> => {
    try {
      await api.baseUpdate(base.id, { favorite: !base.favorite });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const updateProjectTags = async (project: ProjectRef, tags: string[]): Promise<void> => {
    try {
      await api.projectUpdate(project.id, { tags });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const toggleProjectFavorite = async (project: ProjectRef): Promise<void> => {
    try {
      await api.projectUpdate(project.id, { favorite: !project.favorite });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const selectedTags = selected[section];
  const matchQuery = (text: string): boolean =>
    text.toLowerCase().includes(query.toLowerCase());
  const filteredSkills = useMemo(
    () =>
      assets.skills.filter(
        (s) => matchesTags(s.tags, selectedTags) && matchQuery(`${s.name} ${s.description ?? ''} ${s.source}`)
      ),
    [assets.skills, selectedTags, query]
  );
  const filteredBases = useMemo(
    () =>
      assets.bases.filter(
        (b) => matchesTags(b.tags, selectedTags) && matchQuery(`${b.name} ${b.description ?? ''} ${b.remoteUrl ?? ''}`)
      ),
    [assets.bases, selectedTags, query]
  );
  const filteredProjects = useMemo(
    () =>
      assets.projects.filter(
        (p) => matchesTags(p.tags, selectedTags) && matchQuery(`${p.name} ${p.localPath ?? ''} ${p.notes ?? ''}`)
      ),
    [assets.projects, selectedTags, query]
  );
  const tab = (key: Section, label: string, icon: React.ReactNode): React.JSX.Element => <button type="button" onClick={() => setSection(key)} className={`flex items-center gap-2 rounded px-3 py-2 text-sm ${section === key ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}>{icon}{label}<span className="text-xs opacity-60">{assets[key].length}</span></button>;

  return <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
    <header className="flex items-center gap-4 border-b border-steam-elevated/50 px-6 py-4">
      <div><h1 className="text-xl font-semibold">Biblioteca</h1><p className="mt-1 text-xs text-steam-text/50">Skills reutilizáveis, repositórios-base e projetos que os utilizam.</p></div>
      <label className="ml-auto"><span className="sr-only">Buscar na biblioteca</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar… (Ctrl+K)" id="library-search" className="w-64 rounded border border-steam-elevated bg-steam-panel px-3 py-2 text-sm outline-none focus:border-steam-accent" /></label>
    </header>
    <nav className="flex gap-2 border-b border-steam-elevated/30 px-6 py-3">{tab('skills', 'Skills', <WandSparkles size={16}/>)}{tab('bases', 'Bases', <Layers3 size={16}/>)}{tab('projects', 'Projetos', <BriefcaseBusiness size={16}/>)}</nav>
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
      <TagChips
        tags={sectionTags[section]}
        selected={selectedTags}
        onToggle={toggleTag}
        onClear={clearTags}
        onManage={() => setManageOpen(true)}
      />
      {section === 'skills' && <>
        <div className="mb-5 flex items-center gap-2"><p className="mr-auto text-sm text-steam-text/60">{assets.skills.length} skills descobertas em arquivos SKILL.md</p><button disabled={busy} type="button" onClick={() => void addFolder()} className="flex items-center gap-2 rounded border border-steam-elevated px-3 py-2 text-sm hover:bg-steam-panel"><FolderPlus size={15}/>Adicionar origem</button><button disabled={busy} type="button" onClick={() => void scanSkills()} className="flex items-center gap-2 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-50"><RefreshCw size={15} className={busy ? 'animate-spin' : ''}/> {busy ? 'Buscando…' : 'Sincronizar'}</button></div>
        {filteredSkills.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredSkills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                allTags={allTagNames}
                onTagsChange={(tags) => void updateSkillTags(skill, tags)}
                onFavorite={() => void toggleSkillFavorite(skill)}
                onOpen={() =>
                  void api
                    .skillOpen(skill.id)
                    .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
                }
                onRemove={() =>
                  void api
                    .skillRemove(skill.id)
                    .then(refresh)
                    .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
                }
              />
            ))}
          </div>
        ) : (
          <Empty
            text={
              settings?.skillFolders.length
                ? 'Nenhum SKILL.md foi encontrado nas origens configuradas.'
                : 'Adicione uma pasta que contenha SKILL.md para importar suas skills.'
            }
          />
        )}
      </>}
      {section === 'bases' && <>
        <div className="mb-5 flex items-center"><p className="mr-auto text-sm text-steam-text/60">Repositórios e templates usados como ponto de partida.</p><button type="button" onClick={() => setShowBaseForm((v) => !v)} className="flex items-center gap-2 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg"><Plus size={15}/>Adicionar base</button></div>
        {showBaseForm && <form className="mb-5 flex flex-wrap items-end gap-3 rounded border border-steam-elevated bg-steam-panel p-4" onSubmit={(e) => { e.preventDefault(); void addBase(); }}><label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-steam-text/60">Nome<input required value={baseName} onChange={(e) => setBaseName(e.target.value)} className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm text-steam-text"/></label><label className="flex min-w-64 flex-[2] flex-col gap-1 text-xs text-steam-text/60">URL Git (opcional)<input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://github.com/…" className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm text-steam-text"/></label><button type="button" onClick={() => void api.dialogPickFolder().then((path) => { if (path) { setBasePath(path); if (!baseName) setBaseName(path.split(/[\\/]/).pop() ?? 'Base'); } }).catch((e: unknown) => onError(String(e)))} className="rounded border border-steam-elevated px-3 py-2 text-sm">{basePath ? 'Pasta selecionada' : 'Escolher pasta'}</button><button className="rounded bg-steam-accent px-4 py-2 text-sm font-semibold text-steam-bg">Salvar base</button></form>}
        {filteredBases.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredBases.map((base) => (
              <BaseCard
                key={base.id}
                base={base}
                allTags={allTagNames}
                basesRoot={settings?.basesRoot}
                onTagsChange={(tags) => void updateBaseTags(base, tags)}
                onFavorite={() => void toggleBaseFavorite(base)}
                onClone={() =>
                  void api
                    .baseClone(base.id)
                    .then(refresh)
                    .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
                }
                onRemove={() =>
                  void api
                    .baseRemove(base.id)
                    .then(refresh)
                    .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
                }
              />
            ))}
          </div>
        ) : (
          <Empty text="Adicione uma base para reutilizar como início de novos projetos." />
        )}
      </>}
      {section === 'projects' && <>
        <div className="mb-5 flex items-center"><p className="mr-auto text-sm text-steam-text/60">Projetos existentes como contexto: associe as skills e bases usadas em cada um.</p><button type="button" onClick={() => void api.dialogPickFolder().then(async (path) => { if (path) { await api.projectAdd(path); await refresh(); } }).catch((e: unknown) => onError(String(e)))} className="flex items-center gap-2 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg"><FolderPlus size={15}/>Adicionar projeto</button></div>
        {filteredProjects.length ? (
          <div className="space-y-3">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                assets={assets}
                allTags={allTagNames}
                onSave={async (patch) => {
                  try {
                    await api.projectUpdate(project.id, patch);
                    await refresh();
                  } catch (e) {
                    onError(e instanceof Error ? e.message : String(e));
                  }
                }}
                onTagsChange={(tags) => void updateProjectTags(project, tags)}
                onFavorite={() => void toggleProjectFavorite(project)}
              />
            ))}
          </div>
        ) : (
          <Empty text="A migração não encontrou projetos. Os repositórios locais da biblioteca v1 aparecem aqui como contexto." />
        )}
      </>}
    </div>
    {manageOpen && (
      <TagManagerDialog
        tags={globalTags}
        onRename={handleRenameTag}
        onDelete={handleDeleteTag}
        onClose={() => setManageOpen(false)}
      />
    )}
  </main>;
}

function Empty({ text }: { text: string }): React.JSX.Element { return <div className="flex min-h-64 flex-1 items-center justify-center rounded border border-dashed border-steam-elevated p-8 text-center text-sm text-steam-text/50">{text}</div>; }
