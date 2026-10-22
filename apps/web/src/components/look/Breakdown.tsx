import { Tooltip, TooltipTrigger } from '@/components/ui/ds';
import type { Breakdown } from '@/lib/breakdown';
import type { ReactNode } from 'react';
import { cn } from '@/components/ui/ds/utils';

/**
 * A breakdown's rows as a list of terms, then its closing note under a rule. Drawn on its own where something already holds the
 * headline; `BreakdownPreview` hangs it off a trigger.
 */
export function BreakdownRows({ breakdown }: { breakdown: Breakdown }) {
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
 * A breakdown as a preview over a trigger of the caller's own: the kit's rich tooltip, its headline the breakdown's own and its body
 * the rows (`BreakdownRows`), which opens on focus at once and on a resting pointer, and asks the api nothing — the answer the trigger
 * is drawn from carries the rows.
 *
 * `children` is the trigger, and must take the focus, since the keyboard opens a tooltip by focusing it: a link, a button, or anything
 * inside the kit's `Focusable`. The look's stat tile hangs its sticker here, and the runs tables' Clock cells their own button, so one
 * drawing serves both.
 */
export function BreakdownPreview({ breakdown, children }: { breakdown: Breakdown; children: ReactNode }) {
  return (
    <TooltipTrigger delay={200} closeDelay={150}>
      {children}
      <Tooltip variant="rich" headline={breakdown.head}>
        <BreakdownRows breakdown={breakdown} />
      </Tooltip>
    </TooltipTrigger>
  );
}
