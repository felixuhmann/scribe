import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { config } from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { runAutocomplete } from './autocomplete-agent';
import { runQuickEditSelection } from './quick-edit-selection-agent';
import type {
  DocumentChatBundle,
  DocumentChatSessionMergePatch,
  ExplorerFolderEntry,
  ExportPdfResult,
  ListExplorerFolderResult,
  OpenDocumentResult,
  SaveHtmlAsResult,
  SaveHtmlToPathResult,
  SaveMarkdownAsResult,
  SaveMarkdownToPathResult,
  ScribeSetSettingsInput,
} from './scribe-ipc-types';
import {
  applySettingsPatch,
  getPublicSettings,
  readStoredSettings,
  resolveOpenAiApiKey,
} from './settings-store';
import {
  getDocumentChatBundle,
  mergeDocumentChatSession,
  saveDocumentChatBundle,
} from './document-chat-sessions-store';
import { abortDocumentChatSession, runDocumentChatSession } from './document-chat-ipc';

config({ path: path.resolve(process.cwd(), '.env') });

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let autocompleteAbort: AbortController | null = null;
let quickEditAbort: AbortController | null = null;

ipcMain.handle('scribe:getSettings', async () => {
  const stored = await readStoredSettings();
  return getPublicSettings(stored);
});

ipcMain.handle('scribe:setSettings', async (_event, patch: ScribeSetSettingsInput) => {
  const current = await readStoredSettings();
  const next = await applySettingsPatch(current, patch);
  return getPublicSettings(next);
});

ipcMain.handle('scribe:getDocumentChatBundle', async (_event, documentKey: string) => {
  return getDocumentChatBundle(documentKey);
});

ipcMain.handle(
  'scribe:saveDocumentChatBundle',
  async (_event, payload: { documentKey: string; bundle: DocumentChatBundle }) => {
    await saveDocumentChatBundle(payload.documentKey, payload.bundle);
  },
);

ipcMain.handle(
  'scribe:mergeDocumentChatSession',
  async (
    _event,
    payload: { documentKey: string; sessionId: string; patch: DocumentChatSessionMergePatch },
  ) => {
    await mergeDocumentChatSession(payload.documentKey, payload.sessionId, payload.patch);
  },
);

function wrapHtmlDocument(innerBodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Document</title></head><body>${innerBodyHtml}</body></html>`;
}

function inferOpenFormat(filePath: string): 'html' | 'markdown' {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'markdown';
  }
  return 'html';
}

async function readOpenableDocumentFromResolvedPath(resolvedFilePath: string): Promise<OpenDocumentResult> {
  try {
    const text = await fs.readFile(resolvedFilePath, 'utf8');
    const name = path.basename(resolvedFilePath);
    const format = inferOpenFormat(resolvedFilePath);
    return { ok: true, path: resolvedFilePath, name, text, format };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not read file';
    return { ok: false, error: message };
  }
}

const EXPLORER_SKIP_DIRS = new Set(['node_modules', '.git']);

function isSupportedExplorerFile(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.html') ||
    lower.endsWith('.htm') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.markdown')
  );
}

async function listExplorerFolderEntries(absRoot: string): Promise<ExplorerFolderEntry[]> {
  let dirents;
  try {
    dirents = await fs.readdir(absRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: ExplorerFolderEntry[] = [];
  const sorted = dirents.sort((a, b) => a.name.localeCompare(b.name));
  for (const d of sorted) {
    if (d.name.startsWith('.')) continue;
    const full = path.join(absRoot, d.name);
    if (d.isDirectory()) {
      if (EXPLORER_SKIP_DIRS.has(d.name)) continue;
      const children = await listExplorerFolderEntries(full);
      if (children.length > 0) {
        out.push({ kind: 'dir', name: d.name, path: full, children });
      }
    } else if (d.isFile() && isSupportedExplorerFile(d.name)) {
      out.push({ kind: 'file', name: d.name, path: full });
    }
  }
  return out;
}

function wrapHtmlForPdf(innerBodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Document</title><style>
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:11pt;line-height:1.55;color:#111;max-width:720px;margin:24px auto;padding:0 16px;}
h1{font-size:1.75em;margin:0.6em 0 0.35em;font-weight:600;}
h2{font-size:1.4em;margin:0.8em 0 0.35em;font-weight:600;}
h3{font-size:1.15em;margin:0.8em 0 0.35em;font-weight:600;}
p{margin:0.5em 0;}
pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:0.92em;}
pre{background:#f4f4f5;padding:12px;border-radius:6px;overflow:auto;}
blockquote{border-left:3px solid #ccc;margin:1em 0;padding-left:1em;color:#444;}
hr{border:none;border-top:1px solid #ddd;margin:1.5em 0;}
a{color:#2563eb;}
ul,ol{padding-left:1.5em;}
table{border-collapse:collapse;width:100%;margin:1em 0;}
th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;}
</style></head><body>${innerBodyHtml}</body></html>`;
}

async function loadDataUrl(win: BrowserWindow, html: string): Promise<void> {
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await new Promise<void>((resolve, reject) => {
    win.webContents.once('did-fail-load', (_e, _code, desc) => {
      reject(new Error(desc || 'Failed to load document for PDF'));
    });
    win.webContents.once('did-finish-load', () => {
      resolve();
    });
    void win.loadURL(dataUrl);
  });
}

ipcMain.handle('scribe:openDocument', async (event): Promise<OpenDocumentResult> => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const openOpts = {
    properties: ['openFile' as const],
    filters: [
      {
        name: 'Documents',
        extensions: ['html', 'htm', 'txt', 'md', 'markdown'],
      },
    ],
  };
  const { canceled, filePaths } = await (win
    ? dialog.showOpenDialog(win, openOpts)
    : dialog.showOpenDialog(openOpts));
  if (canceled || !filePaths[0]) {
    return { ok: false, cancelled: true };
  }
  const filePath = path.resolve(filePaths[0]);
  return readOpenableDocumentFromResolvedPath(filePath);
});

ipcMain.handle(
  'scribe:openDocumentAtPath',
  async (_event, payload: { path: string }): Promise<OpenDocumentResult> => {
    const filePath = path.resolve(payload.path);
    try {
      const st = await fs.stat(filePath);
      if (!st.isFile()) {
        return { ok: false, error: 'Not a file' };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read file';
      return { ok: false, error: message };
    }
    return readOpenableDocumentFromResolvedPath(filePath);
  },
);

ipcMain.handle(
  'scribe:listExplorerFolder',
  async (_event, payload: { rootPath: string }): Promise<ListExplorerFolderResult> => {
    const rootPath = path.resolve(payload.rootPath);
    try {
      const st = await fs.stat(rootPath);
      if (!st.isDirectory()) {
        return { ok: false, error: 'Not a directory' };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Folder not found';
      return { ok: false, error: message };
    }
    try {
      const entries = await listExplorerFolderEntries(rootPath);
      return { ok: true, rootPath, entries };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read folder';
      return { ok: false, error: message };
    }
  },
);

ipcMain.handle(
  'scribe:saveHtmlToPath',
  async (_event, payload: { path: string; htmlBody: string }): Promise<SaveHtmlToPathResult> => {
    try {
      await fs.writeFile(payload.path, wrapHtmlDocument(payload.htmlBody), 'utf8');
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      return { ok: false, error: message };
    }
  },
);

ipcMain.handle(
  'scribe:saveHtmlAs',
  async (event, payload: { htmlBody: string; defaultPath?: string }): Promise<SaveHtmlAsResult> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const saveOpts = {
      defaultPath: payload.defaultPath,
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
    };
    const { canceled, filePath } = await (win
      ? dialog.showSaveDialog(win, saveOpts)
      : dialog.showSaveDialog(saveOpts));
    if (canceled || !filePath) {
      return { ok: false, cancelled: true };
    }
    const outPath = path.resolve(filePath);
    try {
      await fs.writeFile(outPath, wrapHtmlDocument(payload.htmlBody), 'utf8');
      return { ok: true, path: outPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      return { ok: false, error: message };
    }
  },
);

ipcMain.handle(
  'scribe:saveMarkdownToPath',
  async (_event, payload: { path: string; markdown: string }): Promise<SaveMarkdownToPathResult> => {
    try {
      await fs.writeFile(payload.path, payload.markdown, 'utf8');
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      return { ok: false, error: message };
    }
  },
);

ipcMain.handle(
  'scribe:saveMarkdownAs',
  async (event, payload: { markdown: string; defaultPath?: string }): Promise<SaveMarkdownAsResult> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const mdSaveOpts = {
      defaultPath: payload.defaultPath,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    };
    const { canceled, filePath } = await (win
      ? dialog.showSaveDialog(win, mdSaveOpts)
      : dialog.showSaveDialog(mdSaveOpts));
    if (canceled || !filePath) {
      return { ok: false, cancelled: true };
    }
    const outPath = path.resolve(filePath);
    try {
      await fs.writeFile(outPath, payload.markdown, 'utf8');
      return { ok: true, path: outPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      return { ok: false, error: message };
    }
  },
);

ipcMain.handle(
  'scribe:exportPdf',
  async (event, payload: { htmlBody: string; defaultPath?: string }): Promise<ExportPdfResult> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    let defaultPath = payload.defaultPath;
    if (defaultPath) {
      const dir = path.dirname(defaultPath);
      const base = path.basename(defaultPath, path.extname(defaultPath));
      defaultPath = path.join(dir, `${base}.pdf`);
    } else {
      defaultPath = 'document.pdf';
    }
    const pdfSaveOpts = {
      defaultPath,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    };
    const { canceled, filePath } = await (win
      ? dialog.showSaveDialog(win, pdfSaveOpts)
      : dialog.showSaveDialog(pdfSaveOpts));
    if (canceled || !filePath) {
      return { ok: false, cancelled: true };
    }
    const outPath = path.resolve(filePath);
    const hidden = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
      },
    });
    try {
      await loadDataUrl(hidden, wrapHtmlForPdf(payload.htmlBody));
      const pdfBuffer = await hidden.webContents.printToPDF({
        printBackground: true,
        margins: { marginType: 'default' },
      });
      await fs.writeFile(outPath, pdfBuffer);
      return { ok: true, path: outPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF export failed';
      return { ok: false, error: message };
    } finally {
      hidden.destroy();
    }
  },
);

ipcMain.on(
  'scribe:documentChat:start',
  (
    event,
    payload: {
      id: string;
      messages: unknown[];
      documentHtml: string;
      documentChangeSummary?: string;
      chatMode?: 'edit' | 'plan';
      planRefinementRounds?: number;
      planDepthMode?: 'fixed' | 'auto';
    },
  ) => {
    void runDocumentChatSession({
      webContents: event.sender,
      requestId: payload.id,
      messages: payload.messages,
      documentHtml: payload.documentHtml,
      documentChangeSummary: payload.documentChangeSummary,
      chatMode: payload.chatMode,
      planRefinementRounds: payload.planRefinementRounds,
      planDepthMode: payload.planDepthMode,
    });
  },
);

ipcMain.on('scribe:documentChat:abort', (_event, payload: { id: string }) => {
  abortDocumentChatSession(payload.id);
});

ipcMain.handle(
  'scribe:quickEditSelection',
  async (_event, payload: { selectedText: string; instruction: string }) => {
    quickEditAbort?.abort();
    quickEditAbort = new AbortController();
    const { signal } = quickEditAbort;
    const stored = await readStoredSettings();
    const apiKey = resolveOpenAiApiKey(stored);
    if (!apiKey) {
      return {
        ok: false as const,
        error:
          'No OpenAI API key found. Add OPENAI_API_KEY to a .env file, or set a key in Settings.',
      };
    }
    const trimmedInstruction = payload.instruction.trim();
    if (!trimmedInstruction) {
      return { ok: false as const, error: 'Describe what you want to change.' };
    }
    const selectedText = payload.selectedText;
    if (!selectedText.trim()) {
      return { ok: false as const, error: 'Select some text to edit.' };
    }
    const maxOutputTokens = Math.min(
      4096,
      Math.max(256, stored.autocompleteMaxOutputTokens * 8),
    );
    try {
      const text = await runQuickEditSelection(
        apiKey,
        { selectedText, instruction: trimmedInstruction },
        {
          model: stored.model,
          maxOutputTokens,
        },
        signal,
      );
      if (signal.aborted) {
        return { ok: false as const, cancelled: true as const };
      }
      return { ok: true as const, text };
    } catch (err) {
      if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        return { ok: false as const, cancelled: true as const };
      }
      const message = err instanceof Error ? err.message : 'Quick edit failed';
      return { ok: false as const, error: message };
    }
  },
);

ipcMain.handle(
  'scribe:autocomplete',
  async (_event, payload: { before: string; after: string }) => {
    autocompleteAbort?.abort();
    autocompleteAbort = new AbortController();
    const { signal } = autocompleteAbort;
    const stored = await readStoredSettings();
    const apiKey = resolveOpenAiApiKey(stored);
    if (!apiKey) {
      return {
        ok: false as const,
        error:
          'No OpenAI API key found. Add OPENAI_API_KEY to a .env file, or set a key in Settings.',
      };
    }
    if (!stored.autocompleteEnabled) {
      return { ok: false as const, error: 'Autocomplete is turned off in Settings.' };
    }
    try {
      const text = await runAutocomplete(
        apiKey,
        payload,
        {
          model: stored.model,
          temperature: stored.autocompleteTemperature,
          maxOutputTokens: stored.autocompleteMaxOutputTokens,
        },
        signal,
      );
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
    width: 1920,
    height: 1080,
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
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  // Electron’s default File/Edit/View menu (Windows/Linux). We use an in-app menubar instead.
  Menu.setApplicationMenu(null);
  createWindow();
});

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
