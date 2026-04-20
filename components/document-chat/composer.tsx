import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import {
  ArrowUpIcon,
  ListTodoIcon,
  PenLineIcon,
  SquareIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { ChatModelSelect } from './chat-model-select';
import type { ChatMode } from './use-document-chat-session';

export type ComposerHandle = {
  focus: () => void;
  setValue: (v: string) => void;
};

type ComposerProps = {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  editorReady: boolean;
  awaitingPlanAnswers: boolean;
  onJumpToClarifications: () => void;

  chatMode: ChatMode;
  onChatModeChange: (next: ChatMode) => void;
  planDepthSelection: string;
  onPlanDepthChange: (next: string) => void;
  planDepthIsAuto: boolean;
  planRefinementRounds: number;

  chatModel: string;
  onChatModelChange: (next: string) => void;
};

const DEPTH_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: '1', label: '1 round' },
  { value: '2', label: '2 rounds' },
  { value: '3', label: '3 rounds' },
  { value: '4', label: '4 rounds' },
  { value: '5', label: '5 rounds' },
  { value: '6', label: '6 rounds' },
  { value: '7', label: '7 rounds' },
  { value: '8', label: '8 rounds' },
];

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  props,
  ref,
) {
  const {
    value,
    onChange,
    onSubmit,
    onStop,
    busy,
    editorReady,
    awaitingPlanAnswers,
    onJumpToClarifications,
    chatMode,
    onChatModeChange,
    planDepthSelection,
    onPlanDepthChange,
    planDepthIsAuto,
    planRefinementRounds,
    chatModel,
    onChatModelChange,
  } = props;

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => textareaRef.current?.focus(),
      setValue: (v: string) => {
        onChange(v);
        requestAnimationFrame(() => textareaRef.current?.focus());
      },
    }),
    [onChange],
  );

  // Auto-grow: reset then set to scroll height, clamped by CSS max-height.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const canSend = !busy && editorReady && !awaitingPlanAnswers && value.trim().length > 0;

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text) return;
    if (!editorReady || busy || awaitingPlanAnswers) return;
    onSubmit(text);
    onChange('');
  }, [value, editorReady, busy, awaitingPlanAnswers, onSubmit, onChange]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (e.nativeEvent.isComposing) return;
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  const placeholder = (() => {
    if (!editorReady) return 'Waiting for the document editor…';
    if (awaitingPlanAnswers) return 'Answer the plan questions above to continue…';
    if (chatMode === 'plan') {
      return planDepthIsAuto
        ? 'Describe what to create or change. Plan (Auto) will ask as many rounds as it needs.'
        : `Describe what to create or change. Plan will ask up to ${planRefinementRounds} round${planRefinementRounds === 1 ? '' : 's'}.`;
    }
    return 'Message about this document…';
  })();

  const sendDisabledReason = (() => {
    if (!editorReady) return 'Document is still loading';
    if (awaitingPlanAnswers) return 'Answer the plan questions above first';
    if (value.trim().length === 0) return 'Type a message to send';
    return null;
  })();

  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      {awaitingPlanAnswers ? (
        <AwaitingAnswersBanner onJumpToClarifications={onJumpToClarifications} />
      ) : null}
      <div
        className={cn(
          'border-input bg-background ring-offset-background focus-within:ring-ring flex flex-col rounded-lg border px-2 pt-2 pb-1.5 transition-shadow focus-within:ring-2 focus-within:ring-offset-1',
          awaitingPlanAnswers && 'opacity-70',
        )}
      >
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={!editorReady || awaitingPlanAnswers}
          className="min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
          onKeyDown={onKeyDown}
          rows={1}
        />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <ToggleGroup
              type="single"
              variant="default"
              size="sm"
              value={chatMode}
              onValueChange={(v) => {
                if (v === 'edit' || v === 'plan') onChatModeChange(v);
              }}
              disabled={busy || awaitingPlanAnswers}
              aria-label="Chat mode"
              className="bg-muted/60 h-7 rounded-md p-0.5"
            >
              <ToggleGroupItem
                value="edit"
                aria-label="Edit mode"
                className="data-[state=on]:bg-background h-6 gap-1 rounded-[min(var(--radius-md),8px)] px-2 text-xs data-[state=on]:shadow-sm"
              >
                <PenLineIcon data-icon="inline-start" aria-hidden />
                Edit
              </ToggleGroupItem>
              <ToggleGroupItem
                value="plan"
                aria-label="Plan mode"
                className="data-[state=on]:bg-background h-6 gap-1 rounded-[min(var(--radius-md),8px)] px-2 text-xs data-[state=on]:shadow-sm"
              >
                <ListTodoIcon data-icon="inline-start" aria-hidden />
                Plan
              </ToggleGroupItem>
            </ToggleGroup>
            {chatMode === 'plan' ? (
              <Select
                value={planDepthSelection}
                disabled={busy || awaitingPlanAnswers}
                onValueChange={onPlanDepthChange}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="Plan depth"
                  className="text-muted-foreground h-7 gap-1 text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {DEPTH_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <ChatModelSelect
              ariaLabel="Chat model"
              size="sm"
              value={chatModel}
              onChange={onChatModelChange}
              disabled={busy || !window.scribe?.setSettings}
              className="text-muted-foreground h-7 max-w-[11rem] text-xs"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-muted-foreground hidden text-[10px] sm:inline">
              ↵ send · ⇧↵ newline
            </span>
            {busy ? (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="size-8 rounded-full"
                aria-label="Stop generating"
                title="Stop generating"
                onClick={onStop}
              >
                <SquareIcon aria-hidden className="size-3.5" />
              </Button>
            ) : (
              <SendButton
                disabled={!canSend}
                disabledReason={sendDisabledReason}
                onClick={submit}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

function SendButton({
  disabled,
  disabledReason,
  onClick,
}: {
  disabled: boolean;
  disabledReason: string | null;
  onClick: () => void;
}) {
  const btn = (
    <Button
      type="button"
      size="icon"
      className="size-8 rounded-full"
      aria-label="Send message"
      disabled={disabled}
      onClick={onClick}
    >
      <ArrowUpIcon aria-hidden className="size-4" />
    </Button>
  );
  if (!disabled || !disabledReason) return btn;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{btn}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{disabledReason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function AwaitingAnswersBanner({
  onJumpToClarifications,
}: {
  onJumpToClarifications: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onJumpToClarifications}
      className="border-border bg-muted/40 hover:bg-muted text-foreground flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors"
    >
      <span>Answer the plan questions above to continue.</span>
      <span className="text-primary font-medium">Jump to form ↑</span>
    </button>
  );
}
