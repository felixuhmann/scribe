import { BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

import { channels } from '../../ipc/channels';
import { registerInvoke } from '../../ipc/main-register';
import type {
  ExplorerFolderEntry,
  ListExplorerFolderResult,
  OpenDocumentResult,
  RenameFileResult,
  SaveHtmlAsResult,
  SaveHtmlToPathResult,
  SaveMarkdownAsResult,
  SaveMarkdownToPathResult,
} from '../../scribe-ipc-types';
import { exportHtmlBodyToPdf } from './pdf-export';

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
