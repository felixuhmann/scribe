import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { writePlanInputSchema } from '../plan-artifact';
import { DocumentBuffer, StrReplaceError } from './document-buffer';

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
  questions: z.array(clarificationQuestionSchema).min(1).max(6),
});

/**
 * Tools that don't depend on per-request state. Edit/read tools live in
 * `createDocumentTools` because they close over a `DocumentBuffer`.
 */
export const planTools = {
  requestClarifications: tool({
    description: `PLAN mode only. Before writePlan (and before full drafts in chat) for new composed content: follow PLAN_REFINEMENT_DEPTH. In FIXED depth, call until the configured rounds are done; in AUTO, you choose when to clarify—call again if scope or constraints change. 1–6 questions; three short options each (UI adds custom text). Later passes are often more specific, but a scope pivot may need fresh high-level questions.

Topic coverage: across the clarification rounds you should always cover both CONTENT (audience, key points, scope, structure, length) AND VOICE/STYLE (tone, formality register, person/POV, vocabulary level, formatting quirks like all-lowercase or em-dash usage, humor, jargon). If the user's brief already pins one of these down, don't re-ask it; if either CONTENT or VOICE is still ambiguous, that ambiguity is a question. Voice/style choices change the output more than most authors realize — never write a plan with style left implicit.`,
    inputSchema: planClarificationRequestSchema,
    execute: async (input) => ({
      questions: input.questions.map((q, i) => ({
        id: `q${i + 1}`,
        prompt: q.prompt,
        options: q.options,
      })),
    }),
  }),
  writePlan: tool({
    description: `PLAN mode only. Emit (or revise) the plan artifact for user review. Call this after clarifications are sufficient — never call any document edit tool in plan mode until the user has submitted [SCRIBE_PLAN_ACCEPTED].

A plan is a structured outline describing what the document should be — sections, key points, structure, AND the voice/style choices that govern how it will be written. It is NOT the final document HTML. Keep blocks short and specific so the user can review at a glance.

REQUIRED STRUCTURE — every plan must start with these two top-level headings, in this order:
1) "Voice & style" (level 1 heading, id "style") — followed by 3–8 bullets capturing concrete writing decisions. Each bullet should be one specific, checkable instruction the author could enforce later. Cover (only when relevant — skip what truly doesn't apply):
   - Tone register (e.g. formal/professional, conversational, playful, dry/academic, persuasive, instructional).
   - Voice & POV (first/second/third person; singular/plural; active vs passive bias).
   - Audience & reading level (who is reading; assumed knowledge; jargon allowed or not).
   - Sentence shape (short and punchy, flowing and discursive, balanced).
   - Formatting quirks the user explicitly asked for (e.g. "all lowercase", "em-dashes over commas", "no oxford commas", "no emoji", "use Markdown emphasis sparingly").
   - Vocabulary constraints (avoid certain words/phrases, prefer plain language, technical precision, etc.).
   - Humor & quirk level (deadpan, wry, none).
   - Length target / density.
   Lift these from the user's clarifications and prior context — don't invent style they didn't ask for. If something is genuinely undecided, write it as a bullet that names the choice (e.g. "Tone: warm-but-professional (assumption — flag if wrong)") so the user can comment on it.
2) "Outline" (level 1 heading, id "outline") — the section structure of the document, with sub-headings (level 2) per section and bullets for the key beats inside each section.

You may add further top-level headings after these (e.g. "Open questions", "Out of scope", "Sources to cite") when useful, but Voice & style and Outline are mandatory.

Block ids: REUSE incoming ids from the previous plan version when a block is preserved or only lightly edited (this keeps user comments anchored). Mint new ids (e.g. "v2.b7") only for newly added blocks. Do not renumber unchanged blocks. Always reuse the ids "style" and "outline" for the two top-level headings.

When PLAN_REVIEW_STATE includes user feedback (open comments + freeform note), revise the plan to address each comment. If a comment requested removing a section, drop that block (do not reuse its id). Comments anchored on Voice & style bullets must update those bullets — never silently override them later.

After calling writePlan, STOP. The user will review and either submit (you'll then receive [SCRIBE_PLAN_ACCEPTED] and execute the plan via the document edit tools) or request changes (you'll receive [SCRIBE_PLAN_FEEDBACK] and call writePlan again with v(N+1)).

Optional rationale: one short sentence describing what changed since the previous version (omit on v1).`,
    inputSchema: writePlanInputSchema,
    execute: async (input) => ({
      ok: true as const,
      blocks: input.blocks,
      rationale: input.rationale ?? '',
    }),
  }),
};

const getDocumentStatsInput = z.object({}).strict();

const readDocumentInput = z
  .object({
    offset: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('1-based starting line number. Defaults to 1.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(600)
      .optional()
      .describe('Maximum number of lines to return (default 100, hard cap 600).'),
  })
  .strict();

const searchDocumentInput = z
  .object({
    query: z.string().min(1).describe('Substring or regex pattern to search for.'),
    regex: z
      .boolean()
      .optional()
      .describe('Treat `query` as a JavaScript regex if true. Default false.'),
    caseInsensitive: z.boolean().optional().describe('Case-insensitive matching. Default false.'),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Cap on returned hits (total match count is always reported). Default 30.'),
  })
  .strict();

const strReplaceInput = z
  .object({
    oldText: z
      .string()
      .min(1)
      .describe(
        'Exact substring to replace. Must match the document UNIQUELY — include surrounding lines if needed.',
      ),
    newText: z
      .string()
      .describe(
        'Replacement text. May be empty to delete `oldText`. To insert content, replace a unique nearby line and include both the original line and the new content.',
      ),
  })
  .strict();

const appendDocumentInput = z
  .object({
    text: z
      .string()
      .min(1)
      .describe('Markdown to append to the end of the document. A blank line separator is added automatically when needed.'),
  })
  .strict();

export type DocumentTools = {
  getDocumentStats: Tool;
  readDocument: Tool;
  searchDocument: Tool;
  strReplace: Tool;
  appendDocument: Tool;
};

/**
 * Build the read+edit tools for one chat run, closing over a single
 * `DocumentBuffer` instance. Tools intentionally surface failures (e.g.
 * `strReplace` ambiguity) as structured `ok: false` outputs rather than
 * thrown errors — that way the model sees the failure as part of its
 * reasoning context and can re-read + retry.
 */
export function createDocumentTools(buffer: DocumentBuffer): DocumentTools {
  return {
    getDocumentStats: tool({
      description: `Read-only. Returns the document's line count, word count, character count, and a heading outline (each entry has a heading id, level, text, and the line range it covers). Cheap — call this first before any other read or edit when the document is non-trivially sized so you know the structure and where to look.`,
      inputSchema: getDocumentStatsInput,
      execute: async () => {
        const stats = buffer.getStats();
        return {
          ok: true as const,
          lineCount: stats.lineCount,
          wordCount: stats.wordCount,
          charCount: stats.charCount,
          outline: stats.outline,
        };
      },
    }),
    readDocument: tool({
      description: `Read-only. Returns a slice of the document as line-numbered Markdown ("123: <content>" per line). Use \`offset\` (1-based) to pick a starting line and \`limit\` to cap the slice (default 100, max 600). For small documents, calling once with \`limit: 600\` is fine. For larger documents, prefer reading the section you intend to edit (use \`getDocumentStats\` first to find the right line range from the outline).`,
      inputSchema: readDocumentInput,
      execute: async ({ offset, limit }) => {
        const result = buffer.read({ offset, limit });
        return { ok: true as const, ...result };
      },
    }),
    searchDocument: tool({
      description: `Read-only. Find every OCCURRENCE of \`query\` in the document — a line containing the query three times produces three hits, not one. The match runs against the RENDERED text (markdown inline formatting like \`**\`, \`*\`, \`_\`, \`~~\`, \`\\\\\` escapes, and code-span backticks are stripped before matching), so counts agree with what the user sees in the editor's find bar. Even if a word is split by formatting (e.g. \`**T**rump\`), it counts as one match.

Returns:
- totalMatches: total occurrences across the whole document (true count, post-rendering).
- matchingLines: distinct lines that contain at least one match.
- hits: array of { lineNumber, column, occurrenceIndex (1-based, doc-wide), preview (~80 chars of the RAW MARKDOWN line around the match — preview includes any inline formatting markers so you can use it directly in strReplace) }.
- truncated: true when totalMatches > hits.length (raise \`maxResults\` if you need more).

Substring match by default (case-sensitive); pass \`regex: true\` for a JavaScript regex (anchors apply per line; no cross-line matches). Pass \`caseInsensitive: true\` for case-insensitive matching. Default \`maxResults\` is 30 — raise to 100 for "find the Nth occurrence" tasks.

Tip: when \`preview\` includes inline formatting markers (e.g. \`**T**rump\`), include them verbatim in your strReplace \`oldText\` — the buffer stores the raw markdown.`,
      inputSchema: searchDocumentInput,
      execute: async ({ query, regex, caseInsensitive, maxResults }) => {
        const result = buffer.search({ query, regex, caseInsensitive, maxResults });
        return { ok: true as const, ...result };
      },
    }),
    strReplace: tool({
      description: `Edit. Replace the unique occurrence of \`oldText\` with \`newText\` in the document. STRICT RULES:
- \`oldText\` must match exactly ONE place in the current document. If it matches zero or multiple times, the tool fails and you must retry with more surrounding context (e.g. include the heading or sentence above/below the change).
- Use multiple small \`strReplace\` calls instead of one giant rewrite — easier to verify, easier to recover from a single bad edit.
- To insert new content, replace a unique nearby line with itself plus the new lines (e.g. oldText = "## Introduction", newText = "## Introduction\\n\\nNew paragraph.").
- To delete content, pass \`newText: ""\`.
- The result includes a small contextPreview around the edit so you can verify the change landed where you expected. If anything looks off, call \`readDocument\` and fix it.

Edits are applied to a server-side working buffer; the document is rewritten in the user's editor only after the agent run completes.`,
      inputSchema: strReplaceInput,
      execute: async ({ oldText, newText }) => {
        try {
          const result = buffer.strReplace(oldText, newText);
          return { ok: true as const, ...result };
        } catch (err) {
          if (err instanceof StrReplaceError) {
            return {
              ok: false as const,
              reason: err.reason,
              matchCount: err.matchCount,
              message: err.message,
            };
          }
          throw err;
        }
      },
    }),
    appendDocument: tool({
      description: `Edit. Append Markdown to the END of the document. Use this for additions that don't have a unique anchor (e.g. starting a brand-new section at the end). For mid-document insertions use \`strReplace\` against a unique nearby line.`,
      inputSchema: appendDocumentInput,
      execute: async ({ text }) => {
        const result = buffer.appendDocument(text);
        return { ok: true as const, ...result };
      },
    }),
  };
}

/** Schema for the synthetic `applyDocumentEdits` part the IPC layer emits. */
export const applyDocumentEditsOutputSchema = z.object({
  html: z.string().describe('Final document HTML to load into the editor.'),
  markdown: z.string().describe('Final document Markdown (mirrors the working buffer state).'),
  editCount: z.number().int().min(0),
  edits: z.array(
    z.object({
      kind: z.enum(['strReplace', 'appendDocument']),
      summary: z.string(),
      startLine: z.number().int().min(1),
      endLine: z.number().int().min(1),
    }),
  ),
  rationale: z.string().optional(),
  staleSnapshot: z
    .boolean()
    .optional()
    .describe('True when the live editor changed during the agent run; the user should review before applying.'),
});

/**
 * Static union of every tool the agent can call (or that IPC synthesizes).
 * Used by AI SDK message validation — it must include all tool names that
 * may appear in history across plan and edit modes.
 *
 * `applyDocumentEdits` is synthetic: the model never calls it; the IPC
 * handler emits it as the final tool-call of the assistant turn so the
 * renderer can apply the working buffer to the live editor (and persist a
 * record of the apply step in chat history).
 *
 * The execute functions here are placeholders: real per-request executors
 * are wired via `createDocumentTools` at agent construction time. We only
 * need correct schemas for `validateUIMessages` / `convertToModelMessages`.
 */
export const allKnownTools = {
  ...planTools,
  getDocumentStats: tool({
    description: 'Read document stats and outline.',
    inputSchema: getDocumentStatsInput,
    execute: async () => ({ ok: true as const }),
  }),
  readDocument: tool({
    description: 'Read a slice of the document.',
    inputSchema: readDocumentInput,
    execute: async () => ({ ok: true as const }),
  }),
  searchDocument: tool({
    description: 'Search the document for a substring or regex.',
    inputSchema: searchDocumentInput,
    execute: async () => ({ ok: true as const }),
  }),
  strReplace: tool({
    description: 'Replace a unique substring in the document.',
    inputSchema: strReplaceInput,
    execute: async () => ({ ok: true as const }),
  }),
  appendDocument: tool({
    description: 'Append Markdown to the end of the document.',
    inputSchema: appendDocumentInput,
    execute: async () => ({ ok: true as const }),
  }),
  applyDocumentEdits: tool({
    description: 'Synthetic — emitted by the server after the agent run to flush the working buffer to the editor.',
    inputSchema: z.object({}).strict(),
    /**
     * Never executed — the IPC layer streams a synthetic `tool-output-available`
     * chunk directly. The return type here exists purely so `tool-applyDocumentEdits`
     * UI parts type-check with the rich payload the renderer consumes.
     */
    execute: async (): Promise<{
      html: string;
      markdown: string;
      editCount: number;
      edits: Array<{
        kind: 'strReplace' | 'appendDocument';
        summary: string;
        startLine: number;
        endLine: number;
      }>;
      rationale?: string;
      staleSnapshot?: boolean;
    }> => {
      throw new Error('applyDocumentEdits is synthetic — never execute it.');
    },
  }),
};

/**
 * Backwards-compat re-export so existing imports of `documentChatTools`
 * keep working while the rest of the codebase migrates. Same shape as
 * `allKnownTools`; the real per-request executors come from
 * `createDocumentTools`.
 */
export const documentChatTools = allKnownTools;
