/**
 * A run's header, on its page: its title (the brief's first line), where it stands, its id to copy, its labels, edited in place, three
 * tiles — what it took, what it cost and how many rounds it went — and its menu (Remove, Hold or Lift, Prune).
 */
import { useQueryClient } from '@tanstack/react-query';
import { clockBreakdown, costBreakdown, roundsBreakdown, roundsOf } from '@/lib/breakdown';
import { spentTitle } from '@/lib/cost';
import { namespaceOf } from '@/lib/factories';
import { clockCounts, inFlight, runClock, standingOf, titleOf } from '@/lib/factory';
import { labelRun } from '@/lib/api/labels';
import { container, type Hue } from '@/lib/meaning';
import { runsMoved } from '@/lib/runWrites';
import type { RunDetail } from '@/lib/runView';
import { whenWords } from '@/lib/runWords';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';
import { ENDED } from '@/lib/words';
import { CopyId, StatTile } from '../look';
import { Labels } from '../field/Labels';
import { RunMenu } from './RunMenu';

/** The hue of where a run stands (`standingOf`): waiting on you, in flight, finished, or called off. */
const standingHue = (standing: string): Hue =>
  standing === 'waiting on you' ? 'yours' : standing === 'in flight' ? 'alive' : standing === ENDED.cancelled.word ? 'grey' : 'sage';

/**
 * The run's labels, a person's edited in place: an edit reads the run's object again (`exact`, as a hold does) and every list it is on
 * (`runsMoved`), so the chip shows with no reload.
 */
function RunLabels({ run }: { run: RunDetail }) {
  const queryClient = useQueryClient();
  const edit = (edits: readonly string[]) =>
    labelRun(namespaceOf(run.labels.factory), run.id, edits).then(() => runsMoved(queryClient, run.id));
  return <Labels labels={run.labels} edit={edit} />;
}

/**
 * The three tiles: what the run took, or how long it has been at work, as its card's clock says it (`runClock`), moving every second
 * while a task of it runs (`clockCounts`), the start, the end and the wall time on hover; what it cost, every step's tries (`≥` where an
 * ended attempt has none on it), by step where the answer carries the steps' costs; and how many rounds it went (`roundsOf`), by round.
 */
function Tiles({ run }: { run: RunDetail }) {
  const finished = !inFlight(run);
  const now = useNow(clockCounts(run, finished) ? 1_000 : 30_000);
  const clock = runClock(run, now, finished);
  const rounds = String(roundsOf(run.timeline.rounds, run.startedAt !== null));
  const asOf = new Date(now);
  return (
    <div data-tiles className="flex flex-wrap gap-2">
      <span data-run-took title={clock.title}>
        <StatTile
          hue="grey"
          label="Took"
          value={clock.words}
          breakdown={run.clock ? clockBreakdown(run.clock, clock.words, whenWords(new Date(run.createdAt), asOf)) : null}
        />
      </span>
      <span data-run-cost title={run.cost ? spentTitle(run.cost, "the run's tries") : undefined}>
        <StatTile
          hue="money"
          label="Cost"
          value={run.cost?.said ?? 'none'}
          breakdown={run.cost && run.stepCosts ? costBreakdown(run.cost, run.stepCosts) : null}
        />
      </span>
      <span data-run-rounds>
        <StatTile
          hue="grey"
          label="Rounds"
          value={rounds}
          breakdown={roundsBreakdown(run.timeline.rounds, run.timeline.run, `${rounds} round${rounds === '1' ? '' : 's'}`)}
        />
      </span>
    </div>
  );
}

/** The header of the run `run`'s page: its title and where it stands, its menu, its id, its labels and its three tiles. */
export function RunHeader({ run }: { run: RunDetail }) {
  const standing = standingOf(run);
  return (
    <header data-run-header className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 data-run-title className="m-0 min-w-0 text-title-large font-title-large break-words">
            {titleOf(run)}
          </h1>
          <span data-run-state={standing} className={cn('rounded px-2 py-0.5 text-label-medium', container[standingHue(standing)])}>
            {standing}
          </span>
        </div>
        <RunMenu run={run} />
      </div>
      <CopyId id={run.id} />
      <RunLabels run={run} />
      <Tiles run={run} />
    </header>
  );
}
