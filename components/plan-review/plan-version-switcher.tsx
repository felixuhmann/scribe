import { GitCompareArrowsIcon } from 'lucide-react';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

type PlanVersionSwitcherProps = {
  totalVersions: number;
  currentVersion: number;
  onChange: (version: number) => void;
  diffEnabled: boolean;
  onToggleDiff: (next: boolean) => void;
};

/**
 * Compact `v1 / v2 / v3` segmented control. Highlights the latest version with
 * a small dot. Diff toggle controls whether the content area colors blocks by
 * "added/edited" relative to the previous version.
 */
export function PlanVersionSwitcher({
  totalVersions,
  currentVersion,
  onChange,
  diffEnabled,
  onToggleDiff,
}: PlanVersionSwitcherProps) {
  const items = Array.from({ length: totalVersions }).map((_, i) => i + 1);
  return (
    <div className="flex items-center gap-2">
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        spacing={1}
        value={String(currentVersion)}
        onValueChange={(v) => {
          if (!v) return;
          const n = Number.parseInt(v, 10);
          if (Number.isFinite(n)) onChange(n);
        }}
        aria-label="Plan version"
      >
        {items.map((n) => (
          <ToggleGroupItem
            key={n}
            value={String(n)}
            className="relative h-7 rounded-md px-2.5 text-xs"
          >
            v{n}
            {n === totalVersions ? (
              <span
                aria-hidden
                className="bg-primary absolute -right-0.5 -top-0.5 size-1.5 rounded-full"
              />
            ) : null}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <button
        type="button"
        onClick={() => onToggleDiff(!diffEnabled)}
        disabled={currentVersion <= 1}
        className={cn(
          'border-border text-muted-foreground hover:text-foreground inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors disabled:opacity-50',
          diffEnabled && 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300',
        )}
        title={
          currentVersion <= 1
            ? 'Diff is available from v2 onward'
            : diffEnabled
              ? `Hide diff vs v${currentVersion - 1}`
              : `Show diff vs v${currentVersion - 1}`
        }
      >
        <GitCompareArrowsIcon aria-hidden className="size-3" />
        {currentVersion <= 1 ? 'Diff' : `Diff vs v${currentVersion - 1}`}
      </button>
    </div>
  );
}
