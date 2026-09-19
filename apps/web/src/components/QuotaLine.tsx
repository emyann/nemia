import { TriangleAlert } from 'lucide-react';
import type { Quota } from '@/lib/api';
import { agoWord, quotaTitle, windowWords } from '@/lib/quota';
import { useNow } from '@/lib/useNow';

/**
 * The subscription's quota over the Factory's floor: each window Claude Code reported, as a percentage used with its reset in the person's
 * own time, and how old the reading is — or, when there is nothing to show as now, the api's sentence saying why and what to do. A window
 * used past the api's mark is marked. A row of its own under the counts, since it never fits beside them. Nothing until it is read;
 * why, when it cannot be.
 */
export function QuotaLine({ quota, error }: { quota: Quota | undefined; error: Error | null }) {
  // The age moves between reads: the file is read again every 30 s, and a reading ages every minute.
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
    return (
      <p data-quota={quota.state} title={title} className="max-w-2xl basis-full text-xs text-muted-foreground">
        {quota.said}
      </p>
    );
  }
  const age = quota.writtenAt ? agoWord(now.getTime() - Date.parse(quota.writtenAt)) : null;
  return (
    <p data-quota="fresh" title={title} className="flex basis-full flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
      {quota.windows.map((w) => {
        const words = windowWords(w, now);
        return (
          <span
            key={w.key}
            data-quota-window={w.key}
            data-marked={words.marked || undefined}
            className={words.marked ? 'text-amber-700 dark:text-amber-400' : undefined}
          >
            {words.marked && <TriangleAlert aria-label={`${quota.markAt}% or more used`} className="mr-1 inline size-3.5 -translate-y-px" />}
            {words.label}{' '}
            <span className={words.marked ? 'font-semibold tabular-nums' : 'font-medium text-foreground tabular-nums'}>{words.used}</span>
            {words.resets && <span className="text-xs"> · {words.resets}</span>}
          </span>
        );
      })}
      {age && (
        <span data-quota-age className="text-xs">
          read {age}
        </span>
      )}
    </p>
  );
}
