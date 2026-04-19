import { createOpenAI } from '@ai-sdk/openai';
import {
  InferAgentUIMessage,
  stepCountIs,
  ToolLoopAgent,
  type LanguageModel,
} from 'ai';

import { documentChatTools } from './document-chat-tools';

export type DocumentChatCallOptions = {
  /** Latest TipTap HTML snapshot — injected each turn via prepareCall */
  documentHtml: string;
  /** Optional unified diff vs last snapshot this session saw (user edits, other tabs, etc.) */
  documentChangeSummary?: string;
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

export function createDocumentChatAgent(options: {
  apiKey: string;
  modelId: string;
  maxOutputTokens: number;
}): DocumentChatAgentInstance {
  const openai = createOpenAI({ apiKey: options.apiKey });
  const model: LanguageModel = openai(options.modelId);
  return new ToolLoopAgent({
    model,
    instructions: BASE_INSTRUCTIONS,
    tools: documentChatTools,
    stopWhen: stepCountIs(16),
    maxOutputTokens: options.maxOutputTokens,
    ...(openAiModelSupportsTemperature(options.modelId)
      ? { temperature: 0.25 }
      : {}),
    prepareCall: (args) => {
      const base =
        typeof args.instructions === 'string' ? args.instructions : BASE_INSTRUCTIONS;
      const doc = args.options?.documentHtml ?? '';
      const delta = args.options?.documentChangeSummary?.trim();
      const deltaBlock =
        delta && delta.length > 0
          ? `\n\nDOCUMENT_CHANGE_SINCE_LAST_TURN (unified diff; CURRENT_DOCUMENT_HTML is authoritative):\n"""${delta}"""`
          : '';
      return {
        ...args,
        instructions: `${base}\n\nCURRENT_DOCUMENT_HTML:\n"""${doc}"""${deltaBlock}`,
      };
    },
  });
}
