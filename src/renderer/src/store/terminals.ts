import { create } from 'zustand';
import type { TerminalSessionSummary } from '@shared/types';
import { api } from '../lib/api';

export interface TerminalGroup {
  cwd: string;
  sessions: TerminalSessionSummary[];
  activeId: string | null;
  panelOpen: boolean;
  loading: boolean;
  error: string | null;
}

interface TerminalsState {
  groups: Record<string, TerminalGroup>;
  openPanel: (cwd: string) => Promise<void>;
  hidePanel: (cwd: string) => void;
  createTerminal: (cwd: string) => Promise<void>;
  selectTerminal: (cwd: string, id: string) => void;
  closeTerminal: (cwd: string, id: string) => Promise<void>;
  markExited: (id: string, exitCode: number) => void;
}

export function terminalCwdKey(cwd: string): string {
  const trimmed = cwd.replace(/[\\/]+$/, '') || cwd;
  const looksWindows = /^[a-z]:[\\/]/i.test(cwd) || cwd.startsWith('\\\\');
  return looksWindows ? trimmed.replace(/\\/g, '/').toLocaleLowerCase('en-US') : trimmed;
}

function findGroupKey(groups: Record<string, TerminalGroup>, cwd: string): string | undefined {
  const target = terminalCwdKey(cwd);
  return Object.keys(groups).find((key) => terminalCwdKey(groups[key].cwd) === target || terminalCwdKey(key) === target);
}

export function useTerminalGroup(cwd: string | null | undefined): TerminalGroup | undefined {
  return useTerminalsStore((state) => {
    if (cwd == null || cwd === '') return undefined;
    const key = terminalCwdKey(cwd);
    return state.groups[key] ?? Object.values(state.groups).find((item) => terminalCwdKey(item.cwd) === key);
  });
}

function emptyGroup(cwd: string): TerminalGroup {
  return { cwd, sessions: [], activeId: null, panelOpen: true, loading: false, error: null };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useTerminalsStore = create<TerminalsState>((set, get) => ({
  groups: {},

  openPanel: async (cwd) => {
    const initialGroups = get().groups;
    const existingKey = findGroupKey(initialGroups, cwd);
    const requestKey = existingKey ?? terminalCwdKey(cwd);
    const existing = existingKey != null ? initialGroups[existingKey] : undefined;
    if (existing?.loading) return;

    set((state) => {
      const current = state.groups[requestKey] ?? emptyGroup(cwd);
      return { groups: { ...state.groups, [requestKey]: { ...current, panelOpen: true, loading: true, error: null } } };
    });

    try {
      const result = await api.terminalList(cwd);
      let sessions = result.sessions;
      if (sessions.length === 0) sessions = [await api.terminalCreateSession(result.cwd)];

      set((state) => {
        const canonicalKey = terminalCwdKey(result.cwd);
        const previous = state.groups[canonicalKey] ?? state.groups[requestKey] ?? existing ?? emptyGroup(result.cwd);
        const activeId = previous.activeId != null && sessions.some((session) => session.id === previous.activeId)
          ? previous.activeId
          : sessions[0]?.id ?? null;
        const groups = { ...state.groups };
        if (requestKey !== canonicalKey) delete groups[requestKey];
        if (existingKey != null && existingKey !== canonicalKey) delete groups[existingKey];
        groups[canonicalKey] = {
          ...previous,
          cwd: result.cwd,
          sessions,
          activeId,
          panelOpen: true,
          loading: false,
          error: null
        };
        return { groups };
      });
    } catch (error) {
      set((state) => {
        const key = findGroupKey(state.groups, cwd) ?? requestKey;
        const current = state.groups[key] ?? emptyGroup(cwd);
        return {
          groups: {
            ...state.groups,
            [key]: { ...current, panelOpen: true, loading: false, error: errorMessage(error) }
          }
        };
      });
    }
  },

  hidePanel: (cwd) => {
    const key = findGroupKey(get().groups, cwd);
    if (key == null) return;
    set((state) => ({
      groups: { ...state.groups, [key]: { ...state.groups[key], panelOpen: false } }
    }));
  },

  createTerminal: async (cwd) => {
    const existingKey = findGroupKey(get().groups, cwd);
    const requestKey = existingKey ?? terminalCwdKey(cwd);
    set((state) => {
      const current = state.groups[requestKey] ?? emptyGroup(cwd);
      return {
        groups: { ...state.groups, [requestKey]: { ...current, panelOpen: true, loading: true, error: null } }
      };
    });

    try {
      const created = await api.terminalCreateSession(cwd);
      set((state) => {
        const canonicalKey = terminalCwdKey(created.cwd);
        const previous = state.groups[canonicalKey] ?? state.groups[requestKey] ?? emptyGroup(created.cwd);
        const sessions = previous.sessions.some((session) => session.id === created.id)
          ? previous.sessions
          : [...previous.sessions, created];
        const groups = { ...state.groups };
        if (requestKey !== canonicalKey) delete groups[requestKey];
        if (existingKey != null && existingKey !== canonicalKey) delete groups[existingKey];
        groups[canonicalKey] = {
          ...previous,
          cwd: created.cwd,
          sessions,
          activeId: created.id,
          panelOpen: true,
          loading: false,
          error: null
        };
        return { groups };
      });
    } catch (error) {
      set((state) => {
        const key = findGroupKey(state.groups, cwd) ?? requestKey;
        const current = state.groups[key] ?? emptyGroup(cwd);
        return {
          groups: {
            ...state.groups,
            [key]: { ...current, panelOpen: true, loading: false, error: errorMessage(error) }
          }
        };
      });
    }
  },

  selectTerminal: (cwd, id) => {
    const key = findGroupKey(get().groups, cwd);
    if (key == null || !get().groups[key].sessions.some((session) => session.id === id)) return;
    set((state) => ({ groups: { ...state.groups, [key]: { ...state.groups[key], activeId: id } } }));
  },

  closeTerminal: async (cwd, id) => {
    const key = findGroupKey(get().groups, cwd);
    if (key == null) return;
    const group = get().groups[key];
    const index = group.sessions.findIndex((session) => session.id === id);
    if (index === -1) return;

    try {
      await api.terminalClose(id);
      set((state) => {
        const current = state.groups[key];
        if (current == null) return state;
        const currentIndex = current.sessions.findIndex((session) => session.id === id);
        if (currentIndex === -1) return state;
        const sessions = current.sessions.filter((session) => session.id !== id);
        const activeId = current.activeId === id
          ? sessions[Math.min(currentIndex, sessions.length - 1)]?.id ?? null
          : current.activeId;
        return {
          groups: {
            ...state.groups,
            [key]: { ...current, sessions, activeId, error: null }
          }
        };
      });
    } catch (error) {
      set((state) => {
        const current = state.groups[key];
        if (current == null) return state;
        return { groups: { ...state.groups, [key]: { ...current, error: errorMessage(error) } } };
      });
    }
  },

  markExited: (id, exitCode) => {
    set((state) => {
      let changed = false;
      const groups = Object.fromEntries(Object.entries(state.groups).map(([key, group]) => {
        const index = group.sessions.findIndex((session) => session.id === id);
        if (index === -1) return [key, group];
        changed = true;
        const sessions = [...group.sessions];
        sessions[index] = { ...sessions[index], status: 'exited', exitCode };
        return [key, { ...group, sessions }];
      }));
      return changed ? { groups } : state;
    });
  }
}));
