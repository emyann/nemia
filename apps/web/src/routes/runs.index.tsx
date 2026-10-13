import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { FinishedTable } from '../components/FinishedTable';
import { FlightTable } from '../components/FlightTable';
import { WaitingCard } from '../components/WaitingCard';
import { finishedRunsQuery, openRunsQuery } from '../lib/api';
import { finishedSearch, pageAt } from '../lib/finished';
import { ink } from '../lib/meaning';
import { PageName, Plate, ScanLines } from '../components/look';

export const Route = createFileRoute('/runs/')({
  validateSearch: finishedSearch,
  loaderDeps: ({ search }) => ({ factory: search.factory, page: pageAt(search) }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(openRunsQuery(deps.factory)),
      context.queryClient.ensureQueryData(finishedRunsQuery(deps.factory, deps.page)),
    ]),
  component: Runs,
  staticData: { fullBleed: true },
  pendingComponent: Loading,
  errorComponent: Failed,
});

/** The page's frame, as wide as the window lets it: its name, alone, over the look's ground, then what it holds. */
function Page({ state, children }: { state: string; children: ReactNode }) {
  return (
    <ScanLines className="min-h-full px-4 py-6 sm:px-8">
      <article data-runs-page={state} className="mx-auto flex w-full max-w-[1360px] flex-col gap-10">
        <PageName>Runs</PageName>
        {children}
      </article>
    </ScanLines>
  );
}

/** The page while its two reads are on their way. */
function Loading() {
  return (
    <Page state="loading">
      <p role="status" className="m-0 text-body-medium text-on-surface-variant">
        Loading the runs…
      </p>
    </Page>
  );
}

/** The page when a read failed: that it did, and the reason as it came. */
function Failed({ error }: { error: unknown }) {
  return (
    <Page state="error">
      <div role="alert" className="flex flex-col gap-1">
        <p className={`m-0 text-body-medium ${ink.failure}`}>The runs could not be loaded.</p>
        <p data-error-reason className="m-0 text-body-small break-words text-on-surface-variant">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    </Page>
  );
}

/** A section of the page: its plate, alone on its line, then what it holds. */
function Section({ name, plate, children }: { name: string; plate: ReactNode; children: ReactNode }) {
  return (
    <section data-section={name} className="flex flex-col gap-4">
      <div className="flex items-center">{plate}</div>
      {children}
    </section>
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
 * row; the runs in flight, a quiet table; and one page of the finished runs, the address' page, newest finished first. Each plate says
 * the api's own count. Every time on the page is a fact to the minute, said against the instant its answer was read at: nothing here
 * counts by itself.
 */
function Runs() {
  const search = Route.useSearch();
  const { data: open } = useSuspenseQuery(openRunsQuery(search.factory));
  const { data: finished } = useSuspenseQuery(finishedRunsQuery(search.factory, pageAt(search)));
  const asOf = new Date(open.asOf);
  const { counts } = open;
  return (
    <Page state="loaded">
      <Section name="waiting" plate={<Plate count={counts.waiting} title="Waiting on you" quiet={counts.waiting === 0} />}>
        {open.waiting.length === 0 ? (
          <Nothing>Nothing waits on you.</Nothing>
        ) : (
          <div data-cards className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
        {finished.total === 0 ? <Nothing>No run has finished yet.</Nothing> : <FinishedTable page={finished} />}
      </Section>
    </Page>
  );
}
