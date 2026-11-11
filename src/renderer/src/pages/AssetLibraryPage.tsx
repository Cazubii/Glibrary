import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, FolderPlus, Plus, RefreshCw, Layers3, WandSparkles, Bot, BriefcaseBusiness, Flame, X } from 'lucide-react';
import type { Agent, AssetCategory, BaseItem, ProjectRef, ScanIssue, Skill, TopRepo, TopRepos, TopWindow } from '@shared/types';
import { TOP_WINDOWS } from '@shared/types';
import { countTags, matchesTags, sameTag } from '@shared/tags';
import { normalizeGitUrl } from '@shared/git-utils';
import { api } from '../lib/api';
import { useLibraryStore } from '../store/library';
import TagChips from '../components/TagChips';
import CategoryChips from '../components/CategoryChips';
import TagManagerDialog from '../components/TagManagerDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import OutdatedBanner from '../components/OutdatedBanner';
import { AgentCard, BaseCard, ProjectCard, SkillCard, TopRepoCard } from '../components/AssetCards';
import GithubReposPanel from '../components/GithubReposPanel';

type Section = 'skills' | 'agents' | 'bases' | 'projects' | 'top';
type Assets = { skills: Skill[]; agents: Agent[]; bases: BaseItem[]; projects: ProjectRef[] };
type TopCache = Record<TopWindow, TopRepos>;
const emptyTop = (windowDays: TopWindow): TopRepos => ({ fetchedAt: '', repos: [], windowDays });
const empty: Assets = { skills: [], agents: [], bases: [], projects: [] };
const sections: Array<Exclude<Section, 'top'>> = ['skills', 'agents', 'bases', 'projects'];
type RemoveKind = 'skill' | 'agent' | 'base';
const unwrapTop = (payload: unknown): TopRepos | null =>
  (payload as { ok?: boolean; data?: TopRepos })?.ok === true && (payload as { data?: TopRepos }).data
    ? ((payload as { data: TopRepos }).data)
    : null;

interface Props {
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
  onOpenDashboard: () => void;
}
export default function AssetLibraryPage({ onError, onSuccess, onOpenDashboard }: Props): React.JSX.Element {
  const [section, setSection] = useState<Section>('skills');
  const [projectSource, setProjectSource] = useState<'local' | 'github'>('local');
  const [assets, setAssets] = useState<Assets>(empty);
  const [topWindow, setTopWindow] = useState<TopWindow>(30);
  const [topCache, setTopCache] = useState<TopCache>(() => ({
    7: emptyTop(7),
    30: emptyTop(30)
  }));
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [addingRepo, setAddingRepo] = useState<Set<string>>(new Set());
  const [importBusy, setImportBusy] = useState<'skill' | 'agents' | null>(null);
  const [skillImported, setSkillImported] = useState<Set<string>>(new Set());
  const [agentsImported, setAgentsImported] = useState<Set<string>>(new Set());
  const [baseName, setBaseName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [basePath, setBasePath] = useState('');
  const [showBaseForm, setShowBaseForm] = useState(false);
  const [selected, setSelected] = useState<Record<Section, string[]>>({
    skills: [],
    agents: [],
    bases: [],
    projects: [],
    top: []
  });
  const [manageOpen, setManageOpen] = useState(false);
  const [scanIssues, setScanIssues] = useState<ScanIssue[]>([]);
  const [knownUrls, setKnownUrls] = useState<string[]>([]);
  const [pendingRemove, setPendingRemove] = useState<{ kind: RemoveKind; id: string; name: string } | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Record<Extract<Section, 'skills' | 'agents'>, AssetCategory[]>>({
    skills: [],
    agents: []
  });
  const settings = useLibraryStore((s) => s.settings);
  const updateSettings = useLibraryStore((s) => s.updateSettings);
  const refresh = useCallback(async () => {
    try {
      const data = await api.assetsGet();
      setAssets((prev) => ({ ...prev, ...data }));
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }, [onError]);
  const respond = useCallback(
    (message: string): void => {
      if (onSuccess) onSuccess(message);
      else onError(message);
    },
    [onError, onSuccess]
  );
  useEffect(() => { void refresh(); }, [refresh]);
  const loadTop = useCallback(async () => {
    try {
      const [seven, thirty] = await Promise.all([api.topReposGet(7), api.topReposGet(30)]);
      setTopCache({
        7: { ...seven, windowDays: 7 },
        30: { ...thirty, windowDays: 30 }
      });
    }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }, [onError]);
  useEffect(() => { void loadTop(); }, [loadTop]);
  const refreshKnown = useCallback(async () => {
    try {
      const lib = await api.libraryGet();
      setKnownUrls([...lib.repos.map((repo) => repo.remoteUrl), ...lib.bases.map((base) => base.remoteUrl)].filter((url): url is string => Boolean(url)));
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }, [onError]);
  useEffect(() => { void refreshKnown(); }, [refreshKnown]);
  const knownSet = useMemo(() => new Set(knownUrls.map((url) => normalizeGitUrl(url))), [knownUrls]);
  useEffect(
    () => api.onTopReposChanged((payload) => {
      const next = unwrapTop(payload);
      if (!next) return;
      const win: TopWindow = (next.windowDays ?? 30) === 7 ? 7 : 30;
      setTopCache((prev) => ({ ...prev, [win]: { ...next, windowDays: win } }));
    }),
    []
  );

  const refreshTop = async (): Promise<void> => {
    setBusy(true);
    try {
      const top = await api.topReposRefresh(topWindow);
      setTopCache((prev) => ({ ...prev, [topWindow]: { ...top, windowDays: topWindow } }));
    }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const addTopRepo = async (repo: TopRepo): Promise<void> => {
    try {
      await api.repoAddByUrl(repo.remoteUrl, false, `${repo.owner}/${repo.name}`);
      setAddingRepo((prev) => new Set(prev).add(repo.remoteUrl));
      respond(`${repo.owner}/${repo.name} adicionado ao catálogo (não clonado).`);
      await refreshKnown();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const importSkillFromTop = async (repo: TopRepo): Promise<void> => {
    setImportBusy('skill');
    try {
      await api.skillImport(repo.remoteUrl);
      setSkillImported((prev) => new Set(prev).add(repo.remoteUrl));
      respond(`SKILL.md de ${repo.owner}/${repo.name} importado. Veja a aba Skills.`);
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportBusy(null);
    }
  };

  const importAgentsFromTop = async (repo: TopRepo): Promise<void> => {
    setImportBusy('agents');
    try {
      const imported = await api.agentImport(repo.remoteUrl);
      setAgentsImported((prev) => new Set(prev).add(repo.remoteUrl));
      respond(`${imported.length} agente(s) importados de ${repo.owner}/${repo.name}. Veja a aba Agents.`);
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportBusy(null);
    }
  };

  const scanSkills = async (): Promise<void> => {
    const folders = settings?.skillFolders ?? [];
    if (folders.length === 0) {
      const selected = await api.dialogPickFolder();
      if (!selected) return;
      await updateSettings({ skillFolders: [selected] });
    }
    setBusy(true);
    try {
      const result = await api.skillsScan();
      setScanIssues(result.issues);
      await refresh();
      respond(`Sincronização concluída: ${result.skills.length} skill(s).`);
    }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const scanAgents = async (): Promise<void> => {
    const folders = settings?.agentFolders ?? [];
    if (folders.length === 0) {
      const selected = await api.dialogPickFolder();
      if (!selected) return;
      await updateSettings({ agentFolders: [selected] });
    }
    setBusy(true);
    try {
      const result = await api.agentsScan();
      setScanIssues(result.issues);
      await refresh();
      respond(`Sincronização concluída: ${result.agents.length} agente(s).`);
    }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const addAgentFolder = async (): Promise<void> => {
    try {
      const selected = await api.dialogPickFolder(); if (!selected) return;
      const folders = settings?.agentFolders ?? [];
      if (!folders.includes(selected)) await updateSettings({ agentFolders: [...folders, selected] });
      setBusy(true);
      const result = await api.agentsScan();
      setScanIssues(result.issues);
      await refresh();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const addFolder = async (): Promise<void> => {
    try {
      const selected = await api.dialogPickFolder(); if (!selected) return;
      const folders = settings?.skillFolders ?? [];
      if (!folders.includes(selected)) await updateSettings({ skillFolders: [...folders, selected] });
      setBusy(true);
      const result = await api.skillsScan();
      setScanIssues(result.issues);
      await refresh();
      respond(`Origem adicionada. Sincronização encontrou ${result.skills.length} skill(s).`);
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const addBase = async (): Promise<void> => {
    try {
      const created = await api.baseAdd({ name: baseName.trim(), ...(baseUrl.trim() ? { remoteUrl: baseUrl.trim() } : {}), ...(basePath ? { localPath: basePath } : {}) });
      setBaseName(''); setBaseUrl(''); setBasePath(''); setShowBaseForm(false);
      respond(`Base "${created.name}" adicionada.`);
      await refresh();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  };

  const cloneBase = async (base: BaseItem): Promise<void> => {
    setCloningId(base.id);
    try {
      const updated = await api.baseClone(base.id);
      respond(`Base "${base.name}" clonada${updated.localPath ? ` para ${updated.localPath}` : ''}.`);
      await refresh();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setCloningId(null); }
  };

  const performRemove = async (kind: RemoveKind, id: string): Promise<void> => {
    try {
      if (kind === 'skill') await api.skillRemove(id);
      else if (kind === 'agent') await api.agentRemove(id);
      else await api.baseRemove(id);
      respond('Removido da biblioteca.');
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const sectionTags = useMemo(
    () => ({
      skills: countTags(assets.skills),
      agents: countTags(assets.agents),
      bases: countTags(assets.bases),
      projects: countTags(assets.projects)
    }),
    [assets]
  );
  const globalTags = useMemo(
    () => countTags([...assets.skills, ...assets.agents, ...assets.bases, ...assets.projects]),
    [assets]
  );
  const categoryCounts = useMemo(
    () => ({
      skills: countAssetCategories(assets.skills),
      agents: countAssetCategories(assets.agents)
    }),
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

  const updateSkillTags = async (skill: Skill, patch: { tags?: string[]; favorite?: boolean; category?: AssetCategory }): Promise<void> => {
    try {
      await api.skillUpdate(skill.id, patch);
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const setSkillFavorite = async (skill: Skill, favorite: boolean): Promise<void> => updateSkillTags(skill, { favorite });
  const setSkillCategory = async (skill: Skill, category: AssetCategory): Promise<void> => updateSkillTags(skill, { category });
  const updateAgent = async (agent: Agent, patch: { tags?: string[]; favorite?: boolean; category?: AssetCategory }): Promise<void> => {
    try {
      await api.agentUpdate(agent.id, patch);
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
  const setBaseFavorite = async (base: BaseItem, favorite: boolean): Promise<void> => {
    try {
      await api.baseUpdate(base.id, { favorite });
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
  const setProjectFavorite = async (project: ProjectRef, favorite: boolean): Promise<void> => {
    try {
      await api.projectUpdate(project.id, { favorite });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const selectedTags = selected[section];
  const assetCategories = section === 'skills' ? categories.skills : section === 'agents' ? categories.agents : [];
  const matchQuery = (text: string): boolean =>
    text.toLowerCase().includes(query.toLowerCase());
  const filteredSkills = useMemo(
    () =>
      assets.skills.filter(
        (s) =>
          matchesTags(s.tags, selectedTags) &&
          (assetCategories.length === 0 || assetCategories.includes(s.category)) &&
          matchQuery(`${s.name} ${s.description ?? ''} ${s.source}`)
      ),
    [assets.skills, selectedTags, assetCategories, query]
  );
  const filteredAgents = useMemo(
    () =>
      assets.agents.filter(
        (a) =>
          matchesTags(a.tags, selectedTags) &&
          (assetCategories.length === 0 || assetCategories.includes(a.category)) &&
          matchQuery(`${a.name} ${a.description ?? ''} ${a.source}`)
      ),
    [assets.agents, selectedTags, assetCategories, query]
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
  const filteredTop = useMemo(
    () =>
      topCache[topWindow].repos.filter((r) =>
        matchQuery(`${r.owner}/${r.name} ${r.description ?? ''} ${r.language ?? ''} ${(r.topics ?? []).join(' ')}`)
      ),
    [topCache[topWindow].repos, query]
  );
  const filtersActive = query.trim() !== '' || selectedTags.length > 0 || ((section === 'skills' || section === 'agents') && categories[section].length > 0);
  const countText = (filteredCount: number, total: number, noun: string): string =>
    filtersActive
      ? `${filteredCount} de ${total} ${noun}`
      : `${total} ${noun}`;
  const clearFilters = (): void => {
    setQuery('');
    setSelected((prev) => ({ ...prev, [section]: [] }));
    if (section === 'skills' || section === 'agents') {
      setCategories((prev) => ({ ...prev, [section]: [] }));
    }
  };
  const noResultsAction = <button type="button" onClick={clearFilters} className="rounded border border-steam-elevated px-3 py-1.5 text-xs text-steam-text/70 hover:text-steam-accent">Limpar busca e filtros</button>;
  const tab = (key: Section, label: string, icon: React.ReactNode, count: number): React.JSX.Element => <button type="button" onClick={() => setSection(key)} aria-pressed={section === key} className={`flex items-center gap-2 rounded px-3 py-2 text-sm ${section === key ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}>{icon}{label}<span className="text-xs opacity-60">{count}</span></button>;

  const toggleCategory = (sectionKey: Extract<Section, 'skills' | 'agents'>, category: AssetCategory): void =>
    setCategories((prev) => {
      const current = prev[sectionKey];
      return {
        ...prev,
        [sectionKey]: current.includes(category)
          ? current.filter((c) => c !== category)
          : [...current, category]
      };
    });
  const clearCategories = (sectionKey: Extract<Section, 'skills' | 'agents'>): void =>
    setCategories((prev) => ({ ...prev, [sectionKey]: [] }));

  return <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
    <header className="flex items-center gap-4 border-b border-steam-elevated/50 px-6 py-4">
      <div><h1 className="text-xl font-semibold">Biblioteca</h1><p className="mt-1 text-xs text-steam-text/50">Skills, agentes, repositórios-base e projetos que os utilizam.</p></div>
      <label className="ml-auto relative">
        <span className="sr-only">Buscar na biblioteca</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); (e.target as HTMLInputElement).blur(); } }}
          placeholder="Buscar… (Ctrl+K)"
          id="library-search"
          className={`w-64 rounded border bg-steam-panel px-3 py-2 pr-8 text-sm outline-none focus:border-steam-accent ${query ? 'border-steam-accent' : 'border-steam-elevated'}`}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-steam-text/40 hover:text-steam-text"
          >
            <X size={14} />
          </button>
        )}
      </label>
    </header>
    <nav className="flex gap-2 border-b border-steam-elevated/30 px-6 py-3">{tab('skills', 'Skills', <WandSparkles size={16}/>, assets.skills.length)}{tab('agents', 'Agents', <Bot size={16}/>, assets.agents.length)}{tab('bases', 'Bases', <Layers3 size={16}/>, assets.bases.length)}{tab('projects', 'Projetos', <BriefcaseBusiness size={16}/>, assets.projects.length)}{tab('top', 'Top GitHub', <Flame size={16}/>, topCache[topWindow].repos.length)}</nav>
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
      <OutdatedBanner onError={onError} />
      {scanIssues.length > 0 && (section === 'skills' || section === 'agents') && (
        <div className="mb-4 rounded border border-steam-warn/40 bg-steam-warn/10 px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-steam-warn">
            <AlertCircle size={14} />
            {scanIssues.length} problema(s) de validação no frontmatter:
          </p>
          <ul className="mt-2 space-y-1 text-xs text-steam-text/80">
            {scanIssues.map((issue, index) => (
              <li key={`${issue.path}-${index}`}>
                <span className="font-mono">{issue.name ?? issue.path}</span> — {issue.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(section === 'skills' || section === 'agents') && (
        <CategoryChips
          counts={categoryCounts[section]}
          selected={categories[section]}
          onToggle={(category) => toggleCategory(section, category)}
          onClear={() => clearCategories(section)}
        />
      )}
      {section !== 'top' && (
        <TagChips
          tags={sectionTags[section]}
          selected={selectedTags}
          onToggle={toggleTag}
          onClear={clearTags}
          onManage={() => setManageOpen(true)}
        />
      )}
      {section === 'skills' && <>
        <div className="mb-5 flex items-center gap-2"><p className="mr-auto text-sm text-steam-text/60">{countText(filteredSkills.length, assets.skills.length, 'skills descobertas em arquivos SKILL.md')}</p><button disabled={busy} type="button" onClick={() => void addFolder()} className="flex items-center gap-2 rounded border border-steam-elevated px-3 py-2 text-sm hover:bg-steam-panel"><FolderPlus size={15}/>Adicionar origem</button><button disabled={busy} type="button" onClick={() => void scanSkills()} className="flex items-center gap-2 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-50"><RefreshCw size={15} className={busy ? 'animate-spin' : ''}/> {busy ? 'Buscando…' : 'Sincronizar'}</button></div>
        {filteredSkills.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredSkills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                allTags={allTagNames}
                onTagsChange={(tags) => void updateSkillTags(skill, { tags })}
                onCategoryChange={(category) => void setSkillCategory(skill, category)}
                onFavorite={(next) => void setSkillFavorite(skill, next)}
                onOpen={() =>
                  void api
                    .skillOpen(skill.id)
                    .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
                }
                onRemove={() => setPendingRemove({ kind: 'skill', id: skill.id, name: skill.name })}
              />
            ))}
          </div>
        ) : (
          <Empty
            text={
              filtersActive
                ? 'Nenhuma skill corresponde à busca e aos filtros selecionados.'
                : settings?.skillFolders.length
                  ? 'Nenhum SKILL.md foi encontrado nas origens configuradas.'
                  : 'Adicione uma pasta que contenha SKILL.md para importar suas skills.'
            }
            action={filtersActive ? noResultsAction : undefined}
          />
        )}
      </>}
      {section === 'agents' && <>
        <div className="mb-5 flex items-center gap-2"><p className="mr-auto text-sm text-steam-text/60">{countText(filteredAgents.length, assets.agents.length, 'agentes descobertos em arquivos .md de agente')}</p><button disabled={busy} type="button" onClick={() => void addAgentFolder()} className="flex items-center gap-2 rounded border border-steam-elevated px-3 py-2 text-sm hover:bg-steam-panel"><FolderPlus size={15}/>Adicionar origem</button><button disabled={busy} type="button" onClick={() => void scanAgents()} className="flex items-center gap-2 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-50"><RefreshCw size={15} className={busy ? 'animate-spin' : ''}/> {busy ? 'Buscando…' : 'Sincronizar'}</button></div>
        {filteredAgents.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                allTags={allTagNames}
                onTagsChange={(tags) => void updateAgent(agent, { tags })}
                onCategoryChange={(category) => void updateAgent(agent, { category })}
                onFavorite={(next) => void updateAgent(agent, { favorite: next })}
                onOpen={() =>
                  void api
                    .agentOpen(agent.id)
                    .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
                }
                onRemove={() => setPendingRemove({ kind: 'agent', id: agent.id, name: agent.name })}
              />
            ))}
          </div>
        ) : (
          <Empty
            text={
              filtersActive
                ? 'Nenhum agente corresponde à busca e aos filtros selecionados.'
                : settings?.agentFolders.length
                  ? 'Nenhum arquivo .md de agente foi encontrado nas origens configuradas.'
                  : 'Adicione uma pasta com arquivos .md de agentes (ex.: .claude/agents) para importá-los.'
            }
            action={filtersActive ? noResultsAction : undefined}
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
                cloning={cloningId === base.id}
                onTagsChange={(tags) => void updateBaseTags(base, tags)}
                onFavorite={(next) => void setBaseFavorite(base, next)}
                onClone={() => void cloneBase(base)}
                onRemove={() => setPendingRemove({ kind: 'base', id: base.id, name: base.name })}
              />
            ))}
          </div>
        ) : (
          <Empty
            text={
              filtersActive
                ? 'Nenhuma base corresponde à busca e aos filtros selecionados.'
                : 'Adicione uma base para reutilizar como início de novos projetos.'
            }
            action={filtersActive ? noResultsAction : undefined}
          />
        )}
      </>}
      {section === 'projects' && <>
        <div className="mb-5 flex items-center gap-2 border-b border-steam-elevated/40 pb-3">
          <button type="button" onClick={() => setProjectSource('local')} aria-pressed={projectSource === 'local'} className={`rounded px-3 py-1.5 text-xs ${projectSource === 'local' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/55 hover:bg-steam-panel'}`}>Projetos locais</button>
          <button type="button" onClick={() => setProjectSource('github')} aria-pressed={projectSource === 'github'} className={`rounded px-3 py-1.5 text-xs ${projectSource === 'github' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/55 hover:bg-steam-panel'}`}>Repositórios da conta</button>
        </div>
        {projectSource === 'github' ? (
          <GithubReposPanel
            onOpenDashboard={onOpenDashboard}
            knownUrls={knownUrls}
            onAdded={(url) => setKnownUrls((current) => current.includes(url) ? current : [...current, url])}
            onError={onError}
          />
        ) : <>
          <div className="mb-5 flex items-center"><p className="mr-auto text-sm text-steam-text/60">Projetos existentes como contexto: associe as skills e bases usadas em cada um.</p><button type="button" onClick={() => void api.dialogPickFolder().then(async (path) => { if (path) { await api.projectAdd(path); await refresh(); } }).catch((e: unknown) => onError(String(e)))} className="flex items-center gap-2 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg"><FolderPlus size={15}/>Adicionar projeto</button></div>
          {filteredProjects.length ? (
            <div className="space-y-3">
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  assets={assets}
                  allTags={allTagNames}
                  inheritTags={settings?.inheritTags ?? true}
                  onSave={async (patch) => {
                    try {
                      await api.projectUpdate(project.id, patch);
                      await refresh();
                    } catch (e) {
                      onError(e instanceof Error ? e.message : String(e));
                    }
                  }}
                  onTagsChange={(tags) => void updateProjectTags(project, tags)}
                  onFavorite={(next) => void setProjectFavorite(project, next)}
                />
              ))}
            </div>
          ) : (
            <Empty
              text={
                filtersActive
                  ? 'Nenhum projeto corresponde à busca e aos filtros selecionados.'
                  : 'A migração não encontrou projetos. Os repositórios locais da biblioteca v1 aparecem aqui como contexto.'
              }
              action={filtersActive ? noResultsAction : undefined}
            />
          )}
        </>}
      </>}
      {section === 'top' && <>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm text-steam-text/60">
            Repositórios em alta no GitHub (criados nos últimos {topWindow} dias, ordenados por estrelas).
            {topCache[topWindow].fetchedAt && <> Última busca em {new Date(topCache[topWindow].fetchedAt).toLocaleString('pt-BR')}.</>}
          </p>
          <span aria-label="Janela da lista" role="radiogroup" className="flex items-center gap-1 rounded border border-steam-elevated p-1">
            {TOP_WINDOWS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setTopWindow(days)}
                aria-pressed={topWindow === days}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs ${topWindow === days ? 'bg-steam-accent font-semibold text-steam-bg' : 'text-steam-text/60 hover:text-steam-accent'}`}
              >
                Últimos {days} dias
              </button>
            ))}
          </span>
          <button disabled={busy} type="button" onClick={() => void refreshTop()} className="flex items-center gap-2 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-50"><RefreshCw size={15} className={busy ? 'animate-spin' : ''}/> {busy ? 'Buscando…' : 'Atualizar agora'}</button>
        </div>
        {filteredTop.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredTop.map((repo) => (
              <TopRepoCard
                key={`${repo.owner}/${repo.name}`}
                repo={repo}
                added={addingRepo.has(repo.remoteUrl) || knownSet.has(normalizeGitUrl(repo.remoteUrl))}
                onAdd={() => void addTopRepo(repo)}
                onImportSkill={() => void importSkillFromTop(repo)}
                onImportAgents={() => void importAgentsFromTop(repo)}
                importBusy={importBusy}
                skillImported={skillImported.has(repo.remoteUrl)}
                agentsImported={agentsImported.has(repo.remoteUrl)}
              />
            ))}
          </div>
        ) : (
          <Empty
            text={
              filtersActive
                ? 'Nenhum repositório da aba Top GitHub corresponde à busca.'
                : topCache[topWindow].fetchedAt
                  ? 'Nenhum repositório encontrado para os critérios atuais.'
                  : `A lista de ${topWindow} dias ainda não foi buscada. Clique em "Atualizar agora".`
            }
            action={query.trim() ? noResultsAction : undefined}
          />
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
    {pendingRemove && (() => {
      const kindName = pendingRemove.kind === 'skill' ? 'skill' : pendingRemove.kind === 'agent' ? 'agente' : 'base';
      const returns = pendingRemove.kind !== 'base';
      return (
        <ConfirmDialog
          title={`Remover ${kindName}`}
          message={
            returns
              ? `"${pendingRemove.name}" sai da biblioteca e das associações. O arquivo continua no disco e reaparece ao sincronizar as origens.`
              : `"${pendingRemove.name}" sai da biblioteca. A pasta local em disco não é apagada.`
          }
          confirmLabel="Remover"
          onConfirm={() => {
            const { kind, id } = pendingRemove;
            setPendingRemove(null);
            void performRemove(kind, id);
          }}
          onCancel={() => setPendingRemove(null)}
        />
      );
    })()}
  </main>;
}

function Empty({ text, action }: { text: string; action?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 rounded border border-dashed border-steam-elevated p-8 text-center text-sm text-steam-text/50">
      <p>{text}</p>
      {action}
    </div>
  );
}

function countAssetCategories(items: { category: AssetCategory }[]): Partial<Record<AssetCategory, number>> {
  const counts: Partial<Record<AssetCategory, number>> = {};
  for (const item of items) counts[item.category] = (counts[item.category] ?? 0) + 1;
  return counts;
}
