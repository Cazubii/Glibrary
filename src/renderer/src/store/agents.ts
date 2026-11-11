import { create } from 'zustand';
import type { AgentProfile, AgentRun, AgentViewMode, LogLine } from '@shared/types';
import { api } from '../lib/api';

interface AgentsState {
  profiles: AgentProfile[];
  runs: AgentRun[];
  logs: Record<string, LogLine[]>;
  viewMode: AgentViewMode;
  loaded: boolean;
  load: () => Promise<void>;
  initEvents: () => () => void;
  setViewMode: (mode: AgentViewMode) => Promise<void>;
  createProfile: (input: { name: string; repoId: string; command: string; args?: string[] }) => Promise<AgentProfile>;
  updateProfile: (id: string, patch: { name?: string; repoId?: string; command?: string; args?: string[] }) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
  startRun: (profileId: string, prompt?: string) => Promise<void>;
  stopRun: (id: string) => Promise<void>;
}

function mergeRun(runs: AgentRun[], run: AgentRun): AgentRun[] {
  const index = runs.findIndex((item) => item.id === run.id);
  if (index === -1) return [run, ...runs];
  const next = [...runs];
  next[index] = run;
  return next;
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  profiles: [],
  runs: [],
  logs: {},
  viewMode: 'painel',
  loaded: false,

  load: async () => {
    try {
      const [profiles, runs, settings] = await Promise.all([
        api.agentProfilesList(),
        api.agentRunsList(),
        api.settingsGet()
      ]);
      set({ profiles, runs, viewMode: settings.agentsViewMode ?? 'painel', loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  initEvents: () => {
    const offChanged = api.onAgentRunsChanged((run) => {
      set((s) => ({ runs: mergeRun(s.runs, run) }));
    });
    const offLog = api.onAgentRunsLog(({ id, line }) => {
      set((s) => {
        const current = s.logs[id] ?? [];
        const next = [...current, line];
        return { logs: { ...s.logs, [id]: next.length > 5000 ? next.slice(-5000) : next } };
      });
    });
    return () => { offChanged(); offLog(); };
  },

  setViewMode: async (mode) => {
    const settings = await api.settingsSet({ agentsViewMode: mode });
    set({ viewMode: settings.agentsViewMode ?? mode });
  },

  createProfile: async (input) => {
    const profile = await api.agentProfilesCreate(input);
    set((s) => ({ profiles: [...s.profiles, profile] }));
    return profile;
  },

  updateProfile: async (id, patch) => {
    const updated = await api.agentProfilesUpdate(id, patch);
    set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? updated : p)) }));
  },

  removeProfile: async (id) => {
    await api.agentProfilesRemove(id);
    set((s) => ({ profiles: s.profiles.filter((p) => p.id !== id) }));
  },

  startRun: async (profileId, prompt) => {
    const run = await api.agentRunsStart(profileId, prompt);
    set((s) => ({ runs: mergeRun(s.runs, run) }));
  },

  stopRun: async (id) => {
    await api.agentRunsStop(id);
    // o status final chega pelo evento agentRunsChanged
    void get();
  }
}));
