import { watch as chokidarWatch, type FSWatcher } from 'chokidar';
import type { WebContents } from 'electron';

type StartArgs = {
  rootPath: string;
  watchId: string;
  webContents: WebContents;
  emit: (webContents: WebContents) => void;
};

type Entry = {
  watcher: FSWatcher;
  webContents: WebContents;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  destroyed: boolean;
};

const DEBOUNCE_MS = 150;

/**
 * Keeps a small registry of chokidar watchers keyed by `watchId` (per renderer
 * subscription). On any disk change inside `rootPath`, we emit a single
 * coalesced "changed" event to the owning webContents and let the renderer
 * re-fetch via listExplorerFolder.
 */
export function createExplorerWatcherRegistry(): {
  start: (args: StartArgs) => void;
  stop: (watchId: string) => void;
} {
  const watchers = new Map<string, Entry>();

  const scheduleEmit = (watchId: string, emit: (wc: WebContents) => void) => {
    const entry = watchers.get(watchId);
    if (!entry || entry.destroyed) return;
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.debounceTimer = setTimeout(() => {
      const current = watchers.get(watchId);
      if (!current || current.destroyed) return;
      if (current.webContents.isDestroyed()) {
        teardown(watchId);
        return;
      }
      try {
        emit(current.webContents);
      } catch {
        /* ignore - renderer may have torn down */
      }
    }, DEBOUNCE_MS);
  };

  const teardown = (watchId: string) => {
    const entry = watchers.get(watchId);
    if (!entry) return;
    entry.destroyed = true;
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
      entry.debounceTimer = null;
    }
    void entry.watcher.close().catch(() => {
      /* ignore */
    });
    watchers.delete(watchId);
  };

  return {
    start({ rootPath, watchId, webContents, emit }) {
      if (watchers.has(watchId)) {
        teardown(watchId);
      }
      const watcher = chokidarWatch(rootPath, {
        ignoreInitial: true,
        ignored: (p: string) => {
          const segs = p.split(/[\\/]+/);
          return segs.some((seg) => {
            if (seg === '') return false;
            if (seg === 'node_modules') return true;
            if (seg === '.git') return true;
            if (seg.startsWith('.') && seg !== '.' && seg !== '..' && seg.length > 1) {
              return true;
            }
            return false;
          });
        },
        persistent: true,
        awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 50 },
      });
      const entry: Entry = {
        watcher,
        webContents,
        debounceTimer: null,
        destroyed: false,
      };
      watchers.set(watchId, entry);
      const onAny = () => scheduleEmit(watchId, emit);
      watcher.on('add', onAny);
      watcher.on('addDir', onAny);
      watcher.on('unlink', onAny);
      watcher.on('unlinkDir', onAny);
      watcher.on('change', onAny);
      watcher.on('error', () => {
        /* swallow - transient fs errors shouldn't crash the watcher */
      });
      webContents.once('destroyed', () => teardown(watchId));
    },
    stop(watchId) {
      teardown(watchId);
    },
  };
}
