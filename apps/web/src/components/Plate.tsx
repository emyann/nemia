import type { CSSProperties } from 'react';
import { filled } from '@/lib/meaning';
import { cn } from '@/components/ui/ds/utils';

/** The plate's barcode: bars of the plate's own ink, read by nobody. */
const BARCODE: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 3px, currentColor 3px 4px, transparent 4px 7px, currentColor 7px 10px, transparent 10px 12px)',
};

/** The label face drawn wide, as the look's counts and headings are. */
const WIDE: CSSProperties = { fontStretch: '125%' };

/** The ground a plate is drawn on: what waits on a person, a session at work, or `grey`, what is at rest. */
export type PlateHue = 'yours' | 'alive' | 'grey';

/**
 * The look's plate, a section's heading: its `count` large, its `title` as an `h2`, and a barcode, on the ground of `hue`. `quiet` is
 * the plate of a section that holds nothing: in grey whatever its hue, and with no barcode.
 */
export function Plate({ count, title, hue = 'yours', quiet = false }: { count: number; title: string; hue?: PlateHue; quiet?: boolean }) {
  return (
    <div
      data-plate={quiet ? 'quiet' : 'loud'}
      data-plate-hue={quiet ? 'grey' : hue}
      className={cn('inline-flex items-center gap-3 rounded-[14px] px-3.5 py-2', quiet ? filled.grey : filled[hue])}
    >
      <span data-plate-count className="font-label text-[30px] leading-8 font-extrabold tracking-[-0.02em]" style={WIDE}>
        {count}
      </span>
      <h2 className="m-0 font-label text-label-large font-extrabold uppercase" style={WIDE}>
        {title}
      </h2>
      {!quiet && <span aria-hidden="true" data-plate-barcode className="ml-1.5 h-[26px] w-[54px] flex-none" style={BARCODE} />}
    </div>
  );
}
