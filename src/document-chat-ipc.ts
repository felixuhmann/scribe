import type { UIMessageChunk } from 'ai';
import { createAgentUIStream } from 'ai';
import type { WebContents } from 'electron';

import { createDocumentChatAgent } from '../lib/agents/document-chat-agent';
import { readStoredSettings, resolveOpenAiApiKey } from './settings-store';

const DOCUMENT_CHAT_MAX_OUTPUT_TOKENS = 8192;

const abortControllers = new Map<string, AbortController>();

export async function runDocumentChatSession(options: {
  webContents: WebContents;
  requestId: string;
  messages: unknown[];
  documentHtml: string;
  documentChangeSummary?: string;
}): Promise<void> {
  const { webContents, requestId, messages, documentHtml, documentChangeSummary } = options;

  const prev = abortControllers.get(requestId);
  prev?.abort();

  const controller = new AbortController();
  abortControllers.set(requestId, controller);

  const stored = await readStoredSettings();
  const apiKey = resolveOpenAiApiKey(stored);
  if (!apiKey) {
    webContents.send('scribe:documentChat:end', {
      id: requestId,
      error:
        'No OpenAI API key found. Add OPENAI_API_KEY to a .env file, or set a key in Settings.',
    });
    abortControllers.delete(requestId);
    return;
  }

  const agent = createDocumentChatAgent({
    apiKey,
    modelId: stored.model,
    maxOutputTokens: DOCUMENT_CHAT_MAX_OUTPUT_TOKENS,
  });

  try {
    const stream = await createAgentUIStream({
      agent,
      uiMessages: messages,
      options: { documentHtml, documentChangeSummary },
      abortSignal: controller.signal,
    });

    for await (const chunk of stream) {
      if (controller.signal.aborted) break;
      webContents.send('scribe:documentChat:chunk', {
        id: requestId,
        chunk: chunk as UIMessageChunk,
      });
    }

    // Include abort `break` above: the renderer must always get `end` to close the stream.
    webContents.send('scribe:documentChat:end', { id: requestId });
  } catch (err) {
    if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      webContents.send('scribe:documentChat:end', { id: requestId });
    } else {
      const message = err instanceof Error ? err.message : 'Document chat failed';
      webContents.send('scribe:documentChat:end', { id: requestId, error: message });
    }
  } finally {
    abortControllers.delete(requestId);
  }
}

export function abortDocumentChatSession(requestId: string): void {
  abortControllers.get(requestId)?.abort();
  abortControllers.delete(requestId);
}
