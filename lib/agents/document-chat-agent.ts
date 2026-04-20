import {
  InferAgentUIMessage,
  stepCountIs,
  ToolLoopAgent,
} from 'ai';

import { buildLlmCall } from '../llm';
import { SCRIBE_PLAN_ANSWERS_PREFIX } from '../plan-answers-protocol';
import { documentChatTools } from './document-chat-tools';

const PLAN_REFINEMENT_ROUNDS_MIN = 1;
const PLAN_REFINEMENT_ROUNDS_MAX = 8;

export type PlanDepthMode = 'fixed' | 'auto';

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

export type PlanClarificationGateOptions = {
  /** How many plan Q&A rounds to run before the model may finalize (default 1). Used when mode is fixed. */
  planRefinementRounds?: number;
  /** `auto`: never force tool choice—the model decides when to clarify vs write, including extra rounds after scope changes. */
  planDepthMode?: PlanDepthMode;
};

/**
 * When true, the first model step should call `requestClarifications` (plan mode only).
 * Mirrors the former "forced clarification round" trigger without a second generateObject pass.
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

export type DocumentChatMode = 'edit' | 'plan';

export type DocumentChatExperimentalContext = {
  planForceRequestClarifications?: boolean;
};

export type DocumentChatCallOptions = {
  /** Latest TipTap HTML snapshot — injected each turn via prepareCall */
  documentHtml: string;
  /** Optional unified diff vs last snapshot this session saw (user edits, other tabs, etc.) */
  documentChangeSummary?: string;
  /**
   * When true (plan mode only), step 0 uses toolChoice requestClarifications.
   * Set from IPC using the same rules as the former forced clarification round.
   */
  planForceRequestClarifications?: boolean;
  /** Configured plan depth (total Q&A rounds). */
  planRefinementRounds?: number;
  /** How many `[SCRIBE_PLAN_ANSWERS]` user messages are in this thread. */
  planAnswerCount?: number;
  /** Matches the session's plan depth setting (fixed rounds vs model-led). */
  planDepthMode?: PlanDepthMode;
};

/** Model reference used only for typing message/tool unions */
export type DocumentChatAgentInstance = ToolLoopAgent<
  DocumentChatCallOptions,
  typeof documentChatTools,
  never
>;

export type DocumentChatUIMessage = InferAgentUIMessage<DocumentChatAgentInstance>;

const BASE_INSTRUCTIONS = `You are Scribe's document assistant. You see the user's chat messages plus the CURRENT_DOCUMENT_HTML block that mirrors what is in their editor right now. If DOCUMENT_CHANGE_SINCE_LAST_TURN is present, it summarizes edits since your last completed turn in this thread; always treat CURRENT_DOCUMENT_HTML as the single source of truth.

Goals:
- Answer questions about the document (tone, structure, clarity).
- When asked to revise, rewrite, shorten, expand, fix grammar, or change formatting, call setDocumentHtml with complete replacement HTML that preserves intent unless asked otherwise.
- Do not invent facts about the author or external context not implied by the document.
- After substantive edits, briefly explain what you changed in plain language (the rationale field covers tool execution; you may still summarize in visible assistant text).

When you should NOT rewrite the whole document: simple questions like "what is this about?" — reply with analysis only.

HTML rules:
- Output clean HTML fragments only (no <!DOCTYPE>, no html/body wrappers).
- Prefer existing structure where possible unless restructuring was requested.`;

const PLAN_MODE_INSTRUCTIONS_FIXED = `PLAN MODE is active (CHAT_MODE: plan). Clarification is mandatory for this product—do not treat it as optional.

The PLAN_REFINEMENT_DEPTH block in your instructions states the configured number of Q&A rounds, which question round you are on, and how many plan-answer messages the user has already submitted. Follow it closely.

Hard rules:
1) If the user wants new writing in the document—email, letter, post, notes, report, rewrite, or any composed text you would put in the editor—you MUST call the tool requestClarifications in your FIRST step before setDocumentHtml and before supplying document-ready prose—until PLAN_REFINEMENT_DEPTH says all configured rounds are complete.
2) Until the user has submitted enough [SCRIBE_PLAN_ANSWERS] messages for the configured round count, you MUST NOT: call setDocumentHtml; paste or write full drafts, sample emails, letter bodies, or other ready-to-paste content in your visible assistant message. One short sentence (e.g. that you will ask a few questions) is OK; a full draft is NOT.
3) Refinement rounds must increase in specificity: round 1 asks broad goals, audience, and shape; later rounds ask tighter follow-ups (edge cases, wording preferences, structure details) based on prior answers. After the final configured round of answers, call setDocumentHtml with the final HTML.

requestClarifications tool usage:
- Call it with 1–6 questions. Each needs a clear prompt and exactly three distinct short option strings (ids q1, q2, … are assigned for you). The UI adds a fourth "custom" field per question—do not add a fake fourth option in the tool.
- Tailor depth to the current round (see PLAN_REFINEMENT_DEPTH).

The only narrow exception to calling requestClarifications first: the user is purely asking about text already in CURRENT_DOCUMENT_HTML (summarize, explain, critique) with no request to compose or change the document. In that case answer in text only and do not use setDocumentHtml unless they ask to apply edits later.

User answers after clarifications look like: [SCRIBE_PLAN_ANSWERS] then JSON with "answers" (optionIndex 0–2 or "custom" per id) and optional "summaryLines".`;

const PLAN_MODE_INSTRUCTIONS_AUTO = `PLAN MODE is active (CHAT_MODE: plan) with ADAPTIVE DEPTH (AUTO). There is no fixed number of clarification rounds—you judge when you have enough context to produce a satisfactory document.

Follow PLAN_REFINEMENT_DEPTH for the running summary of structured answers so far.

Principles:
1) New writing (email, letter, post, report, etc.): usually call requestClarifications first unless the user's message is already a complete brief (audience, channel/format, approximate length, tone, and main points). If anything material is still unknown, clarify before setDocumentHtml.
2) You may call setDocumentHtml as soon as you can write text that matches the request with acceptable specificity—do not pad with extra rounds.
3) Dynamic scope: if the user (in chat or via [SCRIBE_PLAN_ANSWERS]) adds requirements, contradicts earlier choices, narrows/widens scope, or introduces a new constraint, treat that as a new decision point: call requestClarifications again if you need structured choices, or ask one targeted question in chat if enough. Never lock yourself to a prior plan when the request has materially changed.
4) Until you call setDocumentHtml: do not paste full drafts or ready-to-send bodies in visible chat—short acknowledgments are OK.

requestClarifications: 1–6 questions, three short options each (UI adds custom text per question).

The narrow exception: user only wants analysis of existing CURRENT_DOCUMENT_HTML with no composition—reply in text; use setDocumentHtml only if they ask to apply edits.

User answers after clarifications look like: [SCRIBE_PLAN_ANSWERS] then JSON with "answers" (optionIndex 0–2 or "custom" per id) and optional "summaryLines".`;

export function createDocumentChatAgent(options: {
  apiKey: string;
  modelId: string;
  maxOutputTokens: number;
  mode: DocumentChatMode;
  /** Plan mode only. Default fixed (mandatory rounds per depth setting). */
  planDepthMode?: PlanDepthMode;
}): DocumentChatAgentInstance {
  const { model, temperatureOption } = buildLlmCall({
    apiKey: options.apiKey,
    modelId: options.modelId,
    temperature: 0.25,
  });
  const planDepthMode = options.planDepthMode ?? 'fixed';
  const planInstructions =
    planDepthMode === 'auto' ? PLAN_MODE_INSTRUCTIONS_AUTO : PLAN_MODE_INSTRUCTIONS_FIXED;
  const instructions =
    options.mode === 'plan' ? `${BASE_INSTRUCTIONS}\n\n${planInstructions}` : BASE_INSTRUCTIONS;

  const prepareCall = (args: Record<string, unknown>) => {
    const inst = args.instructions;
    const base = typeof inst === 'string' ? inst : instructions;
    const docOpts = args.options as DocumentChatCallOptions | undefined;
    const doc = docOpts?.documentHtml ?? '';
    const delta = docOpts?.documentChangeSummary?.trim();
    const deltaBlock =
      delta && delta.length > 0
        ? `\n\nDOCUMENT_CHANGE_SINCE_LAST_TURN (unified diff; CURRENT_DOCUMENT_HTML is authoritative):\n"""${delta}"""`
        : '';
    const modeLine = `\n\nCHAT_MODE: ${options.mode}`;
    const planForce = docOpts?.planForceRequestClarifications === true;
    const depthMode = docOpts?.planDepthMode ?? planDepthMode;
    const totalRounds = docOpts?.planRefinementRounds ?? 1;
    const answerCount = docOpts?.planAnswerCount ?? 0;
    const planDepthBlock =
      options.mode === 'plan'
        ? depthMode === 'auto'
          ? `\n\nPLAN_REFINEMENT_DEPTH (AUTO — adaptive):
- User [SCRIBE_PLAN_ANSWERS] submissions so far: ${answerCount}.
- No fixed round quota: you decide when context is sufficient to call setDocumentHtml. Prefer clarifying when material details are missing; do not add rounds for their own sake.
- If the latest user message (text or structured answers) materially changes scope, audience, format, tone, or constraints, reassess: call requestClarifications again for a new structured pass, or ask a brief follow-up in chat.
- Each clarification pass can go broader or deeper as fits the situation; later passes often narrow in, but a scope pivot may require fresh high-level questions.`
          : `\n\nPLAN_REFINEMENT_DEPTH (FIXED):
- Configured refinement rounds (Q&A cycles): ${totalRounds}.
- User [SCRIBE_PLAN_ANSWERS] submissions so far: ${answerCount}.
- This turn's clarification round index (1-based): ${Math.min(answerCount + 1, totalRounds)}.
${
  answerCount >= totalRounds
    ? '- All configured refinement rounds are complete. Call setDocumentHtml with the final HTML for the writing task. Do not call requestClarifications unless the narrow "only analyzing existing doc" exception applies.'
    : `- Ask questions appropriate for round ${answerCount + 1} of ${totalRounds}: ${
        answerCount === 0
          ? 'stay broad (goal, audience, format, length band).'
          : answerCount + 1 >= totalRounds
            ? 'this is the last planned round—cover any remaining specifics needed before writing (edge cases, tone tweaks, must-haves).'
            : 'go deeper than before—narrower follow-ups based on what they already chose.'
      }`
}`
        : '';
    const prevCtx =
      args.experimental_context != null && typeof args.experimental_context === 'object'
        ? (args.experimental_context as Record<string, unknown>)
        : {};
    return {
      ...args,
      instructions: `${base}${modeLine}${planDepthBlock}\n\nCURRENT_DOCUMENT_HTML:\n"""${doc}"""${deltaBlock}`,
      experimental_context: {
        ...prevCtx,
        planForceRequestClarifications: planForce,
      } satisfies DocumentChatExperimentalContext,
    };
  };

  const baseAgent = {
    model,
    instructions,
    stopWhen: stepCountIs(options.mode === 'plan' ? 24 : 16),
    maxOutputTokens: options.maxOutputTokens,
    ...temperatureOption,
  };

  if (options.mode === 'plan') {
    return new ToolLoopAgent({
      ...baseAgent,
      tools: documentChatTools,
      prepareCall: prepareCall as never,
      prepareStep: async ({ stepNumber, experimental_context }) => {
        if (stepNumber !== 0) return {};
        const ctx = experimental_context as DocumentChatExperimentalContext | undefined;
        if (!ctx?.planForceRequestClarifications) return {};
        return {
          toolChoice: { type: 'tool' as const, toolName: 'requestClarifications' as const },
        };
      },
    }) as DocumentChatAgentInstance;
  }

  return new ToolLoopAgent({
    ...baseAgent,
    tools: { setDocumentHtml: documentChatTools.setDocumentHtml },
    prepareCall: prepareCall as never,
  }) as unknown as DocumentChatAgentInstance;
}
