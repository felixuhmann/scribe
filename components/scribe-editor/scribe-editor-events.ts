/**
 * DOM event names dispatched on `window` to bridge non-React code paths
 * (extensions, slash menu callbacks) into React-owned chrome surfaces.
 *
 * Keep these names unique and prefixed so other apps embedding the editor
 * cannot collide with us.
 */
export const OPEN_INSERT_TABLE_DIALOG_EVENT = 'scribe:open-insert-table-dialog';
export const OPEN_INSERT_IMAGE_DIALOG_EVENT = 'scribe:open-insert-image-dialog';
