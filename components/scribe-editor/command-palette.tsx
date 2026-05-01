import type { Editor } from '@tiptap/core';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronsUpDown,
  Code2,
  Crosshair,
  FileDown,
  FileText,
  FilePlus2,
  FolderOpen,
  Focus,
  HelpCircle,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image as ImageIcon,
  Italic,
  KeyboardIcon,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Maximize2,
  Minimize2,
  MoonStar,
  Palette,
  PanelRightOpen,
  Quote,
  RotateCw,
  Save,
  Search,
  Settings,
  Sparkles,
  SplitSquareHorizontal,
  Strikethrough,
  Sun,
  Table as TableIcon,
  Type,
  Underline as UnderlineIcon,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CanvasPreferencesApi } from './use-editor-canvas-preferences';

export type CommandPaletteActions = {
  editor: Editor | null;
  mod: string;
  canvas: CanvasPreferencesApi;
  canUndo: boolean;
  canRedo: boolean;
  isFormattingToolbarOpen: boolean;
  onToggleFormattingToolbar: () => void;
  onNewDocument: () => void;
  onOpenFile: () => void;
  onSaveDocument: () => void;
  onSaveHtmlAs: () => void;
  onSaveMarkdownAs: () => void;
  onExportPdf: () => void;
  onOpenLink: () => void;
  onOpenFind: () => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
  onOpenShortcuts?: () => void;
  autocompleteEnabled: boolean;
  onToggleAutocomplete: () => void;
};

export type CommandPaletteProps = CommandPaletteActions & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type PaletteAction = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  keywords?: string[];
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
};

export function CommandPalette({
  editor,
  mod,
  canvas,
  canUndo,
  canRedo,
  isFormattingToolbarOpen,
  onToggleFormattingToolbar,
  onNewDocument,
  onOpenFile,
  onSaveDocument,
  onSaveHtmlAs,
  onSaveMarkdownAs,
  onExportPdf,
  onOpenLink,
  onOpenFind,
  onOpenSettings,
  onToggleTheme,
  onOpenShortcuts,
  autocompleteEnabled,
  onToggleAutocomplete,
  open,
  onOpenChange,
}: CommandPaletteProps) {
  const dismiss = useCallback(() => onOpenChange(false), [onOpenChange]);

  const actions = useMemo<PaletteAction[]>(() => {
    if (!editor) return [];
    const chain = () => editor.chain().focus();
    const list: PaletteAction[] = [
      {
        id: 'file.new',
        group: 'File',
        label: 'New document',
        icon: <FilePlus2 />,
        shortcut: `${mod}N`,
        keywords: ['create', 'blank'],
        run: () => {
          dismiss();
          onNewDocument();
        },
      },
      {
        id: 'file.open',
        group: 'File',
        label: 'Open document…',
        icon: <FolderOpen />,
        shortcut: `${mod}O`,
        keywords: ['browse', 'load'],
        run: () => {
          dismiss();
          onOpenFile();
        },
      },
      {
        id: 'file.save',
        group: 'File',
        label: 'Save',
        icon: <Save />,
        shortcut: `${mod}S`,
        run: () => {
          dismiss();
          onSaveDocument();
        },
      },
      {
        id: 'file.save-html',
        group: 'File',
        label: 'Save as HTML…',
        icon: <FileText />,
        shortcut: `${mod}⇧S`,
        run: () => {
          dismiss();
          onSaveHtmlAs();
        },
      },
      {
        id: 'file.save-md',
        group: 'File',
        label: 'Save as Markdown…',
        icon: <FileText />,
        run: () => {
          dismiss();
          onSaveMarkdownAs();
        },
      },
      {
        id: 'file.export-pdf',
        group: 'File',
        label: 'Export as PDF…',
        icon: <FileDown />,
        run: () => {
          dismiss();
          onExportPdf();
        },
      },

      {
        id: 'insert.h1',
        group: 'Insert',
        label: 'Heading 1',
        icon: <Heading1 />,
        run: () => {
          dismiss();
          chain().setHeading({ level: 1 }).run();
        },
      },
      {
        id: 'insert.h2',
        group: 'Insert',
        label: 'Heading 2',
        icon: <Heading2 />,
        run: () => {
          dismiss();
          chain().setHeading({ level: 2 }).run();
        },
      },
      {
        id: 'insert.h3',
        group: 'Insert',
        label: 'Heading 3',
        icon: <Heading3 />,
        run: () => {
          dismiss();
          chain().setHeading({ level: 3 }).run();
        },
      },
      {
        id: 'insert.p',
        group: 'Insert',
        label: 'Body text',
        icon: <Type />,
        run: () => {
          dismiss();
          chain().setParagraph().run();
        },
      },
      {
        id: 'insert.ul',
        group: 'Insert',
        label: 'Bulleted list',
        icon: <List />,
        run: () => {
          dismiss();
          chain().toggleBulletList().run();
        },
      },
      {
        id: 'insert.ol',
        group: 'Insert',
        label: 'Numbered list',
        icon: <ListOrdered />,
        run: () => {
          dismiss();
          chain().toggleOrderedList().run();
        },
      },
      {
        id: 'insert.task',
        group: 'Insert',
        label: 'Task list',
        icon: <ListTodo />,
        keywords: ['checkbox', 'todo'],
        run: () => {
          dismiss();
          editor.chain().focus().toggleTaskList().run();
        },
      },
      {
        id: 'insert.quote',
        group: 'Insert',
        label: 'Quote',
        icon: <Quote />,
        run: () => {
          dismiss();
          chain().toggleBlockquote().run();
        },
      },
      {
        id: 'insert.code',
        group: 'Insert',
        label: 'Code block',
        icon: <Code2 />,
        run: () => {
          dismiss();
          chain().toggleCodeBlock().run();
        },
      },
      {
        id: 'insert.callout',
        group: 'Insert',
        label: 'Callout',
        icon: <Highlighter />,
        keywords: ['aside', 'note', 'info'],
        run: () => {
          dismiss();
          editor.chain().focus().setCallout('info').run();
        },
      },
      {
        id: 'insert.table',
        group: 'Insert',
        label: 'Table',
        icon: <TableIcon />,
        run: () => {
          dismiss();
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        },
      },
      {
        id: 'insert.image',
        group: 'Insert',
        label: 'Image from URL…',
        icon: <ImageIcon />,
        run: () => {
          dismiss();
          const url = window.prompt('Image URL');
          if (url && url.trim()) {
            editor.chain().focus().setImage({ src: url.trim() }).run();
          }
        },
      },
      {
        id: 'insert.link',
        group: 'Insert',
        label: 'Insert link…',
        icon: <Link2 />,
        shortcut: `${mod}K`,
        run: () => {
          dismiss();
          onOpenLink();
        },
      },
      {
        id: 'insert.hr',
        group: 'Insert',
        label: 'Horizontal line / page break',
        icon: <SplitSquareHorizontal />,
        run: () => {
          dismiss();
          chain().setHorizontalRule().run();
        },
      },

      {
        id: 'format.bold',
        group: 'Format',
        label: 'Toggle bold',
        icon: <Bold />,
        shortcut: `${mod}B`,
        run: () => {
          dismiss();
          chain().toggleBold().run();
        },
      },
      {
        id: 'format.italic',
        group: 'Format',
        label: 'Toggle italic',
        icon: <Italic />,
        shortcut: `${mod}I`,
        run: () => {
          dismiss();
          chain().toggleItalic().run();
        },
      },
      {
        id: 'format.underline',
        group: 'Format',
        label: 'Toggle underline',
        icon: <UnderlineIcon />,
        shortcut: `${mod}U`,
        run: () => {
          dismiss();
          chain().toggleUnderline().run();
        },
      },
      {
        id: 'format.strike',
        group: 'Format',
        label: 'Toggle strikethrough',
        icon: <Strikethrough />,
        run: () => {
          dismiss();
          chain().toggleStrike().run();
        },
      },
      {
        id: 'format.align-left',
        group: 'Format',
        label: 'Align left',
        icon: <AlignLeft />,
        run: () => {
          dismiss();
          chain().setTextAlign('left').run();
        },
      },
      {
        id: 'format.align-center',
        group: 'Format',
        label: 'Align center',
        icon: <AlignCenter />,
        run: () => {
          dismiss();
          chain().setTextAlign('center').run();
        },
      },
      {
        id: 'format.align-right',
        group: 'Format',
        label: 'Align right',
        icon: <AlignRight />,
        run: () => {
          dismiss();
          chain().setTextAlign('right').run();
        },
      },
      {
        id: 'format.align-justify',
        group: 'Format',
        label: 'Justify',
        icon: <AlignJustify />,
        run: () => {
          dismiss();
          chain().setTextAlign('justify').run();
        },
      },
      {
        id: 'format.undo',
        group: 'Format',
        label: 'Undo',
        icon: <RotateCw className="scale-x-[-1]" />,
        shortcut: `${mod}Z`,
        disabled: !canUndo,
        run: () => {
          dismiss();
          chain().undo().run();
        },
      },
      {
        id: 'format.redo',
        group: 'Format',
        label: 'Redo',
        icon: <RotateCw />,
        shortcut: `${mod}⇧Z`,
        disabled: !canRedo,
        run: () => {
          dismiss();
          chain().redo().run();
        },
      },

      {
        id: 'edit.find',
        group: 'Edit',
        label: 'Find in document…',
        icon: <Search />,
        shortcut: `${mod}F`,
        keywords: ['search', 'find', 'replace'],
        run: () => {
          dismiss();
          onOpenFind();
        },
      },

      {
        id: 'view.toggle-toolbar',
        group: 'View',
        label: isFormattingToolbarOpen ? 'Hide formatting toolbar' : 'Show formatting toolbar',
        icon: <PanelRightOpen />,
        run: () => {
          dismiss();
          onToggleFormattingToolbar();
        },
      },
      {
        id: 'view.focus',
        group: 'View',
        label: canvas.focusMode ? 'Exit focus mode' : 'Enter focus mode',
        icon: <Focus />,
        keywords: ['distraction free', 'writing'],
        run: () => {
          dismiss();
          canvas.toggleFocusMode();
        },
      },
      {
        id: 'view.typewriter',
        group: 'View',
        label: canvas.typewriterMode ? 'Disable typewriter scroll' : 'Enable typewriter scroll',
        icon: <Crosshair />,
        run: () => {
          dismiss();
          canvas.toggleTypewriterMode();
        },
      },
      {
        id: 'view.paper',
        group: 'View',
        label: canvas.paperMode ? 'Switch to canvas view' : 'Switch to paper preview',
        icon: <Palette />,
        keywords: ['print', 'preview'],
        run: () => {
          dismiss();
          canvas.togglePaperMode();
        },
      },
      {
        id: 'view.zoom-in',
        group: 'View',
        label: 'Zoom in',
        icon: <ZoomIn />,
        shortcut: `${mod}+`,
        run: () => {
          dismiss();
          canvas.zoomIn();
        },
      },
      {
        id: 'view.zoom-out',
        group: 'View',
        label: 'Zoom out',
        icon: <ZoomOut />,
        shortcut: `${mod}-`,
        run: () => {
          dismiss();
          canvas.zoomOut();
        },
      },
      {
        id: 'view.zoom-reset',
        group: 'View',
        label: 'Reset zoom',
        icon: <Minimize2 />,
        shortcut: `${mod}0`,
        disabled: Math.abs(canvas.zoom - 1) < 0.01,
        run: () => {
          dismiss();
          canvas.resetZoom();
        },
      },
      {
        id: 'view.theme',
        group: 'View',
        label: 'Toggle theme (light/dark)',
        icon: (
          <span className="relative inline-flex size-4 items-center justify-center">
            <Sun className="size-4" />
            <MoonStar className="absolute inset-0 size-4 opacity-0" />
          </span>
        ),
        run: () => {
          dismiss();
          onToggleTheme();
        },
      },
      {
        id: 'app.settings',
        group: 'App',
        label: 'Settings…',
        icon: <Settings />,
        shortcut: `${mod},`,
        run: () => {
          dismiss();
          onOpenSettings();
        },
      },
      ...(onOpenShortcuts
        ? [
            {
              id: 'app.shortcuts',
              group: 'App',
              label: 'Keyboard shortcuts',
              icon: <KeyboardIcon />,
              run: () => {
                dismiss();
                onOpenShortcuts();
              },
            } satisfies PaletteAction,
          ]
        : []),
      {
        id: 'ai.autocomplete',
        group: 'AI',
        label: autocompleteEnabled ? 'Turn off tab autocomplete' : 'Turn on tab autocomplete',
        icon: <Sparkles />,
        keywords: ['ghost', 'suggestion', 'completion', 'tab'],
        run: () => {
          dismiss();
          onToggleAutocomplete();
        },
      },
      {
        id: 'app.ai',
        group: 'AI',
        label: 'Jump to AI chat',
        icon: <Sparkles />,
        keywords: ['assistant', 'agent', 'document chat'],
        run: () => {
          dismiss();
          const target = document.querySelector<HTMLElement>('[data-scribe-chat-target]');
          target?.focus();
        },
      },
    ];
    void ChevronsUpDown;
    void Maximize2;
    void HelpCircle;
    return list;
    // `editor` and its command surface are stable once mounted; recompute when labels change.
  }, [
    canUndo,
    canRedo,
    canvas,
    dismiss,
    editor,
    isFormattingToolbarOpen,
    mod,
    onExportPdf,
    onNewDocument,
    onOpenFile,
    onOpenLink,
    onOpenFind,
    onOpenSettings,
    onOpenShortcuts,
    onSaveDocument,
    onSaveHtmlAs,
    onSaveMarkdownAs,
    onToggleFormattingToolbar,
    onToggleTheme,
    autocompleteEnabled,
    onToggleAutocomplete,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onOpenChange, open]);

  const inputContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      inputContainerRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const grouped = useMemo(() => {
    const groups = new Map<string, PaletteAction[]>();
    for (const action of actions) {
      const bucket = groups.get(action.group);
      if (bucket) bucket.push(action);
      else groups.set(action.group, [action]);
    }
    return Array.from(groups.entries());
  }, [actions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[28%] max-w-xl translate-y-0 overflow-hidden rounded-xl! p-0"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>
            Search for a command to run. Use the arrow keys to navigate and Enter to execute.
          </DialogDescription>
        </DialogHeader>
        <Command
          className="rounded-xl!"
          filter={(value, search, keywords) => {
            const q = search.trim().toLowerCase();
            if (!q) return 1;
            const hay = (value + ' ' + (keywords ?? []).join(' ')).toLowerCase();
            return hay.includes(q) ? 1 : 0;
          }}
        >
          <div ref={inputContainerRef}>
            <CommandInput placeholder="Type a command or search…" />
          </div>
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>No matching commands.</CommandEmpty>
            {grouped.map(([group, items], idx) => (
              <div key={group}>
                {idx > 0 ? <CommandSeparator /> : null}
                <CommandGroup heading={group}>
                  {items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.group} · ${item.label}`}
                      keywords={item.keywords}
                      disabled={item.disabled}
                      onSelect={() => item.run()}
                    >
                      {item.icon ? (
                        <span className="text-muted-foreground mr-2 inline-flex size-4 items-center justify-center [&_svg]:size-4">
                          {item.icon}
                        </span>
                      ) : null}
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.hint ? (
                        <span className="text-muted-foreground/80 text-xs">{item.hint}</span>
                      ) : null}
                      {item.shortcut ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
