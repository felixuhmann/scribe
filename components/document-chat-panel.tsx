import { useChat } from '@ai-sdk/react';
import DOMPurify from 'dompurify';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDocumentWorkspace } from '@/components/document-workspace-context';
import { useEditorSession } from '@/components/editor-session-context';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';
import { chatTitleFromMessages } from '@/lib/chat-session-title';
import {
  buildPlanAnswersUserText,
  tryParsePlanAnswersUserText,
  type PlanAnswerPayload,
} from '@/lib/plan-mode';
import { buildDocumentChangeSummary } from '@/lib/document-change-summary';
import { ElectronIpcChatTransport } from '@/lib/electron-ipc-chat-transport';
import { OPENAI_MODELS } from '@/lib/openai-models';
import type { DocumentChatBundle, StoredChatSession } from '@/src/scribe-ipc-types';

import {
  PastClarificationRound,
  PlanAnswersSubmittedBubble,
  PlanClarificationForm,
  type ClarificationQuestion,
} from '@/components/plan-clarification-form';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronDownIcon,
  ListTodoIcon,
  MessageSquarePlusIcon,
  PenLineIcon,
  SendIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react';

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

function getClarificationQuestions(
  part: DocumentChatUIMessage['parts'][number],
): ClarificationQuestion[] | null {
  if (part.type !== 'tool-requestClarifications') return null;
  if (part.state !== 'output-available') return null;
  const out = part.output;
  if (!isObject(out) || !('questions' in out)) return null;
  const qs = out.questions;
  if (!Array.isArray(qs)) return null;
  return qs as ClarificationQuestion[];
}

function parseInitialMessages(raw: unknown): DocumentChatUIMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw as DocumentChatUIMessage[];
}

/** Rich text from the model; user bubbles stay plain text for safety. */
const assistantMessageHtmlClassName =
  'break-words text-sm [&_a]:text-primary [&_a]:underline [&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:text-xs [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_blockquote]:border-muted-foreground/50 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic';

function ChatTextPart({ text, role }: { text: string; role: DocumentChatUIMessage['role'] }) {
  if (role === 'user') {
    return <p className="break-words whitespace-pre-wrap">{text}</p>;
  }
  const safe = DOMPurify.sanitize(text, { USE_PROFILES: { html: true } });
  return (
    <div
      className={assistantMessageHtmlClassName}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

type DocumentChatSessionViewProps = {
  sessionId: string;
  documentKey: string;
  initialMessages: DocumentChatUIMessage[];
  initialLastAgentDocumentHtml?: string;
  editorReady: boolean;
  /** `persistDocumentKey` is always the document this session belongs to (may differ from the panel’s current doc). */
  onPersistSession: (
    sessionId: string,
    messages: DocumentChatUIMessage[],
    persistDocumentKey: string,
  ) => void;
  onPersistAgentSnapshot: (sessionId: string, html: string, persistDocumentKey: string) => void;
};

function DocumentChatSessionView({
  sessionId,
  documentKey,
  initialMessages,
  initialLastAgentDocumentHtml,
  editorReady,
  onPersistSession,
  onPersistAgentSnapshot,
}: DocumentChatSessionViewProps) {
  const appliedToolIds = useRef(new Set<string>());
  /** After first editor+messages sync: do not replay persisted tool HTML into the editor (would clobber current doc). */
  const toolReplayHydratedRef = useRef(false);
  const lastSeenRef = useRef<string | null>(initialLastAgentDocumentHtml ?? null);
  const editorRef = useRef<ReturnType<typeof useEditorSession>['editor']>(null);
  const { editor } = useEditorSession();
  editorRef.current = editor;

  const [chatMode, setChatMode] = useState<'edit' | 'plan'>('edit');
  /** `useChat` keeps the first `transport` instance; read mode from a ref so IPC always sees the current dropdown value. */
  const chatModeRef = useRef(chatMode);
  chatModeRef.current = chatMode;

  /**
   * Plan mode depth: `auto` = model decides when to clarify vs write (extra rounds if scope changes);
   * `1`–`8` = fixed number of structured answer rounds before applying the document.
   */
  const [planDepthSelection, setPlanDepthSelection] = useState<string>('1');
  const planDepthSelectionRef = useRef(planDepthSelection);
  planDepthSelectionRef.current = planDepthSelection;
  const planDepthIsAuto = planDepthSelection === 'auto';
  const planRefinementRounds =
    planDepthIsAuto ? 1 : Math.min(8, Math.max(1, Number.parseInt(planDepthSelection, 10) || 1));

  const [chatModel, setChatModel] = useState<string>(OPENAI_MODELS[1].id);

  useEffect(() => {
    const api = window.scribe?.getSettings;
    if (!api) return;
    const sync = () => void api().then((s) => setChatModel(s.model));
    sync();
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, []);

  const persistChatModel = useCallback((next: string) => {
    const api = window.scribe?.setSettings;
    if (!api) return;
    void api({ model: next }).then((s) => setChatModel(s.model));
  }, []);

  const getDocumentContext = useCallback(() => {
    const html = editor?.getHTML() ?? '<p></p>';
    const prev = lastSeenRef.current;
    const documentChangeSummary =
      prev !== null && prev !== html ? buildDocumentChangeSummary(prev, html) : undefined;
    return { html, documentChangeSummary };
  }, [editor]);

  const onStreamComplete = useCallback(
    (info: { error?: Error }) => {
      if (info.error) return;
      queueMicrotask(() => {
        const ed = editorRef.current;
        if (!ed) return;
        const snapshot = ed.getHTML();
        lastSeenRef.current = snapshot;
        onPersistAgentSnapshot(sessionId, snapshot, documentKey);
      });
    },
    [documentKey, sessionId, onPersistAgentSnapshot],
  );

  const transport = useMemo(
    () =>
      new ElectronIpcChatTransport<DocumentChatUIMessage>({
        getDocumentContext,
        onStreamComplete,
        getChatMode: () => chatModeRef.current,
        getPlanDepthMode: () => (planDepthSelectionRef.current === 'auto' ? 'auto' : 'fixed'),
        getPlanRefinementRounds: () => {
          const v = planDepthSelectionRef.current;
          if (v === 'auto') return 1;
          return Math.min(8, Math.max(1, Number.parseInt(v, 10) || 1));
        },
      }),
    [getDocumentContext, onStreamComplete],
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
      onPersistSession(sessionId, messagesRef.current, documentKey);
    };
  }, [documentKey, sessionId, onPersistSession, stop]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      onPersistSession(sessionId, messages, documentKey);
    }, 500);
    return () => window.clearTimeout(t);
  }, [documentKey, messages, sessionId, onPersistSession]);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') {
        onPersistSession(sessionId, messagesRef.current, documentKey);
      }
    };
    const onPageHide = () => {
      onPersistSession(sessionId, messagesRef.current, documentKey);
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [documentKey, sessionId, onPersistSession]);

  useEffect(() => {
    if (!editor) return;

    if (!toolReplayHydratedRef.current) {
      for (const message of messages) {
        if (message.role !== 'assistant') continue;
        for (const part of message.parts) {
          const payload = getSetDocumentOutput(part);
          if (!payload?.html) continue;
          const id = 'toolCallId' in part && typeof part.toolCallId === 'string' ? part.toolCallId : '';
          if (id) appliedToolIds.current.add(id);
        }
      }
      toolReplayHydratedRef.current = true;
      return;
    }

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

  const awaitingPlanAnswers = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return false;
    return last.parts.some(
      (p) => p.type === 'tool-requestClarifications' && p.state === 'output-available',
    );
  }, [messages]);
  const sendPrompt = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy || !editorReady || awaitingPlanAnswers) return;
      void sendMessage({ text: trimmed });
    },
    [awaitingPlanAnswers, busy, editorReady, sendMessage],
  );

  const sendPlanAnswers = useCallback(
    (payload: PlanAnswerPayload) => {
      if (busy || !editorReady) return;
      void sendMessage({ text: buildPlanAnswersUserText(payload) });
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
            {chatMode === 'plan'
              ? planDepthIsAuto
                ? 'Describe what you want in the document. Plan (Auto) lets the assistant ask questions until it has enough context to write well, and ask again if you change scope or add constraints.'
                : `Describe what you want in the document. Plan mode runs ${planRefinementRounds} clarification round${planRefinementRounds === 1 ? '' : 's'} (each round asks more specific questions), then applies changes.`
              : 'Ask about this document or request edits. The assistant can replace the full document when you want changes applied.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m, msgIdx) => (
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
                      if (m.role === 'user') {
                        const parsed = tryParsePlanAnswersUserText(part.text);
                        if (parsed) {
                          return <PlanAnswersSubmittedBubble key={i} payload={parsed} />;
                        }
                      }
                      return <ChatTextPart key={i} text={part.text} role={m.role} />;
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
                        <p
                          key={i}
                          className="flex flex-row items-center gap-2 text-xs opacity-70"
                        >
                          <span>Preparing document edit…</span>
                          <Spinner className="shrink-0" />
                        </p>
                      );
                    }
                    if (part.type === 'tool-requestClarifications') {
                      const qs = getClarificationQuestions(part);
                      if (qs && part.state === 'output-available') {
                        const interactive =
                          m.role === 'assistant' &&
                          msgIdx === messages.length - 1 &&
                          !busy;
                        if (interactive) {
                          return (
                            <PlanClarificationForm
                              key={`${m.id}-clar`}
                              questions={qs}
                              disabled={busy || !editorReady}
                              onSubmitAnswers={sendPlanAnswers}
                            />
                          );
                        }
                        return <PastClarificationRound key={i} questions={qs} />;
                      }
                      if (part.state === 'output-error') {
                        return (
                          <p key={i} className="text-destructive text-xs">
                            Could not load clarification questions.
                          </p>
                        );
                      }
                      return (
                        <p
                          key={i}
                          className="flex flex-row items-center gap-2 text-xs opacity-70"
                        >
                          <span>Preparing clarification questions…</span>
                          <Spinner className="shrink-0" />
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
              : awaitingPlanAnswers
                ? 'Use the plan answers above, then the assistant will continue…'
                : chatMode === 'plan'
                  ? planDepthIsAuto
                    ? 'What should we create or change? Plan (Auto) will ask as many question rounds as it needs, then apply changes…'
                    : `What should we create or change? Plan mode will ask up to ${planRefinementRounds} rounds of questions…`
                  : 'Message about this document…'
          }
          disabled={!editorReady || busy || awaitingPlanAnswers}
          className="min-h-[72px] resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const form = e.currentTarget.form;
              if (form) form.requestSubmit();
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-muted-foreground flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              {chatMode === 'plan' ? (
                <ListTodoIcon className="size-3.5 shrink-0 opacity-80" aria-hidden />
              ) : (
                <PenLineIcon className="size-3.5 shrink-0 opacity-80" aria-hidden />
              )}
              <select
                id="scribe-chat-mode"
                aria-label="Chat mode"
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-8 rounded-md border px-2 text-xs shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                value={chatMode}
                disabled={busy || awaitingPlanAnswers}
                onChange={(e) => setChatMode(e.target.value === 'plan' ? 'plan' : 'edit')}
              >
                <option value="edit">Edit</option>
                <option value="plan">Plan</option>
              </select>
              {chatMode === 'plan' ? (
                <label className="flex items-center gap-1">
                  <span className="sr-only">Plan refinement rounds</span>
                  <span className="text-muted-foreground whitespace-nowrap text-[10px] uppercase">
                    Depth
                  </span>
                  <select
                    id="scribe-plan-depth"
                    aria-label="Plan depth"
                    title="Auto: assistant chooses when to clarify vs write. Fixed numbers: that many structured Q&A rounds before applying the document."
                    className="border-input bg-background ring-offset-background focus-visible:ring-ring h-8 min-w-[4.25rem] rounded-md border px-1 text-xs shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    value={planDepthSelection}
                    disabled={busy || awaitingPlanAnswers}
                    onChange={(e) => setPlanDepthSelection(e.target.value)}
                  >
                    <option value="auto">Auto</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <select
              id="scribe-chat-model"
              aria-label="OpenAI model"
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-8 min-w-0 flex-1 rounded-md border px-2 text-xs shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-[12rem]"
              value={chatModel}
              disabled={busy || !window.scribe?.setSettings}
              onChange={(e) => persistChatModel(e.target.value)}
            >
              {!OPENAI_MODELS.some((m) => m.id === chatModel) ? (
                <option value={chatModel}>{chatModel}</option>
              ) : null}
              {OPENAI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex shrink-0 justify-end gap-2">
            {busy ? (
              <Button type="button" variant="outline" size="sm" onClick={() => stop()}>
                <SquareIcon className="mr-1 size-3.5" aria-hidden />
                Stop
              </Button>
            ) : null}
            <Button type="submit" size="sm" disabled={!editorReady || busy || awaitingPlanAnswers}>
              <SendIcon className="mr-1 size-3.5" aria-hidden />
              Send
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}

export function DocumentChatPanel() {
  const { documentKey, documentLabel } = useDocumentWorkspace();
  const { editor } = useEditorSession();

  const [bundle, setBundle] = useState<DocumentChatBundle | null>(null);
  /** Which `documentKey` the current `bundle` was loaded for (avoids one render of stale bundle + new key). */
  const [bundleSourceKey, setBundleSourceKey] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [archivedChatsOpen, setArchivedChatsOpen] = useState(false);
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
    setBundleSourceKey(null);
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
        setBundleSourceKey(documentKey);
      },
      () => {
        if (cancelled) return;
        setLoadError('Could not load chat sessions.');
        setBundle(null);
        setBundleSourceKey(null);
        setActiveSessionId(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [documentKey]);

  const bundleMatchesDocument = bundleSourceKey !== null && bundleSourceKey === documentKey;
  const effectiveBundle = bundle && bundleMatchesDocument ? bundle : null;

  const hydrationKey =
    effectiveBundle && activeSessionId ? `${documentKey}::${activeSessionId}` : '';
  if (effectiveBundle && hydrationKey && hydrationKey !== chatInitialMessagesRef.current.key) {
    const s = effectiveBundle.sessions.find((x) => x.id === activeSessionId);
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
    (sessionId: string, messages: DocumentChatUIMessage[], persistDocumentKey: string) => {
      const title = chatTitleFromMessages(messages);
      const updatedAt = Date.now();
      const mergeApi = window.scribe?.mergeDocumentChatSession;

      if (persistDocumentKey === documentKey) {
        setBundle((prev) => {
          if (!prev) return prev;
          const sessions = prev.sessions.map((s) =>
            s.id === sessionId ? { ...s, messages, title, updatedAt } : s,
          );
          const next: DocumentChatBundle = { ...prev, sessions };
          saveBundle(next);
          return next;
        });
        return;
      }

      if (mergeApi) {
        void mergeApi(persistDocumentKey, sessionId, { messages, title, updatedAt });
      }
    },
    [documentKey, saveBundle],
  );

  const persistAgentSnapshot = useCallback(
    (sessionId: string, html: string, persistDocumentKey: string) => {
      const mergeApi = window.scribe?.mergeDocumentChatSession;

      if (persistDocumentKey === documentKey) {
        setBundle((prev) => {
          if (!prev) return prev;
          const sessions = prev.sessions.map((s) =>
            s.id === sessionId ? { ...s, lastAgentDocumentHtml: html } : s,
          );
          const next: DocumentChatBundle = { ...prev, sessions };
          saveBundle(next);
          return next;
        });
        return;
      }

      if (mergeApi) {
        void mergeApi(persistDocumentKey, sessionId, { lastAgentDocumentHtml: html });
      }
    },
    [documentKey, saveBundle],
  );

  const selectSession = useCallback(
    (id: string) => {
      if (bundleSourceKey !== documentKey) return;
      setActiveSessionId(id);
      setBundle((prev) => {
        if (!prev) return prev;
        const next: DocumentChatBundle = { ...prev, activeSessionId: id };
        saveBundle(next);
        return next;
      });
    },
    [bundleSourceKey, documentKey, saveBundle],
  );

  const newChat = useCallback(() => {
    if (bundleSourceKey !== documentKey) return;
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
  }, [bundleSourceKey, documentKey, saveBundle]);

  const deleteActiveSession = useCallback(() => {
    if (!effectiveBundle || !activeSessionId) return;
    const remaining = effectiveBundle.sessions.filter((s) => s.id !== activeSessionId);
    if (remaining.length === 0) {
      const id = crypto.randomUUID();
      const now = Date.now();
      const session: StoredChatSession = {
        id,
        title: 'New chat',
        messages: [],
        updatedAt: now,
      };
      const next: DocumentChatBundle = { activeSessionId: id, sessions: [session] };
      saveBundle(next);
      setBundle(next);
      setActiveSessionId(id);
      return;
    }
    const nextActive =
      remaining.find((s) => !s.archived)?.id ?? remaining[0].id;
    const next: DocumentChatBundle = {
      activeSessionId: nextActive,
      sessions: remaining,
    };
    saveBundle(next);
    setBundle(next);
    setActiveSessionId(nextActive);
  }, [effectiveBundle, activeSessionId, saveBundle]);

  const archiveActiveSession = useCallback(() => {
    if (!effectiveBundle || !activeSessionId) return;
    let sessions = effectiveBundle.sessions.map((s) =>
      s.id === activeSessionId ? { ...s, archived: true as const } : s,
    );
    const available = sessions.filter((s) => !s.archived);
    let newActiveId: string;
    if (available.length === 0) {
      newActiveId = crypto.randomUUID();
      const now = Date.now();
      sessions = [
        ...sessions,
        { id: newActiveId, title: 'New chat', messages: [], updatedAt: now },
      ];
    } else {
      newActiveId = available[0].id;
    }
    const next: DocumentChatBundle = { activeSessionId: newActiveId, sessions };
    saveBundle(next);
    setBundle(next);
    setActiveSessionId(newActiveId);
  }, [effectiveBundle, activeSessionId, saveBundle]);

  const unarchiveActiveSession = useCallback(() => {
    if (!effectiveBundle || !activeSessionId) return;
    const sessions = effectiveBundle.sessions.map((s) => {
      if (s.id !== activeSessionId) return s;
      if (!s.archived) return s;
      const { archived: _a, ...rest } = s;
      void _a;
      return rest;
    });
    const next: DocumentChatBundle = { ...effectiveBundle, sessions };
    saveBundle(next);
    setBundle(next);
  }, [effectiveBundle, activeSessionId, saveBundle]);

  const editorReady = Boolean(editor);

  const activeSessionMeta =
    effectiveBundle && activeSessionId
      ? effectiveBundle.sessions.find((s) => s.id === activeSessionId)
      : undefined;
  const activeSessionArchived = activeSessionMeta?.archived === true;

  useEffect(() => {
    if (activeSessionArchived) {
      setArchivedChatsOpen(true);
    }
  }, [activeSessionArchived]);

  return (
    <div className="flex min-h-0 flex-1 flex-row gap-3 px-1">
      <div className="border-sidebar-border/80 flex w-[148px] shrink-0 flex-col gap-1.5 border-r pr-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full justify-start gap-1.5 px-2 text-xs"
          disabled={!effectiveBundle}
          onClick={newChat}
        >
          <MessageSquarePlusIcon className="size-3.5 shrink-0" aria-hidden />
          New chat
        </Button>
        <div className="text-sidebar-foreground/60 min-h-0 flex-1 overflow-y-auto text-[10px] leading-snug">
          {effectiveBundle ? (
            <>
              <ul className="flex flex-col gap-0.5">
                {effectiveBundle.sessions
                  .filter((s) => !s.archived)
                  .map((s) => {
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
              {effectiveBundle.sessions.some((s) => s.archived) ? (
                <Collapsible
                  open={archivedChatsOpen}
                  onOpenChange={setArchivedChatsOpen}
                  className="border-sidebar-border/60 group/collapsible mt-2 border-t pt-2"
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-sidebar-foreground/70 hover:text-sidebar-foreground h-7 w-full justify-start px-1.5 text-[9px] font-medium uppercase"
                    >
                      <ChevronDownIcon
                        data-icon="inline-start"
                        className="transition-transform group-data-[state=open]/collapsible:rotate-180"
                        aria-hidden
                      />
                      Archived
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="flex flex-col gap-0.5 pt-0.5">
                      {effectiveBundle.sessions
                        .filter((s) => s.archived)
                        .map((s) => {
                          const selected = s.id === activeSessionId;
                          return (
                            <li key={s.id}>
                              <button
                                type="button"
                                onClick={() => selectSession(s.id)}
                                className={
                                  selected
                                    ? 'bg-sidebar-accent/80 text-sidebar-accent-foreground w-full rounded-md px-1.5 py-1 text-left text-[11px] font-medium'
                                    : 'hover:bg-muted/60 text-sidebar-foreground/70 w-full rounded-md px-1.5 py-1 text-left text-[11px]'
                                }
                                title={s.title}
                              >
                                <span className="line-clamp-2">{s.title}</span>
                              </button>
                            </li>
                          );
                        })}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground px-0.5">…</p>
          )}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2 px-0.5">
          <div className="min-w-0 flex-1">
            <div className="text-sidebar-foreground/80 text-xs font-medium tracking-wide uppercase">
              Assistant
            </div>
            <p className="text-sidebar-foreground/55 mt-0.5 truncate text-[10px]" title={documentKey}>
              {documentLabel}
            </p>
          </div>
          {effectiveBundle && activeSessionId ? (
            <div className="flex shrink-0 gap-0.5 pt-0.5">
              {activeSessionArchived ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-sidebar-foreground/70 hover:text-sidebar-foreground size-7"
                  title="Restore chat to main list"
                  aria-label="Restore archived chat"
                  onClick={unarchiveActiveSession}
                >
                  <ArchiveRestoreIcon className="size-3.5" aria-hidden />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-sidebar-foreground/70 hover:text-sidebar-foreground size-7"
                  title="Archive this chat"
                  aria-label="Archive chat"
                  onClick={archiveActiveSession}
                >
                  <ArchiveIcon className="size-3.5" aria-hidden />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-sidebar-foreground/70 hover:text-destructive size-7"
                title="Delete this chat"
                aria-label="Delete chat"
                onClick={deleteActiveSession}
              >
                <Trash2Icon className="size-3.5" aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>

        {loadError ? (
          <p className="text-destructive text-xs">{loadError}</p>
        ) : null}

        {effectiveBundle && activeSessionId ? (
          <DocumentChatSessionView
            key={`${documentKey}::${activeSessionId}`}
            sessionId={activeSessionId}
            documentKey={documentKey}
            initialMessages={initialMessagesForView}
            initialLastAgentDocumentHtml={
              effectiveBundle.sessions.find((s) => s.id === activeSessionId)?.lastAgentDocumentHtml
            }
            editorReady={editorReady}
            onPersistSession={persistSession}
            onPersistAgentSnapshot={persistAgentSnapshot}
          />
        ) : (
          <p className="text-muted-foreground text-xs">Loading chats…</p>
        )}
      </div>
    </div>
  );
}
