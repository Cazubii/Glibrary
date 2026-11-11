import { create } from 'zustand';
import type { GithubAccountStatus, GithubRepoPage, LogLine, Repo, Settings } from '@shared/types';
import type { ToolStatus } from '@shared/tools';
import { api } from '../lib/api';

interface LibraryState {
  repos: Repo[];
  settings: Settings | null;
  githubAccount: GithubAccountStatus | null;
  githubRepoPages: Record<number, GithubRepoPage>;
  loaded: boolean;
  error: string | null;
  logs: Record<string, LogLine[]>;
  confirmedRuns: string[];
  cloneProgress: Record<string, { percent: number | null; stage: string }>;
  tools: ToolStatus[];
  toolsLoaded: boolean;
  load: () => Promise<void>;
  loadTools: (force?: boolean) => Promise<ToolStatus[]>;
  addLocal: (path: string) => Promise<Repo>;
  updateRepo: (id: string, patch: Partial<Repo>) => Promise<void>;
  removeRepo: (id: string, deleteFolder: boolean) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  loadGithubAccount: (force?: boolean) => Promise<GithubAccountStatus>;
  connectGithubAccount: (token: string) => Promise<GithubAccountStatus>;
  disconnectGithubAccount: () => Promise<GithubAccountStatus>;
  loadGithubRepos: (page: number, force?: boolean) => Promise<GithubRepoPage>;
  clearGithubRepos: () => void;
  appendLog: (id: string, line: LogLine) => void;
  clearLogs: (id: string) => void;
  confirmRun: (key: string) => void;
  setCloneProgress: (id: string, progress: { percent: number | null; stage: string }) => void;
}

export const runConfirmKey = (id: string, command: string): string => `${id}::${command}`;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  repos: [],
  settings: null,
  githubAccount: null,
  githubRepoPages: {},
  loaded: false,
  error: null,
  logs: {},
  confirmedRuns: [],
  cloneProgress: {},
  tools: [],
  toolsLoaded: false,

  load: async () => {
    try {
      const library = await api.libraryGet();
      set({ repos: library.repos, settings: library.settings, loaded: true, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loaded: true });
    }
  },

  loadTools: async (force = false) => {
    try {
      const tools = await api.toolsCheck(force);
      set({ tools, toolsLoaded: true });
      return tools;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), toolsLoaded: true });
      return [];
    }
  },

  addLocal: async (path: string) => {
    const repo = await api.repoAddLocal(path);
    set((s) => ({ repos: [...s.repos, repo] }));
    return repo;
  },

  updateRepo: async (id, patch) => {
    const updated = await api.repoUpdate(id, patch);
    set((s) => ({ repos: s.repos.map((r) => (r.id === id ? updated : r)) }));
  },

  removeRepo: async (id, deleteFolder) => {
    await api.repoRemove(id, deleteFolder);
    set((s) => ({ repos: s.repos.filter((r) => r.id !== id) }));
  },

  toggleFavorite: async (id) => {
    const repo = get().repos.find((r) => r.id === id);
    if (!repo) return;
    const updated = await api.repoUpdate(id, { favorite: !repo.favorite });
    set((s) => ({ repos: s.repos.map((r) => (r.id === id ? updated : r)) }));
  },

  updateSettings: async (patch) => {
    const settings = await api.settingsSet(patch);
    set({ settings });
  },
  loadGithubAccount: async (force = false) => {
    const cached = get().githubAccount;
    if (!force && cached != null && Date.now() - Date.parse(cached.checkedAt) < 5 * 60 * 1000) {
      return cached;
    }
    const account = await api.githubAccountStatus();
    set({ githubAccount: account, ...(account.state === 'connected' ? {} : { githubRepoPages: {} }) });
    return account;
  },

  connectGithubAccount: async (token) => {
    const account = await api.githubAccountConnect(token);
    set({ githubAccount: account, githubRepoPages: {} });
    return account;
  },

  disconnectGithubAccount: async () => {
    const account = await api.githubAccountDisconnect();
    set({ githubAccount: account, githubRepoPages: {} });
    return account;
  },

  loadGithubRepos: async (page, force = false) => {
    const cached = get().githubRepoPages[page];
    if (!force && cached != null) return cached;
    const result = await api.githubReposList(page);
    set((state) => ({ githubRepoPages: { ...state.githubRepoPages, [page]: result } }));
    return result;
  },

  clearGithubRepos: () => set({ githubRepoPages: {} }),

  appendLog: (id, line) =>
    set((s) => {
      const current = s.logs[id] ?? [];
      const next = [...current, line];
      return { logs: { ...s.logs, [id]: next.length > 5000 ? next.slice(-5000) : next } };
    }),

  clearLogs: (id) => set((s) => ({ logs: { ...s.logs, [id]: [] } })),

  confirmRun: (key) => set((s) => ({ confirmedRuns: [...s.confirmedRuns, key] })),

  setCloneProgress: (id, progress) =>
    set((s) => ({ cloneProgress: { ...s.cloneProgress, [id]: progress } }))
}));
