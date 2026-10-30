import { create } from 'zustand';
import type { Repo, Settings } from '@shared/types';
import { api } from '../lib/api';

interface LibraryState {
  repos: Repo[];
  settings: Settings | null;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  addLocal: (path: string) => Promise<Repo>;
  updateRepo: (id: string, patch: Partial<Repo>) => Promise<void>;
  removeRepo: (id: string, deleteFolder: boolean) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  repos: [],
  settings: null,
  loaded: false,
  error: null,

  load: async () => {
    try {
      const library = await api.libraryGet();
      set({ repos: library.repos, settings: library.settings, loaded: true, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loaded: true });
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
  }
}));
