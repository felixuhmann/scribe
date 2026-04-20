import DOMPurify from 'dompurify';

import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';

/** Rich text from the model; user bubbles stay plain text for safety. */
const assistantMessageHtmlClassName =
  'break-words text-sm [&_a]:text-primary [&_a]:underline [&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:text-xs [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_blockquote]:border-muted-foreground/50 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic';

export function ChatTextPart({
  text,
  role,
}: {
  text: string;
  role: DocumentChatUIMessage['role'];
}) {
  if (role === 'user') {
    return <p className="break-words whitespace-pre-wrap">{text}</p>;
  }
  const safe = DOMPurify.sanitize(text, { USE_PROFILES: { html: true } });
  return (
    <div
      className={assistantMessageHtmlClassName}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
