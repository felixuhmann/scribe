import { BrowserWindow, dialog, shell, type WebContents } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

import { channels } from '../../ipc/channels';
import { registerInvoke, registerOn, sendEvent } from '../../ipc/main-register';
import type {
  CreateFileInFolderResult,
  CreateFolderInFolderResult,
  ExplorerFolderEntry,
  ListExplorerFolderResult,
  OpenDocumentResult,
  RenameFileResult,
  RevealInOSResult,
  SaveHtmlAsResult,
  SaveHtmlToPathResult,
  SaveMarkdownAsResult,
  SaveMarkdownToPathResult,
  TrashItemResult,
} from '../../scribe-ipc-types';
import { exportHtmlBodyToPdf } from './pdf-export';
import { createExplorerWatcherRegistry } from './files-watcher';

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

async function readOpenableDocumentFromResolvedPath(
  resolvedFilePath: string,
): Promise<OpenDocumentResult> {
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
  const sorted = dirents.sort((a, b) => {
    const ad = a.isDirectory() ? 0 : 1;
    const bd = b.isDirectory() ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
  const out: ExplorerFolderEntry[] = [];
  for (const d of sorted) {
    if (d.name.startsWith('.')) continue;
    const full = path.join(absRoot, d.name);
    if (d.isDirectory()) {
      if (EXPLORER_SKIP_DIRS.has(d.name)) continue;
      const children = await listExplorerFolderEntries(full);
      if (children.length === 0) continue;
      let mtimeMs = 0;
      try {
        const st = await fs.stat(full);
        mtimeMs = st.mtimeMs;
      } catch {
        /* ignore */
      }
      out.push({ kind: 'dir', name: d.name, path: full, mtimeMs, children });
    } else if (d.isFile() && isSupportedExplorerFile(d.name)) {
      let mtimeMs = 0;
      let sizeBytes = 0;
      try {
        const st = await fs.stat(full);
        mtimeMs = st.mtimeMs;
        sizeBytes = st.size;
      } catch {
        /* ignore */
      }
      out.push({ kind: 'file', name: d.name, path: full, mtimeMs, sizeBytes });
    }
  }
  return out;
}

const EXPLORER_NAME_INVALID = /[\\/]/;

function validateExplorerBasename(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '..') {
    return 'Invalid filename';
  }
  if (EXPLORER_NAME_INVALID.test(trimmed)) {
    return 'Invalid filename';
  }
  return null;
}

async function pathExists(abs: string): Promise<boolean> {
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

const explorerWatchers = createExplorerWatcherRegistry();

export function registerFilesIpc(): void {
  registerInvoke(channels.openDocument, async (_req, event): Promise<OpenDocumentResult> => {
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

  registerInvoke(channels.openDocumentAtPath, async (payload): Promise<OpenDocumentResult> => {
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
  });

  registerInvoke(channels.listExplorerFolder, async (payload): Promise<ListExplorerFolderResult> => {
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
  });

  registerInvoke(channels.saveHtmlToPath, async (payload): Promise<SaveHtmlToPathResult> => {
    try {
      await fs.writeFile(payload.path, wrapHtmlDocument(payload.htmlBody), 'utf8');
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      return { ok: false, error: message };
    }
  });

  registerInvoke(channels.saveHtmlAs, async (payload, event): Promise<SaveHtmlAsResult> => {
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
  });

  registerInvoke(channels.saveMarkdownToPath, async (payload): Promise<SaveMarkdownToPathResult> => {
    try {
      await fs.writeFile(payload.path, payload.markdown, 'utf8');
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      return { ok: false, error: message };
    }
  });

  registerInvoke(channels.saveMarkdownAs, async (payload, event): Promise<SaveMarkdownAsResult> => {
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
  });

  registerInvoke(channels.exportPdf, async (payload, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return exportHtmlBodyToPdf({
      htmlBody: payload.htmlBody,
      defaultPath: payload.defaultPath,
      parentWindow: win,
    });
  });

  registerInvoke(channels.revealInOS, async (payload): Promise<RevealInOSResult> => {
    const target = path.resolve(payload.path);
    try {
      await fs.access(target);
    } catch {
      return { ok: false, error: 'Path does not exist' };
    }
    try {
      shell.showItemInFolder(target);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reveal failed';
      return { ok: false, error: message };
    }
  });

  registerInvoke(
    channels.createFileInFolder,
    async (payload): Promise<CreateFileInFolderResult> => {
      const parentDir = path.resolve(payload.parentDir);
      const nameError = validateExplorerBasename(payload.name);
      if (nameError) return { ok: false, error: nameError };
      const finalName = payload.name.trim();
      const ext = path.extname(finalName);
      const resolvedName = ext === '' ? `${finalName}.md` : finalName;
      try {
        const st = await fs.stat(parentDir);
        if (!st.isDirectory()) return { ok: false, error: 'Parent is not a directory' };
      } catch {
        return { ok: false, error: 'Parent folder not found' };
      }
      const target = path.resolve(path.join(parentDir, resolvedName));
      if (await pathExists(target)) {
        return { ok: false, error: 'A file with that name already exists' };
      }
      try {
        await fs.writeFile(target, '', { encoding: 'utf8', flag: 'wx' });
        return { ok: true, path: target };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Create failed';
        return { ok: false, error: message };
      }
    },
  );

  registerInvoke(
    channels.createFolderInFolder,
    async (payload): Promise<CreateFolderInFolderResult> => {
      const parentDir = path.resolve(payload.parentDir);
      const nameError = validateExplorerBasename(payload.name);
      if (nameError) return { ok: false, error: nameError };
      try {
        const st = await fs.stat(parentDir);
        if (!st.isDirectory()) return { ok: false, error: 'Parent is not a directory' };
      } catch {
        return { ok: false, error: 'Parent folder not found' };
      }
      const target = path.resolve(path.join(parentDir, payload.name.trim()));
      if (await pathExists(target)) {
        return { ok: false, error: 'A folder with that name already exists' };
      }
      try {
        await fs.mkdir(target, { recursive: false });
        return { ok: true, path: target };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Create failed';
        return { ok: false, error: message };
      }
    },
  );

  registerInvoke(channels.trashItem, async (payload): Promise<TrashItemResult> => {
    const target = path.resolve(payload.path);
    try {
      await fs.access(target);
    } catch {
      return { ok: false, error: 'Path does not exist' };
    }
    try {
      await shell.trashItem(target);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not move to Trash';
      return { ok: false, error: message };
    }
  });

  registerOn(channels.explorerWatchStart, (payload, event) => {
    explorerWatchers.start({
      rootPath: path.resolve(payload.rootPath),
      watchId: payload.watchId,
      webContents: event.sender,
      emit: (wc: WebContents) => {
        sendEvent(wc, channels.explorerWatchChanged, { watchId: payload.watchId });
      },
    });
  });

  registerOn(channels.explorerWatchStop, (payload) => {
    explorerWatchers.stop(payload.watchId);
  });

  registerInvoke(channels.renameFile, async (payload): Promise<RenameFileResult> => {
    const src = path.resolve(payload.path);
    const base = payload.newBasename.trim();
    if (base === '' || /[\\/]/.test(base) || base === '.' || base === '..') {
      return { ok: false, error: 'Invalid filename' };
    }
    const dir = path.dirname(src);
    const srcExt = path.extname(src);
    const hasExt = path.extname(base) !== '';
    const finalBase = hasExt ? base : `${base}${srcExt}`;
    const dst = path.resolve(path.join(dir, finalBase));
    if (dst === src) return { ok: true, path: src };
    try {
      try {
        await fs.access(dst);
        return { ok: false, error: 'A file with that name already exists' };
      } catch {
        /* target does not exist — proceed */
      }
      await fs.rename(src, dst);
      return { ok: true, path: dst };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rename failed';
      return { ok: false, error: message };
    }
  });
}
