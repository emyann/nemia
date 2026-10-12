import type { CSSProperties, ReactNode } from 'react';
import { filled, type Hue } from '@/lib/meaning';
import { cn } from '@/components/ui/ds/utils';

/** The label face drawn wide, as the look's values are. */
const WIDE: CSSProperties = { fontStretch: '125%' };

/**
 * The look's sticker tile, by its shape alone: a rounded tile filled in `hue` under a label's grain, a small `label` over its value. Its rounding is the
 * sticker's own, 14 pixels, which the look draws beside the kit's corners: no step of the shape scale, and nothing else takes it.
 */
export function Sticker({ hue, label, children }: { hue: Hue; label: string; children: ReactNode }) {
  return (
    <span
      data-sticker={hue}
      data-grain="label"
      className={cn('inline-flex flex-col gap-0.5 rounded-[14px] px-3.5 pt-2.5 pb-[9px]', filled[hue])}
    >
      <span className="text-label-small uppercase">{label}</span>
      <span className="font-label text-[22px] leading-[26px] font-extrabold" style={WIDE}>
        {children}
      </span>
    </span>
  );
}
