import { useChat } from '@ai-sdk/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useEditorSession } from '@/components/editor-session-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ElectronIpcChatTransport } from '@/lib/electron-ipc-chat-transport';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';

import { SendIcon, SquareIcon } from 'lucide-react';

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function getSetDocumentOutput(
  part: DocumentChatUIMessage['parts'][number],
): { html?: string } | null {
  if (part.type !== 'tool-setDocumentHtml') return null;
  if (part.state !== 'output-available') return null;
  const out = part.output;
  if (!isObject(out) || !('html' in out)) return null;
  const html = out.html;
  return typeof html === 'string' ? { html } : null;
}

export function DocumentChatPanel() {
  const { editor } = useEditorSession();
  const appliedToolIds = useRef(new Set<string>());

  const transport = useMemo(
    () =>
      new ElectronIpcChatTransport<DocumentChatUIMessage>({
        getDocumentHtml: () => editor?.getHTML() ?? '<p></p>',
      }),
    [editor],
  );

  const { messages, sendMessage, status, stop, error } = useChat<DocumentChatUIMessage>({
    id: 'scribe-document-chat',
    transport,
  });

  useEffect(() => {
    if (!editor) return;

    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const part of message.parts) {
        const payload = getSetDocumentOutput(part);
        if (!payload?.html) continue;
        const id = 'toolCallId' in part && typeof part.toolCallId === 'string' ? part.toolCallId : '';
        if (!id || appliedToolIds.current.has(id)) continue;
        appliedToolIds.current.add(id);
        editor.chain().focus().setContent(payload.html, { emitUpdate: true }).run();
      }
    }
  }, [messages, editor]);

  const busy = status === 'streaming' || status === 'submitted';
  const sendPrompt = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      void sendMessage({ text: trimmed });
    },
    [busy, sendMessage],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="text-sidebar-foreground/80 px-1 text-xs font-medium tracking-wide uppercase">
        Assistant
      </div>

      <div className="border-border bg-muted/30 min-h-0 flex-1 overflow-y-auto rounded-md border px-2 py-2 text-sm">
        {error ? (
          <p className="text-destructive mb-2 text-xs">{error.message}</p>
        ) : null}
        {!editor ? (
          <p className="text-muted-foreground text-xs">Loading editor…</p>
        ) : messages.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Ask about this document or request edits. The assistant can replace the full document when you want changes applied.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <li key={m.id}>
                <div
                  className={
                    m.role === 'user'
                      ? 'text-foreground'
                      : 'text-muted-foreground border-border ml-0 border-l-2 pl-2'
                  }
                >
                  <span className="text-sidebar-foreground/50 mb-0.5 block text-[10px] font-semibold uppercase">
                    {m.role === 'user' ? 'You' : 'Assistant'}
                  </span>
                  {m.parts.map((part, i) => {
                    if (part.type === 'text') {
                      return (
                        <p key={i} className="break-words whitespace-pre-wrap">
                          {part.text}
                        </p>
                      );
                    }
                    if (part.type === 'tool-setDocumentHtml') {
                      if (part.state === 'output-available') {
                        return (
                          <p key={i} className="text-xs italic opacity-80">
                            Applied update to the document.
                          </p>
                        );
                      }
                      return (
                        <p key={i} className="text-xs opacity-70">
                          Preparing document edit…
                        </p>
                      );
                    }
                    return null;
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        className="flex shrink-0 flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const raw = fd.get('message');
          const text = typeof raw === 'string' ? raw : '';
          sendPrompt(text);
          e.currentTarget.reset();
        }}
      >
        <Textarea
          name="message"
          placeholder={
            editor ? 'Message about this document…' : 'Waiting for editor…'
          }
          disabled={!editor || busy}
          className="min-h-[72px] resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const form = e.currentTarget.form;
              if (form) form.requestSubmit();
            }
          }}
        />
        <div className="flex justify-end gap-2">
          {busy ? (
            <Button type="button" variant="outline" size="sm" onClick={() => stop()}>
              <SquareIcon className="mr-1 size-3.5" aria-hidden />
              Stop
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={!editor || busy}>
            <SendIcon className="mr-1 size-3.5" aria-hidden />
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
