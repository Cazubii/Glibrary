import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Library, X } from 'lucide-react';
import type { AreaSection, PrimaryArea } from './navigation';
import { getAreaSections } from './navigation';
import { useLibraryStore } from './store/library';
import { GlibraryApiError } from './lib/api';
import GithubAccountMenu from './components/GithubAccountMenu';
import { AreaNavigation, AreaSectionNavigation } from './components/AreaNavigation';
import SettingsMenu from './components/SettingsMenu';
import Onboarding from './components/Onboarding';
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

interface Toast { id: number; message: string; kind: ToastKind; presentation?: GlibraryApiError['presentation'] }
type PushToast = (message: unknown, kind?: ToastKind) => void;

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
    const presentation = message instanceof GlibraryApiError ? message.presentation : undefined;
    const displayMessage = message instanceof Error ? message.message : typeof message === 'string' ? message : 'Não foi possível concluir esta ação.';
    setToasts((items) => [...items, { id, message: displayMessage, kind, ...(presentation != null ? { presentation } : {}) }]);
    if (kind === 'success' || presentation == null) {
      setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5000);
    }
  }, []);
  const onError: PushToast = useCallback((message) => pushToast(message, 'error'), [pushToast]);
  const onSuccess: PushToast = useCallback((message) => pushToast(message, 'success'), [pushToast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (error) onError(error); }, [error, onError]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const toggleTheme = (): void => {
    const next = theme === 'dark' ? 'light' : 'dark';
    updateSettings({ theme: next }).catch((e: unknown) => onError(e));
  };
  const setAdvancedResources = (show: boolean): void => {
    updateSettings({ showAdvancedResources: show }).catch((e: unknown) =>
      onError(e)
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
            agentRunBudgetUsd={settings?.agentRunBudgetUsd}
            agentDailyBudgetUsd={settings?.agentDailyBudgetUsd}
            toolsOpen={view === 'tools'}
            onAdvancedResourcesChange={setAdvancedResources}
            onThemeToggle={toggleTheme}
            onBudgetChange={async (patch) => {
              try { await updateSettings(patch); } catch (settingsError) { onError(settingsError); }
            }}
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
          {view === 'home' && settings?.onboarding.status === 'not-started' ? (
            <Onboarding
              onDone={() => setView('home')}
              onError={onError}
              onOpenTools={() => setView('tools')}
              onOpenLibrary={() => {
                setSections((current) => ({ ...current, library: 'resources' }));
                setView('library');
              }}
            />
          ) : view === 'tools' ? (
            <ToolsPage onError={onError} />
          ) : view === 'home' ? (
            <DashboardPage
              onError={onError}
              onSuccess={onSuccess}
              onOpenProjects={() => setView('projects')}
              onOpenTools={() => setView('tools')}
              onOpenAgents={() => {
                setSections((current) => ({ ...current, agents: 'agent-runs' }));
                setView('agents');
              }}
            />
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
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
        {toasts.map((toast) => (
            <div key={toast.id} className={`pointer-events-auto flex max-w-md items-start gap-2 rounded px-4 py-3 text-sm text-white shadow-lg ${toast.kind === 'success' ? 'bg-steam-green' : 'bg-steam-error'}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
            {toast.kind === 'success' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
              <div className="min-w-0 flex-1">
                {toast.presentation != null ? (
                  <div className="space-y-2">
                    <p className="font-semibold">{toast.presentation.title}</p>
                    <p>{toast.presentation.whatHappened}</p>
                    <p>{toast.presentation.nextStep}</p>
                    <div className="flex flex-wrap items-center gap-3">
                      {toast.presentation.action != null && (
                        <button
                          type="button"
                          className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                          onClick={() => {
                            setView(toast.presentation?.action?.target ?? 'projects');
                            setToasts((items) => items.filter((item) => item.id !== toast.id));
                          }}
                        >
                          {toast.presentation.action.label}
                        </button>
                      )}
                      {toast.presentation.technicalDetails !== '' && (
                        <details className="text-xs">
                          <summary className="cursor-pointer underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Ver detalhes técnicos</summary>
                          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 font-mono text-[11px]">{toast.presentation.technicalDetails}</pre>
                        </details>
                      )}
                    </div>
                  </div>
                ) : (
                  <span>{toast.message}</span>
                )}
              </div>
            <button type="button" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))} aria-label="Fechar aviso"><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
