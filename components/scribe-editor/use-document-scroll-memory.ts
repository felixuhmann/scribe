import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Remembers, per document, where the canvas was scrolled and restores it when the
 * document is opened again. Switching files in the explorer therefore lands the reader
 * where they left off instead of jumping to the top/bottom of the freshly loaded content.
 */

const STORAGE_KEY = 'scribe.documentScrollPositions';
/** Cap persisted entries so long-lived installs don't grow localStorage unbounded. */
const MAX_ENTRIES = 200;

type PositionMap = Map<string, number>;

/** Shared across editor remounts within a session; seeded lazily from localStorage. */
let memoryCache: PositionMap | null = null;

function loadPositions(): PositionMap {
  if (memoryCache) return memoryCache;
  const map: PositionMap = new Map();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          map.set(key, value);
        }
      }
    }
  } catch {
    /* ignore malformed storage */
  }
  memoryCache = map;
  return map;
}

function persistPositions(map: PositionMap): void {
  try {
    // Map insertion order tracks recency (see remember()); keep the newest entries.
    const entries = [...map.entries()];
    const trimmed = entries.slice(Math.max(0, entries.length - MAX_ENTRIES));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    /* ignore quota / serialization errors */
  }
}

export function useDocumentScrollMemory(
  scrollRef: RefObject<HTMLElement | null>,
  documentKey: string,
): void {
  const positionsRef = useRef<PositionMap>(loadPositions());
  const activeKeyRef = useRef(documentKey);

  const remember = (key: string, top: number) => {
    const map = positionsRef.current;
    // Re-insert so the most-recently-touched key sorts last for trimming.
    map.delete(key);
    map.set(key, top);
  };

  // Continuously track the active document's scroll offset (throttled to one write per frame).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        remember(activeKeyRef.current, el.scrollTop);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
    // remember/positionsRef/activeKeyRef are stable; only the element identity matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef]);

  // Restore the remembered offset once the newly opened document's content is laid out.
  // Content for a document switch is written synchronously before React commits, so a
  // layout effect (declared after the content-bootstrap effect) sees the new DOM height.
  useLayoutEffect(() => {
    activeKeyRef.current = documentKey;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = positionsRef.current.get(documentKey) ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey]);

  // Flush to localStorage when leaving a document, unmounting, or the window goes away.
  useEffect(() => {
    const flush = () => persistPositions(positionsRef.current);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [documentKey]);
}
