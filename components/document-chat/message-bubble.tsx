import { useState } from 'react';
import {
  CheckIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
  SparklesIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';
import { tryParsePlanAnswersUserText } from '@/lib/plan-answers-protocol';
import { cn } from '@/lib/utils';

import { PlanAnswersSubmittedBubble } from './plan-clarification-form';
import { ChatTextPart } from './message-parts/chat-text-part';
import { ToolSetDocumentHtmlPart } from './message-parts/tool-set-document-html';
import { ToolClarificationsPart } from './message-parts/tool-clarifications';
import type { PlanAnswerPayload } from '@/lib/plan-answers-protocol';

type MessageBubbleProps = {
  message: DocumentChatUIMessage;
  isLast: boolean;
  busy: boolean;
  editorReady: boolean;
  onSubmitPlanAnswers: (payload: PlanAnswerPayload) => void;
  onRetry: () => void;
  onEditUserMessage: () => void;
  /** Pre-apply HTML keyed by toolCallId for the setDocumentHtml Undo. */
  getPreEditHtml: (toolCallId: string) => string | undefined;
  onUndoToolEdit: (toolCallId: string) => void;
};

function plainTextFromMessage(message: DocumentChatUIMessage): string {
  const texts: string[] = [];
  for (const p of message.parts) {
    if (p.type === 'text') texts.push(p.text);
  }
  return texts.join('\n\n').trim();
}

function isPlanAnswers(message: DocumentChatUIMessage): boolean {
  if (message.role !== 'user') return false;
  for (const p of message.parts) {
    if (p.type === 'text' && tryParsePlanAnswersUserText(p.text)) return true;
  }
  return false;
}

export function MessageBubble({
  message,
  isLast,
  busy,
  editorReady,
  onSubmitPlanAnswers,
  onRetry,
  onEditUserMessage,
  getPreEditHtml,
  onUndoToolEdit,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const planAnswers = isPlanAnswers(message);

  return (
    <li
      className={cn(
        'group/message relative flex gap-2.5',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      {isUser ? null : (
        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <SparklesIcon aria-hidden className="size-3.5" />
        </div>
      )}

      <div className={cn('flex min-w-0 flex-col gap-1.5', isUser ? 'items-end' : 'items-start flex-1')}>
        <div
          className={cn(
            'min-w-0',
            isUser && !planAnswers
              ? 'bg-primary/10 text-foreground max-w-[85%] rounded-2xl rounded-tr-md px-3 py-2'
              : 'w-full',
          )}
        >
          {message.parts.map((part, i) => {
            if (part.type === 'text') {
              if (isUser) {
                const parsed = tryParsePlanAnswersUserText(part.text);
                if (parsed) {
                  return <PlanAnswersSubmittedBubble key={i} payload={parsed} />;
                }
              }
              return <ChatTextPart key={i} text={part.text} role={message.role} />;
            }
            if (part.type === 'tool-setDocumentHtml') {
              const toolCallId =
                'toolCallId' in part && typeof part.toolCallId === 'string' ? part.toolCallId : '';
              return (
                <div key={i} className="mt-2">
                  <ToolSetDocumentHtmlPart
                    part={part}
                    previousHtml={toolCallId ? getPreEditHtml(toolCallId) : undefined}
                    canUndo={Boolean(toolCallId) && getPreEditHtml(toolCallId) !== undefined}
                    onUndo={() => {
                      if (toolCallId) onUndoToolEdit(toolCallId);
                    }}
                  />
                </div>
              );
            }
            if (part.type === 'tool-requestClarifications') {
              const interactive = message.role === 'assistant' && isLast && !busy;
              return (
                <ToolClarificationsPart
                  key={interactive ? `${message.id}-clar` : i}
                  part={part}
                  interactive={interactive}
                  disabled={busy || !editorReady}
                  onSubmitAnswers={onSubmitPlanAnswers}
                />
              );
            }
            return null;
          })}
        </div>

        <MessageActions
          message={message}
          isLast={isLast}
          busy={busy}
          onRetry={onRetry}
          onEditUserMessage={onEditUserMessage}
          plainText={plainTextFromMessage(message)}
        />
      </div>
    </li>
  );
}

function MessageActions({
  message,
  isLast,
  busy,
  onRetry,
  onEditUserMessage,
  plainText,
}: {
  message: DocumentChatUIMessage;
  isLast: boolean;
  busy: boolean;
  onRetry: () => void;
  onEditUserMessage: () => void;
  plainText: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!plainText && message.role === 'assistant') {
    // Tool-only assistant turn — no text to copy, no retry until a real reply shows.
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard denial is non-fatal */
    }
  };

  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      {plainText ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground size-6"
          title={copied ? 'Copied' : 'Copy message'}
          aria-label="Copy message"
          onClick={handleCopy}
        >
          {copied ? (
            <CheckIcon aria-hidden className="size-3.5" />
          ) : (
            <CopyIcon aria-hidden className="size-3.5" />
          )}
        </Button>
      ) : null}
      {!isUser && isLast && !busy ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground size-6"
          title="Regenerate response"
          aria-label="Regenerate response"
          onClick={onRetry}
        >
          <RefreshCwIcon aria-hidden className="size-3.5" />
        </Button>
      ) : null}
      {isUser && isLast && !busy ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground size-6"
          title="Edit and resend"
          aria-label="Edit and resend message"
          onClick={onEditUserMessage}
        >
          <PencilIcon aria-hidden className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
