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
      'PLAN mode only. Before setDocumentHtml (and before full drafts in chat) for new composed content: follow PLAN_REFINEMENT_DEPTH. In FIXED depth, call until the configured rounds are done; in AUTO, you choose when to clarify—call again if scope or constraints change. 1–8 questions; three short options each (UI adds custom text). Later passes are often more specific, but a scope pivot may need fresh high-level questions.',
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
In PLAN mode (CHAT_MODE: plan), follow PLAN_REFINEMENT_DEPTH: in FIXED mode wait for enough [SCRIBE_PLAN_ANSWERS] batches; in AUTO mode call when you can deliver a satisfactory document, unless the narrow "only analyzing existing doc" exception applies.
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
