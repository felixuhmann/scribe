import { SCRIBE_PLAN_ANSWERS_PREFIX } from './plan-mode';

const PLAN_REFINEMENT_ROUNDS_MIN = 1;
const PLAN_REFINEMENT_ROUNDS_MAX = 8;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function extractUserTextFromMessage(m: unknown): string {
  if (!isRecord(m) || m.role !== 'user') return '';
  const parts = m.parts;
  if (!Array.isArray(parts)) return '';
  const texts: string[] = [];
  for (const p of parts) {
    if (!isRecord(p) || p.type !== 'text') continue;
    const t = p.text;
    if (typeof t === 'string') texts.push(t);
  }
  return texts.join('\n');
}

function assistantHasToolInState(
  m: unknown,
  partType: 'tool-setDocumentHtml' | 'tool-requestClarifications',
  state: string,
): boolean {
  if (!isRecord(m) || m.role !== 'assistant') return false;
  const parts = m.parts;
  if (!Array.isArray(parts)) return false;
  return parts.some(
    (p) =>
      isRecord(p) &&
      p.type === partType &&
      typeof p.state === 'string' &&
      p.state === state,
  );
}

/** Count of user messages whose text is a `[SCRIBE_PLAN_ANSWERS]` payload. */
export function countPlanAnswerMessages(messages: unknown[]): number {
  if (!Array.isArray(messages)) return 0;
  let n = 0;
  for (const m of messages) {
    const t = extractUserTextFromMessage(m).trim();
    if (t.startsWith(SCRIBE_PLAN_ANSWERS_PREFIX)) n++;
  }
  return n;
}

export function clampPlanRefinementRounds(n: number | undefined): number {
  if (n == null || Number.isNaN(n)) return 1;
  return Math.min(PLAN_REFINEMENT_ROUNDS_MAX, Math.max(PLAN_REFINEMENT_ROUNDS_MIN, Math.floor(n)));
}

export type PlanDepthMode = 'fixed' | 'auto';

export type PlanClarificationGateOptions = {
  /** How many plan Q&A rounds to run before the model may finalize (default 1). Used when mode is fixed. */
  planRefinementRounds?: number;
  /** `auto`: never force tool choice—the model decides when to clarify vs write, including extra rounds after scope changes. */
  planDepthMode?: PlanDepthMode;
};

/**
 * When true, the first model step should call `requestClarifications` (plan mode only).
 * Mirrors the former “forced clarification round” trigger without a second generateObject pass.
 *
 * With `planDepthMode: 'fixed'` and `planRefinementRounds` > 1, each user `[SCRIBE_PLAN_ANSWERS]` counts
 * as one round; we keep forcing `requestClarifications` until that many answer batches exist, then the
 * model may use `setDocumentHtml`.
 *
 * With `planDepthMode: 'auto'`, this always returns false so the model is never forced—only
 * instructed—to choose tools.
 */
export function shouldForcePlanClarificationRound(
  messages: unknown[],
  chatMode: 'edit' | 'plan',
  opts?: PlanClarificationGateOptions,
): boolean {
  const depthMode = opts?.planDepthMode ?? 'fixed';
  const rounds = clampPlanRefinementRounds(opts?.planRefinementRounds);
  if (chatMode !== 'plan') return false;
  if (!Array.isArray(messages) || messages.length < 1) return false;
  const last = messages[messages.length - 1];
  const text = extractUserTextFromMessage(last).trim();
  if (!text) return false;

  /** Auto depth: never force a tool—the model chooses clarifications vs HTML on every turn. */
  if (depthMode === 'auto') return false;

  if (text.startsWith(SCRIBE_PLAN_ANSWERS_PREFIX)) {
    const answered = countPlanAnswerMessages(messages);
    return answered < rounds;
  }

  if (messages.length === 1) return true;

  const prev = messages[messages.length - 2];
  if (!isRecord(prev) || prev.role !== 'assistant') return true;

  if (assistantHasToolInState(prev, 'tool-setDocumentHtml', 'output-available')) return false;
  if (assistantHasToolInState(prev, 'tool-requestClarifications', 'output-available')) return false;

  return true;
}
