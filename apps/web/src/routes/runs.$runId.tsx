import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { RunGone } from '../components/run/RunGone';
import { AsksOfYou } from '../components/run/AsksOfYou';
import { RunHeader } from '../components/run/RunHeader';
import { RunCanvas } from '../components/run/RunCanvas';
import { RunResult } from '../components/run/RunResult';
import { Ledger } from '../components/run/Ledger';
import { Receipts } from '../components/run/Receipts';
import { KindsBehind } from '../components/run/KindsBehind';
import { readGone } from '../lib/api/gone.ts';
import { loadRun, useRunView, type RunDetail } from '../lib/runView';
import { barValue } from '../lib/bar';

/**
 * `step`, the old address of one step of the run and the one a message names a step by (`broughtOf`, `lib/stepLink.ts`), opens that
 * step in the frame's bar: the page is loaded again in place of that address, at `?bar=step:<run>/<step>`, so Back does not return to it.
 */
export const Route = createFileRoute('/runs/$runId')({
  validateSearch: (search: Record<string, unknown>): { step?: string } =>
    typeof search.step === 'string' && search.step ? { step: search.step } : {},
  beforeLoad: ({ search, params }) => {
    if (!search.step) return;
    const bar = barValue({ kind: 'step', run: params.runId, step: search.step });
    throw redirect({ to: '/runs/$runId', params, search: { bar }, replace: true });
  },
  loader: ({ context, params }) => loadRun(context.queryClient, params.runId),
  component: RunPage,
  errorComponent: ({ error }) => (
    <div className="space-y-3">
      <BackToRuns />
      <p className="text-body-medium text-failure">Could not load this run: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
});

/**
 * The page of a run, or, when the store has no run of its id as the page loads (`loadRun`), the words that say so, by its id: the
 * address of a run removed, or of none.
 */
function RunPage() {
  const { runId } = Route.useParams();
  if (Route.useLoaderData().gone) {
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

function BackToRuns() {
  return (
    <Link to="/runs" className="text-body-medium text-muted-foreground hover:text-foreground">
      ← Runs
    </Link>
  );
}
