import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { LibraryStore } from './services/library-store';
import { GitService } from './services/git-service';
import { registerAssetsIpc, refreshTopReposAndBroadcast } from './ipc/assets.ipc';
import { registerTerminalIpc } from './ipc/terminal.ipc';
import { TerminalManager } from './services/terminal-manager';
import { CodespaceService } from './services/codespace-service';
import { TemporaryCheckoutService } from './services/temporary-checkout';

let terminalManager: TerminalManager | null = null;
let shutdownStarted = false;
let shutdownComplete = false;

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
  registerAssetsIpc(store, new GitService());
  const codespaces = new CodespaceService();
  const temporaryCheckouts = new TemporaryCheckoutService(join(app.getPath('userData'), 'terminal-checkouts.json'));
  terminalManager = new TerminalManager(
    store,
    codespaces,
    temporaryCheckouts,
    (channel, payload) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(channel, payload);
      }
    },
    app.getPath('home')
  );
  registerTerminalIpc(store, terminalManager, codespaces, temporaryCheckouts);
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
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('before-quit', (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;
  void (async () => {
    try { await terminalManager?.closeAll(); }
    finally {
      shutdownComplete = true;
      app.quit();
    }
  })();
});
