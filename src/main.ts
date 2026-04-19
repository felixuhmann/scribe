import { app, BrowserWindow, ipcMain } from 'electron';
import { config } from 'dotenv';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { runAutocomplete } from './autocomplete-agent';

config({ path: path.resolve(process.cwd(), '.env') });

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let autocompleteAbort: AbortController | null = null;

ipcMain.handle(
  'scribe:autocomplete',
  async (_event, payload: { before: string; after: string }) => {
    autocompleteAbort?.abort();
    autocompleteAbort = new AbortController();
    const { signal } = autocompleteAbort;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        ok: false as const,
        error: 'Missing OPENAI_API_KEY. Add it to a .env file at the project root.',
      };
    }
    try {
      const text = await runAutocomplete(apiKey, payload, signal);
      if (signal.aborted) {
        return { ok: false as const, cancelled: true as const };
      }
      return { ok: true as const, text };
    } catch (err) {
      if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        return { ok: false as const, cancelled: true as const };
      }
      const message = err instanceof Error ? err.message : 'Autocomplete failed';
      return { ok: false as const, error: message };
    }
  },
);

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
