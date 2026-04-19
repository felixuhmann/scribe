import { useChat } from '@ai-sdk/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDocumentWorkspace } from '@/components/document-workspace-context';
import { useEditorSession } from '@/components/editor-session-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';
import { chatTitleFromMessages } from '@/lib/chat-session-title';
import { ElectronIpcChatTransport } from '@/lib/electron-ipc-chat-transport';
import type { DocumentChatBundle, StoredChatSession } from '@/src/scribe-ipc-types';

import { MessageSquarePlusIcon, SendIcon, SquareIcon } from 'lucide-react';

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

function parseInitialMessages(raw: unknown): DocumentChatUIMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw as DocumentChatUIMessage[];
}

type DocumentChatSessionViewProps = {
  sessionId: string;
  documentKey: string;
  initialMessages: DocumentChatUIMessage[];
  getDocumentHtml: () => string;
  editorReady: boolean;
  onPersistSession: (sessionId: string, messages: DocumentChatUIMessage[]) => void;
};

function DocumentChatSessionView({
  sessionId,
  documentKey,
  initialMessages,
  getDocumentHtml,
  editorReady,
  onPersistSession,
}: DocumentChatSessionViewProps) {
  const appliedToolIds = useRef(new Set<string>());
  const { editor } = useEditorSession();

  const transport = useMemo(
    () =>
      new ElectronIpcChatTransport<DocumentChatUIMessage>({
        getDocumentHtml,
      }),
    [getDocumentHtml],
  );

  const { messages, sendMessage, status, stop, error } = useChat<DocumentChatUIMessage>({
    id: `${documentKey}::${sessionId}`,
    messages: initialMessages,
    transport,
  });

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    return () => {
      stop();
      onPersistSession(sessionId, messagesRef.current);
    };
  }, [sessionId, onPersistSession, stop]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      onPersistSession(sessionId, messages);
    }, 500);
    return () => window.clearTimeout(t);
  }, [messages, sessionId, onPersistSession]);

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
      if (!trimmed || busy || !editorReady) return;
      void sendMessage({ text: trimmed });
    },
    [busy, editorReady, sendMessage],
  );

  return (
    <>
      <div className="border-sidebar-border/60 bg-sidebar-accent/20 min-h-0 flex-1 overflow-y-auto rounded-lg border px-2.5 py-2 text-sm">
        {error ? (
          <p className="text-destructive mb-2 text-xs">{error.message}</p>
        ) : null}
        {!editorReady ? (
          <p className="text-muted-foreground text-xs">
            Loading the editor… You can read past messages; send is enabled once the document is ready.
          </p>
        ) : messages.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Ask about this document or request edits. The assistant can replace the full document when you want
            changes applied.
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
            !editorReady
              ? 'Waiting for the document editor…'
              : 'Message about this document…'
          }
          disabled={!editorReady || busy}
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
          <Button type="submit" size="sm" disabled={!editorReady || busy}>
            <SendIcon className="mr-1 size-3.5" aria-hidden />
            Send
          </Button>
        </div>
      </form>
    </>
  );
}

export function DocumentChatPanel() {
  const { documentKey, documentLabel } = useDocumentWorkspace();
  const { editor } = useEditorSession();

  const [bundle, setBundle] = useState<DocumentChatBundle | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * useChat must receive the correct `messages` on the first paint after a document/session switch.
   * A ref snapshot updates synchronously when `${documentKey}::${activeSessionId}` changes, but not
   * when the same session is persisted (so in-editor chat state stays authoritative).
   */
  const chatInitialMessagesRef = useRef<{ key: string; messages: DocumentChatUIMessage[] }>({
    key: '',
    messages: [],
  });

  useEffect(() => {
    let cancelled = false;
    const api = window.scribe?.getDocumentChatBundle;
    setBundle(null);
    setActiveSessionId(null);
    chatInitialMessagesRef.current = { key: '', messages: [] };
    if (!api) {
      setLoadError('Chat storage is unavailable.');
      return;
    }
    setLoadError(null);
    void api(documentKey).then(
      (b) => {
        if (cancelled) return;
        setBundle(b);
        setActiveSessionId(b.activeSessionId);
      },
      () => {
        if (cancelled) return;
        setLoadError('Could not load chat sessions.');
        setBundle(null);
        setActiveSessionId(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [documentKey]);

  const hydrationKey =
    bundle && activeSessionId ? `${documentKey}::${activeSessionId}` : '';
  if (hydrationKey && hydrationKey !== chatInitialMessagesRef.current.key) {
    const s = bundle.sessions.find((x) => x.id === activeSessionId);
    chatInitialMessagesRef.current = {
      key: hydrationKey,
      messages: parseInitialMessages(s?.messages),
    };
  }
  const initialMessagesForView = hydrationKey ? chatInitialMessagesRef.current.messages : [];

  const saveBundle = useCallback((next: DocumentChatBundle) => {
    const api = window.scribe?.saveDocumentChatBundle;
    if (api) void api(documentKey, next);
  }, [documentKey]);

  const persistSession = useCallback(
    (sessionId: string, messages: DocumentChatUIMessage[]) => {
      setBundle((prev) => {
        if (!prev) return prev;
        const title = chatTitleFromMessages(messages);
        const updatedAt = Date.now();
        const sessions = prev.sessions.map((s) =>
          s.id === sessionId ? { ...s, messages, title, updatedAt } : s,
        );
        const next: DocumentChatBundle = { ...prev, sessions };
        saveBundle(next);
        return next;
      });
    },
    [saveBundle],
  );

  const selectSession = useCallback(
    (id: string) => {
      setActiveSessionId(id);
      setBundle((prev) => {
        if (!prev) return prev;
        const next: DocumentChatBundle = { ...prev, activeSessionId: id };
        saveBundle(next);
        return next;
      });
    },
    [saveBundle],
  );

  const newChat = useCallback(() => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const session: StoredChatSession = {
      id,
      title: 'New chat',
      messages: [],
      updatedAt: now,
    };
    setBundle((prev) => {
      if (!prev) return prev;
      const next: DocumentChatBundle = {
        activeSessionId: id,
        sessions: [session, ...prev.sessions],
      };
      saveBundle(next);
      return next;
    });
    setActiveSessionId(id);
  }, [saveBundle]);

  const getDocumentHtml = useCallback(() => editor?.getHTML() ?? '<p></p>', [editor]);
  const editorReady = Boolean(editor);

  return (
    <div className="flex min-h-0 flex-1 flex-row gap-3 px-1">
      <div className="border-sidebar-border/80 flex w-[148px] shrink-0 flex-col gap-1.5 border-r pr-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full justify-start gap-1.5 px-2 text-xs"
          onClick={newChat}
        >
          <MessageSquarePlusIcon className="size-3.5 shrink-0" aria-hidden />
          New chat
        </Button>
        <div className="text-sidebar-foreground/60 min-h-0 flex-1 overflow-y-auto text-[10px] leading-snug">
          {bundle ? (
            <ul className="flex flex-col gap-0.5">
              {bundle.sessions.map((s) => {
                const selected = s.id === activeSessionId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => selectSession(s.id)}
                      className={
                        selected
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground w-full rounded-md px-1.5 py-1 text-left text-[11px] font-medium'
                          : 'hover:bg-muted/80 text-sidebar-foreground/90 w-full rounded-md px-1.5 py-1 text-left text-[11px]'
                      }
                      title={s.title}
                    >
                      <span className="line-clamp-2">{s.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground px-0.5">…</p>
          )}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="px-0.5">
          <div className="text-sidebar-foreground/80 text-xs font-medium tracking-wide uppercase">Assistant</div>
          <p className="text-sidebar-foreground/55 mt-0.5 truncate text-[10px]" title={documentKey}>
            {documentLabel}
          </p>
        </div>

        {loadError ? (
          <p className="text-destructive text-xs">{loadError}</p>
        ) : null}

        {bundle && activeSessionId ? (
          <DocumentChatSessionView
            key={`${documentKey}::${activeSessionId}`}
            sessionId={activeSessionId}
            documentKey={documentKey}
            initialMessages={initialMessagesForView}
            getDocumentHtml={getDocumentHtml}
            editorReady={editorReady}
            onPersistSession={persistSession}
          />
        ) : (
          <p className="text-muted-foreground text-xs">Loading chats…</p>
        )}
      </div>
    </div>
  );
}
