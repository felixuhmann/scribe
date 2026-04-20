import {
  FileTextIcon,
  ListChecksIcon,
  PencilRulerIcon,
  SparklesIcon,
  TypeIcon,
  WandSparklesIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { ChatMode } from './use-document-chat-session';

type Suggestion = {
  label: string;
  prompt: string;
  icon: LucideIcon;
};

const EDIT_SUGGESTIONS: Suggestion[] = [
  { label: 'Tighten this paragraph', prompt: 'Tighten this paragraph without losing nuance.', icon: PencilRulerIcon },
  { label: 'Make it more formal', prompt: 'Rewrite the document in a more formal, professional tone.', icon: TypeIcon },
  { label: 'Extract key points', prompt: 'Extract the key points from this document as a short bullet list at the top.', icon: ListChecksIcon },
  { label: 'Proofread', prompt: 'Proofread the document and fix any grammar or clarity issues in place.', icon: WandSparklesIcon },
];

const PLAN_SUGGESTIONS: Suggestion[] = [
  { label: 'Outline a launch post', prompt: 'Help me outline a launch post for a new product.', icon: FileTextIcon },
  { label: 'Draft a PRD', prompt: 'Draft a PRD based on the context in this document.', icon: ListChecksIcon },
  { label: 'Write a follow-up email', prompt: 'Write a follow-up email using the notes in this document.', icon: SparklesIcon },
  { label: 'Turn notes into sections', prompt: 'Restructure my raw notes into clear sections with headings.', icon: PencilRulerIcon },
];

export function SuggestionChips({
  mode,
  disabled,
  onPick,
}: {
  mode: ChatMode;
  disabled?: boolean;
  onPick: (prompt: string) => void;
}) {
  const items = mode === 'plan' ? PLAN_SUGGESTIONS : EDIT_SUGGESTIONS;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => {
        const Icon = s.icon;
        return (
          <Button
            key={s.label}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-full px-2.5 text-xs font-normal"
            disabled={disabled}
            onClick={() => onPick(s.prompt)}
          >
            <Icon data-icon="inline-start" aria-hidden />
            {s.label}
          </Button>
        );
      })}
    </div>
  );
}
