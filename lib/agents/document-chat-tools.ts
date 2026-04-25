import { tool } from 'ai';
import { z } from 'zod';

import { writePlanInputSchema } from '../plan-artifact';

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

export const documentChatTools = {
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
    description: `PLAN mode only. Emit (or revise) the plan artifact for user review. Call this after clarifications are sufficient — never call setDocumentHtml in plan mode until the user has submitted [SCRIBE_PLAN_ACCEPTED].

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

When PLAN_REVIEW_STATE includes user feedback (open comments + freeform note), revise the plan to address each comment. If a comment requested removing a section, drop that block (do not reuse its id). Comments anchored on Voice & style bullets must update those bullets — never silently override them in setDocumentHtml later.

After calling writePlan, STOP. The user will review and either submit (you'll then receive [SCRIBE_PLAN_ACCEPTED] and call setDocumentHtml) or request changes (you'll receive [SCRIBE_PLAN_FEEDBACK] and call writePlan again with v(N+1)).

Optional rationale: one short sentence describing what changed since the previous version (omit on v1).`,
    inputSchema: writePlanInputSchema,
    execute: async (input) => ({
      ok: true as const,
      blocks: input.blocks,
      rationale: input.rationale ?? '',
    }),
  }),
  setDocumentHtml: tool({
    description: `Replace the entire document with new HTML. The editor uses TipTap (ProseMirror). Use semantic HTML the editor understands: paragraphs <p>, headings <h1>-<h3>, <strong>, <em>, <u>, <a href="...">, bullet lists <ul><li>, numbered <ol><li>, blockquote.

In EDIT mode: call freely whenever the user asks for document changes.

In PLAN mode (CHAT_MODE: plan): you MUST NOT call setDocumentHtml until the user has submitted [SCRIBE_PLAN_ACCEPTED]. Before that, use requestClarifications and writePlan. The narrow exception is the "only analyzing existing doc" case — see PLAN instructions.

When called after [SCRIBE_PLAN_ACCEPTED]: write the document strictly according to the accepted plan. The plan blocks are the source of truth for structure and required content; do not silently drop sections or pivot scope. The "Voice & style" section of the plan is a hard constraint on HOW you write — apply every bullet (tone, POV, formatting quirks like all-lowercase or em-dash usage, vocabulary rules, etc.) consistently across the whole output. If a style bullet conflicts with default polish (e.g. "all lowercase" vs sentence case), the plan wins. Add prose, formatting, and connective tissue as needed, but never against the style bullets.

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
