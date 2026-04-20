import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';
import type { PlanAnswerPayload } from '@/lib/plan-answers-protocol';
import { cn } from '@/lib/utils';

import { MessageBubble } from './message-bubble';
import type { StreamingPhase } from './use-document-chat-session';

type MessageListProps = {
  messages: DocumentChatUIMessage[];
  busy: boolean;
  editorReady: boolean;
  streamingPhase: StreamingPhase;
  onSubmitPlanAnswers: (payload: PlanAnswerPayload) => void;
  onRetry: () => void;
  onEditUserMessage: () => void;
  getPreEditHtml: (toolCallId: string) => string | undefined;
  onUndoToolEdit: (toolCallId: string) => void;
  /** Rendered inside the scroll container when `messages.length === 0`. */
  emptyState: React.ReactNode;
};

const STREAM_LABEL: Record<StreamingPhase, string | null> = {
  idle: null,
  thinking: 'Thinking',
  writing: 'Writing',
  applyingEdit: 'Applying edit',
  draftingQuestions: 'Drafting questions',
};

export function MessageList({
  messages,
  busy,
  editorReady,
  streamingPhase,
  onSubmitPlanAnswers,
  onRetry,
  onEditUserMessage,
  getPreEditHtml,
  onUndoToolEdit,
  emptyState,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const prevMessagesLenRef = useRef(messages.length);

  // Track whether the bottom sentinel is visible — if so we're "at bottom".
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setAtBottom(entry.isIntersecting);
      },
      { root, rootMargin: '0px 0px 32px 0px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Auto-scroll to bottom when a new message arrives AND the user was already near the bottom.
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const grew = messages.length > prevMessagesLenRef.current;
    prevMessagesLenRef.current = messages.length;
    if (grew && atBottom) {
      root.scrollTop = root.scrollHeight;
    }
  }, [messages.length, atBottom]);

  // During streaming, keep pinning to bottom if the user is already near it.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    if (!busy) return;
    if (!atBottom) return;
    root.scrollTop = root.scrollHeight;
  }, [messages, busy, atBottom]);

  const jumpToLatest = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    root.scrollTo({ top: root.scrollHeight, behavior: 'smooth' });
  }, []);

  const streamLabel = STREAM_LABEL[streamingPhase];

  return (
    <div className="relative min-h-0 flex-1">
      <div
        aria-hidden
        className="from-sidebar pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-gradient-to-b to-transparent"
      />
      <div
        aria-hidden
        className="from-sidebar pointer-events-none absolute inset-x-0 bottom-0 z-10 h-4 bg-gradient-to-t to-transparent"
      />
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-0.5 py-2 text-sm"
      >
        {messages.length === 0 ? (
          <div className="px-0.5">{emptyState}</div>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((m, idx) => (
              <MessageBubble
                key={m.id}
                message={m}
                isLast={idx === messages.length - 1}
                busy={busy}
                editorReady={editorReady}
                onSubmitPlanAnswers={onSubmitPlanAnswers}
                onRetry={onRetry}
                onEditUserMessage={onEditUserMessage}
                getPreEditHtml={getPreEditHtml}
                onUndoToolEdit={onUndoToolEdit}
              />
            ))}
            {streamLabel ? (
              <li className="flex items-center gap-2 pl-8">
                <Spinner className="size-3 shrink-0" />
                <span className="text-muted-foreground text-xs">{streamLabel}…</span>
              </li>
            ) : null}
          </ul>
        )}
        <div ref={sentinelRef} className="h-1 w-full" />
      </div>

      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-1',
          atBottom && 'hidden',
        )}
      >
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="pointer-events-auto h-7 rounded-full px-2.5 text-xs shadow-md"
          onClick={jumpToLatest}
        >
          <ArrowDownIcon data-icon="inline-start" aria-hidden />
          Jump to latest
        </Button>
      </div>
    </div>
  );
}
