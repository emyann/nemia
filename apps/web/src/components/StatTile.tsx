import { Focusable, Tooltip, TooltipTrigger } from '@/components/ui/ds';
import type { Breakdown } from '@/lib/breakdown';
import type { Hue } from '@/lib/meaning';
import { cn } from '@/lib/utils';
import { Sticker } from './Sticker';

/** A breakdown's rows as a list of terms, then its closing note under a rule. */
function Rows({ breakdown }: { breakdown: Breakdown }) {
  return (
    <>
      <dl data-breakdown className="m-0 mt-1 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-body-medium">
        {breakdown.rows.map((row) => (
          <div key={row.what} data-breakdown-row={row.what} className="contents">
            <dt>{row.what}</dt>
            <dd className={cn('m-0 text-end font-mono', !row.none && 'text-on-surface')}>{row.said}</dd>
          </div>
        ))}
      </dl>
      {breakdown.foot && (
        <p data-breakdown-foot className="m-0 mt-2 border-t border-outline-variant pt-2 text-body-small">
          {breakdown.foot}
        </p>
      )}
    </>
  );
}

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
    <TooltipTrigger delay={200} closeDelay={150}>
      <Focusable>
        <span
          role="group"
          tabIndex={0}
          aria-label={`${label} ${value}`}
          data-stat-tile={name}
          className="inline-flex rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          {tile}
        </span>
      </Focusable>
      <Tooltip variant="rich" headline={breakdown.head}>
        <Rows breakdown={breakdown} />
      </Tooltip>
    </TooltipTrigger>
  );
}
