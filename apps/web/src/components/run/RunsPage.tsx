import { useSuspenseQuery, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { FrameGrid } from '@/components/frame/FrameGrid';
import { FinishedTable } from './FinishedTable';
import { FlightTable } from './FlightTable';
import { WaitingCard } from './WaitingCard';
import { SelectorField } from '../field/SelectorField';
import { finishedRunsQuery, openRunsQuery } from '@/lib/api/runs';
import { runLinesQuery } from '@/lib/api/run';
import { ReadRefusal, troubleOf } from '@/lib/api/read';
import { trailOf } from '@/lib/finished';
import { ink } from '@/lib/meaning';
import { Reading, ScanLines, SectionHead } from '../look';
import { Body, Button, Skeleton } from '../ui/ds';
import { judged } from '@/lib/api/judged';
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

/** The page's frame, the grid's wide span, over the look's ground: what it holds; the top bar names it. */
function Frame({ state, children }: { state: string; children: ReactNode }) {
  return (
    <ScanLines className="min-h-full">
      <FrameGrid span="wide">
        <article data-runs-page={state} className="flex w-full flex-col gap-10">
          {children}
        </article>
      </FrameGrid>
    </ScanLines>
  );
}

/** A section still being read: its count chip's place, then what it holds. */
function SectionReading({ chip, children }: { chip: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5">
      <Skeleton shape="rectangle" className={`h-8 rounded-none ${chip}`} />
      {children}
    </div>
  );
}

/** A table's rows still being read, each the height of a row of the runs' tables. */
function RowsReading({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-px">
      {Array.from({ length: rows }, (_, at) => (
        <Skeleton key={at} shape="rectangle" className="h-10 rounded-none" />
      ))}
    </div>
  );
}

/**
 * The page while its two reads are on their way: the shape of its three parts — the label field, the cards that wait on you, the rows in
 * flight and the finished rows — named once for a screen reader. Shown at once: the router holds a pending page back a second already.
 */
export function RunsLoading() {
  return (
    <Frame state="loading">
      <Reading label="Loading the runs…" at="now" className="flex flex-col gap-10">
        <Skeleton shape="rectangle" className="h-11 max-w-xl rounded-none" />
        <SectionReading chip="w-52">
          <div className="grid grid-cols-1 gap-4 @5xl/page:grid-cols-2">
            <Skeleton shape="rectangle" className="h-44 rounded-none" />
            <Skeleton shape="rectangle" className="h-44 rounded-none" />
          </div>
        </SectionReading>
        <SectionReading chip="w-36">
          <RowsReading rows={3} />
        </SectionReading>
        <SectionReading chip="w-36">
          <RowsReading rows={6} />
        </SectionReading>
      </Reading>
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
        <Body size="medium" className={`m-0 ${ink.failure}`}>
          The runs could not be loaded.
        </Body>
        <Body size="small" data-error-reason className="m-0 break-words">
          {troubleOf(error).words}
        </Body>
      </div>
    </Frame>
  );
}

/** A section of the page: its count chip, alone on its line, then what it holds, and under it what opens more of it (`foot`). */
function Section({ name, head, foot, children }: { name: string; head: ReactNode; foot?: ReactNode; children: ReactNode }) {
  return (
    <section data-section={name} className="flex flex-col gap-3.5">
      <div className="flex items-center">{head}</div>
      {children}
      {foot && <div className="flex">{foot}</div>}
    </section>
  );
}

/** The outlined button that opens, and closes, the bar of the runs that wait on you in every factory. */
function AcrossFactories() {
  const { open, toggle } = useBar();
  return (
    <Button
      data-waiting-opener
      variant="outlined"
      size="xsmall"
      aria-expanded={open?.kind === 'waiting'}
      onPress={() => toggle({ kind: 'waiting' })}
      className="-mx-3 text-on-surface"
    >
      Waiting in every factory ›
    </Button>
  );
}

/** What a section says when it holds nothing. */
function Nothing({ children }: { children: string }) {
  return (
    <Body size="medium" data-nothing className="m-0">
      {children}
    </Body>
  );
}

/**
 * The runs, in three parts, by two reads the api filters by the address' factory: what waits on a person, a card a run and never a
 * row; the runs in flight, a quiet table, each row saying how many of the page's open runs wait on it; and one page of the finished
 * runs, the one the address' trail leads to, newest finished first. Each part's head is a count chip in its colour saying the api's
 * own count; where nothing waits on you that part is one line, its chip quiet, and an outlined button opens the bar of what waits on you in
 * every factory. Every
 * time on the page is a fact to the minute, said against the instant its answer was read at: nothing here counts by itself.
 */
export function RunsPage({ at, onLabel }: { at: RunsAt; onLabel: (selector: string | undefined) => void }) {
  const { data: open } = useSuspenseQuery(openRunsQuery(at.factory, at.l));
  const trail = trailOf(at);
  const { data: finished } = useSuspenseQuery(finishedRunsQuery(at.factory, trail, at.l));
  const asOf = new Date(open.asOf);
  const { counts } = open;
  const among = [...open.waiting, ...open.inFlight].filter((run) => judged(run));
  return (
    <Frame state="loaded">
      <SelectorField key={at.l ?? ''} selector={at.l} onSelect={onLabel} />
      {open.waiting.length === 0 ? (
        <section data-section="waiting" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SectionHead count={counts.waiting} word="Waiting on you" tone="yours" />
          <Nothing>Nothing waits on you.</Nothing>
          <AcrossFactories />
        </section>
      ) : (
        <Section name="waiting" head={<SectionHead count={counts.waiting} word="Waiting on you" tone="yours" />} foot={<AcrossFactories />}>
          <div data-cards className="grid grid-cols-1 gap-4 @5xl/page:grid-cols-2">
            {open.waiting.map((run) => (
              <WaitingCard key={run.id} run={run} among={among} asOf={asOf} />
            ))}
          </div>
        </Section>
      )}
      <Section name="in-flight" head={<SectionHead count={counts.inFlight} word="In flight" tone="alive" />}>
        {open.inFlight.length === 0 ? (
          <Nothing>Nothing is in flight.</Nothing>
        ) : (
          <FlightTable runs={open.inFlight} among={among} asOf={asOf} />
        )}
      </Section>
      <Section name="finished" head={<SectionHead count={counts.finished} word="Finished" tone="rest" />}>
        {finished.total === 0 && finished.runs.length === 0 ? (
          <Nothing>No run has finished yet.</Nothing>
        ) : (
          <FinishedTable page={finished} trail={trail} />
        )}
      </Section>
    </Frame>
  );
}
