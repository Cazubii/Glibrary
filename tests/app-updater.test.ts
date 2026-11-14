import { describe, expect, it } from 'vitest';
import { AppUpdaterManager, shouldEnableAutoUpdates, type UpdaterPort } from '../src/main/services/app-updater';

class FakeUpdater implements UpdaterPort {
  autoDownload = false;
  autoInstallOnAppQuit = true;
  installed = false;
  readonly listeners = new Map<string, Array<(payload?: unknown) => void>>();

  on(event: string, listener: (payload?: unknown) => void): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  checkForUpdates(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  quitAndInstall(): void {
    this.installed = true;
  }

  emit(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}

describe('AppUpdaterManager', () => {
  it('baixa a atualização e só reinicia depois que o download termina', async () => {
    const updater = new FakeUpdater();
    const manager = new AppUpdaterManager(updater, '0.1.0');

    await manager.check();
    updater.emit('update-available', { version: '0.2.0' });
    expect(manager.getState()).toMatchObject({ status: 'available', availableVersion: '0.2.0' });
    expect(updater.autoDownload).toBe(true);

    updater.emit('download-progress', { percent: 42.6 });
    expect(manager.getState()).toMatchObject({ status: 'downloading', percent: 43 });

    updater.emit('update-downloaded', { version: '0.2.0' });
    expect(manager.getState()).toMatchObject({ status: 'downloaded', availableVersion: '0.2.0' });
    manager.install();
    expect(updater.installed).toBe(true);
  });

  it('mantém a versão atual e mostra orientação curta quando a busca falha', async () => {
    const updater = new FakeUpdater();
    updater.checkForUpdates = () => Promise.reject(new Error('falha técnica com caminho local'));
    const manager = new AppUpdaterManager(updater, '0.1.0');

    await manager.check();

    expect(manager.getState()).toMatchObject({
      status: 'error',
      currentVersion: '0.1.0',
      message: 'Não foi possível verificar atualizações. Tente novamente mais tarde.'
    });
    expect(manager.getState().message).not.toContain('caminho local');
  });

  it('não instala enquanto a atualização ainda não foi baixada', () => {
    const updater = new FakeUpdater();
    const manager = new AppUpdaterManager(updater, '0.1.0');

    expect(() => manager.install()).toThrow('A atualização ainda não está pronta.');
    expect(updater.installed).toBe(false);
  });
});

describe('shouldEnableAutoUpdates', () => {
  it('habilita Windows e Linux em builds instaláveis e exige assinatura configurada no macOS', () => {
    expect(shouldEnableAutoUpdates(true, 'win32', false)).toBe(true);
    expect(shouldEnableAutoUpdates(true, 'linux', false)).toBe(true);
    expect(shouldEnableAutoUpdates(true, 'darwin', false)).toBe(false);
    expect(shouldEnableAutoUpdates(true, 'darwin', true)).toBe(true);
    expect(shouldEnableAutoUpdates(false, 'linux', false)).toBe(false);
  });
});
