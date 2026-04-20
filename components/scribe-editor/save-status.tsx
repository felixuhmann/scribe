import { AlertTriangle, Check, CircleDashed, CloudOff, Loader2 } from 'lucide-react';

import { useDocumentWorkspace } from '@/components/document-workspace-context';
import { cn } from '@/lib/utils';

import type { SaveStatusSnapshot } from './use-autosave';

export type SaveStatusProps = {
  status: SaveStatusSnapshot;
  className?: string;
};

function formatRelative(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 10_000) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

export function SaveStatus({ status, className }: SaveStatusProps) {
  const { diskAbsolutePath, isDirty } = useDocumentWorkspace();
  const { state, tick } = status;
  void tick;

  const hasDisk = Boolean(diskAbsolutePath);

  let label: string;
  let icon: React.ReactNode;
  let tone: 'muted' | 'success' | 'warning' | 'destructive' | 'pending';

  if (state.kind === 'saving') {
    label = 'Saving…';
    icon = <Loader2 className="size-3.5 animate-spin" aria-hidden />;
    tone = 'pending';
  } else if (state.kind === 'error') {
    label = 'Save failed';
    icon = <AlertTriangle className="size-3.5" aria-hidden />;
    tone = 'destructive';
  } else if (!hasDisk) {
    label = isDirty ? 'Unsaved draft' : 'Not saved to disk';
    icon = <CloudOff className="size-3.5" aria-hidden />;
    tone = isDirty ? 'warning' : 'muted';
  } else if (state.kind === 'saved') {
    label = `Saved ${formatRelative(state.at)}`;
    icon = <Check className="size-3.5" aria-hidden />;
    tone = 'success';
  } else if (isDirty || state.kind === 'dirty') {
    label = 'Unsaved changes';
    icon = <CircleDashed className="size-3.5" aria-hidden />;
    tone = 'warning';
  } else {
    label = 'Saved';
    icon = <Check className="size-3.5" aria-hidden />;
    tone = 'success';
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors',
        tone === 'muted' && 'border-border/60 bg-transparent text-muted-foreground',
        tone === 'pending' &&
          'border-border/60 bg-muted/40 text-muted-foreground',
        tone === 'success' &&
          'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        tone === 'warning' &&
          'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
        tone === 'destructive' &&
          'border-destructive/40 bg-destructive/10 text-destructive',
        className,
      )}
      role="status"
      aria-live="polite"
      title={state.kind === 'error' ? state.message : label}
    >
      <span className="grid size-4 place-items-center">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
