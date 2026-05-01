import type { ModelMessage } from 'ai';

import type { DocumentBuffer } from '../../../lib/agents/document-buffer';
import type {
  DocumentChatPhase,
  DocumentChatMode,
  PlanForceMode,
} from '../../../lib/agents/document-chat-agent';

/**
 * Console logging for document-chat agent runs. Off by default in packaged
 * builds; enable explicitly with `SCRIBE_DOC_CHAT_DEBUG=1` (or the alias
 * `DEBUG_DOC_CHAT`). Runs in the Electron main process — output goes to the
 * terminal you launched the app from (`npm start`).
 */
export function isDebugEnabled(): boolean {
  const flag =
    process.env.SCRIBE_DOC_CHAT_DEBUG ??
    process.env.DEBUG_DOC_CHAT ??
    /** Default ON in development so the user can see what the agent does without env juggling. */
    (process.env.NODE_ENV !== 'production' ? '1' : '0');
  return flag !== '0' && flag !== 'false';
}

const MAX_LINE = 500;
const MAX_OBJECT = 1200;

function truncate(value: string, max = MAX_LINE): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}… [+${value.length - max} chars]`;
}

function jsonPreview(value: unknown, max = MAX_OBJECT): string {
  let out: string;
  try {
    out = JSON.stringify(value, null, 2);
  } catch {
    out = String(value);
  }
  return truncate(out, max);
}

function header(requestId: string, label: string): string {
  return `[doc-chat:${requestId.slice(0, 8)}] ${label}`;
}

export type RunStartContext = {
  requestId: string;
  modelId: string;
  mode: DocumentChatMode;
  phase: DocumentChatPhase;
  planForceMode: PlanForceMode;
  planDepthMode: 'fixed' | 'auto';
  planRefinementRounds: number;
  planAnswerCount: number;
  planFeedbackCount: number;
  planCurrentVersion: number;
  documentChangeSummary?: string;
  modelMessages: ModelMessage[];
  buffer: DocumentBuffer;
};

export function logRunStart(ctx: RunStartContext): void {
  if (!isDebugEnabled()) return;
  const stats = ctx.buffer.getStats();
  const lastUser = ctx.modelMessages.filter((m) => m.role === 'user').slice(-1)[0];
  const lastUserPreview = lastUser ? truncate(stringifyContent(lastUser.content), 800) : '(none)';

  console.log(
    [
      '',
      '─'.repeat(72),
      header(ctx.requestId, 'RUN START'),
      `  model         : ${ctx.modelId}`,
      `  mode / phase  : ${ctx.mode} / ${ctx.phase}`,
      `  forceTool     : ${ctx.planForceMode}`,
      `  planDepth     : ${ctx.planDepthMode} (rounds=${ctx.planRefinementRounds}, answers=${ctx.planAnswerCount}, feedback=${ctx.planFeedbackCount}, currentVersion=${ctx.planCurrentVersion})`,
      `  doc           : ${stats.lineCount} lines, ${stats.wordCount} words, ${stats.charCount} chars`,
      `  outline       : ${stats.outline.length === 0 ? '(none)' : ''}`,
      ...stats.outline
        .slice(0, 12)
        .map((h) => `                  ${'  '.repeat(h.level - 1)}- L${h.startLine}-${h.endLine}: ${h.text}`),
      stats.outline.length > 12 ? `                  + ${stats.outline.length - 12} more headings` : '',
      `  history       : ${ctx.modelMessages.length} model messages`,
      `  last user msg :`,
      indent(lastUserPreview, 4),
      ctx.documentChangeSummary
        ? `  doc diff      :\n${indent(truncate(ctx.documentChangeSummary, 800), 4)}`
        : '  doc diff      : (none — initial snapshot)',
      '─'.repeat(72),
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

export type StepLogContext = {
  requestId: string;
  stepNumber: number;
  text?: string;
  reasoningText?: string;
  toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>;
  toolResults: Array<{ toolCallId: string; toolName: string; output: unknown }>;
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
};

export function logStep(ctx: StepLogContext): void {
  if (!isDebugEnabled()) return;
  const lines: string[] = [];
  lines.push(header(ctx.requestId, `STEP ${ctx.stepNumber}`));

  if (ctx.reasoningText && ctx.reasoningText.trim().length > 0) {
    lines.push('  reasoning:');
    lines.push(indent(truncate(ctx.reasoningText, 800), 4));
  }

  if (ctx.text && ctx.text.trim().length > 0) {
    lines.push('  text:');
    lines.push(indent(truncate(ctx.text, 800), 4));
  }

  if (ctx.toolCalls.length > 0) {
    /** Pair each call with its result by toolCallId so we read them together. */
    const resultByCallId = new Map<string, unknown>();
    for (const r of ctx.toolResults) {
      resultByCallId.set(r.toolCallId, r.output);
    }
    for (const call of ctx.toolCalls) {
      lines.push(`  tool · ${call.toolName} (id=${call.toolCallId.slice(0, 8)}):`);
      lines.push(indent(`input  : ${jsonPreview(call.input)}`, 4));
      const out = resultByCallId.get(call.toolCallId);
      if (out !== undefined) {
        lines.push(indent(`output : ${jsonPreview(out)}`, 4));
      } else {
        lines.push(indent('output : (still pending)', 4));
      }
    }
  }

  if (ctx.finishReason) {
    const usage = ctx.usage
      ? ` · tokens in/out/total = ${ctx.usage.inputTokens ?? '?'}/${ctx.usage.outputTokens ?? '?'}/${ctx.usage.totalTokens ?? '?'}`
      : '';
    lines.push(`  finish        : ${ctx.finishReason}${usage}`);
  }

  console.log(lines.join('\n'));
}

export type RunEndContext = {
  requestId: string;
  buffer: DocumentBuffer;
  staleSnapshot: boolean;
  applied: boolean;
  errored?: string;
};

export function logRunEnd(ctx: RunEndContext): void {
  if (!isDebugEnabled()) return;
  const stats = ctx.buffer.getStats();
  const editLog = ctx.buffer.getEditLog();
  const lines: string[] = [];
  lines.push(header(ctx.requestId, ctx.errored ? 'RUN ERROR' : 'RUN END'));
  if (ctx.errored) lines.push(`  error         : ${ctx.errored}`);
  lines.push(`  applied       : ${ctx.applied}`);
  lines.push(`  staleSnapshot : ${ctx.staleSnapshot}`);
  lines.push(`  final doc     : ${stats.lineCount} lines, ${stats.wordCount} words, ${stats.charCount} chars`);
  lines.push(`  edits applied : ${editLog.length}`);
  for (const e of editLog.slice(0, 12)) {
    lines.push(`    - [${e.kind}] L${e.startLine}-${e.endLine}: ${e.summary}`);
  }
  if (editLog.length > 12) {
    lines.push(`    + ${editLog.length - 12} more edits`);
  }
  lines.push('─'.repeat(72));
  console.log(lines.join('\n'));
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((l) => `${pad}${l}`)
    .join('\n');
}

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return JSON.stringify(part);
      })
      .join('\n');
  }
  return JSON.stringify(content);
}
