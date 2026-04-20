import { Spinner } from '@/components/ui/spinner';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';

type SetDocumentHtmlPart = Extract<
  DocumentChatUIMessage['parts'][number],
  { type: 'tool-setDocumentHtml' }
>;

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

/**
 * Pull the final HTML output from a completed `tool-setDocumentHtml` part.
 * Returns null while the tool is still streaming or produced no HTML.
 */
export function getSetDocumentOutput(
  part: DocumentChatUIMessage['parts'][number],
): { html?: string } | null {
  if (part.type !== 'tool-setDocumentHtml') return null;
  if (part.state !== 'output-available') return null;
  const out = part.output;
  if (!isObject(out) || !('html' in out)) return null;
  const html = out.html;
  return typeof html === 'string' ? { html } : null;
}

export function ToolSetDocumentHtmlPart({ part }: { part: SetDocumentHtmlPart }) {
  if (part.state === 'output-available') {
    return (
      <p className="text-xs italic opacity-80">
        Applied update to the document.
      </p>
    );
  }
  return (
    <p className="flex flex-row items-center gap-2 text-xs opacity-70">
      <span>Preparing document edit…</span>
      <Spinner className="shrink-0" />
    </p>
  );
}
