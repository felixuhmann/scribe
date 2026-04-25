export const SCRIBE_PLAN_ANSWERS_PREFIX = '[SCRIBE_PLAN_ANSWERS]';
export const SCRIBE_PLAN_FEEDBACK_PREFIX = '[SCRIBE_PLAN_FEEDBACK]';
export const SCRIBE_PLAN_ACCEPTED_PREFIX = '[SCRIBE_PLAN_ACCEPTED]';

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

/**
 * Sent when the user clicks "Request changes" in the plan review overlay.
 * Each comment anchors to a block id (or 'doc' for whole-plan notes); the
 * model uses these to revise the plan into v(N+1).
 */
export type PlanFeedbackPayload = {
  baseVersion: number;
  freeformNote?: string;
  comments: Array<{
    blockId: string;
    selectionText?: string;
    body: string;
  }>;
};

export function buildPlanFeedbackUserText(payload: PlanFeedbackPayload): string {
  return `${SCRIBE_PLAN_FEEDBACK_PREFIX}\n${JSON.stringify(payload)}`;
}

export function tryParsePlanFeedbackUserText(text: string): PlanFeedbackPayload | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(SCRIBE_PLAN_FEEDBACK_PREFIX)) return null;
  const jsonPart = trimmed.slice(SCRIBE_PLAN_FEEDBACK_PREFIX.length).trim();
  try {
    const raw: unknown = JSON.parse(jsonPart);
    if (!raw || typeof raw !== 'object') return null;
    if (!('baseVersion' in raw) || !('comments' in raw)) return null;
    const comments = (raw as { comments: unknown }).comments;
    if (!Array.isArray(comments)) return null;
    return raw as PlanFeedbackPayload;
  } catch {
    return null;
  }
}

/**
 * Sent when the user clicks "Submit plan". Carries the accepted version so
 * the model knows which plan to execute against the document.
 */
export type PlanAcceptedPayload = {
  acceptedVersion: number;
};

export function buildPlanAcceptedUserText(payload: PlanAcceptedPayload): string {
  return `${SCRIBE_PLAN_ACCEPTED_PREFIX}\n${JSON.stringify(payload)}`;
}

export function tryParsePlanAcceptedUserText(text: string): PlanAcceptedPayload | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(SCRIBE_PLAN_ACCEPTED_PREFIX)) return null;
  const jsonPart = trimmed.slice(SCRIBE_PLAN_ACCEPTED_PREFIX.length).trim();
  try {
    const raw: unknown = JSON.parse(jsonPart);
    if (!raw || typeof raw !== 'object' || !('acceptedVersion' in raw)) return null;
    return raw as PlanAcceptedPayload;
  } catch {
    return null;
  }
}
