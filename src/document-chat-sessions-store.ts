import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { DocumentChatBundle, StoredChatSession } from './scribe-ipc-types';

const FILE_NAME = 'scribe-document-chats.json';

function storePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
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
  try {
    const raw = await fs.readFile(storePath(), 'utf8');
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
    return { version: 1, documents: {} };
  }
}

export async function getDocumentChatBundle(documentKey: string): Promise<DocumentChatBundle> {
  const key = documentKey.trim() || 'scratch';
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
}

export async function saveDocumentChatBundle(documentKey: string, bundle: DocumentChatBundle): Promise<void> {
  const key = documentKey.trim() || 'scratch';
  const normalized = normalizeBundle(bundle);
  const file = await readFile();
  file.documents[key] = normalized;
  await writeFile(file);
}

async function writeFile(data: DocumentChatStoreFile): Promise<void> {
  const dir = path.dirname(storePath());
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(storePath(), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
