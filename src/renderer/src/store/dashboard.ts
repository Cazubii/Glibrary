import { create } from 'zustand';
import type { DashboardAccount } from '@shared/github-dashboard';
import { api } from '../lib/api';

/** Dados com menos de 5 minutos não são rebuscados ao voltar para a aba. */
export const DASHBOARD_STALE_MS = 5 * 60 * 1000;

interface DashboardState {
  account: DashboardAccount | null;
  /** Primeira carga sem nada em cache. */
  loading: boolean;
  /** Atualização em segundo plano com dados em cache visíveis. */
  refreshing: boolean;
  error: string | null;
  /** Stale-while-revalidate: mostra o cache e só busca se estiver velho (ou `force`). */
  load: (force?: boolean) => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useDashboardStore = create<DashboardState>((set, get) => ({
  account: null,
  loading: false,
  refreshing: false,
  error: null,

  load: async (force = false) => {
    const { account } = get();
    const age = account != null ? Date.now() - Date.parse(account.fetchedAt) : Infinity;
    if (!force && age < DASHBOARD_STALE_MS) return;
    if (inflight != null) return inflight;
    set(account != null ? { refreshing: true } : { loading: true });
    inflight = api
      .dashboardAccount()
      .then((data) => set({ account: data, error: null }))
      .catch((e: unknown) => set({ error: e instanceof Error ? e.message : 'Não foi possível carregar os dados do GitHub' }))
      .finally(() => {
        inflight = null;
        set({ loading: false, refreshing: false });
      });
    return inflight;
  }
}));
