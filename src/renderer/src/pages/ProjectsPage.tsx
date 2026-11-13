import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, FolderGit2, GitFork, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import type { DashboardAccount } from '../../../shared/github-dashboard';
import type { ProjectRepoSummary } from '../../../shared/github-projects';
import { api } from '../lib/api';
import { findLibraryRepo, useProjectsStore } from '../store/projects';
import { useLibraryStore } from '../store/library';
import { useDashboardStore } from '../store/dashboard';
import GithubAccountSection from '../components/dashboard/GithubAccountSection';
import ProjectRepoRow from '../components/projects/ProjectRepoRow';
import DevWorkspacePage from './DevWorkspacePage';
import RepoDetailPage from './RepoDetailPage';

interface Props {
  onError: (error: unknown) => void;
  onSuccess: (message: string) => void;
}

const EMPTY_ACCOUNT: DashboardAccount = {
  connected: false,
  profile: null,
  rateLimit: null,
  repos: [],
  fetchedAt: ''
};

function ProjectRepoSkeleton(): React.JSX.Element {
  return (
    <li className="flex flex-col gap-3 border-b border-steam-elevated/60 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1" aria-hidden="true">
        <div className="flex gap-2">
          <span className="h-4 w-40 animate-pulse rounded bg-steam-elevated motion-reduce:animate-none" />
          <span className="h-5 w-16 animate-pulse rounded-full bg-steam-elevated motion-reduce:animate-none" />
        </div>
        <span className="mt-3 block h-3 w-3/4 animate-pulse rounded bg-steam-elevated motion-reduce:animate-none" />
        <span className="mt-2 block h-3 w-48 animate-pulse rounded bg-steam-elevated motion-reduce:animate-none" />
      </div>
      <div className="flex gap-2" aria-hidden="true">
        <span className="h-9 w-32 animate-pulse rounded bg-steam-elevated motion-reduce:animate-none" />
        <span className="h-9 w-36 animate-pulse rounded bg-steam-elevated motion-reduce:animate-none" />
      </div>
    </li>
  );
}

export default function ProjectsPage({ onError, onSuccess }: Props): React.JSX.Element {
  const account = useDashboardStore((state) => state.account);
  const accountLoading = useDashboardStore((state) => state.loading);
  const accountRefreshing = useDashboardStore((state) => state.refreshing);
  const accountError = useDashboardStore((state) => state.error);
  const loadAccount = useDashboardStore((state) => state.load);
  const libraryRepos = useLibraryStore((state) => state.repos);
  const loadLibrary = useLibraryStore((state) => state.load);

  const repos = useProjectsStore((state) => state.repos);
  const page = useProjectsStore((state) => state.page);
  const hasMore = useProjectsStore((state) => state.hasMore);
  const fetchedAt = useProjectsStore((state) => state.fetchedAt);
  const visibility = useProjectsStore((state) => state.visibility);
  const showForks = useProjectsStore((state) => state.showForks);
  const query = useProjectsStore((state) => state.query);
  const loading = useProjectsStore((state) => state.loading);
  const refreshing = useProjectsStore((state) => state.refreshing);
  const loadingMore = useProjectsStore((state) => state.loadingMore);
  const error = useProjectsStore((state) => state.error);
  const clones = useProjectsStore((state) => state.clones);
  const setQuery = useProjectsStore((state) => state.setQuery);
  const setVisibility = useProjectsStore((state) => state.setVisibility);
  const setShowForks = useProjectsStore((state) => state.setShowForks);
  const resetFilters = useProjectsStore((state) => state.resetFilters);
  const load = useProjectsStore((state) => state.load);
  const loadMore = useProjectsStore((state) => state.loadMore);
  const startClone = useProjectsStore((state) => state.startClone);
  const failClone = useProjectsStore((state) => state.failClone);

  const [devProject, setDevProject] = useState<ProjectRepoSummary | null>(null);
  const [openRepoId, setOpenRepoId] = useState<string | null>(null);

  useEffect(() => { void loadAccount(); }, [loadAccount]);
  useEffect(() => {
    if (account?.connected === true) void load();
  }, [account?.connected, load]);

  const filteredRepos = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('pt-BR');
    if (needle === '') return repos;
    return repos.filter((repo) =>
      repo.name.toLocaleLowerCase('pt-BR').includes(needle) || repo.fullName.toLocaleLowerCase('pt-BR').includes(needle)
    );
  }, [query, repos]);

  const refresh = useCallback(() => {
    void loadAccount(true);
    if (useDashboardStore.getState().account?.connected === true) void load(true);
  }, [load, loadAccount]);

  const handleConnected = useCallback(async () => {
    await loadAccount(true);
    if (useDashboardStore.getState().account?.connected === true) await load(true);
  }, [load, loadAccount]);

  const cloneProject = useCallback(async (project: ProjectRepoSummary): Promise<void> => {
    const currentRepos = useLibraryStore.getState().repos;
    const existing = findLibraryRepo(currentRepos, project);
    if (existing?.localPath != null && existing.status !== 'missing') {
      onSuccess(`${project.name} já está disponível no PC.`);
      return;
    }

    let repoId: string | null = null;
    try {
      const repo = existing ?? await api.repoAddByUrl(project.htmlUrl, false, project.name);
      repoId = repo.id;
      await loadLibrary();
      startClone(project.fullName, repo.id);
      await api.repoClone(repo.id);
      await loadLibrary();
      onSuccess(`Clone de ${project.name} iniciado em sua pasta de repositórios.`);
    } catch (cloneError) {
      const message = cloneError instanceof Error ? cloneError.message : 'Não foi possível baixar este projeto.';
      if (repoId != null) failClone(project.fullName, message);
      onError(cloneError);
    }
  }, [failClone, loadLibrary, onError, onSuccess, startClone]);

  if (openRepoId != null) {
    return (
      <div className="flex min-w-0 flex-1">
        <RepoDetailPage
          repoId={openRepoId}
          onBack={() => setOpenRepoId(null)}
          onError={onError}
          onSuccessToast={onSuccess}
        />
      </div>
    );
  }

  if (devProject != null) {
    const libraryRepo = findLibraryRepo(libraryRepos, devProject);
    return (
      <DevWorkspacePage
        project={devProject}
        {...(libraryRepo != null ? { repo: libraryRepo } : {})}
        onBack={() => setDevProject(null)}
        onSuccess={onSuccess}
      />
    );
  }

  const isConnected = account?.connected === true;
  const connectedAccount = account ?? EMPTY_ACCOUNT;
  const cacheLoaded = fetchedAt != null;
  const accountRefreshPending = accountLoading || accountRefreshing;

  return (
    <main className="projects-surface flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
      <header className="flex flex-wrap items-center gap-4 border-b border-steam-elevated/60 pb-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">Projetos</h1>
          <p className="mt-1 text-sm text-steam-text/75">
            Todos os repositórios da conta GitHub, prontos para clonar ou abrir por branch.
            {cacheLoaded && ` Página ${page} carregada.`}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={accountRefreshPending || loading || refreshing}
          className="inline-flex min-h-9 items-center gap-2 rounded border border-steam-elevated bg-steam-panel px-3 text-xs font-medium text-steam-text/90 transition-colors duration-150 hover:bg-steam-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent disabled:cursor-wait disabled:opacity-55"
        >
          <RefreshCw size={14} className={accountRefreshPending || loading || refreshing ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
          {refreshing || accountRefreshPending ? 'Atualizando…' : 'Atualizar'}
        </button>
      </header>

      {!isConnected && account == null && accountLoading && (
        <section className="grid gap-4 lg:grid-cols-3" aria-busy="true" aria-label="Verificando conexão com o GitHub">
          <div className="h-28 animate-pulse rounded border border-steam-elevated bg-steam-panel motion-reduce:animate-none lg:col-span-2" />
          <div className="h-28 animate-pulse rounded border border-steam-elevated bg-steam-panel motion-reduce:animate-none" />
        </section>
      )}

      {!isConnected && account != null && (
        <GithubAccountSection account={connectedAccount} onConnected={() => void handleConnected()} onError={onError} />
      )}

      {!isConnected && account == null && accountError != null && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-steam-error/40 bg-steam-error/10 px-4 py-3 text-sm text-steam-error">
          <AlertCircle size={16} aria-hidden="true" />
          <span className="min-w-0 flex-1">{accountError}</span>
          <button type="button" onClick={refresh} className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent">Tentar novamente</button>
        </div>
      )}

      {isConnected && (
        <>
          <section className="flex flex-col gap-3 rounded border border-steam-elevated bg-steam-panel p-3 sm:flex-row sm:items-end" aria-label="Filtros de repositórios">
            <div className="min-w-0 flex-1">
              <label htmlFor="projects-search" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-steam-text/85">
                <Search size={13} aria-hidden="true" /> Buscar por nome
              </label>
              <input
                id="projects-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nome do repositório"
                className="min-h-10 w-full rounded border border-steam-elevated bg-steam-bg px-3 text-sm text-steam-text placeholder:text-steam-text/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
              />
            </div>
            <div className="sm:w-44">
              <label htmlFor="projects-visibility" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-steam-text/85">
                <SlidersHorizontal size={13} aria-hidden="true" /> Visibilidade
              </label>
              <select
                id="projects-visibility"
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as typeof visibility)}
                className="min-h-10 w-full rounded border border-steam-elevated bg-steam-bg px-3 text-sm text-steam-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
              >
                <option value="all">Todos</option>
                <option value="private">Privados</option>
                <option value="public">Públicos</option>
              </select>
            </div>
            <label className="flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded border border-steam-elevated px-3 text-xs text-steam-text/85 focus-within:ring-2 focus-within:ring-steam-accent">
              <input
                type="checkbox"
                checked={showForks}
                onChange={(event) => setShowForks(event.target.checked)}
                className="h-4 w-4 accent-[hsl(var(--steam-accent))] focus-visible:outline-none"
              />
              <GitFork size={13} aria-hidden="true" /> Mostrar forks
            </label>
          </section>

          {error != null && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-steam-error/40 bg-steam-error/10 px-4 py-3 text-sm text-steam-error">
              <AlertCircle size={16} aria-hidden="true" />
              <span className="min-w-0 flex-1">{error}{repos.length > 0 ? ' Exibindo os últimos dados carregados.' : ''}</span>
              <button type="button" onClick={() => void load(true)} className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent">Tentar novamente</button>
            </div>
          )}

          <section aria-label="Repositórios do GitHub" aria-busy={loading || refreshing}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-steam-text/75" aria-live="polite">
              <span>{filteredRepos.length.toLocaleString('pt-BR')} de {repos.length.toLocaleString('pt-BR')} repositórios carregados</span>
              {fetchedAt != null && (
                <span>Atualizado às {new Date(fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>

            {loading && !cacheLoaded ? (
              <ul className="divide-y divide-steam-elevated/50" aria-busy="true" aria-label="Carregando repositórios">
                {[0, 1, 2, 3].map((item) => <ProjectRepoSkeleton key={item} />)}
              </ul>
            ) : filteredRepos.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center border-y border-dashed border-steam-elevated px-5 py-8 text-center">
                <FolderGit2 size={24} className="text-steam-text/60" aria-hidden="true" />
                <h2 className="mt-3 text-sm font-semibold">Nenhum repositório encontrado</h2>
                <p className="mt-1 max-w-md text-xs leading-5 text-steam-text/75">
                  {repos.length === 0
                    ? 'Esta conta ainda não retornou repositórios para os filtros selecionados.'
                    : 'Tente outro nome ou ajuste os filtros para ver mais repositórios.'}
                </p>
                {(query !== '' || visibility !== 'all' || !showForks) && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-4 min-h-9 rounded border border-steam-elevated px-3 text-xs text-steam-text/90 transition-colors duration-150 hover:bg-steam-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-steam-elevated/50">
                {filteredRepos.map((project) => {
                  const libraryRepo = findLibraryRepo(libraryRepos, project);
                  const clone = clones[project.fullName.toLocaleLowerCase('en-US')];
                  return (
                    <ProjectRepoRow
                      key={project.id}
                      project={project}
                      {...(libraryRepo != null ? { libraryRepo } : {})}
                      {...(clone != null ? { clone } : {})}
                      onClone={() => { void cloneProject(project); }}
                      onOpen={() => { if (libraryRepo != null) setOpenRepoId(libraryRepo.id); }}
                      onWork={() => setDevProject(project)}
                    />
                  );
                })}
              </ul>
            )}

            {hasMore && (
              <div className="flex justify-center border-t border-steam-elevated/50 py-4">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore || loading || refreshing}
                  className="inline-flex min-h-10 items-center gap-2 rounded border border-steam-elevated bg-steam-panel px-4 text-xs font-medium text-steam-text/90 transition-colors duration-150 hover:bg-steam-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent disabled:cursor-wait disabled:opacity-55"
                >
                  {loadingMore && <RefreshCw size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                  {loadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
