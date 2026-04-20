import { BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { ExportPdfResult } from '../../scribe-ipc-types';

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

/**
 * Render an HTML body to a PDF file. Uses a hidden BrowserWindow to run
 * Chromium's print pipeline off-screen, then writes the bytes to disk.
 */
export async function exportHtmlBodyToPdf(options: {
  htmlBody: string;
  defaultPath?: string;
  parentWindow: BrowserWindow | null;
}): Promise<ExportPdfResult> {
  const { htmlBody, parentWindow } = options;
  let defaultPath = options.defaultPath;
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
  const { canceled, filePath } = await (parentWindow
    ? dialog.showSaveDialog(parentWindow, pdfSaveOpts)
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
    await loadDataUrl(hidden, wrapHtmlForPdf(htmlBody));
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
}
