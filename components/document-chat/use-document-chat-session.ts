import { useChat } from '@ai-sdk/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useEditorSession } from '@/components/editor-session-context';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';
import { buildDocumentChangeSummary } from '@/lib/document-change-summary';
import {
  buildPlanAnswersUserText,
  type PlanAnswerPayload,
} from '@/lib/plan-answers-protocol';
import { OPENAI_MODELS } from '@/lib/llm';

import { ElectronIpcChatTransport } from './electron-ipc-chat-transport';
import { getSetDocumentOutput } from './message-parts/tool-set-document-html';

export type DocumentChatSessionHookOptions = {
  sessionId: string;
  documentKey: string;
  initialMessages: DocumentChatUIMessage[];
  initialLastAgentDocumentHtml?: string;
  editorReady: boolean;
  /** `persistDocumentKey` is always the document this session belongs to (may differ from the panel's current doc). */
  onPersistSession: (
    sessionId: string,
    messages: DocumentChatUIMessage[],
    persistDocumentKey: string,
  ) => void;
  onPersistAgentSnapshot: (sessionId: string, html: string, persistDocumentKey: string) => void;
};

export type DocumentChatSessionHookResult = ReturnType<typeof useDocumentChatSession>;

/**
 * Owns every side-effectful concern of one chat session:
 * IPC transport wiring, `useChat` instance, model/mode state + persistence,
 * debounced + visibilitychange + pagehide message persistence, tool output
 * replay into the Tiptap editor, and plan-mode send helpers. The view
 * component only renders JSX from the returned state.
 */
export function useDocumentChatSession({
  sessionId,
  documentKey,
  initialMessages,
  initialLastAgentDocumentHtml,
  editorReady,
  onPersistSession,
  onPersistAgentSnapshot,
}: DocumentChatSessionHookOptions) {
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
  const planRefinementRounds = planDepthIsAuto
    ? 1
    : Math.min(8, Math.max(1, Number.parseInt(planDepthSelection, 10) || 1));

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

  return {
    messages,
    status,
    error,
    busy,
    awaitingPlanAnswers,
    chatMode,
    setChatMode,
    planDepthSelection,
    setPlanDepthSelection,
    planDepthIsAuto,
    planRefinementRounds,
    chatModel,
    persistChatModel,
    sendPrompt,
    sendPlanAnswers,
    stop,
  };
}
