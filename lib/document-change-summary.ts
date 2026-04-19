import { createTwoFilesPatch } from 'diff';

const MAX_PATCH_CHARS = 14_000;

/**
 * Unified diff between two HTML snapshots for the model (truncated if huge).
 */
export function buildDocumentChangeSummary(before: string, after: string): string {
  if (before === after) return '';
  const patch = createTwoFilesPatch('previous snapshot', 'current editor', before, after, '', '', {
    context: 2,
  });
  if (patch.length <= MAX_PATCH_CHARS) return patch;
  return `${patch.slice(0, MAX_PATCH_CHARS)}\n\n… (patch truncated; CURRENT_DOCUMENT_HTML is complete and authoritative)`;
}
