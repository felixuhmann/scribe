import {
  ChevronRightIcon,
  FileCode2Icon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { renderWithMatch } from './search-input';

type TreeRowCommon = {
  depth: number;
  selected: boolean;
  active: boolean;
  dirty: boolean;
  onActivePath: boolean;
  query: string;
  renaming: boolean;
  onRenameSubmit: (newName: string) => void;
  onRenameCancel: () => void;
  onClick: () => void;
  onDoubleClick: () => void;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  rowRef?: (el: HTMLDivElement | null) => void;
  ariaSetSize?: number;
  ariaPosInSet?: number;
};

type DirRowProps = TreeRowCommon & {
  kind: 'dir';
  name: string;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
};

type FileRowProps = TreeRowCommon & {
  kind: 'file';
  name: string;
  fileType: 'markdown' | 'html' | 'text';
};

export type TreeRowProps = DirRowProps | FileRowProps;

const INDENT_PX = 10;
const BASE_INSET_PX = 4;

function IndentGuides({ depth, onActivePath }: { depth: number; onActivePath: boolean }) {
  if (depth <= 0) return null;
  const guides: React.ReactNode[] = [];
  for (let i = 0; i < depth; i++) {
    guides.push(
      <span
        key={i}
        aria-hidden
        className={cn(
          'inline-block h-full border-l',
          onActivePath ? 'border-sidebar-border' : 'border-sidebar-border/40',
        )}
        style={{ width: INDENT_PX, marginRight: i === depth - 1 ? 2 : 0 }}
      />,
    );
  }
  return <span className="flex h-full shrink-0">{guides}</span>;
}

function FileKindIcon({ fileType }: { fileType: FileRowProps['fileType'] }) {
  if (fileType === 'markdown') {
    return <FileTextIcon className="size-3.5 shrink-0 opacity-75" aria-hidden />;
  }
  if (fileType === 'html') {
    return <FileCode2Icon className="size-3.5 shrink-0 opacity-75" aria-hidden />;
  }
  return <FileIcon className="size-3.5 shrink-0 opacity-75" aria-hidden />;
}

function RenameInput({
  initialValue,
  onSubmit,
  onCancel,
}: {
  initialValue: string;
  onSubmit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const dot = initialValue.lastIndexOf('.');
    if (dot > 0) {
      input.setSelectionRange(0, dot);
    } else {
      input.select();
    }
  }, [initialValue]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const trimmed = value.trim();
        if (trimmed === '' || trimmed === initialValue) onCancel();
        else onSubmit(trimmed);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const trimmed = value.trim();
          if (trimmed === '' || trimmed === initialValue) onCancel();
          else onSubmit(trimmed);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="min-w-0 flex-1 rounded-[3px] border border-sidebar-ring/70 bg-background px-1 py-[1px] text-[13px] leading-none text-foreground outline-none focus:border-sidebar-ring"
    />
  );
}

export function TreeRow(props: TreeRowProps) {
  const {
    depth,
    selected,
    active,
    dirty,
    onActivePath,
    query,
    renaming,
    onRenameSubmit,
    onRenameCancel,
    onClick,
    onDoubleClick,
    onMouseDown,
    onContextMenu,
    rowRef,
    ariaSetSize,
    ariaPosInSet,
  } = props;

  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    rowRef?.(ref.current);
    return () => rowRef?.(null);
  }, [rowRef]);

  const rowClass = cn(
    'group/row relative flex h-[22px] select-none items-stretch rounded-sm pr-1 text-[13px] leading-none',
    'text-sidebar-foreground/85',
    selected
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
    active && !selected ? 'text-sidebar-foreground' : null,
  );

  const onRowKeyDown = () => {
    // Keyboard navigation is handled at the `role="tree"` container level.
    // This stub exists so jsx-a11y lint accepts the click handler on the row.
  };

  return (
    <div
      ref={ref}
      role="treeitem"
      tabIndex={-1}
      aria-level={depth + 1}
      aria-selected={selected}
      aria-setsize={ariaSetSize}
      aria-posinset={ariaPosInSet}
      aria-expanded={props.kind === 'dir' ? props.expanded : undefined}
      data-path={props.name}
      className={rowClass}
      onClick={onClick}
      onKeyDown={onRowKeyDown}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
    >
      {active ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-[3px] left-0 w-[2px] rounded-full bg-sidebar-primary/80"
        />
      ) : null}
      <span
        aria-hidden
        className="h-full shrink-0"
        style={{ width: BASE_INSET_PX }}
      />
      <IndentGuides depth={depth} onActivePath={onActivePath} />
      {props.kind === 'dir' ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={(e) => {
            e.stopPropagation();
            props.onToggle();
          }}
          className="grid size-[18px] shrink-0 place-items-center self-center rounded text-sidebar-foreground/60 hover:text-sidebar-foreground"
        >
          {props.hasChildren ? (
            <ChevronRightIcon
              className={cn(
                'size-3 transition-transform motion-safe:duration-100 motion-reduce:transition-none',
                props.expanded ? 'rotate-90' : null,
              )}
              aria-hidden
            />
          ) : (
            <span className="size-3" aria-hidden />
          )}
        </button>
      ) : (
        <span className="w-[18px] shrink-0" aria-hidden />
      )}
      <span className="flex min-w-0 flex-1 items-center gap-1.5 self-center">
        {props.kind === 'dir' ? (
          props.expanded ? (
            <FolderOpenIcon
              className={cn(
                'size-3.5 shrink-0',
                onActivePath ? 'text-sidebar-primary/80' : 'opacity-75',
              )}
              aria-hidden
            />
          ) : (
            <FolderIcon
              className={cn(
                'size-3.5 shrink-0',
                onActivePath ? 'text-sidebar-primary/80' : 'opacity-75',
              )}
              aria-hidden
            />
          )
        ) : (
          <FileKindIcon fileType={props.fileType} />
        )}
        {renaming ? (
          <RenameInput
            initialValue={props.name}
            onSubmit={onRenameSubmit}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className="truncate font-normal">
            {renderWithMatch(props.name, query)}
          </span>
        )}
        {dirty && !renaming ? (
          <span
            aria-label="Unsaved changes"
            title="Unsaved changes"
            className="ml-0.5 size-[6px] shrink-0 rounded-full bg-amber-500"
          />
        ) : null}
      </span>
    </div>
  );
}

/** Ghost row for in-tree creation of a file or folder. */
export function PendingCreateRow({
  depth,
  createKind,
  onSubmit,
  onCancel,
}: {
  depth: number;
  createKind: 'file' | 'folder';
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={false}
      className="relative flex h-[22px] items-stretch rounded-sm pr-1 text-[13px] leading-none text-sidebar-foreground"
    >
      <span aria-hidden className="h-full shrink-0" style={{ width: BASE_INSET_PX }} />
      <IndentGuides depth={depth} onActivePath={false} />
      <span className="w-[18px] shrink-0" aria-hidden />
      <span className="flex min-w-0 flex-1 items-center gap-1.5 self-center">
        {createKind === 'folder' ? (
          <FolderIcon className="size-3.5 shrink-0 opacity-75" aria-hidden />
        ) : (
          <FileTextIcon className="size-3.5 shrink-0 opacity-75" aria-hidden />
        )}
        <RenameInput initialValue="" onSubmit={onSubmit} onCancel={onCancel} />
      </span>
    </div>
  );
}

export function fileKindFromName(name: string): 'markdown' | 'html' | 'text' {
  const lower = name.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  return 'text';
}
