import type { ReactNode } from 'react';
import { FRAME_EDGE } from '@/lib/classes';

/**
 * How much of the frame's grid a page takes: `wide` the whole of it, `reading` the left of it, its lines stopping at `--frame-measure`,
 * and `bleed` the whole column with no grid, for a page that fills the window by height or wears a ground across it.
 */
export type PageSpan = 'wide' | 'reading' | 'bleed';

/**
 * The frame's one grid: the edges (`FRAME_EDGE`), the gutter (`--frame-gutter`, 1rem, 1.5rem from a 3xl column) and four, eight then twelve
 * columns by the page's column (the frame's named container), never by the window. What it holds takes the `span` it is given (`reading` stops at
 * `--frame-measure`), so no page picks a centred width of its own.
 *
 * @param span - how much of the grid the page takes.
 * @param className - what the span's own box adds (its layout inside).
 * @param children - the page.
 */
export function FrameGrid({ span, className, children }: { span: Exclude<PageSpan, 'bleed'>; className?: string; children: ReactNode }) {
  return (
    <div
      data-frame-grid
      className={`grid w-full grid-cols-4 gap-x-(--frame-gutter) py-6 [--frame-gutter:--spacing(4)] @3xl/page:grid-cols-8 @3xl/page:[--frame-gutter:--spacing(6)] @7xl/page:grid-cols-12 ${FRAME_EDGE}`}
    >
      <div
        data-frame-span={span}
        className={`col-span-full min-w-0 ${span === 'reading' ? 'max-w-(--frame-measure) ' : ''}${className ?? ''}`.trimEnd()}
      >
        {children}
      </div>
    </div>
  );
}
