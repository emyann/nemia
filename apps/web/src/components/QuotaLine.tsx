import { TriangleAlert } from 'lucide-react';
import type { Quota } from '@/lib/api';
import { agoWord, lastWords, quotaTitle, type WindowWords, windowWords } from '@/lib/quota';
import { useNow } from '@/lib/useNow';

/**
 * The subscription's quota over a factory's floor, led by `Quota on this machine:`, since it is the machine's and not the factory's: each
 * window Claude Code answered with, as a percentage used with its reset in the person's own time, and how old the answer is — or, when
 * there is nothing to show as now, the api's sentence saying why and what to do, with the last good reading under it, dimmed and dated, so
 * that nobody takes it for now. A window used past the api's mark is marked. A row of its own under the counts, since it never fits beside
 * them. Nothing until it is read; why, when it cannot be. The age moves between reads: the api is read again every minute, and answers from
 * an ask up to ten minutes old — or hours, for the last good reading.
 */
export function QuotaLine({ quota, error }: { quota: Quota | undefined; error: Error | null }) {
  const now = new Date(useNow(30_000));
  if (error) {
    return (
      <p data-quota="error" className="max-w-md basis-full truncate text-xs text-red-600 dark:text-red-400" title={error.message}>
        The quota could not be read: {error.message}
      </p>
    );
  }
  if (!quota) return null;
  const title = quotaTitle(quota, now);
  if (quota.state !== 'fresh') {
    const last = lastWords(quota, now);
    return (
      <div data-quota={quota.state} title={title} className="max-w-2xl basis-full text-xs text-muted-foreground">
        <p>
          <Lead /> {quota.said}
        </p>
        {last && (
          <p
            data-quota-last
            className="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-foreground opacity-70 [&_[data-marked]]:text-foreground"
          >
            {last.windows.map((w) => (
              <Window key={w.key} words={w} markAt={quota.markAt} data={{ 'data-quota-last-window': w.key }} />
            ))}
            <span data-quota-last-age>{last.asOf}</span>
          </p>
        )}
      </div>
    );
  }
  const age = quota.askedAt ? agoWord(now.getTime() - Date.parse(quota.askedAt)) : null;
  return (
    <p data-quota="fresh" title={title} className="flex basis-full flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <Lead />
      {quota.windows.map((w) => (
        <Window key={w.key} words={windowWords(w, now)} markAt={quota.markAt} data={{ 'data-quota-window': w.key }} emphasis />
      ))}
      {age && (
        <span data-quota-age className="text-xs">
          read {age}
        </span>
      )}
    </p>
  );
}

/**
 * One window's words: its label, the percentage — in the text's own colour when `emphasis` is off, as for the last reading — and its reset.
 */
function Window({
  words,
  markAt,
  data,
  emphasis = false,
}: {
  words: WindowWords;
  markAt: number;
  data: Record<string, string>;
  emphasis?: boolean;
}) {
  return (
    <span {...data} data-marked={words.marked || undefined} className={words.marked ? 'text-money' : undefined}>
      {words.marked && <TriangleAlert aria-label={`${markAt}% or more used`} className="mr-1 inline size-3.5 -translate-y-px" />}
      {words.label}{' '}
      <span
        className={
          words.marked ? 'font-semibold tabular-nums' : emphasis ? 'font-medium text-foreground tabular-nums' : 'font-medium tabular-nums'
        }
      >
        {words.used}
      </span>
      {words.resets && <span className="text-xs"> · {words.resets}</span>}
    </span>
  );
}

/** What the quota is, before it: the machine's, whichever factory's floor shows it. */
function Lead() {
  return <span data-quota-machine>Quota on this machine:</span>;
}
