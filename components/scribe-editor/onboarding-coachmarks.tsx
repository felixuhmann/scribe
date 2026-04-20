import { Command, Keyboard, Sparkles, Type } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'scribe.onboarding.seen';

type CoachStep = {
  icon: React.ReactNode;
  title: string;
  body: string;
  shortcut?: string[];
};

export type OnboardingCoachmarksProps = {
  mod: string;
};

function readSeen(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function OnboardingCoachmarks({ mod }: OnboardingCoachmarksProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!readSeen()) {
      const t = window.setTimeout(() => setOpen(true), 350);
      return () => window.clearTimeout(t);
    }
  }, []);

  const steps: CoachStep[] = [
    {
      icon: <Type className="size-5" />,
      title: 'A quiet canvas',
      body: 'Scribe melts the chrome away. Just start writing — the formatting tools appear only when you need them.',
    },
    {
      icon: <Sparkles className="size-5" />,
      title: 'Type / for blocks',
      body: 'Press "/" at the start of a line to insert headings, lists, tables, callouts, or code blocks.',
      shortcut: ['/'],
    },
    {
      icon: <Command className="size-5" />,
      title: 'Command palette',
      body: 'Every action lives behind one shortcut. Search for commands, toggle focus mode, switch themes.',
      shortcut: [mod, 'K'],
    },
    {
      icon: <Keyboard className="size-5" />,
      title: 'Shortcuts on demand',
      body: 'Press "?" anywhere to see the full keyboard cheatsheet. You will be fast in no time.',
      shortcut: ['?'],
    },
  ];

  if (!open) return null;

  const current = steps[step];
  const isLast = step === steps.length - 1;

  const dismiss = () => {
    markSeen();
    setOpen(false);
  };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] flex items-end justify-end p-6"
      role="dialog"
      aria-label="Welcome to Scribe"
      aria-live="polite"
    >
      <div
        className={cn(
          'pointer-events-auto flex w-[min(22rem,100vw)] flex-col gap-4 rounded-xl border bg-background/95 p-5 shadow-2xl backdrop-blur-xl',
          'border-border/80 dark:shadow-black/40',
          'animate-in slide-in-from-bottom-4 fade-in-0 duration-300',
        )}
      >
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary inline-flex size-10 shrink-0 items-center justify-center rounded-lg">
            {current.icon}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <h3 className="text-foreground text-sm font-semibold">{current.title}</h3>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{current.body}</p>
            {current.shortcut ? (
              <div className="mt-3 flex items-center gap-1">
                {current.shortcut.map((k, i) => (
                  <kbd
                    key={`${k}-${i}`}
                    className="border-border bg-muted/60 inline-flex min-w-[1.5rem] items-center justify-center rounded border px-1.5 py-0.5 text-[11px] font-semibold"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'size-1.5 rounded-full transition-colors',
                  i === step ? 'bg-primary' : 'bg-muted-foreground/30',
                )}
                aria-hidden
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={dismiss}
            >
              Skip
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => {
                if (isLast) {
                  dismiss();
                } else {
                  setStep((s) => Math.min(s + 1, steps.length - 1));
                }
              }}
            >
              {isLast ? 'Start writing' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
