import type { CSSProperties, ReactNode } from 'react';
import { filled, paint } from '@/lib/meaning';
import { cn } from '@/components/ui/ds/utils';

/** Bars of the plate's own ink, `widths` in pixels, an inked bar and a gap in turn, repeated along the barcode. */
function bars(widths: readonly number[]): CSSProperties {
  let at = 0;
  const stops = widths.map((width, i) => {
    const from = at;
    at += width;
    return `${i % 2 === 0 ? 'currentColor' : 'transparent'} ${from === 0 ? '0' : `${from}px`} ${at}px`;
  });
  return { backgroundImage: `repeating-linear-gradient(90deg, ${stops.join(', ')})` };
}

/** Each plate's own barcode, read by nobody: no two hues carry the same. */
const BARCODE: Record<PlateHue, CSSProperties> = {
  yours: bars([2, 1, 1, 3, 3, 2]),
  alive: bars([1, 2, 3, 1, 1, 3]),
  grey: bars([3, 1, 1, 3, 2, 3]),
};

/** The label face drawn wide, as the look's counts and headings are. */
const WIDE: CSSProperties = { fontStretch: '125%' };

/** The ground a plate is drawn on: what waits on a person, a session at work, or `grey`, what is at rest. */
export type PlateHue = 'yours' | 'alive' | 'grey';

/**
 * The look's plate, a section's heading: its `count` large, its `title` as an `h2`, its `hue`'s barcode, on its ground. `quiet` is
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
      {!quiet && <span aria-hidden="true" data-plate-barcode className="ml-1.5 h-[26px] w-[54px] flex-none" style={BARCODE[hue]} />}
    </div>
  );
}

/** The rule under a page's name: its first 140 pixels lit in the hue of a session at work, the rest a hairline. */
const NAME_RULE: CSSProperties = {
  backgroundImage: `linear-gradient(to right, ${paint.alive} 0 140px, var(--md-sys-color-outline-variant) 140px)`,
};

/**
 * A page's name in the look: the brand face in capitals, as the page's `h1`, 18 pixels over its rule. The rule is a line of its own
 * nobody reads, under the name, so the name keeps a ground a contrast measure can read.
 */
export function PageName({ children }: { children: ReactNode }) {
  return (
    <h1 data-page-name className="relative m-0 pb-4.5 font-brand text-display-small text-on-surface uppercase">
      {children}
      <span aria-hidden="true" data-page-rule className="absolute inset-x-0 bottom-0 h-px" style={NAME_RULE} />
    </h1>
  );
}
