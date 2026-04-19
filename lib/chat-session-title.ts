import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';

export function chatTitleFromMessages(messages: DocumentChatUIMessage[]): string {
  for (const m of messages) {
    if (m.role !== 'user') continue;
    for (const part of m.parts) {
      if (part.type === 'text') {
        const t = part.text.trim().replace(/\s+/g, ' ');
        if (t.length === 0) continue;
        return t.length > 48 ? `${t.slice(0, 47)}…` : t;
      }
    }
  }
  return 'New chat';
}
