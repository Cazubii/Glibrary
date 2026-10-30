import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { LibraryStore } from './services/library-store';
import { registerRepoIpc } from './ipc/repos.ipc';

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

  registerRepoIpc(store);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
