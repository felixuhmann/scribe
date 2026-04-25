import { useChat } from '@ai-sdk/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useEditorSession } from '@/components/editor-session-context';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';
import { buildDocumentChangeSummary } from '@/lib/document-change-summary';
import {
  buildPlanAcceptedUserText,
  buildPlanAnswersUserText,
  buildPlanFeedbackUserText,
  type PlanAnswerPayload,
  type PlanFeedbackPayload,
} from '@/lib/plan-answers-protocol';
import {
  appendPlanVersion,
  emptyPlanArtifact,
  newCommentId,
  type PlanArtifact,
  type PlanBlock,
  type PlanComment,
} from '@/lib/plan-artifact';
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
  | 'writingPlan'
  | 'applyingEdit'
  | 'draftingQuestions';

export type StagedComment = {
  stagedId: string;
  blockId: string | 'doc';
  selectionText?: string;
  body: string;
};

export type DocumentChatSessionHookOptions = {
  sessionId: string;
  documentKey: string;
  initialMessages: DocumentChatUIMessage[];
  initialLastAgentDocumentHtml?: string;
  initialPlanArtifact?: unknown;
  initialChatMode?: ChatMode;
  initialPlanDepthSelection?: string;
  editorReady: boolean;
  /** `persistDocumentKey` is always the document this session belongs to (may differ from the panel's current doc). */
  onPersistSession: (
    sessionId: string,
    messages: DocumentChatUIMessage[],
    persistDocumentKey: string,
  ) => void;
  onPersistAgentSnapshot: (sessionId: string, html: string, persistDocumentKey: string) => void;
  onPersistPlanArtifact: (
    sessionId: string,
    artifact: PlanArtifact | null,
    persistDocumentKey: string,
  ) => void;
  onPersistChatMode: (
    sessionId: string,
    mode: ChatMode,
    persistDocumentKey: string,
  ) => void;
  onPersistPlanDepth: (
    sessionId: string,
    depthSelection: string,
    persistDocumentKey: string,
  ) => void;
};

export type DocumentChatSessionHookResult = ReturnType<typeof useDocumentChatSession>;

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

/** Defensive parse for a persisted plan artifact (validates shape but stays permissive). */
function parseStoredArtifact(raw: unknown): PlanArtifact | null {
  if (!isObject(raw)) return null;
  if (!Array.isArray(raw.versions)) return null;
  if (!Array.isArray(raw.comments)) return null;
  if (typeof raw.artifactId !== 'string') return null;
  return raw as PlanArtifact;
}

/** Pull completed `tool-writePlan` outputs from the message stream in order. */
function extractWrittenPlansFromMessages(
  messages: DocumentChatUIMessage[],
): Array<{ blocks: PlanBlock[]; rationale?: string }> {
  const out: Array<{ blocks: PlanBlock[]; rationale?: string }> = [];
  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    for (const p of m.parts) {
      if (p.type !== 'tool-writePlan') continue;
      if (p.state !== 'output-available') continue;
      const output = p.output as unknown;
      if (!isObject(output) || !Array.isArray(output.blocks)) continue;
      const blocks = output.blocks as PlanBlock[];
      const rationale =
        typeof output.rationale === 'string' && output.rationale.length > 0
          ? output.rationale
          : undefined;
      out.push({ blocks, rationale });
    }
  }
  return out;
}

/**
 * Reconcile the artifact's version count with the messages stream:
 * appending any new `tool-writePlan` outputs that aren't yet versions in the
 * artifact. Existing comments + artifactId are preserved by `appendPlanVersion`.
 */
function syncArtifactWithMessages(
  artifact: PlanArtifact | null,
  messages: DocumentChatUIMessage[],
): PlanArtifact | null {
  const written = extractWrittenPlansFromMessages(messages);
  if (written.length === 0) {
    /** No plans written yet — keep whatever artifact we have (e.g. drafting empty). */
    return artifact ?? null;
  }
  let next: PlanArtifact = artifact ?? emptyPlanArtifact();
  while (next.versions.length < written.length) {
    const idx = next.versions.length;
    const w = written[idx];
    next = appendPlanVersion(next, w.blocks, w.rationale);
  }
  return next;
}

/**
 * Owns every side-effectful concern of one chat session:
 * IPC transport wiring, `useChat` instance, model/mode state + persistence,
 * debounced + visibilitychange + pagehide message persistence, tool output
 * replay into the Tiptap editor, per-tool Undo snapshots, retry / edit-last
 * helpers, plan-mode send helpers, and plan-artifact derivation.
 * The view component only renders JSX from the returned state.
 */
export function useDocumentChatSession({
  sessionId,
  documentKey,
  initialMessages,
  initialLastAgentDocumentHtml,
  initialPlanArtifact,
  initialChatMode,
  initialPlanDepthSelection,
  editorReady,
  onPersistSession,
  onPersistAgentSnapshot,
  onPersistPlanArtifact,
  onPersistChatMode,
  onPersistPlanDepth,
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

  const [chatMode, setChatModeState] = useState<ChatMode>(initialChatMode ?? 'edit');
  /** `useChat` keeps the first `transport` instance; read mode from a ref so IPC always sees the current dropdown value. */
  const chatModeRef = useRef(chatMode);
  chatModeRef.current = chatMode;

  const setChatMode = useCallback(
    (next: ChatMode) => {
      setChatModeState(next);
      onPersistChatMode(sessionId, next, documentKey);
    },
    [documentKey, onPersistChatMode, sessionId],
  );

  /**
   * Plan mode depth: `auto` = model decides when to clarify vs write (extra rounds if scope changes);
   * `1`–`8` = fixed number of structured answer rounds before applying the document.
   */
  const [planDepthSelection, setPlanDepthSelectionState] = useState<string>(
    initialPlanDepthSelection ?? '1',
  );
  const planDepthSelectionRef = useRef(planDepthSelection);
  planDepthSelectionRef.current = planDepthSelection;
  const planDepthIsAuto = planDepthSelection === 'auto';
  const planRefinementRounds = planDepthIsAuto
    ? 1
    : Math.min(8, Math.max(1, Number.parseInt(planDepthSelection, 10) || 1));

  const setPlanDepthSelection = useCallback(
    (next: string) => {
      setPlanDepthSelectionState(next);
      onPersistPlanDepth(sessionId, next, documentKey);
    },
    [documentKey, onPersistPlanDepth, sessionId],
  );

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

  /**
   * Plan artifact: comments + status are user-authored (not derivable from messages),
   * but versions come from completed `tool-writePlan` parts in the stream. We hydrate
   * from persistence and reconcile new versions on every messages change.
   */
  const [planArtifact, setPlanArtifact] = useState<PlanArtifact | null>(() => {
    const stored = parseStoredArtifact(initialPlanArtifact);
    return syncArtifactWithMessages(stored, initialMessages);
  });
  const planArtifactRef = useRef(planArtifact);
  planArtifactRef.current = planArtifact;

  /** Whether the full-tab plan review overlay is currently open. */
  const [planReviewOpen, setPlanReviewOpen] = useState(false);
  /** Comments the user has staged but not yet sent via `Request changes`. */
  const [stagedComments, setStagedComments] = useState<StagedComment[]>([]);
  /** Freeform note paired with staged comments. */
  const [freeformFeedback, setFreeformFeedback] = useState<string>('');

  /** When a new `tool-writePlan` arrives in the stream, append a version to the artifact and persist. */
  useEffect(() => {
    setPlanArtifact((prev) => {
      const next = syncArtifactWithMessages(prev, messages);
      if (next === prev) return prev;
      onPersistPlanArtifact(sessionId, next, documentKey);
      return next;
    });
  }, [messages, documentKey, sessionId, onPersistPlanArtifact]);

  /** Auto-open the overlay when a brand-new plan version lands while the user is on this session. */
  const lastSeenVersionRef = useRef<number>(planArtifact?.versions.length ?? 0);
  useEffect(() => {
    const count = planArtifact?.versions.length ?? 0;
    if (count > lastSeenVersionRef.current) {
      setPlanReviewOpen(true);
      /** Drop staged comments from the prior version: each version is reviewed fresh. */
      setStagedComments([]);
      setFreeformFeedback('');
    }
    lastSeenVersionRef.current = count;
  }, [planArtifact?.versions.length]);

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
        /**
         * After setDocumentHtml lands following a [SCRIBE_PLAN_ACCEPTED] turn, mark the artifact
         * superseded and persist. We detect "after acceptance" by checking artifact.status.
         */
        const current = planArtifactRef.current;
        if (current && current.status === 'accepted') {
          const next: PlanArtifact = { ...current, status: 'superseded' };
          setPlanArtifact(next);
          onPersistPlanArtifact(sessionId, next, documentKey);
        }
      }
    }
  }, [messages, editor, documentKey, sessionId, onPersistPlanArtifact]);

  const busy = status === 'streaming' || status === 'submitted';

  const awaitingPlanAnswers = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return false;
    return last.parts.some(
      (p) => p.type === 'tool-requestClarifications' && p.state === 'output-available',
    );
  }, [messages]);

  /** True when the most recent assistant turn ends with a writePlan that hasn't been accepted yet. */
  const awaitingPlanReview = useMemo(() => {
    if (!planArtifact) return false;
    if (planArtifact.status === 'accepted' || planArtifact.status === 'superseded') return false;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return false;
    return last.parts.some(
      (p) => p.type === 'tool-writePlan' && p.state === 'output-available',
    );
  }, [messages, planArtifact]);

  /** Classify the current stream phase based on the last assistant message's parts. */
  const streamingPhase: StreamingPhase = useMemo(() => {
    if (status === 'submitted') return 'thinking';
    if (status !== 'streaming') return 'idle';
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return 'thinking';
    let hasInProgressSetDoc = false;
    let hasInProgressClarify = false;
    let hasInProgressWritePlan = false;
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
      if (
        p.type === 'tool-writePlan' &&
        p.state !== 'output-available' &&
        p.state !== 'output-error'
      ) {
        hasInProgressWritePlan = true;
      }
    }
    if (hasInProgressSetDoc) return 'applyingEdit';
    if (hasInProgressWritePlan) return 'writingPlan';
    if (hasInProgressClarify) return 'draftingQuestions';
    return 'writing';
  }, [status, messages]);

  const sendPrompt = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy || !editorReady || awaitingPlanAnswers || awaitingPlanReview) return;
      void sendMessage({ text: trimmed });
    },
    [awaitingPlanAnswers, awaitingPlanReview, busy, editorReady, sendMessage],
  );

  const sendPlanAnswers = useCallback(
    (payload: PlanAnswerPayload) => {
      if (busy || !editorReady) return;
      void sendMessage({ text: buildPlanAnswersUserText(payload) });
    },
    [busy, editorReady, sendMessage],
  );

  /** Add a comment to the staging set (not yet sent to the agent). */
  const addStagedComment = useCallback(
    (input: { blockId: string | 'doc'; selectionText?: string; body: string }) => {
      const trimmed = input.body.trim();
      if (!trimmed) return;
      setStagedComments((prev) => [
        ...prev,
        {
          stagedId: newCommentId(),
          blockId: input.blockId,
          selectionText: input.selectionText,
          body: trimmed,
        },
      ]);
    },
    [],
  );

  const removeStagedComment = useCallback((stagedId: string) => {
    setStagedComments((prev) => prev.filter((c) => c.stagedId !== stagedId));
  }, []);

  /**
   * Persist staged comments into the artifact (status: open) and send the
   * `[SCRIBE_PLAN_FEEDBACK]` user message. The agent will reply with a new
   * `writePlan` call, which appends v(N+1) to the artifact via the message
   * sync effect above.
   */
  const sendPlanFeedback = useCallback(() => {
    if (busy || !editorReady) return;
    if (!planArtifact || planArtifact.versions.length === 0) return;
    const baseVersion = planArtifact.currentVersion;
    const note = freeformFeedback.trim();
    if (stagedComments.length === 0 && note.length === 0) return;

    const persistedComments: PlanComment[] = stagedComments.map((c) => ({
      commentId: c.stagedId,
      versionNumber: baseVersion,
      blockId: c.blockId,
      selectionText: c.selectionText,
      body: c.body,
      status: { kind: 'open' },
      createdAt: Date.now(),
    }));

    const updated: PlanArtifact = {
      ...planArtifact,
      comments: [...planArtifact.comments, ...persistedComments],
    };
    setPlanArtifact(updated);
    onPersistPlanArtifact(sessionId, updated, documentKey);

    const payload: PlanFeedbackPayload = {
      baseVersion,
      freeformNote: note.length > 0 ? note : undefined,
      comments: stagedComments.map((c) => ({
        blockId: c.blockId,
        selectionText: c.selectionText,
        body: c.body,
      })),
    };
    void sendMessage({ text: buildPlanFeedbackUserText(payload) });

    setStagedComments([]);
    setFreeformFeedback('');
    setPlanReviewOpen(false);
  }, [
    busy,
    documentKey,
    editorReady,
    freeformFeedback,
    onPersistPlanArtifact,
    planArtifact,
    sendMessage,
    sessionId,
    stagedComments,
  ]);

  /**
   * Accept the current plan: mark the artifact accepted, close the overlay, and
   * send `[SCRIBE_PLAN_ACCEPTED]`. The agent's next step is forced into
   * setDocumentHtml in the main process.
   */
  const sendPlanAccepted = useCallback(() => {
    if (busy || !editorReady) return;
    if (!planArtifact || planArtifact.versions.length === 0) return;
    const accepted: PlanArtifact = { ...planArtifact, status: 'accepted' };
    setPlanArtifact(accepted);
    onPersistPlanArtifact(sessionId, accepted, documentKey);
    void sendMessage({
      text: buildPlanAcceptedUserText({ acceptedVersion: planArtifact.currentVersion }),
    });
    setStagedComments([]);
    setFreeformFeedback('');
    setPlanReviewOpen(false);
  }, [
    busy,
    documentKey,
    editorReady,
    onPersistPlanArtifact,
    planArtifact,
    sendMessage,
    sessionId,
  ]);

  /** Switch which version the user is reviewing (for diffing v1 vs v2). */
  const setPlanCurrentVersion = useCallback(
    (versionNumber: number) => {
      setPlanArtifact((prev) => {
        if (!prev) return prev;
        if (versionNumber < 1 || versionNumber > prev.versions.length) return prev;
        const next: PlanArtifact = { ...prev, currentVersion: versionNumber };
        onPersistPlanArtifact(sessionId, next, documentKey);
        return next;
      });
    },
    [documentKey, onPersistPlanArtifact, sessionId],
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
    if (busy || !editorReady || awaitingPlanAnswers || awaitingPlanReview) return;
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
  }, [awaitingPlanAnswers, awaitingPlanReview, busy, editorReady, sendMessage, setMessages]);

  /**
   * Pop the trailing assistant turn(s) after the last user turn and return the user
   * text so the composer can load it for editing. No-op while busy.
   */
  const popLastUserMessageForEdit = useCallback((): string | null => {
    if (busy || awaitingPlanAnswers || awaitingPlanReview) return null;
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
  }, [awaitingPlanAnswers, awaitingPlanReview, busy, setMessages]);

  return {
    messages,
    status,
    error,
    busy,
    awaitingPlanAnswers,
    awaitingPlanReview,
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
    sendPlanFeedback,
    sendPlanAccepted,
    retryAssistant,
    popLastUserMessageForEdit,
    undoToolEdit,
    getPreEditHtml,
    stop,

    /** Plan-review state. */
    planArtifact,
    setPlanCurrentVersion,
    planReviewOpen,
    setPlanReviewOpen,
    stagedComments,
    addStagedComment,
    removeStagedComment,
    freeformFeedback,
    setFreeformFeedback,
  };
}
