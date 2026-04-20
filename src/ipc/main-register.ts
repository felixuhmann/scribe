import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron';

import type { EventChannel, InvokeChannel, SendChannel } from './channels';

/** Register an `ipcMain.handle` against a typed invoke channel. */
export function registerInvoke<Req, Res>(
  channel: InvokeChannel<Req, Res>,
  handler: (req: Req, event: IpcMainInvokeEvent) => Promise<Res> | Res,
): void {
  ipcMain.handle(channel.name, (event, req) => handler(req as Req, event));
}

/** Register an `ipcMain.on` listener against a typed send channel. */
export function registerOn<Payload>(
  channel: SendChannel<Payload>,
  handler: (payload: Payload, event: IpcMainEvent) => void,
): void {
  ipcMain.on(channel.name, (event, payload) => handler(payload as Payload, event));
}

/** Push an event to a renderer over a typed event channel. */
export function sendEvent<Payload>(
  webContents: WebContents,
  channel: EventChannel<Payload>,
  payload: Payload,
): void {
  webContents.send(channel.name, payload);
}
