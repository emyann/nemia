import type { ReactNode } from 'react';
import { Skeleton, SkeletonGroup } from '@/components/ui/ds';
import { cn } from '@/components/ui/ds/utils';

type ReadingProps = {
  /** The line it stands in for, said once to a screen reader as the group's status ("Reading its conversation…"). */
  label: string;
  /**
   * `late` waits `--reading-after` (`reading.css`) before the shapes show, so a read that answers sooner draws nothing in between;
   * `now` shows them at once, for a route's pending page, which the router already holds back until its read has taken a second.
   */
  at?: 'late' | 'now';
  /** The layout of what it stands for. */
  className?: string;
  /** The kit's `Skeleton`s, in the shape of what is coming. */
  children: ReactNode;
};

/**
 * What a page or a part draws while its first read is out: the kit's `SkeletonGroup`, named by the line it replaces, holding the kit's
 * `Skeleton`s in the shape of what is coming. Sighted, the shapes alone; a screen reader hears the label once, from a status region.
 */
export function Reading({ label, at = 'late', className, children }: ReadingProps) {
  return (
    <SkeletonGroup label={label} className={cn(at === 'late' && 'reading-late', className)}>
      {children}
    </SkeletonGroup>
  );
}

/**
 * Lines of text still being read, one kit `Skeleton` a line, each as wide as its entry of `widths` (a width class, `w-2/3`), laid out by
 * `className`, a column by default: its type role sets the lines' height.
 */
export function ReadingLines({ widths, className }: { widths: readonly string[]; className?: string }) {
  return (
    <div className={cn('flex flex-col', className)}>
      {widths.map((width, at) => (
        <Skeleton key={at} className={width} />
      ))}
    </div>
  );
}
