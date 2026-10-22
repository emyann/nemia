import { Focusable } from '@/components/ui/ds';
import type { Breakdown } from '@/lib/breakdown';
import type { Hue } from '@/lib/meaning';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { BreakdownPreview } from './Breakdown';
import { Sticker } from './Sticker';

/**
 * A stat of a waiting run: the look's sticker tile, which the keyboard reaches, under the kit's rich tooltip with its `breakdown`: a
 * headline, rows that add up to the tile, a closing note. The tooltip opens on focus at once and on a resting pointer, and asks the
 * api nothing: the answer the tile is drawn from carries its rows. A tile given no breakdown is drawn alone, and takes no focus.
 */
export function StatTile({ hue, label, value, breakdown }: { hue: Hue; label: string; value: string; breakdown: Breakdown | null }) {
  const name = label.toLowerCase();
  const tile = (
    <Sticker hue={hue} label={label}>
      {value}
    </Sticker>
  );
  if (!breakdown) return <span data-stat-tile={name}>{tile}</span>;
  return (
    <BreakdownPreview breakdown={breakdown}>
      <Focusable>
        <span
          role="group"
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the keyboard opens the tooltip by focusing the tile
          tabIndex={0}
          aria-label={`${label} ${value}`}
          data-stat-tile={name}
          className={cn('inline-flex rounded-[14px]', focusRing())}
        >
          {tile}
        </span>
      </Focusable>
    </BreakdownPreview>
  );
}
