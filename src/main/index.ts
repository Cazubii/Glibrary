import { app, BrowserWindow, dialog, shell } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { LibraryStore } from './services/library-store';
import { ProcessManager } from './services/process-manager';
import { GitService } from './services/git-service';
import { ToolsChecker } from './services/tools-checker';
import { registerRepoIpc } from './ipc/repos.ipc';
import { registerProcessIpc } from './ipc/process.ipc';
import { registerToolsIpc } from './ipc/tools.ipc';
import { registerScanIpc } from './ipc/scan.ipc';

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#171a21',
    title: 'Glibrary',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(async () => {
  const store = new LibraryStore(app.getPath('userData'), join(app.getPath('home'), 'Glibrary'));
  await store.load();
  await store.applyStartupFixes((repo) =>
    repo.localPath != null ? existsSync(repo.localPath) : false,
  );

  const processManager = new ProcessManager(store, join(app.getPath('userData'), 'logs'), broadcast);
  const gitService = new GitService();
  const toolsChecker = new ToolsChecker();

  registerRepoIpc(store, gitService, join(app.getPath('userData'), 'covers'));
  registerProcessIpc(processManager, store);
  registerToolsIpc(toolsChecker);
  registerScanIpc(store, gitService);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('before-quit', (event) => {
    const running = processManager.runningRepoIds();
    if (running.length === 0) return;
    event.preventDefault();
    void dialog
      .showMessageBox({
        type: 'warning',
        buttons: ['Parar todos e sair', 'Cancelar'],
        defaultId: 0,
        cancelId: 1,
        title: 'Processos em execução',
        message: `Há ${running.length} repositórios rodando. Parar todos e sair?`
      })
      .then(async ({ response }) => {
        if (response === 0) {
          await processManager.stopAll();
          app.exit(0);
        }
      });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
