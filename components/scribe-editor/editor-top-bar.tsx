import type { Editor } from '@tiptap/core';
import {
  FileDown,
  FileText,
  FolderOpen,
  FilePlus2,
  Focus,
  Keyboard,
  MoreHorizontal,
  PanelRightOpen,
  Save,
  Settings,
  SlidersHorizontal,
  Crosshair,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Palette,
  Search,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { DocumentTitle } from './document-title';
import { SaveStatus } from './save-status';
import type { SaveStatusSnapshot } from './use-autosave';
import type { CanvasPreferencesApi } from './use-editor-canvas-preferences';

export type EditorTopBarProps = {
  editor: Editor | null;
  mod: string;
  saveStatus: SaveStatusSnapshot;
  isFormattingToolbarOpen: boolean;
  onToggleFormattingToolbar: () => void;
  onOpenCommandPalette: () => void;
  canvas: CanvasPreferencesApi;
  onNewDocument: () => void;
  onOpenFile: () => void;
  onSaveDocument: () => void;
  onSaveHtmlAs: () => void;
  onSaveMarkdownAs: () => void;
  onExportPdf: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
};

export function EditorTopBar({
  editor,
  mod,
  saveStatus,
  isFormattingToolbarOpen,
  onToggleFormattingToolbar,
  onOpenCommandPalette,
  canvas,
  onNewDocument,
  onOpenFile,
  onSaveDocument,
  onSaveHtmlAs,
  onSaveMarkdownAs,
  onExportPdf,
  onOpenSettings,
  onOpenShortcuts,
}: EditorTopBarProps) {
  const zoomPct = Math.round(canvas.zoom * 100);

  return (
    <div
      className="border-border bg-background/85 supports-[backdrop-filter]:bg-background/70 flex h-11 shrink-0 items-center gap-2 border-b px-2 backdrop-blur-md"
      role="toolbar"
      aria-label="Document header"
    >
      <SidebarTrigger className="-ml-0.5 size-8" />
      <Separator orientation="vertical" className="hidden h-5 sm:block" decorative />

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <DocumentTitle />
        <SaveStatus status={saveStatus} />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={canvas.focusMode ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5 px-2 text-muted-foreground data-[state=pressed]:text-foreground"
              aria-pressed={canvas.focusMode}
              onClick={canvas.toggleFocusMode}
            >
              <Focus className="size-4" aria-hidden />
              <span className="hidden sm:inline">Focus</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Focus mode — dim everything except the current block</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isFormattingToolbarOpen ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5 px-2 text-muted-foreground"
              aria-pressed={isFormattingToolbarOpen}
              onClick={onToggleFormattingToolbar}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              <span className="hidden sm:inline">Format</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle the formatting ribbon</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2 px-2 text-muted-foreground hover:text-foreground"
              onClick={onOpenCommandPalette}
              aria-label="Open command palette"
            >
              <Search className="size-4" aria-hidden />
              <span className="hidden min-w-24 text-left sm:inline">Commands…</span>
              <kbd className="border-border bg-muted/60 text-muted-foreground hidden rounded border px-1 py-0.5 text-[10px] font-medium sm:inline">
                {mod}K
              </kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Command palette ({mod}K)</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-8 px-0 text-muted-foreground"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>File, view &amp; settings</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>File</DropdownMenuLabel>
            <DropdownMenuItem disabled={!editor} onSelect={() => onNewDocument()}>
              <FilePlus2 />
              New
              <DropdownMenuShortcut>{mod}N</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!editor} onSelect={() => onOpenFile()}>
              <FolderOpen />
              Open…
              <DropdownMenuShortcut>{mod}O</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!editor} onSelect={() => onSaveDocument()}>
              <Save />
              Save
              <DropdownMenuShortcut>{mod}S</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!editor} onSelect={() => onSaveHtmlAs()}>
              <FileText />
              Save as HTML…
              <DropdownMenuShortcut>{mod}⇧S</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!editor} onSelect={() => onSaveMarkdownAs()}>
              <FileText />
              Save as Markdown…
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!editor} onSelect={() => onExportPdf()}>
              <FileDown />
              Export as PDF…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>View</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => onToggleFormattingToolbar()}>
              <PanelRightOpen />
              {isFormattingToolbarOpen ? 'Hide formatting ribbon' : 'Show formatting ribbon'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => canvas.toggleFocusMode()}>
              <Focus />
              {canvas.focusMode ? 'Exit focus mode' : 'Enter focus mode'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => canvas.toggleTypewriterMode()}>
              <Crosshair />
              {canvas.typewriterMode ? 'Disable typewriter scroll' : 'Typewriter scroll'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => canvas.togglePaperMode()}>
              <Palette />
              {canvas.paperMode ? 'Switch to canvas view' : 'Paper preview'}
            </DropdownMenuItem>
            <div className="flex items-center justify-between px-2 py-1.5 text-sm">
              <span className="text-muted-foreground">Zoom</span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-7 p-0"
                  onClick={(e) => {
                    e.preventDefault();
                    canvas.zoomOut();
                  }}
                  aria-label="Zoom out"
                >
                  <ZoomOut className="size-3.5" />
                </Button>
                <button
                  type="button"
                  className={cn(
                    'min-w-[3.5rem] rounded-md border border-transparent px-2 py-1 text-xs tabular-nums hover:border-border',
                    Math.abs(canvas.zoom - 1) < 0.01 && 'text-muted-foreground',
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    canvas.resetZoom();
                  }}
                  aria-label="Reset zoom"
                  title="Reset zoom"
                >
                  <span className="inline-flex items-center gap-1">
                    <RotateCcw className="size-3" />
                    {zoomPct}%
                  </span>
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-7 p-0"
                  onClick={(e) => {
                    e.preventDefault();
                    canvas.zoomIn();
                  }}
                  aria-label="Zoom in"
                >
                  <ZoomIn className="size-3.5" />
                </Button>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onOpenShortcuts()}>
              <Keyboard />
              Keyboard shortcuts…
              <DropdownMenuShortcut>?</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpenSettings()}>
              <Settings />
              Settings…
              <DropdownMenuShortcut>{mod},</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
