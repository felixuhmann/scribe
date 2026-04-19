import { SCRIBE_PLAN_ANSWERS_PREFIX } from './plan-mode';

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

/**
 * When true, the first model step should call `requestClarifications` (plan mode only).
 * Mirrors the former “forced clarification round” trigger without a second generateObject pass.
 */
export function shouldForcePlanClarificationRound(
  messages: unknown[],
  chatMode: 'edit' | 'plan',
): boolean {
  if (chatMode !== 'plan') return false;
  if (!Array.isArray(messages) || messages.length < 1) return false;
  const last = messages[messages.length - 1];
  const text = extractUserTextFromMessage(last).trim();
  if (!text || text.startsWith(SCRIBE_PLAN_ANSWERS_PREFIX)) return false;

  if (messages.length === 1) return true;

  const prev = messages[messages.length - 2];
  if (!isRecord(prev) || prev.role !== 'assistant') return true;

  if (assistantHasToolInState(prev, 'tool-setDocumentHtml', 'output-available')) return false;
  if (assistantHasToolInState(prev, 'tool-requestClarifications', 'output-available')) return false;

  return true;
}
