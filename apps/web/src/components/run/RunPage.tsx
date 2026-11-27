import { RunGone } from './RunGone';
import { AsksOfYou } from './AsksOfYou';
import { RunHeader } from './RunHeader';
import { RunCanvas } from './RunCanvas';
import { RunResult } from './RunResult';
import { Ledger } from './Ledger';
import { Receipts } from './Receipts';
import { KindsBehind } from './KindsBehind';
import { FirstHint } from '../welcome/FirstHint';
import { readGone } from '@/lib/api/gone';
import { useRunView, type RunDetail } from '@/lib/runView';
import { titleOf } from '@/lib/factory';
import { factoryLevel, runLevel, runsLevel, Trail } from '../nav/Trail';
import { seatFactory } from '../nav/nav';
import { useSeat } from '../nav/useSeat';
import { Body } from '@/components/ui/ds';

/**
 * The page of a run, or, when the store has no run of its id as the page loads (`loadRun`), the words that say so, by its id: the
 * address of a run removed, or of none.
 */
export function RunPage({ runId, gone }: { runId: string; gone: boolean }) {
  if (gone) {
    return (
      <div className="space-y-3">
        <RunTrail runId={runId} />
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
        <RunTrail runId={runId} name={titleOf(run)} />
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
 * (`Receipts`). The machine's detail is one fold down, never gone. Where it is the welcome's first card's run, the hint of the beat it
 * stands at is drawn where that beat is (`FirstHint`): the gate's over the asks, the card's under the header, the steps' over the graph
 * and succeeded's over the result.
 */
function Run({ run }: { run: RunDetail }) {
  return (
    <article className="space-y-6">
      <RunTrail runId={run.id} name={titleOf(run)} />

      <FirstHint run={run} beat="gate" />

      <AsksOfYou run={run} />

      <RunHeader run={run} />

      <FirstHint run={run} beat="card" />

      {run.warning && (
        <Body size="medium" data-run-warning className="rounded border border-outline px-3 py-2">
          {run.warning}
        </Body>
      )}

      <KindsBehind run={run} />

      <FirstHint run={run} beat="steps" />

      <section aria-label="The run's steps as a graph">
        <RunCanvas run={run} />
      </section>

      <FirstHint run={run} beat="succeeded" />

      <RunResult run={run} />

      <Ledger run={run} />

      <Receipts run={run} />
    </article>
  );
}

/**
 * Where a run's page, or one of its steps', is: its factory where the page sits under one, the runs, the run `runId` by its `name` (its
 * id while it is still read, or where it is gone), and the `step` whose page this is, none on the run's own.
 */
export function RunTrail({ runId, name = runId, step }: { runId: string; name?: string; step?: string }) {
  const factory = seatFactory(useSeat());
  return (
    <Trail
      levels={[
        ...factoryLevel(factory),
        runsLevel(factory),
        step === undefined ? { name } : runLevel(factory, runId, name),
        ...(step === undefined ? [] : [{ name: step }]),
      ]}
    />
  );
}
