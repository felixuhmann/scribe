import { Spinner } from '@/components/ui/spinner';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';
import type { PlanAnswerPayload } from '@/lib/plan-answers-protocol';

import {
  PastClarificationRound,
  PlanClarificationForm,
  type ClarificationQuestion,
} from '../plan-clarification-form';

type RequestClarificationsPart = Extract<
  DocumentChatUIMessage['parts'][number],
  { type: 'tool-requestClarifications' }
>;

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

/** Extract the clarification questions produced by a completed tool call. */
export function getClarificationQuestions(
  part: DocumentChatUIMessage['parts'][number],
): ClarificationQuestion[] | null {
  if (part.type !== 'tool-requestClarifications') return null;
  if (part.state !== 'output-available') return null;
  const out = part.output;
  if (!isObject(out) || !('questions' in out)) return null;
  const qs = out.questions;
  if (!Array.isArray(qs)) return null;
  return qs as ClarificationQuestion[];
}

export function ToolClarificationsPart({
  part,
  interactive,
  disabled,
  onSubmitAnswers,
}: {
  part: RequestClarificationsPart;
  /** Only the latest clarification round accepts input; older rounds render read-only. */
  interactive: boolean;
  disabled: boolean;
  onSubmitAnswers: (payload: PlanAnswerPayload) => void;
}) {
  const qs = getClarificationQuestions(part);
  if (qs && part.state === 'output-available') {
    if (interactive) {
      return (
        <PlanClarificationForm
          questions={qs}
          disabled={disabled}
          onSubmitAnswers={onSubmitAnswers}
        />
      );
    }
    return <PastClarificationRound questions={qs} />;
  }
  if (part.state === 'output-error') {
    return (
      <p className="text-destructive text-xs">
        Could not load clarification questions.
      </p>
    );
  }
  return (
    <p className="flex flex-row items-center gap-2 text-xs opacity-70">
      <span>Preparing clarification questions…</span>
      <Spinner className="shrink-0" />
    </p>
  );
}
