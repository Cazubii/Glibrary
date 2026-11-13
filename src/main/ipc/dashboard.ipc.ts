import { ipcMain } from 'electron';
import type { IpcResult } from '../../shared/types';
import type { DashboardAccount } from '../../shared/github-dashboard';
import { IpcChannels } from '../../shared/ipc-channels';
import type { LibraryStore } from '../services/library-store';
import { fetchJson } from '../services/github-api';
import { getGithubAccessToken } from '../services/github-oauth';
import { loadDashboardAccount } from '../services/github-dashboard';

/** Dados da conta GitHub para a aba Dashboard (token salvo via safeStorage). */
export function registerDashboardIpc(store: LibraryStore): void {
  ipcMain.handle(IpcChannels.dashboardAccount, async (): Promise<IpcResult<DashboardAccount>> => {
    const token = await getGithubAccessToken(store);
    return loadDashboardAccount(fetchJson, token);
  });
}
