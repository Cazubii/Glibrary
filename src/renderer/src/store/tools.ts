import { create } from 'zustand';
import type { LogLine, ToolEntry, ToolInstallRun, ToolStatus } from '@shared/types';
import { api } from '../lib/api';

interface ToolsState {
  entries: ToolEntry[];
  statuses: Record<string, ToolStatus>;
  runs: ToolInstallRun[];
  logs: Record<string, LogLine[]>;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  initEvents: () => () => void;
  addTool: (url: string) => Promise<ToolEntry>;
  removeTool: (id: string) => Promise<void>;
  installTool: (id: string) => Promise<ToolInstallRun>;
}

function mergeRun(runs: ToolInstallRun[], run: ToolInstallRun): ToolInstallRun[] {
  const index = runs.findIndex((item) => item.id === run.id);
  if (index === -1) return [run, ...runs];
  const next = [...runs];
  next[index] = run;
  return next;
}

export const useToolsStore = create<ToolsState>((set) => ({
  entries: [],
  statuses: {},
  runs: [],
  logs: {},
  loaded: false,
  error: null,

  load: async () => {
    try {
      const [entries, statuses] = await Promise.all([api.toolsList(), api.toolsDetect()]);
      set({ entries, statuses, loaded: true, error: null });
    } catch (error) {
      set({ loaded: true, error: error instanceof Error ? error.message : String(error) });
    }
  },

  initEvents: () => {
    const offChanged = api.onToolRunsChanged((run) => {
      set((state) => ({
        runs: mergeRun(state.runs, run),
        statuses: { ...state.statuses, [run.toolId]: run.status === 'running' ? 'installing' : state.statuses[run.toolId] ?? 'not_installed' }
      }));
      if (run.status !== 'running') {
        void api.toolsDetect(run.toolId).then((status) => {
          set((state) => ({ statuses: { ...state.statuses, [run.toolId]: status } }));
        }).catch(() => undefined);
      }
    });
    const offLog = api.onToolRunsLog(({ id, line }) => {
      set((state) => {
        const current = state.logs[id] ?? [];
        const next = [...current, line];
        return { logs: { ...state.logs, [id]: next.length > 2000 ? next.slice(-2000) : next } };
      });
    });
    return () => { offChanged(); offLog(); };
  },

  addTool: async (url) => {
    const entry = await api.toolsAdd(url);
    set((state) => ({
      entries: [...state.entries, entry],
      statuses: { ...state.statuses, [entry.id]: 'not_installed' },
      error: null
    }));
    return entry;
  },

  removeTool: async (id) => {
    await api.toolsRemove(id);
    set((state) => {
      const statuses = { ...state.statuses };
      delete statuses[id];
      return { entries: state.entries.filter((entry) => entry.id !== id), statuses, error: null };
    });
  },

  installTool: async (id) => {
    const run = await api.toolsInstall(id);
    set((state) => ({
      runs: mergeRun(state.runs, run),
      statuses: { ...state.statuses, [id]: 'installing' },
      error: null
    }));
    return run;
  }
}));
