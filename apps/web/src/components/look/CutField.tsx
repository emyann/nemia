import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { cutHold, cutPoints, cutShape, type CutSize } from './cut';

/**
 * The edge of a field: a pixel of the outline's hue while nothing in it has the focus, two of a session's hue when something does.
 * Each class is written whole, since Tailwind finds a class by its text in a source file.
 */
const EDGE = 'bg-outline-variant group-focus-within/field:bg-alive';

/** How far what a field holds is kept inside its diagonals, in pixels: the width of its edge with the focus in it. */
const FOCUSED_EDGE = 2;

/** The room the field's row keeps around a control at its end, in pixels: above, below, and beside its cut. */
const END_ROOM = 4;

/**
 * The look's cut-corner frame for a box that holds a field: a shape of its own under what it holds, its top-right and bottom-left
 * corners cut, and an edge drawn in that shape all the way round the cut corners — never a rectangular ring a clip would take off the
 * diagonals. Quiet it is a pixel of the outline's hue; when something inside it takes the focus, by a click or by the keyboard, the
 * whole edge is two pixels of a session's hue, the diagonals with the straight sides. It casts no glow. `ground` is the Tailwind
 * class of the ground under what it holds, `size` its cut. What it holds is kept inside its two diagonals, two pixels in from each
 * (`cutHold`), its straight sides left open: nothing is drawn past a cut. `end` is a control at the row's right end (a Filter, an
 * Add): the field lays its row itself, what it holds filling it and the control set in from the right by the cut and the row's room
 * beside it, so its corner stands inside the cut (`data-cut-end`). Its ground is read from its own layer, as a cut frame's is
 * (`data-cut-frame`, `test/e2e/contrast.ts`).
 */
export function CutField({
  size = 12,
  ground = 'bg-surface-container-high',
  className,
  end,
  children,
}: {
  size?: CutSize;
  ground?: string;
  className?: string;
  end?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div data-cut-frame="none" data-cut-field="" className={cn('group/field relative', className)}>
      <span aria-hidden="true" data-cut-shape className="pointer-events-none absolute inset-0">
        <span data-cut-edge="field" className={cn('absolute inset-0', EDGE)} style={{ clipPath: cutShape(size) }} />
        <span
          data-cut-ground="quiet"
          className={cn('absolute inset-0 group-focus-within/field:hidden', ground)}
          style={{ clipPath: `polygon(${cutPoints(size, 1)})` }}
        />
        <span
          data-cut-ground="focus"
          className={cn('absolute inset-0 hidden group-focus-within/field:block', ground)}
          style={{ clipPath: `polygon(${cutPoints(size, 2)})` }}
        />
      </span>
      <div className="relative" style={{ clipPath: cutHold(size, FOCUSED_EDGE) }}>
        {end === undefined ? (
          children
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1">{children}</div>
            <div data-cut-end className="flex shrink-0" style={{ paddingBlock: END_ROOM, marginRight: size + END_ROOM }}>
              {end}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
