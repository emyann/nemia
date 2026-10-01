import type { ByStepRow } from '../lib/stats';
import { NONE } from '../lib/stats';

/**
 * A titled table of what each step and agent loaded or was refused (`byStepOf`): a row each (`data-by-step-row`), its step, its agent, its
 * total over its measured tries — `—`, the count, or `3 (2 of 4)` — and each name with its count, wrapping and never cut; or a line saying
 * no try ended. `kind` names it on the page (`data-by-step`), `about` says what it counts, and `total` and `item` head its columns.
 */
export function StatsByStep({
  title,
  about,
  kind,
  rows,
  total,
  item,
}: {
  title: string;
  about: string;
  kind: 'skills' | 'denials';
  rows: readonly ByStepRow[];
  total: string;
  item: string;
}) {
  return (
    <section aria-label={title} data-by-step={kind} className="min-w-0 space-y-2">
      <h2 className="text-sm font-medium">
        {title} <span className="font-normal text-neutral-500 dark:text-neutral-400">— {about}</span>
      </h2>
      {rows.length ? (
        <table className="w-full text-left text-xs">
          <thead className="text-neutral-500 dark:text-neutral-400">
            <tr>
              <th className="py-1 pr-4 font-normal">step</th>
              <th className="py-1 pr-4 font-normal">agent</th>
              <th className="py-1 pr-4 font-normal">{total}</th>
              <th className="py-1 font-normal">{item}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 font-mono dark:divide-neutral-800">
            {rows.map((row) => (
              <tr key={`${row.step} ${row.agent}`} data-by-step-row={row.step} className="align-top">
                <td className="py-1 pr-4 wrap-anywhere">{row.step}</td>
                <td className="py-1 pr-4 wrap-anywhere">{row.agent ?? NONE}</td>
                <td data-total className="py-1 pr-4 whitespace-nowrap tabular-nums">
                  {row.total}
                </td>
                <td className="py-1">
                  <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {row.items.map((it) => (
                      <li key={it.name} data-item={it.name} className="wrap-anywhere">
                        {it.name} <span className="text-neutral-500 dark:text-neutral-400">×{it.count}</span>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">No step ended a try in this period.</p>
      )}
    </section>
  );
}
