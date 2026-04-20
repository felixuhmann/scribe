import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';

export type ElectronIpcChatTransportOptions = {
  /** Full HTML plus optional diff vs last completed turn for this session */
  getDocumentContext: () => { html: string; documentChangeSummary?: string };
  /** After the stream finishes (success or failure). Used to persist “last seen” snapshots. */
  onStreamComplete?: (info: { error?: Error }) => void;
  /** Controls whether the main-process agent can ask clarification questions (plan) or only edit (edit). */
  getChatMode?: () => 'edit' | 'plan';
  /** Plan mode: number of clarification Q&A rounds (1–8). Used when depth is fixed. */
  getPlanRefinementRounds?: () => number;
  /** Plan mode: `auto` lets the model choose when to clarify vs write; `fixed` uses a round count. */
  getPlanDepthMode?: () => 'fixed' | 'auto';
};

/**
 * Bridges useChat to the main-process AI SDK agent via preload IPC streaming.
 */
export class ElectronIpcChatTransport<UI_MESSAGE extends UIMessage>
  implements ChatTransport<UI_MESSAGE>
{
  constructor(private readonly opts: ElectronIpcChatTransportOptions) {}

  async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<UI_MESSAGE>['sendMessages']>[0]): Promise<
    ReadableStream<UIMessageChunk>
  > {
    const api = window.scribe?.documentChatStream;
    if (!api) {
      throw new Error('Document chat is unavailable (preload bridge missing).');
    }

    return new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        let finished = false;
        const ctx = this.opts.getDocumentContext();
        const teardown = api({
          messages,
          documentHtml: ctx.html,
          documentChangeSummary: ctx.documentChangeSummary,
          chatMode: this.opts.getChatMode?.(),
          planRefinementRounds: this.opts.getPlanRefinementRounds?.(),
          planDepthMode: this.opts.getPlanDepthMode?.(),
          onChunk: (chunk) => {
            controller.enqueue(chunk as UIMessageChunk);
          },
          onFinished: (err) => {
            if (finished) return;
            finished = true;
            if (err) controller.error(err);
            else controller.close();
            this.opts.onStreamComplete?.({ error: err });
          },
        });

        abortSignal?.addEventListener(
          'abort',
          () => {
            teardown();
          },
          { once: true },
        );
      },
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
