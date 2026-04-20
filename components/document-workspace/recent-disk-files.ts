const STORAGE_KEY = 'scribe.recentDiskPaths';
const CHANGE_EVENT = 'scribe-recent-disk-paths';

export const RECENT_DISK_FILES_MAX = 5;

export function basenameDiskPath(absolutePath: string): string {
  const t = absolutePath.trim();
  const base = t.split(/[/\\]/).pop();
  return base && base.trim() !== '' ? base : t;
}

export function readRecentDiskPaths(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      .slice(0, RECENT_DISK_FILES_MAX);
  } catch {
    return [];
  }
}

function writeRecentDiskPaths(paths: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(paths.slice(0, RECENT_DISK_FILES_MAX)));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* ignore */
  }
}

/** Move `absolutePath` to the front; cap list size. */
export function recordRecentDiskPath(absolutePath: string): void {
  const p = absolutePath.trim();
  if (!p) return;
  const prev = readRecentDiskPaths();
  const next = [p, ...prev.filter((x) => x !== p)].slice(0, RECENT_DISK_FILES_MAX);
  writeRecentDiskPaths(next);
}

export function removeRecentDiskPath(absolutePath: string): void {
  const p = absolutePath.trim();
  const prev = readRecentDiskPaths();
  writeRecentDiskPaths(prev.filter((x) => x !== p));
}

export function subscribeRecentDiskPaths(listener: () => void): () => void {
  const on = () => listener();
  window.addEventListener(CHANGE_EVENT, on);
  return () => window.removeEventListener(CHANGE_EVENT, on);
}
