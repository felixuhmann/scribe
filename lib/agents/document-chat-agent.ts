import { createOpenAI } from '@ai-sdk/openai';
import {
  InferAgentUIMessage,
  stepCountIs,
  ToolLoopAgent,
  type LanguageModel,
} from 'ai';

import { documentChatTools } from './document-chat-tools';

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
};

/** Model reference used only for typing message/tool unions */
export type DocumentChatAgentInstance = ToolLoopAgent<
  DocumentChatCallOptions,
  typeof documentChatTools,
  never
>;

export type DocumentChatUIMessage = InferAgentUIMessage<DocumentChatAgentInstance>;

function openAiModelSupportsTemperature(modelId: string): boolean {
  const id = modelId.toLowerCase();
  if (id.startsWith('gpt-5')) return false;
  if (id.startsWith('o1') || id.startsWith('o3')) return false;
  return true;
}

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

const PLAN_MODE_INSTRUCTIONS = `PLAN MODE is active (CHAT_MODE: plan). Clarification is mandatory for this product—do not treat it as optional.

Hard rules:
1) If the user wants new writing in the document—email, letter, post, notes, report, rewrite, or any composed text you would put in the editor—you MUST call the tool requestClarifications in your FIRST step before setDocumentHtml and before supplying document-ready prose.
2) Until the user has sent at least one message whose text starts with [SCRIBE_PLAN_ANSWERS], you MUST NOT: call setDocumentHtml; paste or write full drafts, sample emails, letter bodies, or other ready-to-paste content in your visible assistant message. One short sentence (e.g. that you will ask a few questions) is OK; a full draft is NOT.
3) After each [SCRIBE_PLAN_ANSWERS] reply, either call requestClarifications again if something important is still unknown, or call setDocumentHtml with the final HTML. Only skip a second clarification round when their answers already fully specify tone, length, audience, and format.

requestClarifications tool usage:
- Call it with 1–6 questions. Each needs a clear prompt and exactly three distinct short option strings (ids q1, q2, … are assigned for you). The UI adds a fourth "custom" field per question—do not add a fake fourth option in the tool.
- Questions should cover what you need for a solid result (e.g. formality, channel email vs Slack, how much detail, tone, urgency).

The only narrow exception to calling requestClarifications first: the user is purely asking about text already in CURRENT_DOCUMENT_HTML (summarize, explain, critique) with no request to compose or change the document. In that case answer in text only and do not use setDocumentHtml unless they ask to apply edits later.

User answers after clarifications look like: [SCRIBE_PLAN_ANSWERS] then JSON with "answers" (optionIndex 0–2 or "custom" per id) and optional "summaryLines".`;

export function createDocumentChatAgent(options: {
  apiKey: string;
  modelId: string;
  maxOutputTokens: number;
  mode: DocumentChatMode;
}): DocumentChatAgentInstance {
  const openai = createOpenAI({ apiKey: options.apiKey });
  const model: LanguageModel = openai(options.modelId);
  const instructions =
    options.mode === 'plan' ? `${BASE_INSTRUCTIONS}\n\n${PLAN_MODE_INSTRUCTIONS}` : BASE_INSTRUCTIONS;

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
    const prevCtx =
      args.experimental_context != null && typeof args.experimental_context === 'object'
        ? (args.experimental_context as Record<string, unknown>)
        : {};
    return {
      ...args,
      instructions: `${base}${modeLine}\n\nCURRENT_DOCUMENT_HTML:\n"""${doc}"""${deltaBlock}`,
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
    ...(openAiModelSupportsTemperature(options.modelId) ? { temperature: 0.25 } : {}),
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
