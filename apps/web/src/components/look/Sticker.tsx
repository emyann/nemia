import type { CSSProperties, ReactNode } from 'react';
import { filled, type Hue } from '@/lib/meaning';
import { cn } from '@/components/ui/ds/utils';

/** The label face drawn wide, as the look's values are. */
const WIDE: CSSProperties = { fontStretch: '125%' };

/** A sticker's tone: a meaning's hue, or plain ink on the Control rung, which a cost takes (DESIGN.md, *The four meanings*). */
export type Tone = Hue | 'ink';

/** Each tone's ground and ink. */
const TONE: Record<Tone, string> = { ...filled, ink: 'bg-surface-container-highest text-on-surface' };

/**
 * The look's sticker tile, by its shape alone: a rounded tile filled in `hue` under a label's grain, a small `label` over its
 * value. Its rounding is the sticker's own, 14 pixels, which the look draws beside the kit's corners: no step of the shape scale, and
 * nothing else takes it.
 */
export function Sticker({ hue, label, children }: { hue: Tone; label: string; children: ReactNode }) {
  return (
    <span
      data-sticker={hue}
      data-grain="label"
      className={cn('inline-flex flex-col gap-0.5 rounded-[14px] px-3.5 pt-2.5 pb-[9px]', TONE[hue])}
    >
      <span className="text-label-small uppercase">{label}</span>
      <span className="font-label text-[22px] leading-[26px] font-extrabold" style={WIDE}>
        {children}
      </span>
    </span>
  );
}
