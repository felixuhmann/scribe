import {
  InferAgentUIMessage,
  stepCountIs,
  ToolLoopAgent,
} from 'ai';

import { buildLlmCall } from '../llm';
import {
  SCRIBE_PLAN_ACCEPTED_PREFIX,
  SCRIBE_PLAN_ANSWERS_PREFIX,
  SCRIBE_PLAN_FEEDBACK_PREFIX,
  tryParsePlanAcceptedUserText,
  tryParsePlanFeedbackUserText,
} from '../plan-answers-protocol';
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
  partType:
    | 'tool-setDocumentHtml'
    | 'tool-requestClarifications'
    | 'tool-writePlan',
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

/** Count of user messages whose text is a `[SCRIBE_PLAN_FEEDBACK]` payload. */
export function countPlanFeedbackMessages(messages: unknown[]): number {
  if (!Array.isArray(messages)) return 0;
  let n = 0;
  for (const m of messages) {
    const t = extractUserTextFromMessage(m).trim();
    if (t.startsWith(SCRIBE_PLAN_FEEDBACK_PREFIX)) n++;
  }
  return n;
}

/** Parse the latest [SCRIBE_PLAN_FEEDBACK] payload from the message stream, if any. */
export function findLatestPlanFeedback(messages: unknown[]) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = extractUserTextFromMessage(messages[i]).trim();
    if (!t.startsWith(SCRIBE_PLAN_FEEDBACK_PREFIX)) continue;
    const parsed = tryParsePlanFeedbackUserText(t);
    if (parsed) return parsed;
  }
  return null;
}

/** Parse the latest [SCRIBE_PLAN_ACCEPTED] payload, if any. */
export function findLatestPlanAccepted(messages: unknown[]) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = extractUserTextFromMessage(messages[i]).trim();
    if (!t.startsWith(SCRIBE_PLAN_ACCEPTED_PREFIX)) continue;
    const parsed = tryParsePlanAcceptedUserText(t);
    if (parsed) return parsed;
  }
  return null;
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
 *
 * With `planDepthMode: 'fixed'` and `planRefinementRounds` > 1, each user `[SCRIBE_PLAN_ANSWERS]` counts
 * as one round; we keep forcing `requestClarifications` until that many answer batches exist, then the
 * model moves on to `writePlan`.
 *
 * With `planDepthMode: 'auto'`, this always returns false so the model is never forced—only
 * instructed—to choose tools.
 *
 * Once we are in the plan-review/feedback/accept phase (any of those user messages exist after the
 * last clarification), we no longer force this — `shouldForcePlanWrite` and `shouldForcePlanExecute`
 * take over.
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

  /** Once the user has accepted or sent feedback on a plan, we are past the clarification phase. */
  if (
    text.startsWith(SCRIBE_PLAN_ACCEPTED_PREFIX) ||
    text.startsWith(SCRIBE_PLAN_FEEDBACK_PREFIX)
  ) {
    return false;
  }

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
  if (assistantHasToolInState(prev, 'tool-writePlan', 'output-available')) return false;
  if (assistantHasToolInState(prev, 'tool-requestClarifications', 'output-available')) return false;

  return true;
}

/**
 * In plan mode, force `writePlan` on step 0 when:
 * - The latest user message is `[SCRIBE_PLAN_FEEDBACK]` (revise current plan), OR
 * - Clarifications are complete (no force-clarify) and no plan exists yet, AND
 *   the user is asking for new composed content.
 *
 * This is the bridge between "clarifications done" and "user reviews a plan".
 */
export function shouldForcePlanWrite(
  messages: unknown[],
  chatMode: 'edit' | 'plan',
  opts?: PlanClarificationGateOptions,
): boolean {
  if (chatMode !== 'plan') return false;
  if (!Array.isArray(messages) || messages.length < 1) return false;
  const last = messages[messages.length - 1];
  const text = extractUserTextFromMessage(last).trim();
  if (!text) return false;

  if (text.startsWith(SCRIBE_PLAN_ACCEPTED_PREFIX)) return false;

  if (text.startsWith(SCRIBE_PLAN_FEEDBACK_PREFIX)) return true;

  /** If clarification gate fires, that wins — don't double-force. */
  if (shouldForcePlanClarificationRound(messages, chatMode, opts)) return false;

  if (text.startsWith(SCRIBE_PLAN_ANSWERS_PREFIX)) {
    /** Final answer round complete (fixed-depth) → write plan. */
    return true;
  }
  return false;
}

/**
 * Force `setDocumentHtml` on step 0 when the latest user message is
 * `[SCRIBE_PLAN_ACCEPTED]` — the user has signed off on the plan and we now
 * execute it against the document.
 */
export function shouldForcePlanExecute(
  messages: unknown[],
  chatMode: 'edit' | 'plan',
): boolean {
  if (chatMode !== 'plan') return false;
  if (!Array.isArray(messages) || messages.length < 1) return false;
  const last = messages[messages.length - 1];
  const text = extractUserTextFromMessage(last).trim();
  return text.startsWith(SCRIBE_PLAN_ACCEPTED_PREFIX);
}

export type DocumentChatMode = 'edit' | 'plan';

export type PlanForceMode =
  | 'none'
  | 'requestClarifications'
  | 'writePlan'
  | 'setDocumentHtml';

export type DocumentChatExperimentalContext = {
  planForceMode?: PlanForceMode;
};

export type DocumentChatCallOptions = {
  /** Latest TipTap HTML snapshot — injected each turn via prepareCall */
  documentHtml: string;
  /** Optional unified diff vs last snapshot this session saw (user edits, other tabs, etc.) */
  documentChangeSummary?: string;
  /**
   * Which tool (if any) the agent should be forced to call on step 0.
   * Set in IPC based on the message stream.
   */
  planForceMode?: PlanForceMode;
  /** Configured plan depth (total Q&A rounds). */
  planRefinementRounds?: number;
  /** How many `[SCRIBE_PLAN_ANSWERS]` user messages are in this thread. */
  planAnswerCount?: number;
  /** How many `[SCRIBE_PLAN_FEEDBACK]` user messages are in this thread. */
  planFeedbackCount?: number;
  /** Matches the session's plan depth setting (fixed rounds vs model-led). */
  planDepthMode?: PlanDepthMode;
  /** Latest plan version number the user has been shown (0 if none yet). */
  planCurrentVersion?: number;
  /** Latest plan blocks as plain text — included as model context for revisions and execution. */
  planLatestText?: string;
  /** Open comments on the current plan version, grouped for the model. */
  planOpenComments?: Array<{
    blockId: string;
    selectionText?: string;
    body: string;
  }>;
  /** Freeform note from the latest [SCRIBE_PLAN_FEEDBACK]. */
  planFeedbackNote?: string;
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

const PLAN_MODE_INSTRUCTIONS_FIXED = `PLAN MODE is active (CHAT_MODE: plan). The plan-review workflow is mandatory for new composed content—do not treat any step as optional.

Workflow:
1) Clarifications: call requestClarifications until PLAN_REFINEMENT_DEPTH says all configured rounds are complete. Each round increases in specificity (round 1 broad goals/audience/shape; later rounds tighten on edge cases, wording, structure). Across the rounds, always probe BOTH content (audience, scope, key points, structure, length) AND voice/style (tone, formality register, POV, formatting quirks, humor, vocabulary level) — voice/style is not optional and must be settled before writePlan.
2) Write plan: once clarifications are done, call writePlan with a structured outline. Every plan MUST begin with a "Voice & style" section (heading id "style") of 3–8 concrete bullets capturing tone, voice/POV, audience, sentence shape, formatting quirks, vocabulary rules, humor level, and length target as relevant — followed by an "Outline" section (heading id "outline") describing the document structure. Do NOT call setDocumentHtml here. Stop after writePlan — the user will review.
3) Revise on feedback: when the user submits [SCRIBE_PLAN_FEEDBACK] (open comments + optional freeform note), call writePlan again with v(N+1). Address each comment. Reuse block ids for preserved blocks; mint new ids only for newly added blocks. Comments on Voice & style bullets must update those bullets in the new version, not be quietly ignored.
4) Execute on accept: when the user submits [SCRIBE_PLAN_ACCEPTED], call setDocumentHtml writing the document according to the accepted plan. The plan is the source of truth — do not silently drop sections, change tone, or pivot scope. The Voice & style bullets are HARD constraints on how you write the prose: tone, POV, formatting quirks (e.g. all-lowercase, em-dash usage), and vocabulary rules apply to every paragraph of output.

Hard rules:
- Until clarifications are complete, do NOT call writePlan or setDocumentHtml, and do NOT paste full drafts in chat. One short sentence (e.g. that you'll ask a few questions) is OK.
- Until [SCRIBE_PLAN_ACCEPTED], do NOT call setDocumentHtml. The plan must be reviewed first.
- Block-id stability: when revising the plan in v(N+1), reuse incoming block ids for preserved/lightly-edited content. Only mint new ids for new blocks. This keeps user comments anchored. Always reuse "style" and "outline" for the two mandatory top-level headings.
- Voice/style fidelity: never write the document in a tone or with formatting that contradicts the accepted Voice & style bullets, even if it produces less conventionally "polished" prose. The user chose those constraints deliberately.

requestClarifications usage: 1–6 questions, exactly three short option strings each (UI adds a fourth custom field — do not add a fake fourth option). Tailor depth to PLAN_REFINEMENT_DEPTH. Spend at least one question on voice/style if it is not already pinned down.

The narrow exception: the user is purely analyzing existing CURRENT_DOCUMENT_HTML (summarize, explain, critique) with no request to compose or change. Reply in text only; do not call any tool.

User messages: [SCRIBE_PLAN_ANSWERS] = answers to clarifications; [SCRIBE_PLAN_FEEDBACK] = comments on the plan; [SCRIBE_PLAN_ACCEPTED] = sign-off, write the document now.`;

const PLAN_MODE_INSTRUCTIONS_AUTO = `PLAN MODE is active (CHAT_MODE: plan) with ADAPTIVE DEPTH (AUTO). You judge when context is sufficient — but the plan-review workflow itself is still mandatory.

Workflow (same as fixed mode, but you control how many clarification rounds):
1) Clarifications: call requestClarifications when material details (audience, format, tone, length, key points, voice/style quirks) are still unknown. Skip if the user's brief is already complete. Voice/style (tone, POV, formatting quirks, vocabulary, humor) is just as material as content — if it is unspecified, ask before you write the plan.
2) Write plan: once you can describe the document with acceptable specificity, call writePlan. Every plan MUST begin with a "Voice & style" section (heading id "style") of 3–8 concrete bullets, then an "Outline" section (heading id "outline"). Do NOT call setDocumentHtml here.
3) Revise on [SCRIBE_PLAN_FEEDBACK]: call writePlan again with v(N+1). Reuse block ids for preserved content; mint new ids only for new blocks. Style comments must update style bullets, not be ignored.
4) Execute on [SCRIBE_PLAN_ACCEPTED]: call setDocumentHtml strictly per the accepted plan. The Voice & style bullets are HARD constraints on how you write the prose — apply them consistently across the whole document.

Hard rules (same as fixed):
- Until [SCRIBE_PLAN_ACCEPTED], do NOT call setDocumentHtml.
- Until you call writePlan: do not paste full drafts in chat.
- Dynamic scope: if a [SCRIBE_PLAN_FEEDBACK] or new user message materially shifts scope, audience, format, tone, or voice, treat it as a new decision point — call requestClarifications again if structured choices are needed, or revise the plan via writePlan.
- Block-id stability: reuse incoming ids in v(N+1); only mint new ids for new blocks. Always reuse "style" and "outline" for the two mandatory top-level headings.
- Voice/style fidelity: never write the document in a tone or with formatting that contradicts the accepted Voice & style bullets.

requestClarifications: 1–6 questions, three short options each. If voice/style isn't pinned down by the brief, spend a question on it.

The narrow exception: user only wants analysis of existing CURRENT_DOCUMENT_HTML — reply in text; do not call any tool.

User messages: [SCRIBE_PLAN_ANSWERS], [SCRIBE_PLAN_FEEDBACK], [SCRIBE_PLAN_ACCEPTED] — see fixed-mode description.`;

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
    const planForceMode: PlanForceMode = docOpts?.planForceMode ?? 'none';
    const depthMode = docOpts?.planDepthMode ?? planDepthMode;
    const totalRounds = docOpts?.planRefinementRounds ?? 1;
    const answerCount = docOpts?.planAnswerCount ?? 0;
    const feedbackCount = docOpts?.planFeedbackCount ?? 0;
    const currentVersion = docOpts?.planCurrentVersion ?? 0;
    const latestPlanText = docOpts?.planLatestText?.trim() ?? '';
    const openComments = docOpts?.planOpenComments ?? [];
    const feedbackNote = docOpts?.planFeedbackNote?.trim() ?? '';

    const planDepthBlock =
      options.mode === 'plan'
        ? depthMode === 'auto'
          ? `\n\nPLAN_REFINEMENT_DEPTH (AUTO — adaptive):
- User [SCRIBE_PLAN_ANSWERS] submissions so far: ${answerCount}.
- No fixed round quota: you decide when context is sufficient to call writePlan. Prefer clarifying when material details are missing; do not add rounds for their own sake.
- If the latest user message (text or structured answers) materially changes scope, audience, format, tone, or constraints, reassess: call requestClarifications again for a new structured pass, or revise via writePlan.
- Each clarification pass can go broader or deeper as fits the situation; later passes often narrow in, but a scope pivot may require fresh high-level questions.`
          : `\n\nPLAN_REFINEMENT_DEPTH (FIXED):
- Configured refinement rounds (Q&A cycles): ${totalRounds}.
- User [SCRIBE_PLAN_ANSWERS] submissions so far: ${answerCount}.
- This turn's clarification round index (1-based): ${Math.min(answerCount + 1, totalRounds)}.
${
  answerCount >= totalRounds
    ? '- All configured refinement rounds are complete. Call writePlan for the writing task. Do not call requestClarifications unless the narrow "only analyzing existing doc" exception applies.'
    : `- Ask questions appropriate for round ${answerCount + 1} of ${totalRounds}: ${
        answerCount === 0
          ? 'stay broad (goal, audience, format, length band).'
          : answerCount + 1 >= totalRounds
            ? 'this is the last planned round—cover any remaining specifics needed before writing (edge cases, tone tweaks, must-haves).'
            : 'go deeper than before—narrower follow-ups based on what they already chose.'
      }`
}`
        : '';

    const planReviewBlock =
      options.mode === 'plan'
        ? `\n\nPLAN_REVIEW_STATE:
- Latest plan version shown to user: ${currentVersion === 0 ? 'none yet' : `v${currentVersion}`}.
- [SCRIBE_PLAN_FEEDBACK] revisions so far: ${feedbackCount}.
${
  latestPlanText.length > 0
    ? `- Current plan (v${currentVersion}) blocks (id | text):\n"""\n${latestPlanText}\n"""`
    : '- No plan written yet.'
}
${
  openComments.length > 0
    ? `- Open user comments to address in the next writePlan call:\n${openComments
        .map(
          (c, i) =>
            `  ${i + 1}. block=${c.blockId}${
              c.selectionText ? ` selection="${c.selectionText.slice(0, 120)}"` : ''
            } — ${c.body}`,
        )
        .join('\n')}`
    : '- No open comments.'
}
${feedbackNote ? `- Freeform feedback note: "${feedbackNote}"` : ''}`
        : '';

    const prevCtx =
      args.experimental_context != null && typeof args.experimental_context === 'object'
        ? (args.experimental_context as Record<string, unknown>)
        : {};
    return {
      ...args,
      instructions: `${base}${modeLine}${planDepthBlock}${planReviewBlock}\n\nCURRENT_DOCUMENT_HTML:\n"""${doc}"""${deltaBlock}`,
      experimental_context: {
        ...prevCtx,
        planForceMode,
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
        const force = ctx?.planForceMode ?? 'none';
        if (force === 'requestClarifications') {
          return {
            toolChoice: { type: 'tool' as const, toolName: 'requestClarifications' as const },
          };
        }
        if (force === 'writePlan') {
          return { toolChoice: { type: 'tool' as const, toolName: 'writePlan' as const } };
        }
        if (force === 'setDocumentHtml') {
          return { toolChoice: { type: 'tool' as const, toolName: 'setDocumentHtml' as const } };
        }
        return {};
      },
    }) as DocumentChatAgentInstance;
  }

  return new ToolLoopAgent({
    ...baseAgent,
    tools: { setDocumentHtml: documentChatTools.setDocumentHtml },
    prepareCall: prepareCall as never,
  }) as unknown as DocumentChatAgentInstance;
}
