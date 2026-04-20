import { ListTodoIcon, PenLineIcon, SendIcon, SquareIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';
import { tryParsePlanAnswersUserText } from '@/lib/plan-answers-protocol';

import { ChatModelSelect } from './chat-model-select';
import { PlanAnswersSubmittedBubble } from './plan-clarification-form';
import { ChatTextPart } from './message-parts/chat-text-part';
import { ToolSetDocumentHtmlPart } from './message-parts/tool-set-document-html';
import { ToolClarificationsPart } from './message-parts/tool-clarifications';
import { useDocumentChatSession } from './use-document-chat-session';

type DocumentChatSessionViewProps = {
  sessionId: string;
  documentKey: string;
  initialMessages: DocumentChatUIMessage[];
  initialLastAgentDocumentHtml?: string;
  editorReady: boolean;
  onPersistSession: (
    sessionId: string,
    messages: DocumentChatUIMessage[],
    persistDocumentKey: string,
  ) => void;
  onPersistAgentSnapshot: (sessionId: string, html: string, persistDocumentKey: string) => void;
};

export function DocumentChatSessionView(props: DocumentChatSessionViewProps) {
  const { editorReady } = props;
  const {
    messages,
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
  } = useDocumentChatSession(props);

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
                      return <ToolSetDocumentHtmlPart key={i} part={part} />;
                    }
                    if (part.type === 'tool-requestClarifications') {
                      const interactive =
                        m.role === 'assistant' && msgIdx === messages.length - 1 && !busy;
                      return (
                        <ToolClarificationsPart
                          key={interactive ? `${m.id}-clar` : i}
                          part={part}
                          interactive={interactive}
                          disabled={busy || !editorReady}
                          onSubmitAnswers={sendPlanAnswers}
                        />
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
            <ChatModelSelect
              id="scribe-chat-model"
              ariaLabel="Chat model"
              value={chatModel}
              onChange={persistChatModel}
              disabled={busy || !window.scribe?.setSettings}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-8 min-w-0 flex-1 rounded-md border px-2 text-xs shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-[12rem]"
            />
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
