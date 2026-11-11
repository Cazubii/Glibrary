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
import { registerAssetsIpc, refreshTopReposAndBroadcast } from './ipc/assets.ipc';

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
  createWindow();
  // Atualiza os top repos do GitHub em segundo plano; erros ficam silenciosos
  // (offline/limite da API não impedem o uso — a lista anterior continua na aba).
  setTimeout(() => {
    void refreshTopReposAndBroadcast(store).catch(() => undefined);
    // A lista de 7 dias só é buscada no startup quando o cache está vazio.
    if (store.getTopRepos(7).fetchedAt === '') {
      void refreshTopReposAndBroadcast(store, 7).catch(() => undefined);
    }
  }, 1500);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  app.on('before-quit', () => { void runManager.stopAll(); void toolManager.stopAll(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
