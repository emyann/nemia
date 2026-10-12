import type { ReactNode } from 'react';
import { paint } from '@/lib/meaning';
import { cn } from '@/components/ui/ds/utils';
import { cutPoints, cutShape, type CutSize } from './cut';

/** The hue of a cut frame's edge: what waits on a person, a session at work, or none, a quiet outline. */
export type FrameHue = 'yours' | 'alive' | 'none';

/** The colour of a frame's edge, by its hue. */
const EDGE: Record<FrameHue, string> = {
  yours: paint.yours,
  alive: paint.alive,
  none: 'var(--md-sys-color-outline-variant)',
};

/** The glow of a frame that waits on a person, cast by its shape and so following its cut; no other frame glows. */
const GLOW: Record<FrameHue, string | undefined> = {
  yours: `drop-shadow(0 0 10px color-mix(in srgb, ${paint.yours} 26%, transparent))`,
  alive: undefined,
  none: undefined,
};

/**
 * The look's cut-corner frame: a shape of its own under what it holds, its top-right and bottom-left corners cut, an edge in `hue`
 * around the card's ground, and for what waits on a person a glow the shape casts. Outside the cut nothing is painted: the page's
 * ground shows. Nothing of the frame cuts what it holds off: a focused child's ring is drawn whole, over a cut corner too. `size` is
 * its cut.
 */
export function CutFrame({
  hue = 'none',
  size = 28,
  className,
  children,
}: {
  hue?: FrameHue;
  size?: CutSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-cut-frame={hue} className={cn('relative p-px text-card-foreground', className)}>
      <span aria-hidden="true" data-cut-shape className="pointer-events-none absolute inset-0" style={{ filter: GLOW[hue] }}>
        <span data-cut-edge className="absolute inset-0" style={{ backgroundColor: EDGE[hue], clipPath: cutShape(size) }} />
        <span data-cut-ground className="absolute inset-0 bg-card" style={{ clipPath: `polygon(${cutPoints(size, 1)})` }} />
      </span>
      <div className="relative">{children}</div>
    </div>
  );
}

/**
 * What the box around a table in a cut frame wears: it scrolls sideways when the table is wider than the frame and never upright,
 * the frame growing with its rows.
 */
export const FRAMED_BOX = 'overflow-x-auto overflow-y-hidden';

/**
 * What that box wears besides where it ends its frame, a frame cut 24 pixels: its sideways scroll bar starts past the bottom-left
 * cut, where its thumb would be painted in the cut corner. A box with something under it in the frame is not at the cut.
 */
export const FRAMED_END = '[&::-webkit-scrollbar-track:horizontal]:ml-6';

/**
 * What a table in a cut frame wears: nothing it holds is laid out past its own box, where a control's touch target under the last
 * row would make the box around it scroll upright. The table's box is the frame's inside, so nothing drawn in it is cut.
 */
export const FRAMED_TABLE = 'overflow-clip';

/**
 * What a row of a table in a cut frame wears: no ground of its own, which would paint a cut corner over, and no line under the last
 * row, where the frame's own edge closes the table.
 */
export const FRAMED_ROW = 'bg-transparent last:border-b-0';
