import { app, BrowserWindow, shell } from 'electron';
import { createRequire } from 'node:module';
import { join } from 'path';
import { LibraryStore } from './services/library-store';
import { GitService } from './services/git-service';
import { AgentRunStore } from './services/agent-run-store';
import { AgentRunManager } from './services/agent-run-manager';
import { registerAgentRunsIpc } from './ipc/agent-runs.ipc';
import { ToolManager } from './services/tool-manager';
import { registerNativeToolsIpc } from './ipc/native-tools.ipc';
import { registerDashboardIpc } from './ipc/dashboard.ipc';
import { registerProjectsIpc } from './ipc/projects.ipc';
import { TerminalManager } from './services/terminal-manager';
import { registerAssetsIpc } from './ipc/assets.ipc';
import { registerRepoIpc } from './ipc/repos.ipc';
import { registerTerminalIpc } from './ipc/terminal.ipc';
import { registerToolsIpc } from './ipc/tools.ipc';
import { ToolsChecker } from './services/tools-checker';
import { DevWorkspaceManager } from './services/dev-workspace';
import { registerDevWorkspaceIpc } from './ipc/dev-workspace.ipc';
import { registerAppUpdaterIpc } from './ipc/app-updater.ipc';
import { AppUpdaterManager, shouldEnableAutoUpdates, type UpdaterPort } from './services/app-updater';
import { IpcChannels } from '../shared/ipc-channels';

function loadAutoUpdater(): UpdaterPort | null {
  if (!shouldEnableAutoUpdates(app.isPackaged, process.platform, __GLIBRARY_MACOS_AUTO_UPDATE__)) return null;

  try {
    const loaded: unknown = createRequire(__filename)('electron-updater');
    if (typeof loaded !== 'object' || loaded == null || !('autoUpdater' in loaded)) return null;
    const updater = loaded.autoUpdater;
    if (
      typeof updater !== 'object' || updater == null ||
      !('on' in updater) || typeof updater.on !== 'function' ||
      !('checkForUpdates' in updater) || typeof updater.checkForUpdates !== 'function' ||
      !('quitAndInstall' in updater) || typeof updater.quitAndInstall !== 'function' ||
      !('autoDownload' in updater) || !('autoInstallOnAppQuit' in updater)
    ) return null;
    return updater as UpdaterPort;
  } catch (error) {
    console.error('NÃ£o foi possÃ­vel carregar as atualizaÃ§Ãµes do aplicativo.', error);
    return null;
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600,
    backgroundColor: '#171a21', title: 'Glibrary', autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

void app.whenReady().then(async () => {
  const store = new LibraryStore(app.getPath('userData'), join(app.getPath('home'), 'Glibrary'));
  await store.load();
  const runStore = new AgentRunStore(app.getPath('userData'));
  await runStore.load();
  const runManager = new AgentRunManager(store, runStore, join(app.getPath('userData'), 'logs', 'agents'), (channel, payload) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload);
  });
  const toolManager = new ToolManager(
    store,
    join(app.getPath('userData'), 'tools'),
    join(app.getPath('userData'), 'logs', 'tools'),
    (channel, payload) => {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload);
    }
  );
  registerAgentRunsIpc(store, runManager);
  registerNativeToolsIpc(toolManager);
  registerDashboardIpc(store);
  registerProjectsIpc(store, new GitService());
  registerAssetsIpc(store, new GitService());
  registerRepoIpc(store, new GitService(), join(app.getPath('userData'), 'covers'));
  const terminalManager = new TerminalManager();
  registerTerminalIpc(terminalManager);
  registerDevWorkspaceIpc(
    store,
    new DevWorkspaceManager(store, join(app.getPath('userData'), 'workspaces')),
    terminalManager
  );
  registerToolsIpc(new ToolsChecker());
  const autoUpdater = loadAutoUpdater();
  const updateManager = new AppUpdaterManager(
    autoUpdater,
    app.getVersion(),
    (state) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IpcChannels.appUpdateChanged, state);
      }
    },
    process.platform === 'darwin' && app.isPackaged && !__GLIBRARY_MACOS_AUTO_UPDATE__
      ? 'As atualizaÃ§Ãµes automÃ¡ticas no macOS serÃ£o ativadas quando o app tiver assinatura de cÃ³digo.'
      : undefined
  );
  registerAppUpdaterIpc(updateManager);
  createWindow();
  if (autoUpdater != null) void updateManager.check();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  app.on('before-quit', () => {
    terminalManager.killAll();
    void runManager.stopAll();
    void toolManager.stopAll();
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
