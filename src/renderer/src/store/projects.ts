import { create } from 'zustand';
import type { ProjectRepoPage, ProjectRepoSummary, ProjectVisibility } from '../../../shared/github-projects';
import type { Repo } from '../../../shared/types';
import { normalizeGitUrl } from '../../../shared/git-utils';
import { api } from '../lib/api';
import { useLibraryStore } from './library';

export const PROJECTS_PER_PAGE = 50;
export const PROJECTS_STALE_MS = 5 * 60 * 1000;

export interface ProjectCloneState {
  repoId: string;
  status: 'cloning' | 'cloned' | 'error';
  percent: number | null;
  stage: string;
  error?: string;
}

interface ProjectsState {
  repos: ProjectRepoSummary[];
  page: number;
  hasMore: boolean;
  fetchedAt: number | null;
  visibility: ProjectVisibility;
  showForks: boolean;
  query: string;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  clones: Record<string, ProjectCloneState>;
  setQuery: (query: string) => void;
  setVisibility: (visibility: ProjectVisibility) => void;
  setShowForks: (show: boolean) => void;
  resetFilters: () => void;
  load: (force?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  startClone: (fullName: string, repoId: string) => void;
  failClone: (fullName: string, message: string) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível carregar os repositórios do GitHub.';
}

let listRequestId = 0;
let listInFlight: { key: string; promise: Promise<void> } | null = null;

export const useProjectsStore = create<ProjectsState>((set, get) => {
  let cloneListenersBound = false;

  const bindCloneListeners = (): void => {
    if (cloneListenersBound) return;
    cloneListenersBound = true;

    api.onCloneProgress(({ id, percent, stage }) => {
      const match = Object.entries(get().clones).find(([, clone]) => clone.repoId === id);
      if (match == null) return;
      const [key, clone] = match;
      set((state) => ({ clones: { ...state.clones, [key]: { ...clone, percent, stage } } }));
    });

    api.onStatusChanged(({ id, status }) => {
      const match = Object.entries(get().clones).find(([, clone]) => clone.repoId === id);
      if (match == null) return;
      const [key, clone] = match;
      if (status === 'error') {
        const cloneWithoutError = { ...clone };
        delete cloneWithoutError.error;
        set((state) => ({
          clones: { ...state.clones, [key]: { ...cloneWithoutError, status: 'error' } }
        }));
        void useLibraryStore.getState().load();
        return;
      }
      if (status === 'cloned' || status === 'installed' || status === 'running') {
        set((state) => ({
          clones: { ...state.clones, [key]: { ...clone, status: 'cloned', percent: 100, stage: 'Concluído' } }
        }));
        void useLibraryStore.getState().load();
        void get().load(true);
      }
    });
  };

  const requestPage = async (page: number): Promise<ProjectRepoPage> => {
    const { visibility, showForks } = get();
    return api.projectsList({
      page,
      perPage: PROJECTS_PER_PAGE,
      sort: 'updated',
      visibility,
      fork: showForks
    });
  };

  return {
    repos: [],
    page: 0,
    hasMore: false,
    fetchedAt: null,
    visibility: 'all',
    showForks: true,
    query: '',
    loading: false,
    refreshing: false,
    loadingMore: false,
    error: null,
    clones: {},

    setQuery: (query) => set({ query }),

    setVisibility: (visibility) => {
      if (get().visibility === visibility) return;
      set({ visibility, repos: [], page: 0, hasMore: false, fetchedAt: null, loadingMore: false, error: null });
      void get().load(true);
    },

    setShowForks: (showForks) => {
      if (get().showForks === showForks) return;
      set({ showForks, repos: [], page: 0, hasMore: false, fetchedAt: null, loadingMore: false, error: null });
      void get().load(true);
    },

    resetFilters: () => {
      set({ visibility: 'all', showForks: true, query: '', repos: [], page: 0, hasMore: false, fetchedAt: null, loadingMore: false, error: null });
      void get().load(true);
    },

    load: async (force = false) => {
      const current = get();
      const age = current.fetchedAt == null ? Infinity : Date.now() - current.fetchedAt;
      if (!force && age < PROJECTS_STALE_MS) return;
      const key = `${current.visibility}:${current.showForks}`;
      if (listInFlight?.key === key) return listInFlight.promise;

      const requestId = ++listRequestId;
      set(current.fetchedAt == null
        ? { loading: true, loadingMore: false, error: null }
        : { refreshing: true, loadingMore: false, error: null });
      const promise = requestPage(1)
        .then((data) => {
          if (requestId !== listRequestId) return;
          set({ repos: data.repos, page: data.page, hasMore: data.hasMore, fetchedAt: Date.now(), error: null });
        })
        .catch((error: unknown) => {
          if (requestId === listRequestId) set({ error: errorMessage(error) });
        })
        .finally(() => {
          if (requestId !== listRequestId) return;
          listInFlight = null;
          set({ loading: false, refreshing: false });
        });
      listInFlight = { key, promise };
      return promise;
    },

    loadMore: async () => {
      const current = get();
      if (!current.hasMore || current.loadingMore || current.loading || current.refreshing) return;
      bindCloneListeners();
      const nextPage = current.page + 1;
      const requestId = ++listRequestId;
      set({ loadingMore: true, error: null });
      try {
        const data = await requestPage(nextPage);
        if (requestId !== listRequestId) return;
        set((state) => {
          const known = new Set(state.repos.map((repo) => repo.id));
          return {
            repos: [...state.repos, ...data.repos.filter((repo) => !known.has(repo.id))],
            page: data.page,
            hasMore: data.hasMore,
            fetchedAt: Date.now(),
            error: null
          };
        });
      } catch (error) {
        if (requestId === listRequestId) set({ error: errorMessage(error) });
      } finally {
        if (requestId === listRequestId) set({ loadingMore: false });
      }
    },

    startClone: (fullName, repoId) => {
      bindCloneListeners();
      const key = fullName.toLocaleLowerCase('en-US');
      set((state) => ({
        clones: {
          ...state.clones,
          [key]: { repoId, status: 'cloning', percent: null, stage: 'Iniciando clone…' }
        }
      }));
    },

    failClone: (fullName, message) => {
      const key = fullName.toLocaleLowerCase('en-US');
      const current = get().clones[key];
      if (current == null) return;
      set((state) => ({
        clones: { ...state.clones, [key]: { ...current, status: 'error', error: message } }
      }));
    }
  };
});

export function findLibraryRepo(repos: Repo[], project: ProjectRepoSummary): Repo | undefined {
  const fullName = project.fullName.toLocaleLowerCase('en-US');
  return repos.find((repo) => {
    if (repo.remoteUrl != null && repo.remoteUrl !== '' && project.htmlUrl !== '') {
      if (normalizeGitUrl(repo.remoteUrl) === normalizeGitUrl(project.htmlUrl)) return true;
    }
    return repo.owner != null && `${repo.owner}/${repo.name}`.toLocaleLowerCase('en-US') === fullName;
  });
}
