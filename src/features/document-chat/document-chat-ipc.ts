import { convertToModelMessages, validateUIMessages, type UIMessageChunk } from 'ai';
import type { WebContents } from 'electron';

import {
  clampPlanRefinementRounds,
  countPlanAnswerMessages,
  createDocumentChatAgent,
  shouldForcePlanClarificationRound,
  type DocumentChatMode,
  type DocumentChatUIMessage,
  type PlanDepthMode,
} from '../../../lib/agents/document-chat-agent';
import { documentChatTools } from '../../../lib/agents/document-chat-tools';
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

  try {
    const agent = createDocumentChatAgent({
      apiKey,
      modelId: stored.model,
      maxOutputTokens: DOCUMENT_CHAT_MAX_OUTPUT_TOKENS,
      mode,
      planDepthMode: mode === 'plan' ? planDepthMode : undefined,
    });

    const planForceRequestClarifications =
      mode === 'plan' &&
      shouldForcePlanClarificationRound(messages, mode, {
        planDepthMode,
        planRefinementRounds,
      });

    // Always validate / convert with the full tool set so sessions that used plan mode
    // (requestClarifications in history) still validate after switching to edit mode.
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
        planForceRequestClarifications,
        planRefinementRounds,
        planAnswerCount,
        planDepthMode,
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
