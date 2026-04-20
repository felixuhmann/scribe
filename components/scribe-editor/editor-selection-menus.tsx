import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import {
  ArrowLeft,
  Bold,
  Check,
  ChevronDown,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Languages,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Loader2,
  Minimize2,
  Quote,
  Sparkles,
  Strikethrough,
  Type,
  Underline as UnderlineIcon,
  Wand2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { useEditorSession } from '@/components/editor-session-context';

const bubbleClass =
  'bg-popover text-popover-foreground flex items-stretch gap-0.5 rounded-lg border border-border/70 p-1 shadow-xl backdrop-blur-md';

const floatingClass =
  'bg-popover text-popover-foreground flex items-center gap-0.5 rounded-lg border border-border/70 p-1 shadow-lg backdrop-blur-sm';

function plainTextToSafeInlineHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

type MiniButtonProps = {
  active?: boolean;
  title?: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
};

function MiniButton({ active, title, onClick, children, className, ...rest }: MiniButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
      title={title}
      aria-label={rest['aria-label'] ?? title}
      aria-pressed={active}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-sm transition-colors',
        'text-muted-foreground hover:bg-muted hover:text-foreground',
        'aria-pressed:bg-accent aria-pressed:text-accent-foreground',
        active && 'bg-accent text-accent-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}

function BubbleSeparator() {
  return <Separator orientation="vertical" className="mx-0.5 h-6 self-center" decorative />;
}

type BubbleMode = 'format' | 'ai' | 'preview';

type QuickPreset = {
  id: string;
  label: string;
  instruction: string;
  icon: React.ReactNode;
};

const QUICK_PRESETS: QuickPreset[] = [
  {
    id: 'improve',
    label: 'Improve writing',
    instruction: 'Rewrite for clarity and flow while preserving meaning and voice.',
    icon: <Wand2 className="size-3.5" />,
  },
  {
    id: 'grammar',
    label: 'Fix grammar',
    instruction: 'Fix grammar, spelling, and punctuation. Do not change the meaning or tone.',
    icon: <Check className="size-3.5" />,
  },
  {
    id: 'shorter',
    label: 'Make shorter',
    instruction: 'Rewrite more concisely while preserving the key points.',
    icon: <Minimize2 className="size-3.5" />,
  },
  {
    id: 'translate',
    label: 'Translate…',
    instruction: 'Translate to the following language: ',
    icon: <Languages className="size-3.5" />,
  },
];

function lineDiff(before: string, after: string): Array<{ type: 'same' | 'add' | 'del'; text: string }> {
  const a = before.split(/\n/);
  const b = after.split(/\n/);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: Array<{ type: 'same' | 'add' | 'del'; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: a[i] });
      i += 1;
    } else {
      out.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ type: 'del', text: a[i] });
    i += 1;
  }
  while (j < m) {
    out.push({ type: 'add', text: b[j] });
    j += 1;
  }
  return out;
}

export function EditorSelectionMenus({ editor }: { editor: Editor }) {
  const { requestOpenLinkDialog } = useEditorSession();

  const marks = useEditorState({
    editor,
    selector: (ctx) => ({
      bold: ctx.editor.isActive('bold'),
      italic: ctx.editor.isActive('italic'),
      underline: ctx.editor.isActive('underline'),
      strike: ctx.editor.isActive('strike'),
      h1: ctx.editor.isActive('heading', { level: 1 }),
      h2: ctx.editor.isActive('heading', { level: 2 }),
      h3: ctx.editor.isActive('heading', { level: 3 }),
      paragraph: ctx.editor.isActive('paragraph'),
      quote: ctx.editor.isActive('blockquote'),
      bulletList: ctx.editor.isActive('bulletList'),
      orderedList: ctx.editor.isActive('orderedList'),
      taskList: ctx.editor.isActive('taskList'),
      link: ctx.editor.isActive('link'),
    }),
  });

  const [instruction, setInstruction] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<BubbleMode>('format');
  const [preview, setPreview] = useState<{
    from: number;
    to: number;
    before: string;
    after: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const sync = () => {
      if (editor.state.selection.empty && mode !== 'preview') {
        setInstruction('');
        setError(null);
        setMode('format');
      }
    };
    editor.on('selectionUpdate', sync);
    editor.on('transaction', sync);
    return () => {
      editor.off('selectionUpdate', sync);
      editor.off('transaction', sync);
    };
  }, [editor, mode]);

  useLayoutEffect(() => {
    if (mode !== 'ai' || pending) return;
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [mode, pending]);

  const applyReplacement = useCallback(
    (from: number, to: number, replacementPlain: string) => {
      const html = plainTextToSafeInlineHtml(replacementPlain);
      editor.chain().focus().insertContentAt({ from, to }, html).run();
    },
    [editor],
  );

  const runInstruction = useCallback(
    async (rawInstruction: string) => {
      const trimmed = rawInstruction.trim();
      if (!trimmed || pending) return;

      const { from, to } = editor.state.selection;
      if (from === to) {
        setError('Select some text first.');
        return;
      }

      const selectedText = editor.state.doc.textBetween(from, to, '\n');
      setError(null);
      setPending(true);

      const api = typeof window !== 'undefined' ? window.scribe?.quickEditSelection : undefined;
      if (!api) {
        setPending(false);
        setError('Quick edit runs in the Scribe desktop app with an OpenAI API key.');
        return;
      }

      const result = await api({ selectedText, instruction: trimmed });
      setPending(false);

      if (!result.ok) {
        if ('cancelled' in result && result.cancelled) return;
        setError('error' in result ? result.error : 'Quick edit failed');
        return;
      }

      setPreview({ from, to, before: selectedText, after: result.text });
      setMode('preview');
    },
    [editor, pending],
  );

  const onSubmit = useCallback(
    async () => runInstruction(instruction),
    [instruction, runInstruction],
  );

  const acceptPreview = useCallback(() => {
    if (!preview) return;
    applyReplacement(preview.from, preview.to, preview.after);
    setPreview(null);
    setInstruction('');
    setError(null);
    setMode('format');
  }, [applyReplacement, preview]);

  const rejectPreview = useCallback(() => {
    setPreview(null);
    setMode('ai');
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMode('format');
        return;
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void onSubmit();
      }
    },
    [onSubmit],
  );

  const aiPill = useMemo(
    () => (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setMode('ai');
        }}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-md border border-dashed px-2 text-xs font-medium transition-colors',
          'border-primary/40 bg-primary/[0.06] text-primary hover:bg-primary/[0.12]',
          'dark:border-primary/50 dark:bg-primary/[0.1] dark:hover:bg-primary/[0.18]',
        )}
        title="Ask AI to edit the selection"
      >
        <Sparkles className="size-3.5" aria-hidden />
        <span>Ask AI</span>
        <kbd className="bg-primary/15 text-primary ml-1 rounded px-1 py-0.5 text-[10px] font-semibold">
          ⌘.
        </kbd>
      </button>
    ),
    [],
  );

  return (
    <>
      <BubbleMenu editor={editor} className={bubbleClass}>
        {mode === 'preview' && preview ? (
          <div className="flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-2 p-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="bg-primary/10 text-primary inline-flex size-6 items-center justify-center rounded">
                  <Sparkles className="size-3.5" aria-hidden />
                </span>
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  AI proposal
                </span>
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
                onClick={() => {
                  setPreview(null);
                  setMode('ai');
                }}
                title="Rewrite instruction"
              >
                Try again
              </button>
            </div>
            <div className="border-border/70 max-h-60 overflow-y-auto rounded-md border bg-background/80 p-2 text-xs leading-relaxed">
              {lineDiff(preview.before, preview.after).map((line, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex gap-2 whitespace-pre-wrap px-1 py-0.5',
                    line.type === 'add' &&
                      'bg-emerald-500/10 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-100',
                    line.type === 'del' &&
                      'bg-destructive/10 text-destructive line-through opacity-80',
                  )}
                >
                  <span
                    className={cn(
                      'shrink-0 text-center font-mono text-[10px] opacity-60',
                      'w-3',
                    )}
                    aria-hidden
                  >
                    {line.type === 'add' ? '+' : line.type === 'del' ? '−' : ''}
                  </span>
                  <span className="flex-1">{line.text || '\u00A0'}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={rejectPreview}
              >
                <X className="size-4" />
                Discard
              </Button>
              <Button type="button" size="sm" className="h-8" onClick={acceptPreview}>
                <Check className="size-4" />
                Accept
              </Button>
            </div>
          </div>
        ) : mode === 'ai' ? (
          <div className="flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 p-1">
            <div className="flex items-center gap-2">
              <MiniButton title="Back to formatting" onClick={() => setMode('format')}>
                <ArrowLeft className="size-4" />
              </MiniButton>
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Ask AI
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {QUICK_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setInstruction(p.instruction);
                    if (p.id === 'translate') {
                      requestAnimationFrame(() => textareaRef.current?.focus());
                      return;
                    }
                    void runInstruction(p.instruction);
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    'border-border/70 bg-background/70 text-foreground/80 hover:border-border hover:bg-muted hover:text-foreground',
                    'disabled:pointer-events-none disabled:opacity-50',
                  )}
                >
                  {p.icon}
                  {p.label}
                </button>
              ))}
            </div>
            <Textarea
              ref={textareaRef}
              placeholder="Describe how to change the selection…"
              value={instruction}
              disabled={pending}
              rows={3}
              className="text-sm"
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs">⌘↵ to apply · Esc to cancel</p>
              <Button
                type="button"
                size="sm"
                className="h-8"
                disabled={pending || !instruction.trim()}
                onClick={() => void onSubmit()}
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                    Thinking…
                  </>
                ) : (
                  'Preview'
                )}
              </Button>
            </div>
            {error ? <p className="text-destructive text-xs">{error}</p> : null}
          </div>
        ) : (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 items-center gap-1 rounded-md px-2 text-sm transition-colors',
                  )}
                  title="Change block type"
                >
                  <Type className="size-4" />
                  <span className="max-sm:hidden">
                    {marks?.h1
                      ? 'H1'
                      : marks?.h2
                        ? 'H2'
                        : marks?.h3
                          ? 'H3'
                          : marks?.bulletList
                            ? 'List'
                            : marks?.orderedList
                              ? 'Numbered'
                              : marks?.taskList
                                ? 'Tasks'
                                : marks?.quote
                                  ? 'Quote'
                                  : 'Text'}
                  </span>
                  <ChevronDown className="size-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onSelect={() => editor.chain().focus().setParagraph().run()}>
                  <Type /> Text
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => editor.chain().focus().setHeading({ level: 1 }).run()}
                >
                  <Heading1 /> Heading 1
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => editor.chain().focus().setHeading({ level: 2 }).run()}
                >
                  <Heading2 /> Heading 2
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => editor.chain().focus().setHeading({ level: 3 }).run()}
                >
                  <Heading3 /> Heading 3
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => editor.chain().focus().toggleBulletList().run()}>
                  <List /> Bulleted list
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => editor.chain().focus().toggleOrderedList().run()}>
                  <ListOrdered /> Numbered list
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => editor.chain().focus().toggleTaskList().run()}>
                  <ListTodo /> Task list
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => editor.chain().focus().toggleBlockquote().run()}>
                  <Quote /> Quote
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <BubbleSeparator />

            <MiniButton
              title="Bold (⌘B)"
              active={marks?.bold}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold className="size-4" />
            </MiniButton>
            <MiniButton
              title="Italic (⌘I)"
              active={marks?.italic}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic className="size-4" />
            </MiniButton>
            <MiniButton
              title="Underline (⌘U)"
              active={marks?.underline}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <UnderlineIcon className="size-4" />
            </MiniButton>
            <MiniButton
              title="Strikethrough"
              active={marks?.strike}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <Strikethrough className="size-4" />
            </MiniButton>

            <BubbleSeparator />

            <MiniButton
              title="Insert / edit link"
              active={marks?.link}
              onClick={() => requestOpenLinkDialog()}
            >
              <Link2 className="size-4" />
            </MiniButton>

            <BubbleSeparator />

            {aiPill}
          </>
        )}
      </BubbleMenu>

      <FloatingMenu editor={editor} className={floatingClass}>
        <span className="text-muted-foreground px-2 text-xs">
          Press <kbd className="border-border bg-background/40 rounded border px-1 py-0.5 text-[10px]">/</kbd>{' '}
          for blocks
        </span>
        <BubbleSeparator />
        <MiniButton
          title="Heading 2"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-4" />
        </MiniButton>
        <MiniButton title="Bulleted list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="size-4" />
        </MiniButton>
        <MiniButton title="Task list" onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <ListTodo className="size-4" />
        </MiniButton>
      </FloatingMenu>
    </>
  );
}
