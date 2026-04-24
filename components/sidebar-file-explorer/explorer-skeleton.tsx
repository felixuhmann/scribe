import { Skeleton } from '@/components/ui/skeleton';

const ROW_SHAPES: ReadonlyArray<{ depth: number; width: number }> = [
  { depth: 0, width: 120 },
  { depth: 1, width: 140 },
  { depth: 1, width: 110 },
  { depth: 2, width: 90 },
  { depth: 0, width: 160 },
  { depth: 1, width: 100 },
  { depth: 1, width: 130 },
];

export function ExplorerSkeleton() {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-1.5" aria-hidden>
      {ROW_SHAPES.map((row, i) => (
        <div key={i} className="flex h-[22px] items-center gap-1.5">
          <span style={{ width: 4 + row.depth * 10 }} aria-hidden />
          <Skeleton className="size-3 rounded-sm" />
          <Skeleton className="size-3.5 rounded-sm" />
          <Skeleton className="h-3 rounded-sm" style={{ width: row.width }} />
        </div>
      ))}
    </div>
  );
}
