import type { StatsMark } from '../lib/api';
import { RouteLink } from './AgentParts';

/**
 * The changes the charts' rules point at, in words: a row each (`data-mark`), its day, what changed, the run that froze it — a link to
 * its page — and the run it is compared with; or a line saying nothing frozen changed in the period.
 */
export function StatsMarks({ marks }: { marks: readonly StatsMark[] }) {
  return (
    <section aria-label="What changed" className="space-y-2">
      <h2 className="text-sm font-medium">
        What changed{' '}
        <span className="font-normal text-neutral-500 dark:text-neutral-400">
          — each day a run froze a step, an agent or a rendered skill that differs from the run of its workflow before it
        </span>
      </h2>
      {marks.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-500 dark:text-neutral-400">
              <tr>
                <th className="py-1 pr-4 font-normal">day</th>
                <th className="py-1 pr-4 font-normal">changed</th>
                <th className="py-1 pr-4 font-normal">run</th>
                <th className="py-1 font-normal">since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 font-mono dark:divide-neutral-800">
              {marks.map((m) => (
                <tr key={`${m.run} ${m.kind} ${m.name}`} data-mark={m.day}>
                  <td className="py-1 pr-4 whitespace-nowrap">{m.day}</td>
                  <td className="py-1 pr-4">
                    {m.kind} {m.name}
                  </td>
                  <td className="py-1 pr-4">
                    <RouteLink
                      to="/runs/$runId"
                      params={{ runId: m.run }}
                      className="underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-600 dark:decoration-neutral-600 dark:hover:decoration-neutral-300"
                    >
                      {m.run}
                    </RouteLink>
                  </td>
                  <td className="py-1 text-neutral-500 dark:text-neutral-400">{m.since}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Nothing a run froze changed in this period.</p>
      )}
    </section>
  );
}
