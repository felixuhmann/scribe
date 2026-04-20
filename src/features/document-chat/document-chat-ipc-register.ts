import { channels } from '../../ipc/channels';
import { registerInvoke, registerOn } from '../../ipc/main-register';
import {
  getDocumentChatBundle,
  mergeDocumentChatSession,
  saveDocumentChatBundle,
} from './document-chat-sessions-store';
import { abortDocumentChatSession, runDocumentChatSession } from './document-chat-ipc';

export function registerDocumentChatIpc(): void {
  registerInvoke(channels.getDocumentChatBundle, async (documentKey) => {
    return getDocumentChatBundle(documentKey);
  });

  registerInvoke(channels.saveDocumentChatBundle, async (payload) => {
    await saveDocumentChatBundle(payload.documentKey, payload.bundle);
  });

  registerInvoke(channels.mergeDocumentChatSession, async (payload) => {
    await mergeDocumentChatSession(payload.documentKey, payload.sessionId, payload.patch);
  });

  registerOn(channels.documentChatStart, (payload, event) => {
    void runDocumentChatSession({
      webContents: event.sender,
      requestId: payload.id,
      messages: payload.messages,
      documentHtml: payload.documentHtml,
      documentChangeSummary: payload.documentChangeSummary,
      chatMode: payload.chatMode,
      planRefinementRounds: payload.planRefinementRounds,
      planDepthMode: payload.planDepthMode,
    });
  });

  registerOn(channels.documentChatAbort, (payload) => {
    abortDocumentChatSession(payload.id);
  });
}
