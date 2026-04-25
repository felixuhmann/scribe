import { z } from 'zod';

/**
 * One block of the plan artifact. Block ids are stable across revisions when
 * the model preserves a section: comments anchored to a block_id continue to
 * make sense in v2/v3 even if the surrounding text shifts.
 *
 * `kind: 'doc'` is reserved for whole-plan comments that don't anchor to a
 * specific block; never produced by `writePlan` itself.
 */
export type PlanBlock =
  | { id: string; kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { id: string; kind: 'paragraph'; text: string }
  | { id: string; kind: 'bullet'; text: string }
  | { id: string; kind: 'numbered'; text: string };

export const planBlockSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z
      .string()
      .min(1)
      .max(64)
      .describe(
        'Stable block id. Reuse the incoming id when content is preserved or only lightly edited; mint a new id (e.g. "v2.b7") only for newly added blocks.',
      ),
    kind: z.literal('heading'),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    text: z.string().min(1).max(280),
  }),
  z.object({
    id: z.string().min(1).max(64),
    kind: z.literal('paragraph'),
    text: z.string().min(1).max(2000),
  }),
  z.object({
    id: z.string().min(1).max(64),
    kind: z.literal('bullet'),
    text: z.string().min(1).max(800),
  }),
  z.object({
    id: z.string().min(1).max(64),
    kind: z.literal('numbered'),
    text: z.string().min(1).max(800),
  }),
]);

export const writePlanInputSchema = z.object({
  blocks: z.array(planBlockSchema).min(1).max(60),
  rationale: z
    .string()
    .max(800)
    .optional()
    .describe(
      'One short sentence shown to the user explaining the change vs the previous version (omit on v1).',
    ),
});

export type WritePlanInput = z.infer<typeof writePlanInputSchema>;

export type PlanVersion = {
  versionId: string;
  versionNumber: number;
  createdAt: number;
  blocks: PlanBlock[];
  rationale?: string;
};

export type PlanCommentStatus =
  | { kind: 'open' }
  | { kind: 'addressed'; inVersion: number }
  | { kind: 'dismissed' };

export type PlanComment = {
  commentId: string;
  /** Version this comment was authored against. */
  versionNumber: number;
  /** Block id (or 'doc' for plan-wide comments). */
  blockId: string | 'doc';
  /** Verbatim slice the user highlighted, if any. */
  selectionText?: string;
  body: string;
  status: PlanCommentStatus;
  createdAt: number;
};

export type PlanArtifactStatus = 'drafting' | 'reviewing' | 'accepted' | 'superseded';

export type PlanArtifact = {
  artifactId: string;
  versions: PlanVersion[];
  /** Version the user is currently looking at; defaults to the latest. */
  currentVersion: number;
  comments: PlanComment[];
  status: PlanArtifactStatus;
};

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Compact, sortable id. Not a true ULID — we don't need one — but we keep the
 * timestamp prefix so versions/comments sort naturally.
 */
function shortId(prefix: string): string {
  const t = Date.now().toString(36);
  let r = '';
  for (let i = 0; i < 6; i++) {
    r += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return `${prefix}_${t}${r}`;
}

export function newArtifactId(): string {
  return shortId('pa');
}

export function newVersionId(): string {
  return shortId('pv');
}

export function newCommentId(): string {
  return shortId('pc');
}

/** Synthesize a stable id for a freshly minted block (e.g. when the model fails to provide one). */
export function defaultBlockId(versionNumber: number, index: number): string {
  return `v${versionNumber}.b${index}`;
}

export function emptyPlanArtifact(): PlanArtifact {
  return {
    artifactId: newArtifactId(),
    versions: [],
    currentVersion: 0,
    comments: [],
    status: 'drafting',
  };
}

export function latestPlanVersion(artifact: PlanArtifact | null | undefined): PlanVersion | null {
  if (!artifact || artifact.versions.length === 0) return null;
  return artifact.versions[artifact.versions.length - 1] ?? null;
}

export function getPlanVersion(
  artifact: PlanArtifact | null | undefined,
  versionNumber: number,
): PlanVersion | null {
  if (!artifact) return null;
  return artifact.versions.find((v) => v.versionNumber === versionNumber) ?? null;
}

/** Append a new version (v(N+1)) onto an artifact, preserving prior versions and comments. */
export function appendPlanVersion(
  artifact: PlanArtifact | null,
  blocks: PlanBlock[],
  rationale: string | undefined,
): PlanArtifact {
  const base: PlanArtifact = artifact ?? emptyPlanArtifact();
  const nextNumber = base.versions.length + 1;
  const normalizedBlocks = blocks.map((b, i) => ({
    ...b,
    id: b.id && b.id.length > 0 ? b.id : defaultBlockId(nextNumber, i),
  }));
  const newVersion: PlanVersion = {
    versionId: newVersionId(),
    versionNumber: nextNumber,
    createdAt: Date.now(),
    blocks: normalizedBlocks,
    rationale,
  };
  /**
   * When v(N+1) preserves a block id from v(N) but the text differs, mark
   * comments anchored to that block as "addressed in v(N+1)" — the user may
   * still re-open them, but the rail stops nagging about an old concern.
   */
  const prev = base.versions[base.versions.length - 1];
  const prevById = new Map<string, PlanBlock>();
  for (const b of prev?.blocks ?? []) prevById.set(b.id, b);
  const newById = new Map<string, PlanBlock>();
  for (const b of normalizedBlocks) newById.set(b.id, b);

  const updatedComments: PlanComment[] = base.comments.map((c) => {
    if (c.status.kind !== 'open') return c;
    if (c.blockId === 'doc') return c;
    const before = prevById.get(c.blockId);
    const after = newById.get(c.blockId);
    if (!after) {
      return { ...c, status: { kind: 'addressed', inVersion: nextNumber } };
    }
    if (before && after.text !== before.text) {
      return { ...c, status: { kind: 'addressed', inVersion: nextNumber } };
    }
    return c;
  });

  return {
    ...base,
    versions: [...base.versions, newVersion],
    currentVersion: nextNumber,
    comments: updatedComments,
    status: 'reviewing',
  };
}

/** Ensure all block ids in a plan version are unique (for stable comment anchoring). */
export function dedupeBlockIds(blocks: PlanBlock[], versionNumber: number): PlanBlock[] {
  const seen = new Set<string>();
  return blocks.map((b, i) => {
    if (!b.id || seen.has(b.id)) {
      const fresh = defaultBlockId(versionNumber, i);
      seen.add(fresh);
      return { ...b, id: fresh };
    }
    seen.add(b.id);
    return b;
  });
}

/** Block-level diff between two versions, keyed by id. Used by the version switcher. */
export type PlanBlockDiff = {
  added: Set<string>;
  removed: Set<string>;
  edited: Set<string>;
};

export function diffPlanBlocks(prev: PlanBlock[] | undefined, next: PlanBlock[]): PlanBlockDiff {
  const added = new Set<string>();
  const removed = new Set<string>();
  const edited = new Set<string>();
  const prevById = new Map<string, PlanBlock>();
  for (const b of prev ?? []) prevById.set(b.id, b);
  const nextIds = new Set<string>();
  for (const b of next) {
    nextIds.add(b.id);
    const before = prevById.get(b.id);
    if (!before) {
      added.add(b.id);
      continue;
    }
    if (before.kind !== b.kind || before.text !== b.text) {
      edited.add(b.id);
      continue;
    }
    if (
      before.kind === 'heading' &&
      b.kind === 'heading' &&
      before.level !== b.level
    ) {
      edited.add(b.id);
    }
  }
  for (const b of prev ?? []) {
    if (!nextIds.has(b.id)) removed.add(b.id);
  }
  return { added, removed, edited };
}

/** Plain-text serialization used as model context when handing the plan back for execution. */
export function planVersionToText(version: PlanVersion): string {
  const lines: string[] = [];
  for (const b of version.blocks) {
    if (b.kind === 'heading') {
      lines.push(`${'#'.repeat(b.level)} ${b.text}`);
    } else if (b.kind === 'bullet') {
      lines.push(`- ${b.text}`);
    } else if (b.kind === 'numbered') {
      lines.push(`1. ${b.text}`);
    } else {
      lines.push(b.text);
    }
  }
  return lines.join('\n');
}
