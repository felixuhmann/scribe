import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { PlanAnswerPayload } from '@/lib/plan-mode';
import { cn } from '@/lib/utils';

export type ClarificationQuestion = {
  id: string;
  prompt: string;
  /** Always three strings (matches schema; OpenAI output uses array, not tuple). */
  options: string[];
};

type PlanClarificationFormProps = {
  questions: ClarificationQuestion[];
  disabled?: boolean;
  onSubmitAnswers: (payload: PlanAnswerPayload) => void;
};

export function PlanClarificationForm({
  questions,
  disabled,
  onSubmitAnswers,
}: PlanClarificationFormProps) {
  const [selected, setSelected] = useState<Array<0 | 1 | 2 | null>>(() =>
    questions.map(() => null),
  );
  const [custom, setCustom] = useState<string[]>(() => questions.map(() => ''));

  const canSubmit = useMemo(() => {
    return questions.every((_, i) => {
      const c = custom[i]?.trim() ?? '';
      return c.length > 0 || selected[i] !== null;
    });
  }, [questions, selected, custom]);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit || disabled) return;
      const answers: PlanAnswerPayload['answers'] = [];
      const summaryLines: string[] = [];
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i]!;
        const c = custom[i]?.trim() ?? '';
        if (c) {
          answers.push({ id: q.id, custom: c });
          summaryLines.push(`${q.prompt} — ${c}`);
        } else {
          const idx = selected[i];
          if (idx === null) return;
          answers.push({ id: q.id, optionIndex: idx });
          summaryLines.push(`${q.prompt} — ${q.options[idx]}`);
        }
      }
      onSubmitAnswers({ answers, summaryLines });
    },
    [canSubmit, custom, disabled, onSubmitAnswers, questions, selected],
  );

  return (
    <form
      onSubmit={onSubmit}
      className="border-border bg-muted/30 mt-2 space-y-3 rounded-md border p-3"
    >
      <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
        Your answers
      </p>
      <div className="space-y-4">
        {questions.map((q, qi) => (
          <div key={q.id} className="space-y-2">
            <p className="text-foreground text-sm leading-snug">{q.prompt}</p>
            <div className="flex flex-col gap-1.5">
              {q.options.map((label, oi) => {
                const idx = oi as 0 | 1 | 2;
                const isOn = selected[qi] === idx && !(custom[qi]?.trim());
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setSelected((prev) => {
                        const next = [...prev];
                        next[qi] = idx;
                        return next;
                      });
                      setCustom((prev) => {
                        const next = [...prev];
                        next[qi] = '';
                        return next;
                      });
                    }}
                    className={cn(
                      'border-border hover:bg-muted/80 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors',
                      isOn && 'border-primary bg-primary/10 ring-primary/30 ring-1',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1">
              <Label htmlFor={`plan-custom-${q.id}`} className="text-muted-foreground text-[11px]">
                Something else (optional)
              </Label>
              <Textarea
                id={`plan-custom-${q.id}`}
                value={custom[qi] ?? ''}
                disabled={disabled}
                placeholder="Type a different answer…"
                className="min-h-[56px] resize-none text-xs"
                onChange={(e) => {
                  const v = e.target.value;
                  setCustom((prev) => {
                    const next = [...prev];
                    next[qi] = v;
                    return next;
                  });
                  if (v.trim()) {
                    setSelected((prev) => {
                      const next = [...prev];
                      next[qi] = null;
                      return next;
                    });
                  }
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={disabled || !canSubmit}>
          Submit answers
        </Button>
      </div>
    </form>
  );
}

export function PlanAnswersSubmittedBubble({ payload }: { payload: PlanAnswerPayload }) {
  const lines = payload.summaryLines?.length
    ? payload.summaryLines
    : payload.answers.map((a) => a.id + (a.custom != null ? `: ${a.custom}` : ` [${a.optionIndex}]`));
  return (
    <div className="space-y-1">
      <p className="text-sidebar-foreground/60 text-[10px] font-semibold uppercase">Plan choices</p>
      <ul className="list-disc space-y-0.5 pl-4 text-xs">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

export function PastClarificationRound({ questions }: { questions: ClarificationQuestion[] }) {
  return (
    <div className="border-border/60 bg-muted/15 mt-2 rounded-md border px-2 py-1.5">
      <p className="text-muted-foreground text-[10px] font-medium uppercase">
        Clarification ({questions.length} question{questions.length === 1 ? '' : 's'})
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-3 text-[11px] opacity-90">
        {questions.map((q) => (
          <li key={q.id}>{q.prompt}</li>
        ))}
      </ul>
    </div>
  );
}

