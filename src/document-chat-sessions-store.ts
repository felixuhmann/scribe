import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  DocumentChatBundle,
  DocumentChatSessionMergePatch,
  StoredChatSession,
} from './scribe-ipc-types';

const FILE_NAME = 'scribe-document-chats.json';

function storePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

/** Serialize all JSON store reads/writes so concurrent IPC cannot drop updates. */
let storeChain: Promise<unknown> = Promise.resolve();

function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = storeChain.then(() => fn());
  storeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function defaultSession(): StoredChatSession {
  const id = randomUUID();
  const now = Date.now();
  return {
    id,
    title: 'New chat',
    messages: [],
    updatedAt: now,
  };
}

function normalizeBundle(raw: unknown): DocumentChatBundle {
  if (!raw || typeof raw !== 'object') {
    const s = defaultSession();
    return { activeSessionId: s.id, sessions: [s] };
  }
  const o = raw as Record<string, unknown>;
  const sessionsIn = o.sessions;
  if (!Array.isArray(sessionsIn) || sessionsIn.length === 0) {
    const s = defaultSession();
    return { activeSessionId: s.id, sessions: [s] };
  }
  const sessions: StoredChatSession[] = sessionsIn.map((row, i) => {
    if (!row || typeof row !== 'object') return defaultSession();
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' && r.id.trim() !== '' ? r.id : randomUUID();
    const title =
      typeof r.title === 'string' && r.title.trim() !== '' ? r.title.trim() : 'New chat';
    const messages = Array.isArray(r.messages) ? r.messages : [];
    const updatedAt = typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : Date.now() - i;
    const lastAgentDocumentHtml =
      typeof r.lastAgentDocumentHtml === 'string' ? r.lastAgentDocumentHtml : undefined;
    const archived = r.archived === true;
    return {
      id,
      title,
      messages,
      updatedAt,
      ...(archived ? { archived: true } : {}),
      ...(lastAgentDocumentHtml !== undefined ? { lastAgentDocumentHtml } : {}),
    };
  });
  let activeSessionId =
    typeof o.activeSessionId === 'string' && o.activeSessionId.trim() !== ''
      ? o.activeSessionId
      : sessions[0].id;
  if (!sessions.some((s) => s.id === activeSessionId)) {
    activeSessionId = sessions[0].id;
  }
  return { activeSessionId, sessions };
}

type DocumentChatStoreFile = {
  version: 1;
  documents: Record<string, DocumentChatBundle>;
};

async function readFile(): Promise<DocumentChatStoreFile> {
  let raw: string;
  try {
    raw = await fs.readFile(storePath(), 'utf8');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return { version: 1, documents: {} };
    }
    throw e;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { version: 1, documents: {} };
    }
    const p = parsed as Record<string, unknown>;
    if (p.version !== 1 || typeof p.documents !== 'object' || p.documents === null) {
      return { version: 1, documents: {} };
    }
    return { version: 1, documents: p.documents as Record<string, DocumentChatBundle> };
  } catch {
    try {
      const corruptPath = `${storePath()}.corrupt.${Date.now()}.json`;
      await fs.rename(storePath(), corruptPath);
    } catch {
      /* ignore backup failure */
    }
    return { version: 1, documents: {} };
  }
}

function applySessionPatch(s: StoredChatSession, patch: DocumentChatSessionMergePatch): StoredChatSession {
  const next: StoredChatSession = { ...s };
  if (patch.messages !== undefined) next.messages = patch.messages;
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.updatedAt !== undefined) next.updatedAt = patch.updatedAt;
  if (patch.lastAgentDocumentHtml !== undefined) {
    next.lastAgentDocumentHtml = patch.lastAgentDocumentHtml;
  }
  return next;
}

export async function getDocumentChatBundle(documentKey: string): Promise<DocumentChatBundle> {
  return withStoreLock(async () => {
    const key = documentKey.trim() || 'idle';
    const file = await readFile();
    const existing = file.documents[key];
    if (!existing) {
      const s = defaultSession();
      const bundle: DocumentChatBundle = { activeSessionId: s.id, sessions: [s] };
      file.documents[key] = bundle;
      await writeFile(file);
      return bundle;
    }
    return normalizeBundle(existing);
  });
}

export async function saveDocumentChatBundle(documentKey: string, bundle: DocumentChatBundle): Promise<void> {
  return withStoreLock(async () => {
    const key = documentKey.trim() || 'idle';
    const normalized = normalizeBundle(bundle);
    const file = await readFile();
    file.documents[key] = normalized;
    await writeFile(file);
  });
}

export async function mergeDocumentChatSession(
  documentKey: string,
  sessionId: string,
  patch: DocumentChatSessionMergePatch,
): Promise<void> {
  return withStoreLock(async () => {
    const key = documentKey.trim() || 'idle';
    const file = await readFile();
    const rawBundle = file.documents[key];
    let norm: DocumentChatBundle;

    if (!rawBundle) {
      const now = Date.now();
      const messages = patch.messages !== undefined ? patch.messages : [];
      const title = patch.title?.trim() ? patch.title.trim() : 'New chat';
      const updatedAt = patch.updatedAt ?? now;
      const session: StoredChatSession = {
        id: sessionId,
        title,
        messages,
        updatedAt,
        ...(patch.lastAgentDocumentHtml !== undefined
          ? { lastAgentDocumentHtml: patch.lastAgentDocumentHtml }
          : {}),
      };
      norm = { activeSessionId: sessionId, sessions: [session] };
    } else {
      norm = normalizeBundle(rawBundle);
      const idx = norm.sessions.findIndex((s) => s.id === sessionId);
      if (idx === -1) {
        const now = Date.now();
        const session: StoredChatSession = {
          id: sessionId,
          title: patch.title?.trim() ? patch.title.trim() : 'New chat',
          messages: patch.messages !== undefined ? patch.messages : [],
          updatedAt: patch.updatedAt ?? now,
          ...(patch.lastAgentDocumentHtml !== undefined
            ? { lastAgentDocumentHtml: patch.lastAgentDocumentHtml }
            : {}),
        };
        norm = { ...norm, sessions: [...norm.sessions, session] };
      } else {
        const sessions = norm.sessions.map((s) =>
          s.id === sessionId ? applySessionPatch(s, patch) : s,
        );
        norm = { ...norm, sessions };
      }
    }

    file.documents[key] = norm;
    await writeFile(file);
  });
}

async function writeFile(data: DocumentChatStoreFile): Promise<void> {
  const p = storePath();
  const dir = path.dirname(p);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(p, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
