import { Link } from '@tanstack/react-router';
import { RunGone } from './RunGone';
import { AsksOfYou } from './AsksOfYou';
import { RunHeader } from './RunHeader';
import { RunCanvas } from './RunCanvas';
import { RunResult } from './RunResult';
import { Ledger } from './Ledger';
import { Receipts } from './Receipts';
import { KindsBehind } from './KindsBehind';
import { readGone } from '@/lib/api/gone';
import { useRunView, type RunDetail } from '@/lib/runView';
import { seatFactory } from '../nav/nav';
import { useSeat } from '../nav/useSeat';

/**
 * The page of a run, or, when the store has no run of its id as the page loads (`loadRun`), the words that say so, by its id: the
 * address of a run removed, or of none.
 */
export function RunPage({ runId, gone }: { runId: string; gone: boolean }) {
  if (gone) {
    return (
      <div className="space-y-3">
        <BackToRuns />
        <RunGone id={runId} />
      </div>
    );
  }
  return <RunRead runId={runId} />;
}

/**
 * The page of the run `runId`, keyed by run, so where the nodes were dragged belongs to the run they were on. A run removed
 * while the page is open is said to be gone: the query keeps its last read, which is not drawn as if the run were still there.
 */
function RunRead({ runId }: { runId: string }) {
  const { view: run, error } = useRunView(runId);
  if (readGone(error)) {
    return (
      <div className="space-y-3">
        <BackToRuns />
        <RunGone run={run} />
      </div>
    );
  }
  return <Run key={run.id} run={run} />;
}

/**
 * One run, top to bottom, in the order a person reads it: what it asks of them, each ask pointing to its step (`AsksOfYou`); its header
 * — its title, where it stands, its id, its labels, three tiles and its menu (`RunHeader`) — with its warning and the kinds it is behind
 * on under it; the graph, the whole width of the page, whose edges carry the packets that passed between steps, a step pressed on it
 * inspected in the frame's bar; the ask beside the result (`RunResult`); every step in one part (`Ledger`); and its receipts, folded
 * (`Receipts`). The machine's detail is one fold down, never gone.
 */
function Run({ run }: { run: RunDetail }) {
  return (
    <article className="space-y-6">
      <BackToRuns />

      <AsksOfYou run={run} />

      <RunHeader run={run} />

      {run.warning && (
        <p data-run-warning className="rounded border border-outline px-3 py-2 text-body-medium text-muted-foreground">
          {run.warning}
        </p>
      )}

      <KindsBehind run={run} />

      <section aria-label="The run's steps as a graph">
        <RunCanvas run={run} />
      </section>

      <RunResult run={run} />

      <Ledger run={run} />

      <Receipts run={run} />
    </article>
  );
}

/** The way back to the runs: the factory's, on a page under its path, else every factory's. */
export function BackToRuns() {
  const factory = seatFactory(useSeat());
  const className = 'text-body-medium text-muted-foreground hover:text-foreground';
  return factory === undefined ? (
    <Link to="/runs" className={className}>
      ← Runs
    </Link>
  ) : (
    <Link to="/factories/$factory/runs" params={{ factory }} className={className}>
      ← Runs
    </Link>
  );
}
