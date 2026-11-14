import { z } from 'zod';
import type { AppUpdateState } from '../../shared/types';

export type UpdaterEvent =
  | 'checking-for-update'
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error';

export interface UpdaterPort {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: UpdaterEvent, listener: (payload?: unknown) => void): this;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

const VersionPayloadSchema = z.object({ version: z.string().trim().min(1).max(100) }).passthrough();
const ProgressPayloadSchema = z.object({ percent: z.number().finite().min(0).max(100) }).passthrough();

const failedCheckMessage = 'Não foi possível verificar atualizações. Tente novamente mais tarde.';

export class AppUpdaterManager {
  private state: AppUpdateState;

  constructor(
    private readonly updater: UpdaterPort | null,
    currentVersion: string,
    private readonly broadcast?: (state: AppUpdateState) => void,
    unavailableMessage?: string
  ) {
    this.state = updater == null
      ? {
          status: 'unavailable',
          currentVersion,
          ...(unavailableMessage != null ? { message: unavailableMessage } : {})
        }
      : { status: 'idle', currentVersion };

    if (updater == null) return;

    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.on('checking-for-update', () => this.setState({ status: 'checking' }));
    updater.on('update-available', (payload) => {
      const parsed = VersionPayloadSchema.safeParse(payload);
      this.setState({
        status: 'available',
        ...(parsed.success ? { availableVersion: parsed.data.version } : {}),
        message: 'Nova versão disponível. O download começará agora.'
      });
    });
    updater.on('update-not-available', () => this.setState({ status: 'up-to-date' }));
    updater.on('download-progress', (payload) => {
      const parsed = ProgressPayloadSchema.safeParse(payload);
      if (!parsed.success) return;
      this.setState({ status: 'downloading', percent: Math.round(parsed.data.percent) });
    });
    updater.on('update-downloaded', (payload) => {
      const parsed = VersionPayloadSchema.safeParse(payload);
      const availableVersion = parsed.success ? parsed.data.version : this.state.availableVersion;
      this.setState({
        status: 'downloaded',
        ...(availableVersion != null ? { availableVersion } : {}),
        message: 'Atualização pronta. Reinicie para instalar.'
      });
    });
    updater.on('error', () => {
      this.setState({ status: 'error', message: failedCheckMessage });
    });
  }

  getState(): AppUpdateState {
    return { ...this.state };
  }

  async check(): Promise<AppUpdateState> {
    if (this.updater == null) return this.getState();
    this.setState({ status: 'checking' });
    try {
      await this.updater.checkForUpdates();
    } catch {
      this.setState({ status: 'error', message: failedCheckMessage });
    }
    return this.getState();
  }

  install(): void {
    if (this.state.status !== 'downloaded' || this.updater == null) {
      throw new Error('A atualização ainda não está pronta.');
    }
    this.updater.quitAndInstall(false, true);
  }

  private setState(update: Omit<AppUpdateState, 'currentVersion'> & { status: AppUpdateState['status'] }): void {
    this.state = { currentVersion: this.state.currentVersion, ...update };
    this.broadcast?.(this.getState());
  }
}

export function shouldEnableAutoUpdates(
  isPackaged: boolean,
  platform: string,
  macAutoUpdateEnabled: boolean
): boolean {
  if (!isPackaged) return false;
  if (platform === 'darwin') return macAutoUpdateEnabled;
  return platform === 'win32' || platform === 'linux';
}
