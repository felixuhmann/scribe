import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useState } from 'react';

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

export function LinkDialog({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (open) {
      const href = editor.getAttributes('link').href as string | undefined;
      setUrl(href ?? '');
    }
  }, [open, editor]);

  const apply = useCallback(() => {
    const trimmed = url.trim();
    if (trimmed === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      const chain = editor.chain().focus();
      const sel = editor.state.selection;
      if (sel.empty) {
        chain.insertContent(`<a href="${trimmed}">${trimmed}</a> `).run();
      } else {
        chain.extendMarkRange('link').setLink({ href: trimmed }).run();
      }
    }
    onOpenChange(false);
  }, [editor, onOpenChange, url]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Link</DialogTitle>
          <DialogDescription>Enter a URL. Leave blank to remove the link.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="scribe-link-url">Address</Label>
          <Input
            id="scribe-link-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                apply();
              }
            }}
          />
        </div>
        <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={apply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
