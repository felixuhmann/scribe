import { useMemo } from 'react';
import DOMPurify from 'dompurify';

import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';
import { markdownToEditorHtml } from '@/lib/markdown/markdown-io';

/** Rich text from the model; user bubbles stay plain text for safety. */
const assistantMessageHtmlClassName =
  'break-words text-sm [&_a]:text-primary [&_a]:underline [&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:text-xs [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_li>p]:my-0 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_strong]:font-semibold [&_em]:italic [&_hr]:my-3 [&_hr]:border-border [&_blockquote]:border-muted-foreground/50 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic [&_table]:my-2 [&_table]:w-full [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1';

/**
 * Parse markdown from the LLM into HTML. `marked` tolerates partial documents
 * mid-stream (e.g. an unclosed `**`), so we can safely re-render on every token.
 */
function renderMarkdown(src: string): string {
  try {
    return markdownToEditorHtml(src);
  } catch {
    // Defensive: never throw from a render path. Fall back to the raw text so
    // the user still sees something if marked rejects a malformed fragment.
    return src;
  }
}

export function ChatTextPart({
  text,
  role,
}: {
  text: string;
  role: DocumentChatUIMessage['role'];
}) {
  const html = useMemo(() => {
    if (role === 'user') return '';
    const rendered = renderMarkdown(text);
    return DOMPurify.sanitize(rendered, { USE_PROFILES: { html: true } });
  }, [text, role]);

  if (role === 'user') {
    return <p className="break-words whitespace-pre-wrap">{text}</p>;
  }
  return (
    <div
      className={assistantMessageHtmlClassName}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
