import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'scribe.canvasPrefs';

export type CanvasPreferences = {
  focusMode: boolean;
  typewriterMode: boolean;
  paperMode: boolean;
  zoom: number;
};

const DEFAULT_PREFS: CanvasPreferences = {
  focusMode: false,
  typewriterMode: false,
  paperMode: false,
  zoom: 1,
};

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.4;
const ZOOM_STEP = 0.1;

function readStored(): CanvasPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<CanvasPreferences>;
    return {
      focusMode: Boolean(parsed.focusMode),
      typewriterMode: Boolean(parsed.typewriterMode),
      paperMode: Boolean(parsed.paperMode),
      zoom: typeof parsed.zoom === 'number' ? clampZoom(parsed.zoom) : 1,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
}

export type CanvasPreferencesApi = CanvasPreferences & {
  toggleFocusMode: () => void;
  toggleTypewriterMode: () => void;
  togglePaperMode: () => void;
  setZoom: (z: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
};

export function useEditorCanvasPreferences(): CanvasPreferencesApi {
  const [prefs, setPrefs] = useState<CanvasPreferences>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  const toggleFocusMode = useCallback(
    () => setPrefs((p) => ({ ...p, focusMode: !p.focusMode })),
    [],
  );
  const toggleTypewriterMode = useCallback(
    () => setPrefs((p) => ({ ...p, typewriterMode: !p.typewriterMode })),
    [],
  );
  const togglePaperMode = useCallback(
    () => setPrefs((p) => ({ ...p, paperMode: !p.paperMode })),
    [],
  );
  const setZoom = useCallback(
    (z: number) => setPrefs((p) => ({ ...p, zoom: clampZoom(z) })),
    [],
  );
  const zoomIn = useCallback(
    () => setPrefs((p) => ({ ...p, zoom: clampZoom(p.zoom + ZOOM_STEP) })),
    [],
  );
  const zoomOut = useCallback(
    () => setPrefs((p) => ({ ...p, zoom: clampZoom(p.zoom - ZOOM_STEP) })),
    [],
  );
  const resetZoom = useCallback(() => setPrefs((p) => ({ ...p, zoom: 1 })), []);

  return {
    ...prefs,
    toggleFocusMode,
    toggleTypewriterMode,
    togglePaperMode,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
  };
}
