import { useCallback, useEffect, useRef, useState } from 'react';

import { useDocumentWorkspace } from '@/components/document-workspace-context';
import { useEditorSession } from '@/components/editor-session-context';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';
import type { DocumentChatBundle, StoredChatSession } from '@/src/scribe-ipc-types';

import { ChatHeader } from './chat-header';
import { chatTitleFromMessages } from './chat-session-title';
import { DocumentChatSessionView } from './document-chat-session-view';
import { SessionsRail } from './sessions-rail';

function parseInitialMessages(raw: unknown): DocumentChatUIMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw as DocumentChatUIMessage[];
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
  const [railCollapsed, setRailCollapsed] = useState(false);
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

  const saveBundle = useCallback(
    (next: DocumentChatBundle) => {
      const api = window.scribe?.saveDocumentChatBundle;
      if (api) void api(documentKey, next);
    },
    [documentKey],
  );

  const persistSession = useCallback(
    (sessionId: string, messages: DocumentChatUIMessage[], persistDocumentKey: string) => {
      const title = chatTitleFromMessages(messages);
      const updatedAt = Date.now();
      const mergeApi = window.scribe?.mergeDocumentChatSession;

      if (persistDocumentKey === documentKey) {
        setBundle((prev) => {
          if (!prev) return prev;
          const sessions = prev.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages,
                  // Preserve manual renames: chat-title-from-messages is only used when title is still the default.
                  title: s.title === 'New chat' ? title : s.title,
                  updatedAt,
                }
              : s,
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

  const deleteSession = useCallback(
    (sessionId: string) => {
      if (!effectiveBundle) return;
      const remaining = effectiveBundle.sessions.filter((s) => s.id !== sessionId);
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
      let nextActive = effectiveBundle.activeSessionId;
      if (nextActive === sessionId) {
        nextActive = remaining.find((s) => !s.archived)?.id ?? remaining[0].id;
      }
      const next: DocumentChatBundle = {
        activeSessionId: nextActive,
        sessions: remaining,
      };
      saveBundle(next);
      setBundle(next);
      setActiveSessionId(nextActive);
    },
    [effectiveBundle, saveBundle],
  );

  const archiveSession = useCallback(
    (sessionId: string) => {
      if (!effectiveBundle) return;
      let sessions = effectiveBundle.sessions.map((s) =>
        s.id === sessionId ? { ...s, archived: true as const } : s,
      );
      const available = sessions.filter((s) => !s.archived);
      let nextActive = effectiveBundle.activeSessionId;
      if (nextActive === sessionId) {
        if (available.length === 0) {
          nextActive = crypto.randomUUID();
          const now = Date.now();
          sessions = [
            ...sessions,
            { id: nextActive, title: 'New chat', messages: [], updatedAt: now },
          ];
        } else {
          nextActive = available[0].id;
        }
      }
      const next: DocumentChatBundle = { activeSessionId: nextActive, sessions };
      saveBundle(next);
      setBundle(next);
      setActiveSessionId(nextActive);
    },
    [effectiveBundle, saveBundle],
  );

  const unarchiveSession = useCallback(
    (sessionId: string) => {
      if (!effectiveBundle) return;
      const sessions = effectiveBundle.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        if (!s.archived) return s;
        const { archived: _a, ...rest } = s;
        void _a;
        return rest;
      });
      const next: DocumentChatBundle = { ...effectiveBundle, sessions };
      saveBundle(next);
      setBundle(next);
    },
    [effectiveBundle, saveBundle],
  );

  const renameSession = useCallback(
    (sessionId: string, nextTitle: string) => {
      if (!effectiveBundle) return;
      const sessions = effectiveBundle.sessions.map((s) =>
        s.id === sessionId ? { ...s, title: nextTitle, updatedAt: Date.now() } : s,
      );
      const next: DocumentChatBundle = { ...effectiveBundle, sessions };
      saveBundle(next);
      setBundle(next);
    },
    [effectiveBundle, saveBundle],
  );

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
      <SessionsRail
        bundle={effectiveBundle}
        activeSessionId={activeSessionId}
        collapsed={railCollapsed}
        onToggleCollapsed={() => setRailCollapsed((v) => !v)}
        archivedOpen={archivedChatsOpen}
        onArchivedOpenChange={setArchivedChatsOpen}
        onSelect={selectSession}
        onNewChat={newChat}
        onRename={(s, next) => renameSession(s.id, next)}
        onArchiveToggle={(s) => (s.archived ? unarchiveSession(s.id) : archiveSession(s.id))}
        onDelete={(s) => deleteSession(s.id)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <ChatHeader
          documentLabel={documentLabel}
          documentKey={documentKey}
          activeSession={activeSessionMeta}
          onRenameActive={(next) =>
            activeSessionId ? renameSession(activeSessionId, next) : undefined
          }
          onArchiveActive={() => activeSessionId && archiveSession(activeSessionId)}
          onUnarchiveActive={() => activeSessionId && unarchiveSession(activeSessionId)}
          onDeleteActive={() => activeSessionId && deleteSession(activeSessionId)}
        />

        {loadError ? (
          <Alert variant="destructive">
            <AlertTitle>Chat storage error</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : null}

        {effectiveBundle && activeSessionId ? (
          <DocumentChatSessionView
            key={`${documentKey}::${activeSessionId}`}
            sessionId={activeSessionId}
            documentKey={documentKey}
            documentLabel={documentLabel}
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
