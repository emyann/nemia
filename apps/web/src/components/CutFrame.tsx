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
