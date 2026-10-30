import { create } from 'zustand';
import type { LogLine, Repo, Settings } from '@shared/types';
import type { ToolStatus } from '@shared/tools';
import { api } from '../lib/api';

interface LibraryState {
  repos: Repo[];
  settings: Settings | null;
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
  appendLog: (id: string, line: LogLine) => void;
  clearLogs: (id: string) => void;
  confirmRun: (key: string) => void;
  setCloneProgress: (id: string, progress: { percent: number | null; stage: string }) => void;
}

export const runConfirmKey = (id: string, command: string): string => `${id}::${command}`;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  repos: [],
  settings: null,
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
