import { useCallback, useRef, useState } from 'react';

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';
import type { PlanArtifact } from '@/lib/plan-artifact';

import { PlanReviewOverlay } from '@/components/plan-review/plan-review-overlay';

import { Composer, type ComposerHandle } from './composer';
import { MessageList } from './message-list';
import { SuggestionChips } from './suggestion-chips';
import { useDocumentChatSession, type ChatMode } from './use-document-chat-session';

type DocumentChatSessionViewProps = {
  sessionId: string;
  documentKey: string;
  documentLabel: string;
  initialMessages: DocumentChatUIMessage[];
  initialLastAgentDocumentHtml?: string;
  initialPlanArtifact?: unknown;
  initialChatMode?: ChatMode;
  initialPlanDepthSelection?: string;
  editorReady: boolean;
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

export function DocumentChatSessionView(props: DocumentChatSessionViewProps) {
  const { editorReady, documentLabel } = props;
  const {
    messages,
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
    sendPlanFeedback,
    sendPlanAccepted,
    retryAssistant,
    popLastUserMessageForEdit,
    undoToolEdit,
    getPreEditHtml,
    stop,
    planArtifact,
    setPlanCurrentVersion,
    planReviewOpen,
    setPlanReviewOpen,
    stagedComments,
    addStagedComment,
    removeStagedComment,
    freeformFeedback,
    setFreeformFeedback,
  } = useDocumentChatSession(props);

  const [draft, setDraft] = useState('');
  const composerRef = useRef<ComposerHandle>(null);
  const listWrapperRef = useRef<HTMLDivElement>(null);

  const pickSuggestion = useCallback((prompt: string) => {
    composerRef.current?.setValue(prompt);
  }, []);

  const handleEditUserMessage = useCallback(() => {
    const prev = popLastUserMessageForEdit();
    if (prev !== null) {
      composerRef.current?.setValue(prev);
    }
  }, [popLastUserMessageForEdit]);

  const handleRetry = useCallback(() => {
    retryAssistant();
  }, [retryAssistant]);

  const handleSubmitPrompt = useCallback(
    (text: string) => {
      sendPrompt(text);
    },
    [sendPrompt],
  );

  const handleJumpToClarifications = useCallback(() => {
    const root = listWrapperRef.current;
    if (!root) return;
    const form = root.querySelector('form');
    if (form) {
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const handleOpenPlan = useCallback(() => {
    if (!planArtifact || planArtifact.versions.length === 0) return;
    setPlanReviewOpen(true);
  }, [planArtifact, setPlanReviewOpen]);

  const handleSkipReview = useCallback(() => {
    sendPlanAccepted();
  }, [sendPlanAccepted]);

  const emptyState = (
    <EmptyState
      documentLabel={documentLabel}
      chatMode={chatMode}
      planDepthIsAuto={planDepthIsAuto}
      planRefinementRounds={planRefinementRounds}
      editorReady={editorReady}
      onPick={pickSuggestion}
    />
  );

  return (
    <>
      {error ? (
        <Alert variant="destructive" className="shrink-0">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
          {!busy && editorReady ? (
            <AlertAction>
              <Button type="button" variant="outline" size="sm" onClick={retryAssistant}>
                Retry
              </Button>
            </AlertAction>
          ) : null}
        </Alert>
      ) : null}

      {!editorReady && messages.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Loading the editor… You can read past messages; sending is enabled once the document is
          ready.
        </p>
      ) : null}

      <div ref={listWrapperRef} className="flex min-h-0 flex-1 flex-col">
        <MessageList
          messages={messages}
          busy={busy}
          editorReady={editorReady}
          streamingPhase={streamingPhase}
          onSubmitPlanAnswers={sendPlanAnswers}
          onOpenPlan={handleOpenPlan}
          onSkipReview={handleSkipReview}
          onRetry={handleRetry}
          onEditUserMessage={handleEditUserMessage}
          getPreEditHtml={getPreEditHtml}
          onUndoToolEdit={undoToolEdit}
          emptyState={emptyState}
        />
      </div>

      <Composer
        ref={composerRef}
        value={draft}
        onChange={setDraft}
        onSubmit={handleSubmitPrompt}
        onStop={stop}
        busy={busy}
        editorReady={editorReady}
        awaitingPlanAnswers={awaitingPlanAnswers}
        onJumpToClarifications={handleJumpToClarifications}
        chatMode={chatMode}
        onChatModeChange={setChatMode}
        planDepthSelection={planDepthSelection}
        onPlanDepthChange={setPlanDepthSelection}
        planDepthIsAuto={planDepthIsAuto}
        planRefinementRounds={planRefinementRounds}
        chatModel={chatModel}
        onChatModelChange={persistChatModel}
      />

      {planArtifact && planArtifact.versions.length > 0 ? (
        <PlanReviewOverlay
          open={planReviewOpen}
          onOpenChange={setPlanReviewOpen}
          artifact={planArtifact}
          busy={busy}
          stagedComments={stagedComments}
          freeformFeedback={freeformFeedback}
          onChangeFreeformFeedback={setFreeformFeedback}
          onAddComment={addStagedComment}
          onRemoveStagedComment={removeStagedComment}
          onSetCurrentVersion={setPlanCurrentVersion}
          onRequestChanges={sendPlanFeedback}
          onSubmitPlan={sendPlanAccepted}
        />
      ) : null}
    </>
  );
}

function EmptyState({
  documentLabel,
  chatMode,
  planDepthIsAuto,
  planRefinementRounds,
  editorReady,
  onPick,
}: {
  documentLabel: string;
  chatMode: 'edit' | 'plan';
  planDepthIsAuto: boolean;
  planRefinementRounds: number;
  editorReady: boolean;
  onPick: (prompt: string) => void;
}) {
  const title = documentLabel ? `Chat with ${documentLabel}` : 'Start a new chat';
  const subtitle =
    chatMode === 'plan'
      ? planDepthIsAuto
        ? 'Plan (Auto) will ask as many clarification rounds as it needs (covering both content and voice/style), then write a reviewable plan.'
        : `Plan will run ${planRefinementRounds} clarification round${planRefinementRounds === 1 ? '' : 's'} (covering both content and voice/style), then write a reviewable plan you can comment on before applying changes.`
      : 'Ask about this document or request edits. The assistant can rewrite the full document when you want changes applied.';

  return (
    <div className="flex flex-col gap-3 py-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-foreground text-sm font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-xs leading-relaxed">{subtitle}</p>
      </div>
      <SuggestionChips mode={chatMode} disabled={!editorReady} onPick={onPick} />
    </div>
  );
}
