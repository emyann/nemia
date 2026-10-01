import type { StatsTile } from '../lib/api';
import { TILES, trendOf } from '../lib/stats';

/** The trend's words, for a person who reads it aloud. */
const TREND_WORDS = { '↑': 'up on', '↓': 'down on', '=': 'the same as' } as const;

/**
 * A tile per headline number in `TILES` (`data-tile`, its served value for the last 14 days as JSON in `data-value`, null kept): its words
 * for the last 14 days, which way it went, and its words for the 14 days before, each window's first and last day on hover. Which way is
 * better is not said: for a cost down is, for the runs landed up is. A number drawn only as a chart has no tile.
 */
export function StatsTiles({ last, before }: { last: StatsTile; before: StatsTile }) {
  return (
    <section aria-label="The last 14 days" className="space-y-2">
      <h2 className="text-sm font-medium">
        Last 14 days{' '}
        <span className="font-normal text-neutral-500 dark:text-neutral-400">
          ({last.from} → {last.to}), against the 14 before ({before.from} → {before.to})
        </span>
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5 2xl:grid-cols-10">
        {TILES.map((number) => {
          const trend = trendOf(last[number.key], before[number.key]);
          return (
            <li
              key={number.key}
              data-tile={number.key}
              data-value={JSON.stringify(last[number.key])}
              title={number.about}
              className="min-w-0 space-y-0.5 rounded-lg border border-neutral-200 px-2.5 py-2 dark:border-neutral-800"
            >
              <div data-words className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                {number.label}
              </div>
              <div className="flex items-baseline gap-1">
                <span data-words className="truncate text-lg font-semibold tabular-nums" title={`${last.from} → ${last.to}`}>
                  {number.words(last[number.key])}
                </span>
                {trend && (
                  <span className="text-xs text-neutral-500 dark:text-neutral-400" aria-label={`${TREND_WORDS[trend]} the 14 before`}>
                    {trend}
                  </span>
                )}
              </div>
              <div
                data-words
                className="truncate text-xs text-neutral-500 tabular-nums dark:text-neutral-400"
                title={`${before.from} → ${before.to}`}
              >
                before {number.words(before[number.key])}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
