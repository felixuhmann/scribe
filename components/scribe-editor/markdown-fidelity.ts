/**
 * Detects editor features in HTML that typical Markdown export cannot represent faithfully.
 * Used before saving or exporting to Markdown.
 */
export function getMarkdownFidelityWarnings(html: string): string[] {
  if (typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const warnings: string[] = [];

  if (doc.querySelector('u')) {
    warnings.push('Underline');
  }
  if (doc.querySelector('sub')) {
    warnings.push('Subscript');
  }
  if (doc.querySelector('sup')) {
    warnings.push('Superscript');
  }

  doc.querySelectorAll('[style]').forEach((el) => {
    const st = el.getAttribute('style') ?? '';
    const m = /text-align:\s*([^;]+)/i.exec(st);
    if (!m) return;
    const v = m[1].trim().toLowerCase();
    if (v !== 'left' && v !== 'start' && v !== '') {
      if (!warnings.includes('Text alignment')) {
        warnings.push('Text alignment');
      }
    }
  });

  return warnings;
}

export function formatMarkdownFidelityPrompt(warnings: string[]): string {
  const list = warnings.join(', ');
  return `This document uses formatting that Markdown does not represent well (${list}). Some of it may be lost or simplified when you save. Continue?`;
}
