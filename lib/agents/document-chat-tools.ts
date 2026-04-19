import { tool } from 'ai';
import { z } from 'zod';

export const documentChatTools = {
  setDocumentHtml: tool({
    description: `Replace the entire document with new HTML. The editor uses TipTap (ProseMirror). Use semantic HTML the editor understands: paragraphs <p>, headings <h1>-<h3>, <strong>, <em>, <u>, <a href="...">, bullet lists <ul><li>, numbered <ol><li>, blockquote.
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
