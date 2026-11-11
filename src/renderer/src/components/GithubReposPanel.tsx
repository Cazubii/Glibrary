import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FolderOpen, Globe, LockKeyhole, Plus, RefreshCw, Search, Star } from 'lucide-react';
import type { GithubAccountRepo } from '@shared/types';
import { normalizeGitUrl } from '@shared/git-utils';
import { api } from '../lib/api';
import { useLibraryStore } from '../store/library';

interface Props {
  knownUrls: string[];
  onAdded: (remoteUrl: string) => void;
  onError: (message: string) => void;
  onOpenDashboard: () => void;
  onOpenRepository: (repoId: string) => void;
}

function updatedLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data desconhecida' : `Atualizado ${date.toLocaleDateString('pt-BR')}`;
}

export default function GithubReposPanel({ knownUrls, onAdded, onError, onOpenDashboard, onOpenRepository }: Props): React.JSX.Element {
  const status = useLibraryStore((state) => state.githubAccount);
  const pages = useLibraryStore((state) => state.githubRepoPages);
  const loadAccount = useLibraryStore((state) => state.loadGithubAccount);
  const loadRepos = useLibraryStore((state) => state.loadGithubRepos);
  const clearRepos = useLibraryStore((state) => state.clearGithubRepos);
  const [query, setQuery] = useState('');
  const [loadingPage, setLoadingPage] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const loadPage = useCallback(async (page: number, force = false): Promise<void> => {
    setLoadingPage(page);
    setLoadError('');
    try {
      await loadRepos(page, force);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingPage(null);
    }
  }, [loadRepos]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const account = await loadAccount();
        if (!cancelled && account.state === 'connected' && pages[1] == null) {
          await loadPage(1);
        }
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => { cancelled = true; };
  }, [loadAccount, loadPage, pages]);

  const allRepos = useMemo(
    () => Object.keys(pages).map(Number).sort((a, b) => a - b).flatMap((page) => pages[page]?.repos ?? []),
    [pages]
  );
  const visibleRepos = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (normalizedQuery === '') return allRepos;
    return allRepos.filter((repo) =>
      `${repo.fullName} ${repo.description ?? ''} ${repo.language ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [allRepos, query]);
  const known = useMemo(() => new Set(knownUrls.map(normalizeGitUrl)), [knownUrls]);
  const lastPage = pages[Math.max(0, ...Object.keys(pages).map(Number))];
  const nextPage = lastPage?.page != null ? lastPage.page + 1 : 1;

  const refresh = async (): Promise<void> => {
    clearRepos();
    try {
      const account = await loadAccount(true);
      if (account.state === 'connected') await loadPage(1, true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  };

  const addToLibrary = async (repo: GithubAccountRepo): Promise<void> => {
    setAdding(repo.remoteUrl);
    setLoadError('');
    try {
      const addedRepo = await api.repoAddByUrl(repo.remoteUrl, false, repo.fullName);
      useLibraryStore.setState((state) => ({
        repos: state.repos.some((item) => item.id === addedRepo.id) ? state.repos : [...state.repos, addedRepo]
      }));
      onAdded(repo.remoteUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
      onError(message);
    } finally {
      setAdding(null);
    }
  };

  const openProject = async (repo: GithubAccountRepo): Promise<void> => {
    setOpening(repo.remoteUrl);
    setLoadError('');
    try {
      const library = await api.libraryGet();
      let saved = library.repos.find((item) => item.remoteUrl && normalizeGitUrl(item.remoteUrl) === normalizeGitUrl(repo.remoteUrl));
      if (!saved) {
        try {
          saved = await api.repoAddByUrl(repo.remoteUrl, false, repo.fullName);
        } catch (error) {
          const refreshed = await api.libraryGet();
          saved = refreshed.repos.find((item) => item.remoteUrl && normalizeGitUrl(item.remoteUrl) === normalizeGitUrl(repo.remoteUrl));
          if (!saved) throw error;
        }
      }
      if (!saved) throw new Error('Não foi possível registrar este repositório na biblioteca.');
      const savedRepo = saved;
      useLibraryStore.setState((state) => ({
        repos: state.repos.some((item) => item.id === savedRepo.id)
          ? state.repos
          : [...state.repos, savedRepo]
      }));
      onAdded(repo.remoteUrl);
      onOpenRepository(savedRepo.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
      onError(message);
    } finally {
      setOpening(null);
    }
  };

  if (status?.state !== 'connected') {
    const message = status?.state === 'error'
      ? status.message
      : status?.state === 'disconnected'
        ? 'Conecte sua conta no Dashboard para listar os repositórios disponíveis.'
        : 'Verificando a conta GitHub…';
    return (
      <section className="rounded border border-dashed border-steam-elevated p-8 text-center">
        <p className="text-sm text-steam-text/60">{message}</p>
        <div className="mt-3 flex justify-center gap-2">
          <button type="button" onClick={onOpenDashboard} className="rounded bg-steam-accent px-3 py-2 text-xs font-semibold text-steam-bg">Abrir Dashboard</button>
          <button type="button" onClick={() => void refresh()} disabled={loadingPage != null} className="inline-flex items-center gap-2 rounded border border-steam-elevated px-3 py-2 text-xs hover:bg-steam-panel disabled:opacity-50">
            <RefreshCw size={13} className={loadingPage != null ? 'animate-spin' : ''} /> Verificar novamente
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs text-steam-text/55">
          Repositórios acessíveis por @{status.account.login}
          <span className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-steam-text/40" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nos repositórios carregados" className="w-full rounded border border-steam-elevated bg-steam-panel py-2 pl-9 pr-3 text-sm text-steam-text outline-none focus:border-steam-accent" />
          </span>
        </label>
        <button type="button" onClick={() => void refresh()} disabled={loadingPage != null} className="flex items-center gap-2 rounded border border-steam-elevated px-3 py-2 text-xs text-steam-text/70 hover:bg-steam-panel disabled:opacity-50">
          <RefreshCw size={13} className={loadingPage != null ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>
      <p className="mb-3 text-xs text-steam-text/40">{allRepos.length} repositórios carregados · a lista segue as permissões concedidas ao token.</p>
      {loadError !== '' && <p role="status" className="mb-3 rounded border border-steam-error/30 bg-steam-error/5 p-3 text-xs text-steam-error">{loadError}</p>}
      {visibleRepos.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleRepos.map((repo) => (
            <RepositoryCard
              key={repo.id}
              repo={repo}
              added={known.has(normalizeGitUrl(repo.remoteUrl))}
              adding={adding === repo.remoteUrl}
              opening={opening === repo.remoteUrl}
              onOpen={() => void openProject(repo)}
              onAdd={() => void addToLibrary(repo)}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-48 items-center justify-center rounded border border-dashed border-steam-elevated p-6 text-center text-sm text-steam-text/45">
          {allRepos.length === 0 ? 'Nenhum repositório encontrado nesta conta.' : 'Nenhum repositório carregado corresponde à busca.'}
        </div>
      )}
      {lastPage?.hasNextPage && (
        <div className="mt-5 flex justify-center">
          <button type="button" onClick={() => void loadPage(nextPage)} disabled={loadingPage != null} className="rounded bg-steam-accent px-4 py-2 text-sm font-semibold text-steam-bg disabled:opacity-50">
            {loadingPage === nextPage ? 'Carregando…' : 'Carregar mais repositórios'}
          </button>
        </div>
      )}
    </section>
  );
}

function RepositoryCard({ repo, added, adding, opening, onOpen, onAdd }: {
  repo: GithubAccountRepo;
  added: boolean;
  adding: boolean;
  opening: boolean;
  onOpen: () => void;
  onAdd: () => void;
}): React.JSX.Element {
  return (
    <article className="flex min-h-40 flex-col rounded border border-steam-elevated bg-steam-panel p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <a href={repo.htmlUrl} target="_blank" rel="noreferrer" className="truncate font-semibold text-steam-text hover:text-steam-accent">
            {repo.fullName}<ExternalLink size={12} className="ml-1 inline" />
          </a>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-steam-text/45">
            {repo.private ? <LockKeyhole size={11} /> : <Globe size={11} />}
            {repo.private ? 'Privado' : 'Público'}
          </p>
        </div>
        {repo.language && <span className="max-w-24 truncate rounded bg-steam-elevated px-2 py-1 text-[10px] text-steam-text/60">{repo.language}</span>}
      </div>
      <p className="mt-3 line-clamp-2 min-h-8 text-xs text-steam-text/55">{repo.description || 'Sem descrição.'}</p>
      <div className="mt-auto flex items-center gap-3 pt-3 text-[11px] text-steam-text/40">
        <span className="inline-flex items-center gap-1"><Star size={11} /> {repo.stars.toLocaleString('pt-BR')}</span>
        <span>{updatedLabel(repo.updatedAt)}</span>
      </div>
      <button type="button" onClick={onOpen} disabled={opening} className="mt-3 flex items-center justify-center gap-1.5 rounded bg-steam-accent px-3 py-1.5 text-xs font-semibold text-steam-bg disabled:cursor-default disabled:opacity-55">
        {opening ? 'Abrindo…' : <><FolderOpen size={12} /> Abrir projeto</>}
      </button>
      <button type="button" onClick={onAdd} disabled={added || adding} className="mt-3 flex items-center justify-center gap-1.5 rounded border border-steam-elevated px-3 py-1.5 text-xs text-steam-text/70 hover:bg-steam-elevated disabled:cursor-default disabled:opacity-55">
        {added ? 'Na biblioteca' : adding ? 'Adicionando…' : <><Plus size={12} /> Adicionar à biblioteca</>}
      </button>
    </article>
  );
}
