/**
 * The frame's side sheet for the runs waiting on you, which the Runs page opens under what waits on you: each run, across every
 * factory, that waits on a person as the api answers it (`bellRows`), oldest first, with its factory and what it waits for, a link to its
 * run's page at its gate. They are the whole machine's, not a page's, so the bar has no Open (`barOpens`).
 */
import { useQuery } from '@tanstack/react-query';
import { openRunsQuery } from '@/lib/api/runs';
import { bellHash, bellRows, type BellRow } from '@/lib/bell';
import { RouteLink } from '../agent/AgentParts';
import { FactoryTag } from '../factory/FactoryTag';
import { BarPanel } from '../frame/BarPanel';
import { Reading } from '@/components/look';
import { Skeleton } from '@/components/ui/ds';

/** One run waiting on you: its title, its factory and what it waits for, a link to its run's page at its gate, or at its top for none. */
function WaitingRow({ row }: { row: BellRow }) {
  return (
    <li>
      <RouteLink
        to="/runs/$runId"
        params={{ runId: row.run }}
        search={{}}
        hash={bellHash(row)}
        data-waiting-run={row.run}
        className="block space-y-1.5 rounded-md border p-3 outline-none hover:bg-surface-container-highest focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="block truncate text-body-medium font-medium" title={row.title}>
          {row.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-small text-on-surface-variant">
          <FactoryTag name={row.factory} />{' '}
          <span data-waits-for className="text-yours">
            {row.waitsFor.join(' · ')}
          </span>{' '}
          <span className="font-mono">{row.run}</span>
        </span>
      </RouteLink>
    </li>
  );
}

/** How many runs wait on you, said in the bar's description. */
const countWords = (count: number) => `${count} ${count === 1 ? 'run' : 'runs'}, across every factory`;

/**
 * The runs waiting on you, read as the rail's count reads them (`openRunsQuery`): a row each, or a line saying nothing waits on you; a read
 * that failed says so, and one still on its way says that.
 */
export function WaitingBar() {
  const runs = useQuery(openRunsQuery());
  const rows = runs.data ? bellRows(runs.data.waiting) : null;
  return (
    <BarPanel title="Waiting on you" description={rows ? countWords(rows.length) : 'Across every factory'}>
      {rows ? (
        rows.length ? (
          <ul data-waiting className="space-y-2">
            {rows.map((row) => (
              <WaitingRow key={row.run} row={row} />
            ))}
          </ul>
        ) : (
          <p data-waiting className="text-body-medium text-on-surface-variant">
            Nothing waits on you.
          </p>
        )
      ) : runs.error ? (
        <p className="text-body-medium">The runs could not be read: {runs.error.message}</p>
      ) : (
        <Reading label="Reading the runs…" className="flex flex-col gap-2">
          {[0, 1, 2].map((at) => (
            <Skeleton key={at} shape="rectangle" className="h-14 rounded-none" />
          ))}
        </Reading>
      )}
    </BarPanel>
  );
}
