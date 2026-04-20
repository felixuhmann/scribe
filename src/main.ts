import { app, BrowserWindow, Menu } from 'electron';
import { config } from 'dotenv';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { registerSettingsIpc } from './features/settings/settings-ipc';
import { registerFilesIpc } from './features/files/files-ipc';
import { registerDocumentChatIpc } from './features/document-chat/document-chat-ipc-register';
import { registerLlmInlineTasks } from './features/llm-inline-tasks/inline-task-ipc';

config({ path: path.resolve(process.cwd(), '.env') });

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

registerSettingsIpc();
registerFilesIpc();
registerDocumentChatIpc();
registerLlmInlineTasks();

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

app.on('ready', () => {
  // Electron’s default File/Edit/View menu (Windows/Linux). We use an in-app menubar instead.
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
