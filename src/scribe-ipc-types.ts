export type ScribeAutocompleteResult =
  | { ok: true; text: string }
  | { ok: false; error: string }
  | { ok: false; cancelled: true };
