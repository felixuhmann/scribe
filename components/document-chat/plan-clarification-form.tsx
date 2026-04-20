import { useCallback, useMemo, useState } from 'react';
import { PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { PlanAnswerPayload } from '@/lib/plan-answers-protocol';
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
  const [customOpen, setCustomOpen] = useState<boolean[]>(() => questions.map(() => false));

  const answeredCount = useMemo(
    () =>
      questions.reduce((acc, _q, i) => {
        const c = custom[i]?.trim() ?? '';
        const hasAnswer = c.length > 0 || selected[i] !== null;
        return acc + (hasAnswer ? 1 : 0);
      }, 0),
    [questions, selected, custom],
  );

  const canSubmit = answeredCount === questions.length;

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
      className="border-border bg-card text-card-foreground mt-2 flex flex-col gap-3 rounded-lg border px-3 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-foreground text-[11px] font-semibold uppercase tracking-wide">
          Help the assistant plan
        </p>
        <ProgressPips total={questions.length} complete={answeredCount} />
      </div>
      <div className="flex flex-col gap-3">
        {questions.map((q, qi) => {
          const value = (() => {
            if (custom[qi]?.trim()) return '';
            const v = selected[qi];
            return v === null ? '' : String(v);
          })();
          const hasCustom = Boolean(custom[qi]?.trim());
          return (
            <div key={q.id} className="flex flex-col gap-1.5">
              <p className="text-foreground text-sm leading-snug">{q.prompt}</p>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={1}
                value={value}
                onValueChange={(next) => {
                  if (next === '') return;
                  const idx = Number.parseInt(next, 10) as 0 | 1 | 2;
                  setSelected((prev) => {
                    const n = [...prev];
                    n[qi] = idx;
                    return n;
                  });
                  setCustom((prev) => {
                    const n = [...prev];
                    n[qi] = '';
                    return n;
                  });
                }}
                disabled={disabled}
                className="flex-wrap justify-start"
              >
                {q.options.map((label, oi) => (
                  <ToggleGroupItem
                    key={oi}
                    value={String(oi)}
                    className={cn('h-7 rounded-full text-xs', hasCustom && 'opacity-60')}
                  >
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Collapsible
                open={customOpen[qi] || hasCustom}
                onOpenChange={(open) => {
                  setCustomOpen((prev) => {
                    const n = [...prev];
                    n[qi] = open;
                    return n;
                  });
                  if (!open) {
                    setCustom((prev) => {
                      const n = [...prev];
                      n[qi] = '';
                      return n;
                    });
                  }
                }}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground w-fit text-xs"
                    disabled={disabled}
                  >
                    <PlusIcon className="mr-0.5 inline size-3 align-[-2px]" aria-hidden />
                    {customOpen[qi] || hasCustom ? 'Hide custom answer' : 'Write a different answer'}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1.5">
                  <input
                    type="text"
                    value={custom[qi] ?? ''}
                    disabled={disabled}
                    placeholder="Type your own answer…"
                    className="border-input bg-background focus-visible:ring-ring h-8 w-full rounded-md border px-2 text-xs focus-visible:ring-2 focus-visible:outline-none"
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustom((prev) => {
                        const n = [...prev];
                        n[qi] = v;
                        return n;
                      });
                      if (v.trim()) {
                        setSelected((prev) => {
                          const n = [...prev];
                          n[qi] = null;
                          return n;
                        });
                      }
                    }}
                  />
                </CollapsibleContent>
              </Collapsible>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {answeredCount}/{questions.length} answered
        </p>
        <Button type="submit" size="sm" disabled={disabled || !canSubmit}>
          Submit answers
        </Button>
      </div>
    </form>
  );
}

function ProgressPips({ total, complete }: { total: number; complete: number }) {
  return (
    <div className="flex shrink-0 items-center gap-1" aria-label={`${complete} of ${total} answered`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'size-1.5 rounded-full',
            i < complete ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
        />
      ))}
    </div>
  );
}

export function PlanAnswersSubmittedBubble({ payload }: { payload: PlanAnswerPayload }) {
  const lines = payload.summaryLines?.length
    ? payload.summaryLines
    : payload.answers.map((a) => a.id + (a.custom != null ? `: ${a.custom}` : ` [${a.optionIndex}]`));
  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted-foreground text-[11px] font-semibold uppercase">Plan choices</p>
      <ul className="list-disc pl-4 text-xs leading-snug">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

export function PastClarificationRound({ questions }: { questions: ClarificationQuestion[] }) {
  return (
    <Collapsible className="mt-2">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground flex w-full items-center gap-2 rounded-md border px-2 py-1 text-left text-[11px]"
        >
          <span className="bg-muted-foreground/30 size-1.5 rounded-full" aria-hidden />
          Clarification · {questions.length} question{questions.length === 1 ? '' : 's'}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1">
        <ul className="list-disc pl-4 text-xs leading-snug opacity-90">
          {questions.map((q) => (
            <li key={q.id}>{q.prompt}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
