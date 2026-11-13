import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Library, X } from 'lucide-react';
import type { AreaSection, PrimaryArea } from './navigation';
import { getAreaSections } from './navigation';
import { useLibraryStore } from './store/library';
import GithubAccountMenu from './components/GithubAccountMenu';
import { AreaNavigation, AreaSectionNavigation } from './components/AreaNavigation';
import SettingsMenu from './components/SettingsMenu';
import AssetLibraryPage from './pages/AssetLibraryPage';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const CollectionsPage = lazy(() => import('./pages/CollectionsPage'));
const GithubSearchPage = lazy(() => import('./pages/GithubSearchPage'));
const RepoAnalysisPage = lazy(() => import('./pages/RepoAnalysisPage'));
const ConsumoPage = lazy(() => import('./pages/ConsumoPage'));
const ToolsPage = lazy(() => import('./pages/ToolsPage'));
const AgentesPage = lazy(() => import('./pages/AgentesPage'));

type AppView = PrimaryArea | 'tools';
type SelectableArea = Exclude<PrimaryArea, 'home'>;
type SectionSelections = {
  projects: 'local-projects' | 'github-projects';
  library: 'resources' | 'collections';
  discover: 'github-search' | 'top-repos' | 'repo-analysis';
  agents: 'agent-runs' | 'consumption';
};
type ToastKind = 'error' | 'success';

interface Toast { id: number; message: string; kind: ToastKind }
type PushToast = (message: string, kind?: ToastKind) => void;

export default function App(): React.JSX.Element {
  const { loaded, error, load, settings, updateSettings } = useLibraryStore();
  const theme = settings?.theme ?? 'dark';
  const showAdvancedResources = settings?.showAdvancedResources ?? true;
  const [view, setView] = useState<AppView>('home');
  const [sections, setSections] = useState<SectionSelections>({
    projects: 'local-projects',
    library: 'resources',
    discover: 'github-search',
    agents: 'agent-runs'
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pendingSearch = useRef(false);
  const pushToast: PushToast = useCallback((message, kind = 'error') => {
    const id = Date.now() + Math.random();
    setToasts((items) => [...items, { id, message, kind }]);
    setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5000);
  }, []);
  const onError: PushToast = useCallback((message) => pushToast(message, 'error'), [pushToast]);
  const onSuccess: PushToast = useCallback((message) => pushToast(message, 'success'), [pushToast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (error) onError(error); }, [error, onError]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const toggleTheme = (): void => {
    const next = theme === 'dark' ? 'light' : 'dark';
    updateSettings({ theme: next }).catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
  };
  const setAdvancedResources = (show: boolean): void => {
    updateSettings({ showAdvancedResources: show }).catch((e: unknown) =>
      onError(e instanceof Error ? e.message : String(e))
    );
  };
  const selectAreaSection = (area: SelectableArea, section: AreaSection['id']): void => {
    const isVisible = getAreaSections(area, showAdvancedResources).some((item) => item.id === section);
    if (!isVisible) return;

    if (area === 'projects' && (section === 'local-projects' || section === 'github-projects')) {
      setSections((current) => ({ ...current, projects: section }));
    } else if (area === 'library' && (section === 'resources' || section === 'collections')) {
      setSections((current) => ({ ...current, library: section }));
    } else if (area === 'discover' && (section === 'github-search' || section === 'top-repos' || section === 'repo-analysis')) {
      setSections((current) => ({ ...current, discover: section }));
    } else if (area === 'agents' && (section === 'agent-runs' || section === 'consumption')) {
      setSections((current) => ({ ...current, agents: section }));
    }
  };

  const primaryArea = view === 'tools' ? null : view;
  const visibleSections = primaryArea == null ? [] : getAreaSections(primaryArea, showAdvancedResources);
  const selectedSection = primaryArea != null && primaryArea !== 'home'
    ? visibleSections.find((section) => section.id === sections[primaryArea]) ?? visibleSections[0]
    : undefined;

  useEffect(() => {
    if (showAdvancedResources) return;
    setSections((current) => ({
      ...current,
      library: current.library === 'collections' ? 'resources' : current.library,
      discover: current.discover === 'repo-analysis' ? 'github-search' : current.discover,
      agents: current.agents === 'consumption' ? 'agent-runs' : current.agents
    }));
  }, [showAdvancedResources]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const input = view === 'library' && sections.library === 'resources'
          ? document.getElementById('library-search') as HTMLInputElement | null
          : null;
        if (input != null) {
          input.focus();
          input.select();
        } else {
          pendingSearch.current = true;
          setSections((current) => ({ ...current, library: 'resources' }));
          setView('library');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sections.library, view]);

  useEffect(() => {
    if (view !== 'library' || sections.library !== 'resources' || !pendingSearch.current) return;
    pendingSearch.current = false;
    requestAnimationFrame(() => {
      const input = document.getElementById('library-search') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }, [sections.library, view]);

  if (!loaded) return <div className="flex h-full items-center justify-center bg-steam-bg text-steam-text">Carregando biblioteca…</div>;

  return (
    <div className="relative flex h-full flex-col bg-steam-bg text-steam-text">
      <header className="glibrary-app-header flex flex-col gap-2 border-b border-steam-elevated/50 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Library size={22} className="shrink-0 text-steam-accent" aria-hidden="true" />
          <span className="shrink-0 text-lg font-bold tracking-wide">GLIBRARY</span>
          <AreaNavigation activeArea={primaryArea} onAreaChange={setView} />
          <span className="hidden shrink-0 whitespace-nowrap text-sm text-steam-text/50 2xl:block">Skills · Agents · Bases · Projetos</span>
          <GithubAccountMenu onError={onError} />
          <SettingsMenu
            showAdvancedResources={showAdvancedResources}
            theme={theme}
            toolsOpen={view === 'tools'}
            onAdvancedResourcesChange={setAdvancedResources}
            onThemeToggle={toggleTheme}
            onOpenTools={() => setView('tools')}
          />
        </div>
        {primaryArea != null && primaryArea !== 'home' && selectedSection != null && (
          <AreaSectionNavigation
            area={primaryArea}
            selected={selectedSection.id}
            showAdvancedResources={showAdvancedResources}
            onSelect={(section) => selectAreaSection(primaryArea, section)}
          />
        )}
      </header>
      <div className="flex min-h-0 flex-1">
        <Suspense fallback={<div className="m-auto text-sm text-steam-text/50">Carregando página…</div>}>
          {view === 'tools' ? (
            <ToolsPage onError={onError} />
          ) : view === 'home' ? (
            <DashboardPage onError={onError} onSuccess={onSuccess} onOpenProjects={() => setView('projects')} />
          ) : view === 'projects' ? (
            selectedSection?.id === 'github-projects'
              ? <ProjectsPage onError={onError} onSuccess={onSuccess} />
              : <AssetLibraryPage key="local-projects" mode="projects" onError={onError} onSuccess={onSuccess} />
          ) : view === 'library' ? (
            selectedSection?.id === 'collections'
              ? <CollectionsPage onError={onError} onSuccess={onSuccess} />
              : <AssetLibraryPage key="library-resources" mode="resources" onError={onError} onSuccess={onSuccess} />
          ) : view === 'discover' ? (
            selectedSection?.id === 'github-search' ? <GithubSearchPage onError={onError} onSuccess={onSuccess} />
              : selectedSection?.id === 'top-repos' ? <AssetLibraryPage key="top-repos" mode="top" onError={onError} onSuccess={onSuccess} />
                : <RepoAnalysisPage onError={onError} onSuccess={onSuccess} />
          ) : selectedSection?.id === 'agent-runs' ? (
            <AgentesPage />
          ) : (
            <ConsumoPage onError={onError} onSuccess={onSuccess} />
          )}
        </Suspense>
      </div>
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded px-4 py-3 text-sm text-white shadow-lg ${toast.kind === 'success' ? 'bg-steam-green' : 'bg-steam-error'}`} role="status">
            {toast.kind === 'success' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
            <span className="flex-1">{toast.message}</span>
            <button type="button" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))} aria-label="Fechar aviso"><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
