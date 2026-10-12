/**
 * The frame's floating bar for the runs waiting on you, which the header's bell opens (`FrameHeader`): each run, across every factory, that
 * waits on a person as the api answers it (`bellRows`), oldest first, with its factory and what it waits for, a link to its run's page at
 * its gate. They are the whole machine's, not a page's, so the bar has no Open (`barOpens`).
 */
import { useQuery } from '@tanstack/react-query';
import { openRunsQuery } from '@/lib/api';
import { bellHash, bellRows, type BellRow } from '@/lib/bell';
import { RouteLink } from './AgentParts';
import { FactoryTag } from './FactoryTag';
import { FloatingBar } from './FloatingBar';

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
        className="block space-y-1.5 rounded-md border p-3 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="block truncate text-sm font-medium" title={row.title}>
          {row.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <FactoryTag name={row.factory} />{' '}
          <span data-waits-for className="text-amber-700 dark:text-amber-400">
            {row.waitsFor.join(' · ')}
          </span>{' '}
          <span className="font-mono">{row.run}</span>
        </span>
      </RouteLink>
    </li>
  );
}

/** How many runs wait on you, said in the bar's description. */
const countWords = (count: number): string => `${count} ${count === 1 ? 'run' : 'runs'}, across every factory`;

/**
 * The runs waiting on you, read as the bell reads them (`openRunsQuery`): a row each, or a line saying nothing waits on you; a read that failed
 * says so, and one still on its way says that.
 */
export function WaitingBar() {
  const runs = useQuery(openRunsQuery());
  const rows = runs.data ? bellRows(runs.data.waiting) : null;
  return (
    <FloatingBar title="Waiting on you" description={rows ? countWords(rows.length) : 'Across every factory'}>
      {rows ? (
        rows.length ? (
          <ul data-waiting className="space-y-2">
            {rows.map((row) => (
              <WaitingRow key={row.run} row={row} />
            ))}
          </ul>
        ) : (
          <p data-waiting className="text-sm text-muted-foreground">
            Nothing waits on you.
          </p>
        )
      ) : (
        <p className="text-sm">{runs.error ? `The runs could not be read: ${runs.error.message}` : 'Reading the runs…'}</p>
      )}
    </FloatingBar>
  );
}
