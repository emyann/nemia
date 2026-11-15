import { useSuspenseQuery, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { FinishedTable } from './FinishedTable';
import { FlightTable } from './FlightTable';
import { WaitingCard } from './WaitingCard';
import { SelectorField } from '../field/SelectorField';
import { finishedRunsQuery, openRunsQuery } from '@/lib/api/runs';
import { runLinesQuery } from '@/lib/api/run';
import { ReadRefusal } from '@/lib/api/read';
import { trailOf } from '@/lib/finished';
import { ink } from '@/lib/meaning';
import { Plate, ScanLines } from '../look';
import { Button } from '../ui/ds';
import { useBar } from '@/lib/useBar';

/** What the runs page reads of its address: the factory its path names, none for every factory's, its trail and its label selector. */
type RunsAt = { factory?: string; older?: string; l?: string };

/**
 * What the runs page loads before it draws, at `at`: the open runs and the finished runs' page its trail leads to, with each finished
 * run's lines. Where a trail is refused as stale (422), `firstPage` is called, which throws the route's redirect to the first page.
 * @param client The board's query client.
 * @param at What the page reads of its address.
 * @param firstPage Throws the redirect to the first page of the finished runs.
 */
export const loadRuns = (client: QueryClient, at: RunsAt, firstPage: () => never) =>
  Promise.all([
    client.ensureQueryData(openRunsQuery(at.factory, at.l)),
    client
      .ensureQueryData(finishedRunsQuery(at.factory, trailOf(at), at.l))
      .then((page) => Promise.all(page.runs.map((run) => client.prefetchQuery(runLinesQuery(run.id)))))
      .catch((error: unknown) => {
        if (trailOf(at).length > 0 && error instanceof ReadRefusal && error.status === 422) firstPage();
        throw error;
      }),
  ]);

/** The page's frame, as wide as the window lets it, over the look's ground: what it holds; the top bar names it. */
function Frame({ state, children }: { state: string; children: ReactNode }) {
  return (
    <ScanLines className="min-h-full px-4 py-6 @md/page:px-8">
      <article data-runs-page={state} className="mx-auto flex w-full max-w-[1360px] flex-col gap-10">
        {children}
      </article>
    </ScanLines>
  );
}

/** The page while its two reads are on their way. */
export function RunsLoading() {
  return (
    <Frame state="loading">
      <p role="status" className="m-0 text-body-medium text-on-surface-variant">
        Loading the runs…
      </p>
    </Frame>
  );
}

/**
 * The page when a read failed: that it did, and the reason as it came.
 */
export function RunsFailed({ error }: { error: unknown }) {
  return (
    <Frame state="error">
      <div role="alert" className="flex flex-col gap-1">
        <p className={`m-0 text-body-medium ${ink.failure}`}>The runs could not be loaded.</p>
        <p data-error-reason className="m-0 text-body-small break-words text-on-surface-variant">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    </Frame>
  );
}

/** A section of the page: its plate, alone on its line, then what it holds, and under it what opens more of it (`foot`). */
function Section({ name, plate, foot, children }: { name: string; plate: ReactNode; foot?: ReactNode; children: ReactNode }) {
  return (
    <section data-section={name} className="flex flex-col gap-4">
      <div className="flex items-center">{plate}</div>
      {children}
      {foot && <div className="flex">{foot}</div>}
    </section>
  );
}

/** The button under the runs that wait on you that opens, and closes, the bar of the runs that wait on you in every factory. */
function AcrossFactories() {
  const { open, toggle } = useBar();
  return (
    <Button
      data-waiting-opener
      variant="outlined"
      size="small"
      aria-expanded={open?.kind === 'waiting'}
      onPress={() => toggle({ kind: 'waiting' })}
    >
      Waiting in every factory
    </Button>
  );
}

/** What a section says when it holds nothing. */
function Nothing({ children }: { children: string }) {
  return (
    <p data-nothing className="m-0 text-body-medium text-on-surface-variant">
      {children}
    </p>
  );
}

/**
 * The runs, in three parts, by two reads the api filters by the address' factory: what waits on a person, a card a run and never a
 * row; the runs in flight, a quiet table; and one page of the finished runs, the one the address' trail leads to, newest finished
 * first. Each plate says the api's own count, and under what waits a button opens the bar of what waits on you in every factory. Every
 * time on the page is a fact to the minute, said against the instant its answer was read at: nothing here counts by itself.
 */
export function RunsPage({ at, onLabel }: { at: RunsAt; onLabel: (selector: string | undefined) => void }) {
  const { data: open } = useSuspenseQuery(openRunsQuery(at.factory, at.l));
  const trail = trailOf(at);
  const { data: finished } = useSuspenseQuery(finishedRunsQuery(at.factory, trail, at.l));
  const asOf = new Date(open.asOf);
  const { counts } = open;
  return (
    <Frame state="loaded">
      <SelectorField key={at.l ?? ''} selector={at.l} onSelect={onLabel} />
      <Section
        name="waiting"
        plate={<Plate count={counts.waiting} title="Waiting on you" quiet={counts.waiting === 0} />}
        foot={<AcrossFactories />}
      >
        {open.waiting.length === 0 ? (
          <Nothing>Nothing waits on you.</Nothing>
        ) : (
          <div data-cards className="grid grid-cols-1 gap-4 @5xl/page:grid-cols-2">
            {open.waiting.map((run) => (
              <WaitingCard key={run.id} run={run} asOf={asOf} />
            ))}
          </div>
        )}
      </Section>
      <Section name="in-flight" plate={<Plate count={counts.inFlight} title="In flight" hue="alive" quiet={counts.inFlight === 0} />}>
        {open.inFlight.length === 0 ? <Nothing>Nothing is in flight.</Nothing> : <FlightTable runs={open.inFlight} asOf={asOf} />}
      </Section>
      <Section name="finished" plate={<Plate count={counts.finished} title="Finished" hue="grey" quiet={counts.finished === 0} />}>
        {finished.total === 0 && finished.runs.length === 0 ? (
          <Nothing>No run has finished yet.</Nothing>
        ) : (
          <FinishedTable page={finished} trail={trail} />
        )}
      </Section>
    </Frame>
  );
}
