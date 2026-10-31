import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderPlus, Plus, RefreshCw, Trash2, FolderOpen, Layers3, WandSparkles, BriefcaseBusiness } from 'lucide-react';
import type { BaseItem, ProjectRef, Skill } from '@shared/types';
import { api } from '../lib/api';
import { useLibraryStore } from '../store/library';

type Section = 'skills' | 'bases' | 'projects';
type Assets = { skills: Skill[]; bases: BaseItem[]; projects: ProjectRef[] };
const empty: Assets = { skills: [], bases: [], projects: [] };

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

  const filteredSkills = useMemo(() => assets.skills.filter((s) => `${s.name} ${s.description ?? ''} ${s.source}`.toLowerCase().includes(query.toLowerCase())), [assets.skills, query]);
  const filteredBases = useMemo(() => assets.bases.filter((b) => `${b.name} ${b.description ?? ''} ${b.remoteUrl ?? ''}`.toLowerCase().includes(query.toLowerCase())), [assets.bases, query]);
  const filteredProjects = useMemo(() => assets.projects.filter((p) => `${p.name} ${p.localPath ?? ''} ${p.notes ?? ''}`.toLowerCase().includes(query.toLowerCase())), [assets.projects, query]);
  const tab = (key: Section, label: string, icon: React.ReactNode): React.JSX.Element => <button type="button" onClick={() => setSection(key)} className={`flex items-center gap-2 rounded px-3 py-2 text-sm ${section === key ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}>{icon}{label}<span className="text-xs opacity-60">{assets[key].length}</span></button>;

  return <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
    <header className="flex items-center gap-4 border-b border-steam-elevated/50 px-6 py-4">
      <div><h1 className="text-xl font-semibold">Biblioteca</h1><p className="mt-1 text-xs text-steam-text/50">Skills reutilizáveis, repositórios-base e projetos que os utilizam.</p></div>
      <label className="ml-auto"><span className="sr-only">Buscar na biblioteca</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar… (Ctrl+K)" id="library-search" className="w-64 rounded border border-steam-elevated bg-steam-panel px-3 py-2 text-sm outline-none focus:border-steam-accent" /></label>
    </header>
    <nav className="flex gap-2 border-b border-steam-elevated/30 px-6 py-3">{tab('skills', 'Skills', <WandSparkles size={16}/>)}{tab('bases', 'Bases', <Layers3 size={16}/>)}{tab('projects', 'Projetos', <BriefcaseBusiness size={16}/>)}</nav>
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
      {section === 'skills' && <>
        <div className="mb-5 flex items-center gap-2"><p className="mr-auto text-sm text-steam-text/60">{assets.skills.length} skills descobertas em arquivos SKILL.md</p><button disabled={busy} type="button" onClick={() => void addFolder()} className="flex items-center gap-2 rounded border border-steam-elevated px-3 py-2 text-sm hover:bg-steam-panel"><FolderPlus size={15}/>Adicionar origem</button><button disabled={busy} type="button" onClick={() => void scanSkills()} className="flex items-center gap-2 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-50"><RefreshCw size={15} className={busy ? 'animate-spin' : ''}/> {busy ? 'Buscando…' : 'Sincronizar'}</button></div>
        {filteredSkills.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filteredSkills.map((skill) => <article key={skill.id} className="rounded border border-steam-elevated bg-steam-panel p-4"><div className="flex items-start gap-3"><WandSparkles size={18} className="mt-0.5 shrink-0 text-steam-accent"/><div className="min-w-0 flex-1"><h2 className="font-semibold">{skill.name}</h2><p className="mt-1 line-clamp-2 text-sm text-steam-text/60">{skill.description ?? 'Sem descrição no cabeçalho de SKILL.md.'}</p><p className="mt-3 truncate text-xs text-steam-text/40" title={skill.path}>{skill.source}</p></div></div><div className="mt-4 flex gap-2"><button type="button" onClick={() => void api.skillOpen(skill.id).catch((e: unknown) => onError(String(e)))} className="flex items-center gap-1 rounded bg-steam-elevated px-2 py-1 text-xs hover:text-steam-accent"><FolderOpen size={13}/>Abrir skill</button><button type="button" onClick={() => void api.skillRemove(skill.id).then(refresh).catch((e: unknown) => onError(String(e)))} aria-label={`Remover ${skill.name}`} className="ml-auto rounded p-1 text-steam-text/40 hover:text-red-400"><Trash2 size={14}/></button></div></article>)}</div> : <Empty text={settings?.skillFolders.length ? 'Nenhum SKILL.md foi encontrado nas origens configuradas.' : 'Adicione uma pasta que contenha SKILL.md para importar suas skills.'}/>} 
      </>}
      {section === 'bases' && <>
        <div className="mb-5 flex items-center"><p className="mr-auto text-sm text-steam-text/60">Repositórios e templates usados como ponto de partida.</p><button type="button" onClick={() => setShowBaseForm((v) => !v)} className="flex items-center gap-2 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg"><Plus size={15}/>Adicionar base</button></div>
        {showBaseForm && <form className="mb-5 flex flex-wrap items-end gap-3 rounded border border-steam-elevated bg-steam-panel p-4" onSubmit={(e) => { e.preventDefault(); void addBase(); }}><label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-steam-text/60">Nome<input required value={baseName} onChange={(e) => setBaseName(e.target.value)} className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm text-steam-text"/></label><label className="flex min-w-64 flex-[2] flex-col gap-1 text-xs text-steam-text/60">URL Git (opcional)<input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://github.com/…" className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm text-steam-text"/></label><button type="button" onClick={() => void api.dialogPickFolder().then((path) => { if (path) { setBasePath(path); if (!baseName) setBaseName(path.split(/[\\/]/).pop() ?? 'Base'); } }).catch((e: unknown) => onError(String(e)))} className="rounded border border-steam-elevated px-3 py-2 text-sm">{basePath ? 'Pasta selecionada' : 'Escolher pasta'}</button><button className="rounded bg-steam-accent px-4 py-2 text-sm font-semibold text-steam-bg">Salvar base</button></form>}
        {filteredBases.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filteredBases.map((base) => <article key={base.id} className="rounded border border-steam-elevated bg-steam-panel p-4"><h2 className="font-semibold">{base.name}</h2><p className="mt-2 break-all text-xs text-steam-text/50">{base.localPath ?? base.remoteUrl ?? base.description ?? 'Base local'}</p><div className="mt-4 flex items-center gap-2">{base.remoteUrl && !base.localPath && <button type="button" onClick={() => void api.baseClone(base.id).then(refresh).catch((e: unknown) => onError(String(e)))} className="rounded bg-steam-elevated px-2 py-1 text-xs hover:text-steam-accent">Clonar para {settings?.basesRoot ?? '~/BASES'}</button>}<button type="button" onClick={() => void api.baseRemove(base.id).then(refresh).catch((e: unknown) => onError(String(e)))} className="ml-auto rounded p-1 text-steam-text/40 hover:text-red-400" aria-label={`Remover ${base.name}`}><Trash2 size={14}/></button></div></article>)}</div> : <Empty text="Adicione uma base para reutilizar como início de novos projetos."/>}
      </>}
      {section === 'projects' && <>
        <div className="mb-5 flex items-center"><p className="mr-auto text-sm text-steam-text/60">Projetos existentes como contexto: associe as skills e bases usadas em cada um.</p><button type="button" onClick={() => void api.dialogPickFolder().then(async (path) => { if (path) { await api.projectAdd(path); await refresh(); } }).catch((e: unknown) => onError(String(e)))} className="flex items-center gap-2 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg"><FolderPlus size={15}/>Adicionar projeto</button></div>
        {filteredProjects.length ? <div className="space-y-3">{filteredProjects.map((project) => <ProjectCard key={project.id} project={project} assets={assets} onSave={async (patch) => { try { await api.projectUpdate(project.id, patch); await refresh(); } catch (e) { onError(String(e)); } }}/>)}</div> : <Empty text="A migração não encontrou projetos. Os repositórios locais da biblioteca v1 aparecem aqui como contexto."/>}
      </>}
    </div>
  </main>;
}

function Empty({ text }: { text: string }): React.JSX.Element { return <div className="flex min-h-64 flex-1 items-center justify-center rounded border border-dashed border-steam-elevated p-8 text-center text-sm text-steam-text/50">{text}</div>; }
function ProjectCard({ project, assets, onSave }: { project: ProjectRef; assets: Assets; onSave: (patch: { skillIds: string[]; baseIds: string[]; notes?: string }) => Promise<void> }): React.JSX.Element {
  const [open, setOpen] = useState(false); const [notes, setNotes] = useState(project.notes ?? '');
  return <article className="rounded border border-steam-elevated bg-steam-panel p-4"><div className="flex items-start gap-3"><BriefcaseBusiness size={18} className="mt-0.5 text-steam-accent"/><div className="min-w-0 flex-1"><h2 className="font-semibold">{project.name}</h2><p className="mt-1 truncate text-xs text-steam-text/45" title={project.localPath}>{project.localPath ?? project.remoteUrl ?? 'Sem caminho associado'}</p><p className="mt-2 text-xs text-steam-text/60">{project.skillIds.length} skills · {project.baseIds.length} bases</p></div><button type="button" onClick={() => setOpen((v) => !v)} className="rounded bg-steam-elevated px-3 py-1.5 text-xs">{open ? 'Fechar' : 'Editar contexto'}</button></div>
    {open && <div className="mt-4 grid gap-4 border-t border-steam-elevated/50 pt-4 md:grid-cols-2"><fieldset className="space-y-2"><legend className="mb-2 text-xs font-semibold uppercase text-steam-text/50">Skills usadas</legend>{assets.skills.map((skill) => <label key={skill.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={project.skillIds.includes(skill.id)} onChange={(e) => void onSave({ skillIds: e.target.checked ? [...project.skillIds, skill.id] : project.skillIds.filter((x) => x !== skill.id), baseIds: project.baseIds, notes })}/>{skill.name}</label>)}{assets.skills.length === 0 && <p className="text-xs text-steam-text/40">Ainda não há Skills na biblioteca.</p>}</fieldset><fieldset className="space-y-2"><legend className="mb-2 text-xs font-semibold uppercase text-steam-text/50">Bases usadas</legend>{assets.bases.map((base) => <label key={base.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={project.baseIds.includes(base.id)} onChange={(e) => void onSave({ skillIds: project.skillIds, baseIds: e.target.checked ? [...project.baseIds, base.id] : project.baseIds.filter((x) => x !== base.id), notes })}/>{base.name}</label>)}{assets.bases.length === 0 && <p className="text-xs text-steam-text/40">Ainda não há Bases na biblioteca.</p>}</fieldset><label className="flex flex-col gap-1 text-xs text-steam-text/50 md:col-span-2">Notas<textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => void onSave({ skillIds: project.skillIds, baseIds: project.baseIds, notes })} rows={2} className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm text-steam-text"/></label></div>}
  </article>;
}
