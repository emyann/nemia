import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { cutPoints, cutShape, type CutSize } from './cut';

/**
 * The edge of a field: a pixel of the outline's hue while nothing in it has the focus, two of a session's hue when something does.
 * Each class is written whole, since Tailwind finds a class by its text in a source file.
 */
const EDGE = 'bg-outline-variant group-focus-within/field:bg-alive';

/**
 * The look's cut-corner frame for a box that holds a field: a shape of its own under what it holds, its top-right and bottom-left
 * corners cut, and an edge drawn in that shape all the way round the cut corners — never a rectangular ring a clip would take off the
 * diagonals. Quiet it is a pixel of the outline's hue; when something inside it takes the focus, by a click or by the keyboard, the
 * whole edge is two pixels of a session's hue, the diagonals with the straight sides. It casts no glow. `ground` is the Tailwind
 * class of the ground under what it holds, `size` its cut. Nothing of it cuts what it holds off, and its ground is read from its own
 * layer, as a cut frame's is (`data-cut-frame`, `test/e2e/contrast.ts`).
 */
export function CutField({
  size = 12,
  ground = 'bg-surface-container-high',
  className,
  children,
}: {
  size?: CutSize;
  ground?: string;
  className?: string;
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
      <div className="relative">{children}</div>
    </div>
  );
}
