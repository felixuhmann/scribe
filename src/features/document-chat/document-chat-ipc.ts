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
  type DocumentChatUIMessage,
  type PlanDepthMode,
  type PlanForceMode,
} from '../../../lib/agents/document-chat-agent';
import { documentChatTools } from '../../../lib/agents/document-chat-tools';
import {
  type PlanBlock,
  planVersionToText,
  type PlanVersion,
} from '../../../lib/plan-artifact';
import { providerForModel } from '../../../lib/llm';
import {
  missingApiKeyErrorMessage,
  readStoredSettings,
  resolveApiKeyForProvider,
} from '../settings/settings-store';
import { channels } from '../../ipc/channels';
import { sendEvent } from '../../ipc/main-register';

const DOCUMENT_CHAT_MAX_OUTPUT_TOKENS = 8192;

const abortControllers = new Map<string, AbortController>();

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

/**
 * Walk the message stream and pull the most recent completed `tool-writePlan`
 * output. We mirror the renderer-side artifact reconstruction here so the
 * model sees the same plan the user is reviewing — without piping the full
 * `PlanArtifact` over IPC.
 */
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

/** `createUIMessageStream` returns `ReadableStream`; `createAgentUIStream` returns async-iterable streams. */
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

export async function runDocumentChatSession(options: {
  webContents: WebContents;
  requestId: string;
  messages: unknown[];
  documentHtml: string;
  documentChangeSummary?: string;
  chatMode?: DocumentChatMode;
  /** Plan mode: how many clarification Q&A rounds before final HTML (default 1). Ignored when planDepthMode is auto. */
  planRefinementRounds?: number;
  /** Plan mode: fixed round count vs model decides (auto). */
  planDepthMode?: PlanDepthMode;
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

  /** Force the right tool on step 0 based on the latest user message. */
  let planForceMode: PlanForceMode = 'none';
  if (mode === 'plan') {
    if (shouldForcePlanExecute(messages, mode)) {
      planForceMode = 'setDocumentHtml';
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

  /** Latest plan + open feedback for PLAN_REVIEW_STATE. */
  const latestPlan = mode === 'plan' ? findLatestWrittenPlan(messages) : null;
  const latestFeedback = mode === 'plan' ? findLatestPlanFeedback(messages) : null;
  const latestPlanText = latestPlan
    ? planVersionToText({
        versionId: '',
        versionNumber: latestPlan.versionNumber,
        createdAt: 0,
        blocks: latestPlan.blocks,
      } satisfies PlanVersion)
    : '';

  try {
    const agent = createDocumentChatAgent({
      apiKey,
      modelId: stored.model,
      maxOutputTokens: DOCUMENT_CHAT_MAX_OUTPUT_TOKENS,
      mode,
      planDepthMode: mode === 'plan' ? planDepthMode : undefined,
    });

    // Always validate / convert with the full tool set so sessions that used plan mode
    // (requestClarifications / writePlan in history) still validate after switching to edit mode.
    const validatedMessages = await validateUIMessages<DocumentChatUIMessage>({
      messages,
      tools: documentChatTools,
    });

    const modelMessages = await convertToModelMessages(validatedMessages, {
      tools: documentChatTools,
    });

    const stream = await agent.stream({
      prompt: modelMessages,
      options: {
        documentHtml,
        documentChangeSummary,
        planForceMode,
        planRefinementRounds,
        planAnswerCount,
        planFeedbackCount,
        planDepthMode,
        planCurrentVersion: latestPlan?.versionNumber ?? 0,
        planLatestText: latestPlanText,
        planOpenComments: latestFeedback?.comments ?? [],
        planFeedbackNote: latestFeedback?.freeformNote,
      },
      abortSignal: controller.signal,
    });

    for await (const chunk of uiChunksFromStream(stream.toUIMessageStream({ originalMessages: validatedMessages }))) {
      if (controller.signal.aborted) break;
      sendEvent(webContents, channels.documentChatChunk, {
        id: requestId,
        chunk,
      });
    }

    // Include abort `break` above: the renderer must always get `end` to close the stream.
    sendEvent(webContents, channels.documentChatEnd, { id: requestId });
  } catch (err) {
    if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      sendEvent(webContents, channels.documentChatEnd, { id: requestId });
    } else {
      const message = err instanceof Error ? err.message : 'Document chat failed';
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
