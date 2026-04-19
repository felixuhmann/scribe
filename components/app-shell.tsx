'use client';

import type { CSSProperties } from 'react';
import { useCallback, useRef, useState } from 'react';

import { AppSidebar } from '@/components/app-sidebar';
import { ScribeEditor } from '@/components/scribe-editor';
import { ScribeEditorChrome } from '@/components/scribe-editor/editor-chrome';
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

/** Minimum sidebar width when open; drag cannot go narrower (use collapse to hide). */
export const SIDEBAR_MIN_WIDTH_PX = 280;

const DEFAULT_SIDEBAR_WIDTH_PX = 300;

function DesktopSplit({
  sidebarWidthPx,
  onSidebarWidthPxChange,
}: {
  sidebarWidthPx: number;
  onSidebarWidthPxChange: (px: number) => void;
}) {
  const { open } = useSidebar();
  const handleRef = useRef<HTMLDivElement>(null);

  const onPointerDownHandle = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!open) return;
      event.preventDefault();
      const handle = handleRef.current;
      const pointerId = event.pointerId;
      if (handle) {
        handle.setPointerCapture(pointerId);
      }
      const startX = event.clientX;
      const startW = sidebarWidthPx;

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        const next = Math.max(SIDEBAR_MIN_WIDTH_PX, startW + delta);
        onSidebarWidthPxChange(next);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        document.body.style.removeProperty('user-select');
        if (handle) {
          try {
            handle.releasePointerCapture(pointerId);
          } catch {
            /* ignore */
          }
        }
      };

      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [open, sidebarWidthPx, onSidebarWidthPxChange],
  );

  const visibleWidthPx = open ? sidebarWidthPx : 0;

  return (
    <div className="flex min-h-0 flex-1">
      <div
        aria-hidden={!open}
        className={cn(
          'flex min-h-0 shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-linear',
          !open && 'pointer-events-none',
        )}
        style={{
          width: visibleWidthPx,
          minWidth: open ? SIDEBAR_MIN_WIDTH_PX : 0,
        }}
      >
        <AppSidebar />
      </div>

      <div
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        className={cn(
          'bg-muted/60 hover:bg-muted group relative z-20 w-3 shrink-0 cursor-col-resize touch-none border-l border-border',
          !open && 'pointer-events-none w-0 overflow-hidden border-l-0 opacity-0',
        )}
        onPointerDown={onPointerDownHandle}
        ref={handleRef}
        role="separator"
        tabIndex={open ? 0 : -1}
      >
        <span
          aria-hidden
          className="bg-border pointer-events-none absolute inset-y-8 left-1/2 w-1 -translate-x-1/2 rounded-full opacity-70 shadow-sm group-hover:bg-sidebar-border group-hover:opacity-100"
        />
      </div>

      <SidebarInset className="flex min-h-0 min-w-[12rem] flex-1 flex-col overflow-hidden">
        <ScribeEditor />
      </SidebarInset>
    </div>
  );
}

export function AppShell() {
  const [sidebarWidthPx, setSidebarWidthPx] = useState(DEFAULT_SIDEBAR_WIDTH_PX);

  return (
    <SidebarProvider
      className="flex h-full min-h-0 w-full flex-col"
      style={{ '--sidebar-width': `${sidebarWidthPx}px` } as CSSProperties}
    >
      <ScribeEditorChrome />
      <DesktopSplit sidebarWidthPx={sidebarWidthPx} onSidebarWidthPxChange={setSidebarWidthPx} />
    </SidebarProvider>
  );
}
