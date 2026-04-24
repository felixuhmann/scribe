import {
  AlertTriangleIcon,
  FolderOpenIcon,
  FolderSearchIcon,
  MonitorIcon,
  SearchXIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

export function NoFolderOpenedEmpty({ onOpenFolder }: { onOpenFolder?: () => void }) {
  return (
    <Empty className="border-0 px-3 py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderSearchIcon />
        </EmptyMedia>
        <EmptyTitle>No folder opened yet</EmptyTitle>
        <EmptyDescription>
          Open a document from disk to browse the folder it lives in. Use File → Open, or pick a
          folder to browse.
        </EmptyDescription>
      </EmptyHeader>
      {onOpenFolder ? (
        <EmptyContent>
          <Button size="sm" variant="outline" onClick={onOpenFolder} type="button">
            <FolderOpenIcon className="size-4" aria-hidden />
            Open folder…
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

export function DesktopOnlyEmpty() {
  return (
    <Empty className="border-0 px-3 py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MonitorIcon />
        </EmptyMedia>
        <EmptyTitle>File browsing is desktop-only</EmptyTitle>
        <EmptyDescription>
          Open Scribe as a desktop app to browse files from your computer.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function NoSupportedFilesEmpty({
  onNewFile,
  onRefresh,
}: {
  onNewFile: () => void;
  onRefresh: () => void;
}) {
  return (
    <Empty className="border-0 px-3 py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderOpenIcon />
        </EmptyMedia>
        <EmptyTitle>This folder is empty</EmptyTitle>
        <EmptyDescription>
          No supported documents here yet. Scribe reads <code>.md</code>, <code>.markdown</code>,{' '}
          <code>.html</code>, <code>.htm</code>, and <code>.txt</code>. Hidden folders,
          <code> node_modules</code>, and <code>.git</code> are skipped.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex gap-2">
          <Button size="sm" onClick={onNewFile} type="button">
            New file
          </Button>
          <Button size="sm" variant="outline" onClick={onRefresh} type="button">
            Refresh
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}

export function NoSearchResultsEmpty({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <Empty className="border-0 px-3 py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>No matches for “{query}”</EmptyTitle>
        <EmptyDescription>
          Try a different search term, or clear the search to see all files.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" variant="outline" onClick={onClear} type="button">
          Clear search
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function LoadErrorEmpty({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Empty className="border-0 px-3 py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertTriangleIcon className="text-destructive" />
        </EmptyMedia>
        <EmptyTitle>Could not read folder</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" variant="outline" onClick={onRetry} type="button">
          Retry
        </Button>
      </EmptyContent>
    </Empty>
  );
}
