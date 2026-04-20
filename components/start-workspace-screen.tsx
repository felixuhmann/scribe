import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { useDocumentWorkspace } from '@/components/document-workspace-context';
import { Button } from '@/components/ui/button';
import {
  basenameDiskPath,
  readRecentDiskPaths,
  removeRecentDiskPath,
  subscribeRecentDiskPaths,
} from '@/components/document-workspace/recent-disk-files';
import {
  localFileToEditorHtml,
  openDocumentResultToEditorHtml,
} from '@/lib/markdown/markdown-io';

export function StartWorkspaceScreen() {
  const { notifyOpenedFromDisk, notifyOpenedLocalFile } = useDocumentWorkspace();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recentPaths, setRecentPaths] = useState(readRecentDiskPaths);
  const [openingPath, setOpeningPath] = useState<string | null>(null);

  useEffect(() => {
    setRecentPaths(readRecentDiskPaths());
    return subscribeRecentDiskPaths(() => setRecentPaths(readRecentDiskPaths()));
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onOpenClick = useCallback(async () => {
    const api = window.scribe?.openDocument;
    if (api) {
      const result = await api();
      if (!result.ok) return;
      notifyOpenedFromDisk(result.path, openDocumentResultToEditorHtml(result));
      return;
    }
    openFilePicker();
  }, [notifyOpenedFromDisk, openFilePicker]);

  const onFileChosen = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      void file.text().then((text) => {
        notifyOpenedLocalFile(file, localFileToEditorHtml(file.name, text));
      });
    },
    [notifyOpenedLocalFile],
  );

  const canReopenByPath = typeof window.scribe?.openDocumentAtPath === 'function';

  const onRecentClick = useCallback(
    async (absolutePath: string) => {
      const api = window.scribe?.openDocumentAtPath;
      if (!api) return;
      setOpeningPath(absolutePath);
      try {
        const result = await api(absolutePath);
        if (!result.ok) {
          removeRecentDiskPath(absolutePath);
          return;
        }
        notifyOpenedFromDisk(result.path, openDocumentResultToEditorHtml(result));
      } finally {
        setOpeningPath(null);
      }
    },
    [notifyOpenedFromDisk],
  );

  return (
    <div className="bg-background flex h-full min-h-0 w-full flex-col items-center justify-center gap-8 px-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".html,.htm,.txt,.md,.markdown,text/html,text/markdown"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={onFileChosen}
      />
      <p className="text-muted-foreground max-w-sm text-center text-sm leading-relaxed">
        Open a document to get started.
      </p>
      <Button type="button" size="lg" onClick={() => void onOpenClick()}>
        Open document…
      </Button>

      {canReopenByPath && recentPaths.length > 0 ? (
        <div className="flex max-w-md flex-col gap-2">
          <p className="text-muted-foreground text-center text-xs font-medium tracking-wide uppercase">
            Recent
          </p>
          <ul className="border-border flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-md border bg-card/40 p-1">
            {recentPaths.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  disabled={openingPath !== null}
                  title={path}
                  className="hover:bg-muted/80 focus-visible:ring-ring text-foreground disabled:text-muted-foreground w-full truncate rounded-sm px-2.5 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none"
                  onClick={() => void onRecentClick(path)}
                >
                  {openingPath === path ? 'Opening…' : basenameDiskPath(path)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
