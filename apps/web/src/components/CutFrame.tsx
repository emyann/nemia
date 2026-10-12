import type { CSSProperties, ReactNode } from 'react';
import { edged, paint } from '@/lib/meaning';
import { cn } from '@/components/ui/ds/utils';

/** The ground a cut frame sits on, which its cut corners are painted in, and the ground it holds: each a role of the theme. */
const GROUNDS = {
  page: 'var(--background)',
  card: 'var(--card)',
} as const;

/** A ground a cut corner is painted in: the page's, or a card's. */
export type Ground = keyof typeof GROUNDS;

/** The hue of a cut frame's edge: what waits on a person, a session at work, or none, a quiet outline. */
export type FrameHue = 'yours' | 'alive' | 'none';

const EDGE: Record<FrameHue, { border: string; line: string }> = {
  yours: { border: edged.yours, line: paint.yours },
  alive: { border: edged.alive, line: paint.alive },
  none: { border: 'border-outline-variant', line: 'var(--md-sys-color-outline-variant)' },
};

/** How long a cut is along each side, in pixels: a card's, a table's, a button's. */
export type CutSize = 28 | 24 | 12;

const PLACED = {
  'top-right': { place: { top: -1, right: -1 }, toward: 'to bottom left' },
  'bottom-left': { place: { bottom: -1, left: -1 }, toward: 'to top right' },
} as const;

/**
 * One cut corner, laid over the square corner of the box it sits in: a square of `size` whose outside half is painted in `on`, the
 * ground the box sits on, then a one-pixel diagonal in `line`, then nothing, so the box shows through its inside half. Hidden from a
 * reader, and it takes no pointer. It sits over the box's own border, a pixel out.
 */
export function CutCorner({ corner, size, on, line }: { corner: keyof typeof PLACED; size: CutSize; on: Ground; line: string }) {
  const { place, toward } = PLACED[corner];
  const style: CSSProperties = {
    ...place,
    width: size,
    height: size,
    backgroundImage: `linear-gradient(${toward}, ${GROUNDS[on]} calc(50% - 0.5px), ${line} calc(50% - 0.5px), ${line} calc(50% + 0.5px), transparent calc(50% + 0.5px))`,
  };
  return <span aria-hidden="true" data-cut-corner={corner} className="pointer-events-none absolute" style={style} />;
}

/**
 * The look's cut-corner frame: a bordered box on the card's ground whose top-right and bottom-left corners are cut by overlays
 * (`CutCorner`), each drawn before what the frame holds, which stands above them. Nothing of the frame cuts what it holds off: a
 * focused child's ring is drawn whole, over a cut corner too. `hue` is its edge's, `on` the ground it sits on, `size` its cut.
 */
export function CutFrame({
  hue = 'none',
  on = 'page',
  size = 28,
  className,
  children,
}: {
  hue?: FrameHue;
  on?: Ground;
  size?: CutSize;
  className?: string;
  children: ReactNode;
}) {
  const edge = EDGE[hue];
  return (
    <div data-cut-frame={hue} className={cn('relative border bg-card text-card-foreground', edge.border, className)}>
      <CutCorner corner="top-right" size={size} on={on} line={edge.line} />
      <CutCorner corner="bottom-left" size={size} on={on} line={edge.line} />
      <div className="relative">{children}</div>
    </div>
  );
}
