import type { ReactNode } from 'react';
import { paint } from '@/lib/meaning';
import { cn } from '@/components/ui/ds/utils';

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

/** How long a cut is along each side, in pixels: a card's, a table's, a button's. */
export type CutSize = 28 | 24 | 12;

/** How much longer a cut is, for each pixel its shape is grown by on every side, so the grown cut runs beside the first: 2 − √2. */
const GROWN = 2 - Math.SQRT2;

/**
 * The outline of a box whose top-right and bottom-left corners are cut, as a `polygon`'s points: the box's own, or with `inset` the
 * outline that many pixels inside it, its cuts beside the first's.
 *
 * @param cut how long a cut is along each side of the box, in pixels
 * @param inset how far inside the box the outline runs, in pixels
 */
export function cutPoints(cut: number, inset = 0): string {
  const far = (length: number) => (length === 0 ? '100%' : `calc(100% - ${Number(length.toFixed(2))}px)`);
  const near = (length: number) => `${Number(length.toFixed(2))}px`;
  const [a, b] = [inset, inset + cut - inset * GROWN];
  return [
    `${near(a)} ${near(a)}`,
    `${far(b)} ${near(a)}`,
    `${far(a)} ${near(b)}`,
    `${far(a)} ${far(a)}`,
    `${near(b)} ${far(a)}`,
    `${near(a)} ${far(b)}`,
  ].join(', ');
}

/** The clip that leaves a box its cut shape: its top-right and bottom-left corners cut by `cut` pixels. */
export const cutShape = (cut: number): string => `polygon(${cutPoints(cut)})`;

/**
 * The clip that leaves a box a band along its edge, `width` pixels wide, in the cut shape: the ring of a shape `cut` pixels cut that
 * stands inside the box, `width` and a gap from its edge on every side.
 *
 * @param cut how long the cut of the shape inside is, in pixels
 * @param gap the room between the shape and its ring, in pixels
 * @param width how wide the ring is, in pixels
 */
export function cutRing(cut: number, gap: number, width: number): string {
  const outer = cutPoints(cut + (gap + width) * GROWN);
  const inner = cutPoints(cut + (gap + width) * GROWN, width);
  const [from, hole] = [outer.split(', ')[0], inner.split(', ')[0]];
  return `polygon(evenodd, ${outer}, ${from}, ${inner}, ${hole}, ${from})`;
}

/** The clip that cuts a tag's top-right corner, seven pixels along each side. */
const TAG_CUT = 'polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 0 100%)';

/** A tag with its top-right corner cut, as the look cuts the tag that says a state: what it holds takes no focus, so no ring is cut. */
export function CutTag({ children }: { children: ReactNode }) {
  return (
    <span data-cut-tag className="inline-flex" style={{ clipPath: TAG_CUT }}>
      {children}
    </span>
  );
}

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
