import type { UIMessage, UIMessageChunk } from 'ai';

import type {
  CreateFileInFolderResult,
  CreateFolderInFolderResult,
  DocumentChatBundle,
  DocumentChatSessionMergePatch,
  ExportPdfResult,
  ListExplorerFolderResult,
  OpenDocumentResult,
  RenameFileResult,
  RevealInOSResult,
  SaveHtmlAsResult,
  SaveHtmlToPathResult,
  SaveMarkdownAsResult,
  SaveMarkdownToPathResult,
  ScribeAutocompleteResult,
  ScribeQuickEditResult,
  ScribeSetSettingsInput,
  ScribeSettingsPublic,
  TrashItemResult,
} from '../scribe-ipc-types';
import type { DocumentChatMode, PlanDepthMode } from '../../lib/agents/document-chat-agent';

/**
 * Tagged channel descriptors. Single source of truth for channel name +
 * request/response payload types. Main, preload, and renderer all derive
 * their contracts from this file.
 */
export type InvokeChannel<Req, Res> = {
  readonly kind: 'invoke';
  readonly name: string;
  readonly __req: Req;
  readonly __res: Res;
};

export type SendChannel<Payload> = {
  readonly kind: 'send';
  readonly name: string;
  readonly __payload: Payload;
};

export type EventChannel<Payload> = {
  readonly kind: 'event';
  readonly name: string;
  readonly __payload: Payload;
};

function invoke<Req = void, Res = void>(name: string): InvokeChannel<Req, Res> {
  return { kind: 'invoke', name } as InvokeChannel<Req, Res>;
}
function send<Payload = void>(name: string): SendChannel<Payload> {
  return { kind: 'send', name } as SendChannel<Payload>;
}
function event<Payload = void>(name: string): EventChannel<Payload> {
  return { kind: 'event', name } as EventChannel<Payload>;
}

export type DocumentChatStartPayload = {
  id: string;
  /**
   * AI SDK UI messages carried over the wire. Typed broadly because the
   * transport is generic at the renderer and `validateUIMessages` narrows
   * to `DocumentChatUIMessage` in the main process.
   */
  messages: UIMessage[];
  documentHtml: string;
  documentChangeSummary?: string;
  chatMode?: DocumentChatMode;
  planRefinementRounds?: number;
  planDepthMode?: PlanDepthMode;
};

export type DocumentChatChunkPayload = {
  id: string;
  chunk: UIMessageChunk;
};

export type DocumentChatEndPayload = {
  id: string;
  error?: string;
};

export const channels = {
  getSettings: invoke<void, ScribeSettingsPublic>('scribe:getSettings'),
  setSettings: invoke<ScribeSetSettingsInput, ScribeSettingsPublic>('scribe:setSettings'),

  autocomplete: invoke<{ before: string; after: string }, ScribeAutocompleteResult>(
    'scribe:autocomplete',
  ),
  quickEditSelection: invoke<
    { selectedText: string; instruction: string },
    ScribeQuickEditResult
  >('scribe:quickEditSelection'),

  getDocumentChatBundle: invoke<string, DocumentChatBundle>('scribe:getDocumentChatBundle'),
  saveDocumentChatBundle: invoke<{ documentKey: string; bundle: DocumentChatBundle }, void>(
    'scribe:saveDocumentChatBundle',
  ),
  mergeDocumentChatSession: invoke<
    { documentKey: string; sessionId: string; patch: DocumentChatSessionMergePatch },
    void
  >('scribe:mergeDocumentChatSession'),

  openDocument: invoke<void, OpenDocumentResult>('scribe:openDocument'),
  openDocumentAtPath: invoke<{ path: string }, OpenDocumentResult>('scribe:openDocumentAtPath'),
  listExplorerFolder: invoke<{ rootPath: string }, ListExplorerFolderResult>(
    'scribe:listExplorerFolder',
  ),
  saveHtmlToPath: invoke<{ path: string; htmlBody: string }, SaveHtmlToPathResult>(
    'scribe:saveHtmlToPath',
  ),
  saveHtmlAs: invoke<{ htmlBody: string; defaultPath?: string }, SaveHtmlAsResult>(
    'scribe:saveHtmlAs',
  ),
  saveMarkdownToPath: invoke<{ path: string; markdown: string }, SaveMarkdownToPathResult>(
    'scribe:saveMarkdownToPath',
  ),
  saveMarkdownAs: invoke<{ markdown: string; defaultPath?: string }, SaveMarkdownAsResult>(
    'scribe:saveMarkdownAs',
  ),
  exportPdf: invoke<{ htmlBody: string; defaultPath?: string }, ExportPdfResult>(
    'scribe:exportPdf',
  ),
  renameFile: invoke<{ path: string; newBasename: string }, RenameFileResult>('scribe:renameFile'),

  revealInOS: invoke<{ path: string }, RevealInOSResult>('scribe:revealInOS'),
  createFileInFolder: invoke<{ parentDir: string; name: string }, CreateFileInFolderResult>(
    'scribe:createFileInFolder',
  ),
  createFolderInFolder: invoke<{ parentDir: string; name: string }, CreateFolderInFolderResult>(
    'scribe:createFolderInFolder',
  ),
  trashItem: invoke<{ path: string }, TrashItemResult>('scribe:trashItem'),

  // Explorer watch: send/event pattern (debounced "changed" tick → renderer re-fetches).
  explorerWatchStart: send<{ watchId: string; rootPath: string }>('scribe:explorer:watch:start'),
  explorerWatchStop: send<{ watchId: string }>('scribe:explorer:watch:stop'),
  explorerWatchChanged: event<{ watchId: string }>('scribe:explorer:watch:changed'),

  // Document chat: send/event pattern for streaming.
  documentChatStart: send<DocumentChatStartPayload>('scribe:documentChat:start'),
  documentChatAbort: send<{ id: string }>('scribe:documentChat:abort'),
  documentChatChunk: event<DocumentChatChunkPayload>('scribe:documentChat:chunk'),
  documentChatEnd: event<DocumentChatEndPayload>('scribe:documentChat:end'),
} as const;

export type Channels = typeof channels;
