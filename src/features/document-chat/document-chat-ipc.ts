import { convertToModelMessages, validateUIMessages, type UIMessageChunk } from 'ai';
import type { WebContents } from 'electron';

import {
  clampPlanRefinementRounds,
  countPlanAnswerMessages,
  countPlanFeedbackMessages,
  createDocumentChatAgent,
  findLatestPlanFeedback,
  shouldForcePlanClarificationRound,
  shouldForcePlanExecute,
  shouldForcePlanWrite,
  type DocumentChatMode,
  type DocumentChatPhase,
  type DocumentChatUIMessage,
  type PlanDepthMode,
  type PlanForceMode,
} from '../../../lib/agents/document-chat-agent';
import { DocumentBuffer } from '../../../lib/agents/document-buffer';
import { allKnownTools } from '../../../lib/agents/document-chat-tools';
import {
  type PlanBlock,
  planVersionToText,
  type PlanVersion,
} from '../../../lib/plan-artifact';
import { providerForModel } from '../../../lib/llm';
import { editorHtmlToMarkdown, markdownToEditorHtml } from '../../../lib/markdown/markdown-io';
import {
  missingApiKeyErrorMessage,
  readStoredSettings,
  resolveApiKeyForProvider,
} from '../settings/settings-store';
import { channels } from '../../ipc/channels';
import { sendEvent } from '../../ipc/main-register';
import { logRunEnd, logRunStart, logStep } from './document-chat-debug';

const DOCUMENT_CHAT_MAX_OUTPUT_TOKENS = 8192;

const abortControllers = new Map<string, AbortController>();

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function findLatestWrittenPlan(messages: unknown[]): {
  versionNumber: number;
  blocks: PlanBlock[];
} | null {
  if (!Array.isArray(messages)) return null;
  let count = 0;
  let latest: { versionNumber: number; blocks: PlanBlock[] } | null = null;
  for (const m of messages) {
    if (!isRecord(m) || m.role !== 'assistant') continue;
    const parts = m.parts;
    if (!Array.isArray(parts)) continue;
    for (const p of parts) {
      if (!isRecord(p)) continue;
      if (p.type !== 'tool-writePlan') continue;
      if (p.state !== 'output-available') continue;
      const out = p.output;
      if (!isRecord(out) || !Array.isArray(out.blocks)) continue;
      count += 1;
      latest = { versionNumber: count, blocks: out.blocks as PlanBlock[] };
    }
  }
  return latest;
}

async function* uiChunksFromStream(
  stream: AsyncIterable<UIMessageChunk> | ReadableStream<UIMessageChunk>,
): AsyncGenerator<UIMessageChunk, void, undefined> {
  if (Symbol.asyncIterator in stream) {
    for await (const chunk of stream as AsyncIterable<UIMessageChunk>) {
      yield chunk;
    }
    return;
  }
  const reader = (stream as ReadableStream<UIMessageChunk>).getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Wrap the agent's UI message stream so that, after the run finishes, we
 * inject a synthetic `applyDocumentEdits` tool call on the same assistant
 * message. The renderer treats that part as the trigger to load the new
 * Markdown into the editor (and to capture undo state).
 *
 * We hold back the agent's terminal `finish` chunk and emit a fresh
 * step with the synthetic tool result before re-emitting it.
 */
async function* withFinalApplyEdits(
  inner: AsyncIterable<UIMessageChunk>,
  buildFinalChunks: () => UIMessageChunk[] | null,
): AsyncGenerator<UIMessageChunk, void, undefined> {
  let pendingFinish: UIMessageChunk | null = null;
  for await (const chunk of inner) {
    if (chunk.type === 'finish') {
      pendingFinish = chunk;
      continue;
    }
    yield chunk;
  }
  const tail = buildFinalChunks();
  if (tail) {
    for (const c of tail) yield c;
  }
  if (pendingFinish) yield pendingFinish;
}

function generateToolCallId(): string {
  return `apply_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function runDocumentChatSession(options: {
  webContents: WebContents;
  requestId: string;
  messages: unknown[];
  /** HTML snapshot of the live editor when the user sent the message. */
  documentHtml: string;
  documentChangeSummary?: string;
  chatMode?: DocumentChatMode;
  /** Plan mode: how many clarification Q&A rounds before final HTML (default 1). Ignored when planDepthMode is auto. */
  planRefinementRounds?: number;
  /** Plan mode: fixed round count vs model decides (auto). */
  planDepthMode?: PlanDepthMode;
  /**
   * Optional: live editor HTML at flush time. If different from `documentHtml`,
   * we mark the apply as `staleSnapshot: true` so the renderer can warn the
   * user before clobbering their concurrent edits.
   */
  getLiveDocumentHtml?: () => string | null;
}): Promise<void> {
  const {
    webContents,
    requestId,
    messages,
    documentHtml,
    documentChangeSummary,
    chatMode,
    planRefinementRounds: planRefinementRoundsOpt,
    planDepthMode: planDepthModeOpt,
    getLiveDocumentHtml,
  } = options;

  const prev = abortControllers.get(requestId);
  prev?.abort();

  const controller = new AbortController();
  abortControllers.set(requestId, controller);

  const stored = await readStoredSettings();
  const provider = providerForModel(stored.model);
  const apiKey = resolveApiKeyForProvider(stored, provider);
  if (!apiKey) {
    sendEvent(webContents, channels.documentChatEnd, {
      id: requestId,
      error: missingApiKeyErrorMessage(provider),
    });
    abortControllers.delete(requestId);
    return;
  }

  const mode = chatMode ?? 'edit';
  const planDepthMode: PlanDepthMode = planDepthModeOpt ?? 'fixed';
  const planRefinementRounds = clampPlanRefinementRounds(planRefinementRoundsOpt);
  const planAnswerCount = mode === 'plan' ? countPlanAnswerMessages(messages) : 0;
  const planFeedbackCount = mode === 'plan' ? countPlanFeedbackMessages(messages) : 0;

  /**
   * Phase derivation:
   * - edit mode → 'edit'
   * - plan mode + latest message is [SCRIBE_PLAN_ACCEPTED] → 'plan-execute' (read+edit tools)
   * - plan mode otherwise → 'plan' (read tools + plan tools, no edit)
   */
  const phase: DocumentChatPhase =
    mode === 'edit'
      ? 'edit'
      : shouldForcePlanExecute(messages, mode)
        ? 'plan-execute'
        : 'plan';

  /** Force the right tool on step 0 based on the latest user message. */
  let planForceMode: PlanForceMode = 'none';
  if (mode === 'plan') {
    if (phase === 'plan-execute') {
      planForceMode = 'getDocumentStats';
    } else if (
      shouldForcePlanClarificationRound(messages, mode, {
        planDepthMode,
        planRefinementRounds,
      })
    ) {
      planForceMode = 'requestClarifications';
    } else if (
      shouldForcePlanWrite(messages, mode, {
        planDepthMode,
        planRefinementRounds,
      })
    ) {
      planForceMode = 'writePlan';
    }
  }

  const latestPlan = mode === 'plan' ? findLatestWrittenPlan(messages) : null;
  const latestFeedback = mode === 'plan' ? findLatestPlanFeedback(messages) : null;
  const latestPlanTextSnapshot = latestPlan
    ? planVersionToText({
        versionId: '',
        versionNumber: latestPlan.versionNumber,
        createdAt: 0,
        blocks: latestPlan.blocks,
      } satisfies PlanVersion)
    : '';

  /** Build the working buffer from the snapshot the user saw when they sent the message. */
  let initialMarkdown: string;
  try {
    initialMarkdown = editorHtmlToMarkdown(documentHtml ?? '');
  } catch {
    /** If the live document is HTML the converter can't handle, fall back to passing the raw HTML through.
     * `appendDocument` and `strReplace` still operate as plain text in that case. */
    initialMarkdown = documentHtml ?? '';
  }
  const buffer = new DocumentBuffer(initialMarkdown);

  try {
    const agent = createDocumentChatAgent({
      apiKey,
      modelId: stored.model,
      maxOutputTokens: DOCUMENT_CHAT_MAX_OUTPUT_TOKENS,
      mode,
      phase,
      planDepthMode: mode === 'plan' ? planDepthMode : undefined,
      buffer,
    });

    /**
     * Validate / convert with the FULL tool set (allKnownTools). Sessions may
     * mix plan-mode tools (`writePlan`, `requestClarifications`) with edit
     * tools across history; the validator must know every tool name that has
     * ever appeared.
     */
    const validatedMessages = await validateUIMessages<DocumentChatUIMessage>({
      messages,
      tools: allKnownTools,
    });

    const modelMessages = await convertToModelMessages(validatedMessages, {
      tools: allKnownTools,
    });

    logRunStart({
      requestId,
      modelId: stored.model,
      mode,
      phase,
      planForceMode,
      planDepthMode,
      planRefinementRounds,
      planAnswerCount,
      planFeedbackCount,
      planCurrentVersion: latestPlan?.versionNumber ?? 0,
      documentChangeSummary,
      modelMessages,
      buffer,
    });

    const stream = await agent.stream({
      prompt: modelMessages,
      options: {
        documentChangeSummary,
        planForceMode,
        planRefinementRounds,
        planAnswerCount,
        planFeedbackCount,
        planDepthMode,
        planCurrentVersion: latestPlan?.versionNumber ?? 0,
        planLatestText: latestPlanTextSnapshot,
        planOpenComments: latestFeedback?.comments ?? [],
        planFeedbackNote: latestFeedback?.freeformNote,
      },
      abortSignal: controller.signal,
      onStepFinish: (step) => {
        logStep({
          requestId,
          stepNumber: step.stepNumber,
          text: step.text,
          reasoningText: step.reasoningText,
          toolCalls: step.toolCalls.map((c) => ({
            toolCallId: c.toolCallId,
            toolName: c.toolName,
            input: c.input,
          })),
          toolResults: step.toolResults.map((r) => ({
            toolCallId: r.toolCallId,
            toolName: r.toolName,
            output: r.output,
          })),
          finishReason: step.finishReason,
          usage: step.usage,
        });
      },
    });

    let finalStaleSnapshot = false;
    let finalApplied = false;

    const buildFinalChunks = (): UIMessageChunk[] | null => {
      if (!buffer.isDirty()) return null;
      const finalMarkdown = buffer.getMarkdown();
      let finalHtml: string;
      try {
        finalHtml = markdownToEditorHtml(finalMarkdown);
      } catch {
        finalHtml = finalMarkdown;
      }

      /** Detect concurrent user edits since the snapshot we started with. */
      const liveHtml = getLiveDocumentHtml?.();
      const staleSnapshot = liveHtml != null && liveHtml !== documentHtml;
      finalStaleSnapshot = staleSnapshot;
      finalApplied = true;

      const editLog = buffer.getEditLog();
      const toolCallId = generateToolCallId();
      const output = {
        html: finalHtml,
        markdown: finalMarkdown,
        editCount: editLog.length,
        edits: editLog.map((e) => ({
          kind: e.kind,
          summary: e.summary,
          startLine: e.startLine,
          endLine: e.endLine,
        })),
        staleSnapshot: staleSnapshot || undefined,
      };

      return [
        { type: 'start-step' },
        {
          type: 'tool-input-start',
          toolCallId,
          toolName: 'applyDocumentEdits',
        },
        {
          type: 'tool-input-available',
          toolCallId,
          toolName: 'applyDocumentEdits',
          input: {},
        },
        {
          type: 'tool-output-available',
          toolCallId,
          output,
        },
        { type: 'finish-step' },
      ];
    };

    const innerChunks = uiChunksFromStream(
      stream.toUIMessageStream({ originalMessages: validatedMessages }),
    );

    for await (const chunk of withFinalApplyEdits(innerChunks, buildFinalChunks)) {
      if (controller.signal.aborted) break;
      sendEvent(webContents, channels.documentChatChunk, {
        id: requestId,
        chunk,
      });
    }

    logRunEnd({
      requestId,
      buffer,
      staleSnapshot: finalStaleSnapshot,
      applied: finalApplied,
    });
    sendEvent(webContents, channels.documentChatEnd, { id: requestId });
  } catch (err) {
    const aborted = controller.signal.aborted || (err instanceof Error && err.name === 'AbortError');
    const message = aborted
      ? '(aborted)'
      : err instanceof Error
        ? err.message
        : 'Document chat failed';
    logRunEnd({
      requestId,
      buffer,
      staleSnapshot: false,
      applied: false,
      errored: message,
    });
    if (aborted) {
      sendEvent(webContents, channels.documentChatEnd, { id: requestId });
    } else {
      sendEvent(webContents, channels.documentChatEnd, { id: requestId, error: message });
    }
  } finally {
    abortControllers.delete(requestId);
  }
}

export function abortDocumentChatSession(requestId: string): void {
  abortControllers.get(requestId)?.abort();
  abortControllers.delete(requestId);
}
