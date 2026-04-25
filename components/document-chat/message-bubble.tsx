import { useMemo, useState } from 'react';
import {
  CheckIcon,
  ClipboardListIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
  SendIcon,
  SparklesIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';
import {
  tryParsePlanAcceptedUserText,
  tryParsePlanAnswersUserText,
  tryParsePlanFeedbackUserText,
  type PlanAnswerPayload,
  type PlanFeedbackPayload,
} from '@/lib/plan-answers-protocol';
import { cn } from '@/lib/utils';

import { PlanAnswersSubmittedBubble } from './plan-clarification-form';
import { ChatTextPart } from './message-parts/chat-text-part';
import { ToolSetDocumentHtmlPart } from './message-parts/tool-set-document-html';
import { ToolClarificationsPart } from './message-parts/tool-clarifications';
import { ToolWritePlanPart } from './message-parts/tool-write-plan';

type MessageBubbleProps = {
  message: DocumentChatUIMessage;
  isLast: boolean;
  busy: boolean;
  editorReady: boolean;
  /** 1-based version number for the writePlan part inside this message (if any). */
  writePlanVersionByMessageId: Map<string, number>;
  /** Whether THIS message contains the latest writePlan call. */
  isLatestWritePlanMessage: boolean;
  onOpenPlan: () => void;
  onSkipReview: () => void;
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

type UserBubbleKind = 'plain' | 'planAnswers' | 'planFeedback' | 'planAccepted';

function classifyUserMessage(message: DocumentChatUIMessage): UserBubbleKind {
  if (message.role !== 'user') return 'plain';
  for (const p of message.parts) {
    if (p.type !== 'text') continue;
    if (tryParsePlanAnswersUserText(p.text)) return 'planAnswers';
    if (tryParsePlanFeedbackUserText(p.text)) return 'planFeedback';
    if (tryParsePlanAcceptedUserText(p.text)) return 'planAccepted';
  }
  return 'plain';
}

export function MessageBubble({
  message,
  isLast,
  busy,
  editorReady,
  writePlanVersionByMessageId,
  isLatestWritePlanMessage,
  onOpenPlan,
  onSkipReview,
  onSubmitPlanAnswers,
  onRetry,
  onEditUserMessage,
  getPreEditHtml,
  onUndoToolEdit,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const userKind = classifyUserMessage(message);
  const isStructuredUser = isUser && userKind !== 'plain';

  const writePlanVersion = writePlanVersionByMessageId.get(message.id) ?? 0;

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
            isUser && !isStructuredUser
              ? 'bg-primary/10 text-foreground max-w-[85%] rounded-2xl rounded-tr-md px-3 py-2'
              : 'w-full',
          )}
        >
          {message.parts.map((part, i) => {
            if (part.type === 'text') {
              if (isUser) {
                if (userKind === 'planAnswers') {
                  const parsed = tryParsePlanAnswersUserText(part.text);
                  if (parsed) {
                    return <PlanAnswersSubmittedBubble key={i} payload={parsed} />;
                  }
                }
                if (userKind === 'planFeedback') {
                  const parsed = tryParsePlanFeedbackUserText(part.text);
                  if (parsed) {
                    return <PlanFeedbackSubmittedBubble key={i} payload={parsed} />;
                  }
                }
                if (userKind === 'planAccepted') {
                  const parsed = tryParsePlanAcceptedUserText(part.text);
                  if (parsed) {
                    return <PlanAcceptedBubble key={i} version={parsed.acceptedVersion} />;
                  }
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
            if (part.type === 'tool-writePlan') {
              return (
                <ToolWritePlanPart
                  key={i}
                  part={part}
                  versionNumber={writePlanVersion}
                  isLatest={isLatestWritePlanMessage}
                  onOpenPlan={onOpenPlan}
                  onSkipReview={onSkipReview}
                  canAct={!busy && editorReady}
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
          isStructuredUser={isStructuredUser}
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
  isStructuredUser,
}: {
  message: DocumentChatUIMessage;
  isLast: boolean;
  busy: boolean;
  onRetry: () => void;
  onEditUserMessage: () => void;
  plainText: string;
  isStructuredUser: boolean;
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
      {plainText && !isStructuredUser ? (
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
      {isUser && isLast && !busy && !isStructuredUser ? (
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

/** Compact summary of the user's [SCRIBE_PLAN_FEEDBACK] message. */
function PlanFeedbackSubmittedBubble({ payload }: { payload: PlanFeedbackPayload }) {
  const lines = useMemo(() => {
    const out: string[] = [];
    for (const c of payload.comments) {
      if (c.selectionText) {
        out.push(`On "${c.selectionText.slice(0, 60)}…" — ${c.body}`);
      } else if (c.blockId === 'doc') {
        out.push(`Plan-wide — ${c.body}`);
      } else {
        out.push(`On ${c.blockId} — ${c.body}`);
      }
    }
    if (payload.freeformNote && payload.freeformNote.trim().length > 0) {
      out.push(`Note — ${payload.freeformNote.trim()}`);
    }
    return out;
  }, [payload]);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
        <SendIcon aria-hidden className="mr-1 inline size-3 align-[-2px]" />
        Requested changes to v{payload.baseVersion}
      </p>
      {lines.length === 0 ? (
        <p className="text-muted-foreground text-xs">(No comments — see freeform note above.)</p>
      ) : (
        <ul className="list-disc pl-4 text-xs leading-snug">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Compact summary of the user's [SCRIBE_PLAN_ACCEPTED] message. */
function PlanAcceptedBubble({ version }: { version: number }) {
  return (
    <div className="border-primary/30 bg-primary/5 text-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
      <ClipboardListIcon aria-hidden className="size-3" />
      <span>Submitted plan v{version} — writing the document.</span>
    </div>
  );
}
