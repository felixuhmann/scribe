import type { Editor } from '@tiptap/core';
import { ImageIcon, Link2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const LARGE_IMAGE_WARN_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

type Mode = 'upload' | 'url';

export type InsertImageDialogProps = {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function InsertImageDialog({ editor, open, onOpenChange }: InsertImageDialogProps) {
  const [mode, setMode] = useState<Mode>('upload');
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ name: string; size: number; previewUrl: string } | null>(
    null,
  );
  const [pickedDataUrl, setPickedDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setMode('upload');
    setUrl('');
    setAlt('');
    setError(null);
    setPicked(null);
    setPickedDataUrl(null);
    setPending(false);
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  // Object URLs created by the file picker need to be revoked or they leak — most images get
  // dropped seconds later when the dialog closes, but a long-lived workspace would accrete them.
  useEffect(() => {
    return () => {
      if (picked?.previewUrl) URL.revokeObjectURL(picked.previewUrl);
    };
  }, [picked?.previewUrl]);

  const onFileChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);

    if (!file.type.startsWith('image/')) {
      setError(`“${file.name}” is not an image (${file.type || 'unknown type'}).`);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(
        `Image is ${formatBytes(file.size)}; maximum embedded size is ${formatBytes(MAX_IMAGE_BYTES)}.`,
      );
      return;
    }

    setPending(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const previewUrl = URL.createObjectURL(file);
      setPicked({ name: file.name, size: file.size, previewUrl });
      setPickedDataUrl(dataUrl);
      if (!alt) setAlt(stripExtension(file.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const insertEmbedded = useCallback(() => {
    if (!pickedDataUrl) return;
    if (
      picked &&
      picked.size > LARGE_IMAGE_WARN_BYTES &&
      !window.confirm(
        `This image is ${formatBytes(picked.size)}. Embedding it will significantly increase the document size. Continue?`,
      )
    ) {
      return;
    }
    editor
      .chain()
      .focus()
      .setImage({ src: pickedDataUrl, alt: alt.trim() || undefined })
      .run();
    onOpenChange(false);
  }, [editor, alt, pickedDataUrl, picked, onOpenChange]);

  const insertUrl = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Enter an image URL.');
      return;
    }
    editor
      .chain()
      .focus()
      .setImage({ src: trimmed, alt: alt.trim() || undefined })
      .run();
    onOpenChange(false);
  }, [editor, url, alt, onOpenChange]);

  const onSubmit = () => {
    if (mode === 'upload') insertEmbedded();
    else insertUrl();
  };

  const canSubmit = mode === 'upload' ? Boolean(pickedDataUrl) : url.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Insert image</DialogTitle>
          <DialogDescription>
            Embed an image directly in the document, or link to one by URL.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="w-full">
            <TabsTrigger value="upload" className="flex-1">
              <Upload data-icon="inline-start" />
              From file
            </TabsTrigger>
            <TabsTrigger value="url" className="flex-1">
              <Link2 data-icon="inline-start" />
              From URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-3 flex flex-col gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => void onFileChosen(e)}
            />

            {picked ? (
              <div className="flex flex-col gap-2">
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-md border border-border bg-card/40 p-2',
                  )}
                >
                  <img
                    src={picked.previewUrl}
                    alt=""
                    className="size-14 shrink-0 rounded object-cover"
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium" title={picked.name}>
                      {picked.name}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatBytes(picked.size)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change
                  </Button>
                </div>
                {picked.size > LARGE_IMAGE_WARN_BYTES ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    This image is large; embedding will noticeably grow the document.
                  </p>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={pending}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 p-8 text-center transition-colors',
                  'hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  pending && 'opacity-60',
                )}
              >
                <span className="border-border bg-background/40 text-muted-foreground inline-flex size-10 items-center justify-center rounded-md border">
                  <ImageIcon className="size-5" />
                </span>
                <span className="text-sm font-medium">
                  {pending ? 'Reading image…' : 'Choose an image'}
                </span>
                <span className="text-muted-foreground text-xs">
                  PNG, JPEG, GIF, WebP, SVG — up to {formatBytes(MAX_IMAGE_BYTES)}
                </span>
              </button>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scribe-image-alt-upload" className="text-xs">
                Description (alt text)
              </Label>
              <Input
                id="scribe-image-alt-upload"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="What does this image show?"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSubmit) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="url" className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scribe-image-url" className="text-xs">
                Image URL
              </Label>
              <Input
                id="scribe-image-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/photo.png"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSubmit) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
              />
              <p className="text-muted-foreground text-xs">
                The image stays at this URL — it isn't embedded in the document.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scribe-image-alt-url" className="text-xs">
                Description (alt text)
              </Label>
              <Input
                id="scribe-image-alt-url"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="What does this image show?"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSubmit) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
              />
            </div>
          </TabsContent>
        </Tabs>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={!canSubmit || pending}>
            Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Expected a data URL string'));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stripExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}
