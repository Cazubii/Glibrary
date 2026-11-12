import { app, BrowserWindow, shell } from 'electron';
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
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  app.on('before-quit', () => {
    terminalManager.killAll();
    void runManager.stopAll();
    void toolManager.stopAll();
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
