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

export type ChatMode = 'edit' | 'plan';

/**
 * What the assistant is currently doing — used by the status chip.
 * `idle` while waiting for input; other values indicate an active stream phase.
 */
export type StreamingPhase =
  | 'idle'
  | 'thinking'
  | 'writing'
  | 'applyingEdit'
  | 'draftingQuestions';

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
 * replay into the Tiptap editor, per-tool Undo snapshots, retry / edit-last
 * helpers, and plan-mode send helpers. The view component only renders JSX
 * from the returned state.
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
  /** Pre-apply HTML keyed by `toolCallId`, captured at the exact moment the tool output is pushed into Tiptap. */
  const preEditByToolIdRef = useRef<Map<string, string>>(new Map());
  const editorRef = useRef<ReturnType<typeof useEditorSession>['editor']>(null);
  const { editor } = useEditorSession();
  editorRef.current = editor;

  const [chatMode, setChatMode] = useState<ChatMode>('edit');
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

  const { messages, sendMessage, setMessages, status, stop, error } = useChat<DocumentChatUIMessage>({
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
        // Capture the HTML *immediately before* the edit is applied, so Undo can restore the exact pre-edit state.
        preEditByToolIdRef.current.set(id, editor.getHTML());
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

  /** Classify the current stream phase based on the last assistant message's parts. */
  const streamingPhase: StreamingPhase = useMemo(() => {
    if (status === 'submitted') return 'thinking';
    if (status !== 'streaming') return 'idle';
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return 'thinking';
    let hasInProgressSetDoc = false;
    let hasInProgressClarify = false;
    for (const p of last.parts) {
      if (
        p.type === 'tool-setDocumentHtml' &&
        p.state !== 'output-available' &&
        p.state !== 'output-error'
      ) {
        hasInProgressSetDoc = true;
      }
      if (
        p.type === 'tool-requestClarifications' &&
        p.state !== 'output-available' &&
        p.state !== 'output-error'
      ) {
        hasInProgressClarify = true;
      }
    }
    if (hasInProgressSetDoc) return 'applyingEdit';
    if (hasInProgressClarify) return 'draftingQuestions';
    return 'writing';
  }, [status, messages]);

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

  /**
   * Revert the editor to the exact HTML captured right before this tool call applied
   * its `setDocumentHtml` output. Returns true when a snapshot existed and was applied.
   */
  const undoToolEdit = useCallback((toolCallId: string): boolean => {
    const prev = preEditByToolIdRef.current.get(toolCallId);
    const ed = editorRef.current;
    if (prev === undefined || !ed) return false;
    ed.chain().focus().setContent(prev, { emitUpdate: true }).run();
    return true;
  }, []);

  /** Read the pre-apply HTML captured for a given tool call (undefined if unknown). */
  const getPreEditHtml = useCallback(
    (toolCallId: string): string | undefined => preEditByToolIdRef.current.get(toolCallId),
    [],
  );

  /**
   * Re-send the previous user turn. Used by the "Retry" affordance on the latest
   * assistant message when the reply was unsatisfying or errored out.
   */
  const retryAssistant = useCallback(() => {
    if (busy || !editorReady || awaitingPlanAnswers) return;
    const msgs = messagesRef.current;
    // Find the last user turn's concatenated text.
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role !== 'user') continue;
      const texts: string[] = [];
      for (const p of m.parts) {
        if (p.type === 'text') texts.push(p.text);
      }
      const text = texts.join('\n').trim();
      if (!text) return;
      // Trim messages after and including this user turn so the stream rewrites cleanly.
      setMessages(msgs.slice(0, i));
      void sendMessage({ text });
      return;
    }
  }, [awaitingPlanAnswers, busy, editorReady, sendMessage, setMessages]);

  /**
   * Pop the trailing assistant turn(s) after the last user turn and return the user
   * text so the composer can load it for editing. No-op while busy.
   */
  const popLastUserMessageForEdit = useCallback((): string | null => {
    if (busy || awaitingPlanAnswers) return null;
    const msgs = messagesRef.current;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role !== 'user') continue;
      const texts: string[] = [];
      for (const p of m.parts) {
        if (p.type === 'text') texts.push(p.text);
      }
      const text = texts.join('\n').trim();
      if (!text) return null;
      setMessages(msgs.slice(0, i));
      return text;
    }
    return null;
  }, [awaitingPlanAnswers, busy, setMessages]);

  return {
    messages,
    status,
    error,
    busy,
    awaitingPlanAnswers,
    streamingPhase,
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
    retryAssistant,
    popLastUserMessageForEdit,
    undoToolEdit,
    getPreEditHtml,
    stop,
  };
}
