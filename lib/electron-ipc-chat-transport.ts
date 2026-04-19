import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';

export type ElectronIpcChatTransportOptions = {
  /** Latest editor HTML passed to the agent each request */
  getDocumentHtml: () => string;
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
        const teardown = api({
          messages,
          documentHtml: this.opts.getDocumentHtml(),
          onChunk: (chunk) => {
            controller.enqueue(chunk as UIMessageChunk);
          },
          onFinished: (err) => {
            if (finished) return;
            finished = true;
            if (err) controller.error(err);
            else controller.close();
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
