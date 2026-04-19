export const SCRIBE_PLAN_ANSWERS_PREFIX = '[SCRIBE_PLAN_ANSWERS]';

export type PlanAnswerPayload = {
  answers: Array<{
    id: string;
    optionIndex?: 0 | 1 | 2;
    custom?: string;
  }>;
  /** Human-readable lines for chat display and model context */
  summaryLines?: string[];
};

export function buildPlanAnswersUserText(payload: PlanAnswerPayload): string {
  return `${SCRIBE_PLAN_ANSWERS_PREFIX}\n${JSON.stringify(payload)}`;
}

export function tryParsePlanAnswersUserText(text: string): PlanAnswerPayload | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(SCRIBE_PLAN_ANSWERS_PREFIX)) return null;
  const jsonPart = trimmed.slice(SCRIBE_PLAN_ANSWERS_PREFIX.length).trim();
  try {
    const raw: unknown = JSON.parse(jsonPart);
    if (!raw || typeof raw !== 'object' || !('answers' in raw)) return null;
    const answers = (raw as { answers: unknown }).answers;
    if (!Array.isArray(answers)) return null;
    return raw as PlanAnswerPayload;
  } catch {
    return null;
  }
}
