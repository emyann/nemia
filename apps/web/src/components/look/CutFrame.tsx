import { createContext, use, type HTMLAttributes, type ReactNode } from 'react';
import { paint } from '@/lib/meaning';
import { cn } from '@/components/ui/ds/utils';
import { cutFoot, cutPoints, cutShape, type CutSize } from './cut';

/** The hue of a cut frame's edge: what waits on a person, a session at work, what failed, or none, a quiet outline. */
export type FrameHue = 'yours' | 'alive' | 'failure' | 'none';

/** The colour of a frame's edge, by its hue. */
const EDGE: Record<FrameHue, string> = {
  yours: paint.yours,
  alive: paint.alive,
  failure: paint.failure,
  none: 'var(--md-sys-color-outline-variant)',
};

/** The glow of a frame that waits on a person, cast by its shape and so following its cut; no other frame glows. */
const GLOW = `drop-shadow(0 0 10px color-mix(in srgb, ${paint.yours} 26%, transparent))`;

/** Whether a part is drawn inside a cut frame: a frame there wears no grain, which never doubles. */
const InFrame = createContext(false);

/**
 * The look's cut-corner frame: a shape of its own under what it holds, its top-right and bottom-left corners cut, an edge in `hue`
 * around the card's ground, which wears the quiet grain inside the cut (none for a frame inside another, so grain never doubles), and
 * for what waits on a person a glow the shape casts.
 * Outside the cut nothing is painted: the page's ground shows. Nothing of the frame cuts what it holds off: a focused child's ring is
 * drawn whole, over a cut corner too. `size` is its cut. `fill` is for a frame given a height — a panel that grows to the room it is
 * in — where what it holds is laid out down the whole of it, and scrolls inside rather than past it. `ground` is the class of its
 * ground layer, the card's by default (a run's tone mixes its own, `runRecipe`); `glow` whether its shape casts the glow, which only a
 * frame that waits on a person does, and by default every such frame.
 */
export function CutFrame({
  hue = 'none',
  size = 28,
  fill = false,
  ground = 'bg-surface-container-low',
  glow,
  className,
  children,
}: {
  hue?: FrameHue;
  size?: CutSize;
  fill?: boolean;
  ground?: string;
  glow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const inFrame = use(InFrame);
  return (
    <div data-cut-frame={hue} className={cn('relative p-px text-on-surface', className)}>
      <span
        aria-hidden="true"
        data-cut-shape
        className="pointer-events-none absolute inset-0"
        style={{ filter: (glow ?? hue === 'yours') ? GLOW : undefined }}
      >
        <span data-cut-edge className="absolute inset-0" style={{ backgroundColor: EDGE[hue], clipPath: cutShape(size) }} />
        <span
          data-cut-ground
          data-grain={inFrame ? undefined : 'quiet'}
          className={cn('absolute inset-0', ground)}
          style={{ clipPath: `polygon(${cutPoints(size, 1)})` }}
        />
      </span>
      <div className={cn('relative', fill && 'flex h-full min-h-0 flex-col')}>
        <InFrame value>{children}</InFrame>
      </div>
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
const FRAMED_END = '[&::-webkit-scrollbar-track:horizontal]:ml-6';

/** The cut of the frame a table ends at: a table's. */
const TABLE_CUT = 24;

/**
 * The state layer of the interactive row at the foot of a table that ends its frame: from that row's top (its anchor, `--framed-foot`,
 * which `FRAMED_ROW` names) down to the box's foot, past the lane a sideways scroll bar takes under the row where one is drawn, so its
 * clip lies on the frame's diagonal with a lane or none; as wide as the box and still while the table scrolls sideways, clipped to the
 * frame's bottom-left cut,
 * and painted in the kit's colours and strengths for the row's states: `on-surface` at 8% under the pointer, 10% pressed and focused.
 */
const FOOT_LAYER = [
  'pointer-events-none absolute inset-x-0 bottom-0 [top:anchor(--framed-foot_top)]',
  'transition-colors duration-short-4',
  '[@media(hover:hover)]:group-has-[tbody>tr[data-interactive]:last-child:hover:not([data-pressed],[data-focus-visible])]/foot:bg-on-surface/8',
  'group-has-[tbody>tr[data-interactive][data-pressed]:last-child]/foot:bg-on-surface/10',
  'group-has-[tbody>tr[data-interactive][data-focus-visible]:last-child]/foot:bg-on-surface/10',
].join(' ');

/** Its clip: the frame's diagonal, for a box one pixel inside a frame cut `TABLE_CUT`. */
const FOOT_CLIP = { clipPath: cutFoot(TABLE_CUT, 1) };

/**
 * The box around a table that ends its cut frame, a frame cut 24 pixels: `FRAMED_BOX`, its scroll bar past the bottom-left cut, and
 * the state layer of the row at its foot. The kit paints a row's hover, pressed and focus states as its ground, which over the last
 * row would fill the cut corner square: that row, where it is the kit's interactive row, wears none (`FRAMED_ROW`), and a layer under
 * the table paints them in the cut's shape instead, in the kit's own colours and strengths, standing still while the table scrolls
 * sideways, so the cut stays at the frame's corner. The layer holds nothing and takes no focus; nothing that does is clipped, and the
 * row's focus ring is drawn whole. A table with something under it in its frame (a pager) takes a plain `FRAMED_BOX`. It takes the
 * box's own attributes (its `data-` marks) and `className`, besides what it holds.
 */
export function TableAtCut({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="group/foot relative [anchor-scope:--framed-foot]">
      <span aria-hidden="true" data-framed-foot className={FOOT_LAYER} style={FOOT_CLIP} />
      <div data-framed-end {...props} className={cn('relative', FRAMED_BOX, FRAMED_END, className)}>
        {children}
      </div>
    </div>
  );
}

/**
 * What a table in a cut frame wears: nothing it holds is laid out past its own box, where a control's touch target under the last
 * row would make the box around it scroll upright. The table's box is the frame's inside, so nothing drawn in it is cut.
 */
export const FRAMED_TABLE = 'overflow-clip';

/**
 * What a row of a table in a cut frame wears: no ground of its own, which would paint a cut corner over, and no line under the last
 * row, where the frame's own edge closes the table. The last row of a table that ends its frame (`TableAtCut`), where it is the kit's
 * interactive row, takes its hover, pressed and focus states off its ground and names itself the anchor (`--framed-foot`) of the
 * layer `TableAtCut` paints them on, in the kit's colours and strengths, clipped to the frame's cut.
 */
export const FRAMED_ROW = [
  'bg-transparent last:border-b-0',
  '[[data-framed-end]_&]:last:data-[interactive]:[anchor-name:--framed-foot]',
  '[[data-framed-end]_&]:last:data-[interactive]:hover:bg-transparent',
  '[[data-framed-end]_&]:last:data-[interactive]:data-pressed:bg-transparent',
  '[[data-framed-end]_&]:last:data-[interactive]:data-focus-visible:bg-transparent',
].join(' ');
