import {
  BookOpenIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ListTreeIcon,
  type LucideIcon,
} from 'lucide-react';

import { Spinner } from '@/components/ui/spinner';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';
import { cn } from '@/lib/utils';

type DocumentToolPart = Extract<
  DocumentChatUIMessage['parts'][number],
  {
    type:
      | 'tool-getDocumentStats'
      | 'tool-readDocument'
      | 'tool-searchDocument'
      | 'tool-strReplace'
      | 'tool-appendDocument';
  }
>;

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function inputForPart(part: DocumentToolPart): unknown {
  if (part.state === 'input-available' || part.state === 'output-available') {
    return part.input;
  }
  return undefined;
}

function outputForPart(part: DocumentToolPart): unknown {
  return part.state === 'output-available' ? part.output : undefined;
}

/** Concise one-line summary for each document tool call. */
function describePart(part: DocumentToolPart): { icon: LucideIcon; label: string; failure?: string } {
  if (part.type === 'tool-getDocumentStats') {
    const out = outputForPart(part);
    if (isObject(out) && typeof out.lineCount === 'number' && typeof out.wordCount === 'number') {
      return {
        icon: ListTreeIcon,
        label: `Read document outline · ${out.lineCount} lines, ${out.wordCount} words`,
      };
    }
    return { icon: ListTreeIcon, label: 'Reading document outline' };
  }
  if (part.type === 'tool-readDocument') {
    const input = inputForPart(part);
    const out = outputForPart(part);
    if (isObject(out) && typeof out.startLine === 'number' && typeof out.endLine === 'number') {
      return { icon: BookOpenIcon, label: `Read lines ${out.startLine}–${out.endLine}` };
    }
    if (isObject(input)) {
      const offset = typeof input.offset === 'number' ? input.offset : 1;
      return { icon: BookOpenIcon, label: `Reading from line ${offset}` };
    }
    return { icon: BookOpenIcon, label: 'Reading document' };
  }
  if (part.type === 'tool-searchDocument') {
    const input = inputForPart(part);
    const out = outputForPart(part);
    const query = isObject(input) && typeof input.query === 'string' ? input.query : '';
    if (isObject(out) && typeof out.totalMatches === 'number') {
      return {
        icon: SearchIcon,
        label: `Searched "${truncate(query, 40)}" · ${out.totalMatches} match${out.totalMatches === 1 ? '' : 'es'}`,
      };
    }
    return { icon: SearchIcon, label: `Searching "${truncate(query, 40)}"` };
  }
  if (part.type === 'tool-strReplace') {
    const input = inputForPart(part);
    const out = outputForPart(part);
    const oldText =
      isObject(input) && typeof input.oldText === 'string' ? input.oldText : '';
    const oldFirst = oldText.split('\n')[0].trim();
    if (isObject(out)) {
      if (out.ok === false) {
        const reason = typeof out.reason === 'string' ? out.reason : 'failed';
        return {
          icon: PencilIcon,
          label: `Edit retry needed (${reason}): ${truncate(oldFirst, 50)}`,
          failure: typeof out.message === 'string' ? out.message : undefined,
        };
      }
      if (typeof out.startLine === 'number') {
        return {
          icon: PencilIcon,
          label: `Edited L${out.startLine}${
            typeof out.endLine === 'number' && out.endLine !== out.startLine
              ? `-${out.endLine}`
              : ''
          }: ${truncate(oldFirst, 50)}`,
        };
      }
    }
    return { icon: PencilIcon, label: `Editing: ${truncate(oldFirst, 50)}` };
  }
  // appendDocument
  const input = inputForPart(part);
  const out = outputForPart(part);
  const text = isObject(input) && typeof input.text === 'string' ? input.text : '';
  const firstLine = text.split('\n')[0].trim();
  if (isObject(out) && typeof out.startLine === 'number') {
    return {
      icon: PlusIcon,
      label: `Appended at L${out.startLine}: ${truncate(firstLine, 50)}`,
    };
  }
  return { icon: PlusIcon, label: `Appending: ${truncate(firstLine, 50)}` };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function ToolDocumentActionPart({ part }: { part: DocumentToolPart }) {
  const isComplete = part.state === 'output-available';
  const isErrored = part.state === 'output-error';
  const { icon: Icon, label, failure } = describePart(part);

  return (
    <div
      className={cn(
        'border-border bg-muted/30 text-muted-foreground mt-1 flex items-center gap-2 rounded-md border px-2 py-1 text-xs',
        isErrored && 'border-destructive/40 bg-destructive/5 text-destructive',
      )}
    >
      {isComplete || isErrored ? (
        <Icon aria-hidden className="size-3 shrink-0" />
      ) : (
        <Spinner className="shrink-0 size-3" />
      )}
      <span className="min-w-0 truncate">{label}</span>
      {failure ? (
        <span className="text-muted-foreground/70 shrink-0 text-[10px]">{failure}</span>
      ) : null}
    </div>
  );
}
