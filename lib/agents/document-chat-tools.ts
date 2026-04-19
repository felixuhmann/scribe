import { tool } from 'ai';
import { z } from 'zod';

const clarificationQuestionSchema = z.object({
  prompt: z.string().describe('The clarification question shown to the user.'),
  // Use a length-3 array (not z.tuple): OpenAI structured-output rejects tuple JSON Schema.
  options: z
    .array(z.string())
    .length(3)
    .describe('Exactly three likely answers; the UI also offers a custom text field.'),
});

/** Shared with structured-output plan path (forced clarification round). */
export const planClarificationRequestSchema = z.object({
  questions: z.array(clarificationQuestionSchema).min(1).max(8),
});

export const documentChatTools = {
  requestClarifications: tool({
    description:
      'PLAN mode only. REQUIRED before setDocumentHtml (and before writing full drafts in chat) whenever the user wants new composed content in the document. Call this first with 1–8 questions; each needs three short option strings (the UI adds a custom field). Do not skip this for emails, letters, or similar requests. After replies starting with [SCRIBE_PLAN_ANSWERS], call again if needed, else setDocumentHtml.',
    inputSchema: planClarificationRequestSchema,
    execute: async (input) => ({
      questions: input.questions.map((q, i) => ({
        id: `q${i + 1}`,
        prompt: q.prompt,
        options: q.options,
      })),
    }),
  }),
  setDocumentHtml: tool({
    description: `Replace the entire document with new HTML. The editor uses TipTap (ProseMirror). Use semantic HTML the editor understands: paragraphs <p>, headings <h1>-<h3>, <strong>, <em>, <u>, <a href="...">, bullet lists <ul><li>, numbered <ol><li>, blockquote.
In PLAN mode (CHAT_MODE: plan), do not call this until after the user has responded with [SCRIBE_PLAN_ANSWERS] at least once for this writing task (unless the narrow "only analyzing existing doc" exception applies).
Only call this when the user clearly wants the document changed. Prefer minimal edits when fixing small issues.`,
    inputSchema: z.object({
      html: z
        .string()
        .describe(
          'Full document body as an HTML fragment (one or more block nodes). Will be passed to setContent.',
        ),
      rationale: z
        .string()
        .optional()
        .describe('One short sentence for the user describing what you changed.'),
    }),
    execute: async ({ html, rationale }) => ({
      ok: true as const,
      html,
      rationale: rationale ?? '',
    }),
  }),
};
