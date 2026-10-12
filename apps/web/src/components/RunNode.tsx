import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { decisionQuery, type RunDetail, type RunSummary, type RunWaiting } from '@/lib/api';
import { TryTag } from './TryTag';
import { needLine, needsOf, stepAnchor } from '@/lib/asks';
import { spentTitle } from '@/lib/cost';
import { decisionStamp, isDecidable, touchedSummary } from '@/lib/decide';
import { clockCounts, repoName, runClock, titleOf, toDecideOf, waitsOnRuns, waitsOnYou } from '@/lib/factory';
import { flowSteps, railOf, tilesOf } from '@/lib/flow';
import { decideLine, gateOfSummary } from '@/lib/gate';
import { useNow } from '@/lib/useNow';
import { RouteLink } from './AgentParts';
import { CardGate, type Taken } from './CardGate';
import { FavoriteStar } from './FavoriteStar';
import { CardLift } from './LiftHold';
import { StepRail, StepTiles } from './StepRail';

/**
 * `finished` is a run not in flight: on the floor only when finished runs are asked for, and dimmed.
 * `open` is a run whose card is opened on its steps: `detail` its record once read, which gives each tile its attempt and cost, and
 * `trouble` why it could not be read. `inspected` is a run the frame's bar shows, and `selected` the step of it the bar shows.
 * `onToggle` opens or closes the card, and `onStep` shows a step of it in the bar. `reads` is a line per run it reads as context, its id
 * and title (`readsLines`).
 */
export type RunNodeData = {
  run: RunSummary;
  reads: string[];
  finished: boolean;
  open: boolean;
  detail: RunDetail | null;
  trouble: string | null;
  inspected: boolean;
  selected: string | null;
  onToggle: (runId: string) => void;
  onStep: (runId: string, step: string) => void;
};
export type RunFlowNode = Node<RunNodeData, 'run'>;

/**
 * One run on the Factory floor: what was asked, where, what each step is doing — a small flowchart of them (`StepRail`) — and for how long.
 *
 * Its star puts it under the sidebar's Favorites (`FavoriteStar`). The chevron opens it: the card grows to the right with every step a tile
 * (`StepTiles`), and a tile shows its step in the frame's bar. A click on the card shows the run there, and the card is ringed while it
 * does (`lookOf`). The title opens the run's page, and is not preloaded on hover: only an open run reads its detail. `w-88` is
 * `CARD_WIDTH`, narrower than the grid's cell, which leaves the gap between cards.
 *
 * - Its clock (`runClock`) says how long the run took, or has been at work, from its first filing — its sessions' and checks' time,   a
 *   wait counted for nothing, the wall time on hover — or how long it has waited before that; it moves every second while it counts
 *   (`clockCounts`), and every 30 s otherwise.
 * - A card nobody has decided the result of is ringed, and not dimmed as a finished card is: it is the one finished card on the floor
 *   that waits for a person rather than for a machine.
 * - Beside its id, where its steps work: its repository, or folders the run made (`workspace: folder`); a try of an agent, a folder   run
 *   of the store's own, is tagged with its agent instead, since its folder is on no page.
 * - On whom a run started `--after` waits, and a person's hold on it (the CLI's `hold`), each in the CLI `ls`'s word, yours when only a
 *   person moves   it, with what to do on hover (`WaitingLine`). A hold is said instead of a gate: while it stands, nothing of the run is
 *   asked of anyone.
 * - A run that waits on runs that may still ship, and on nothing else (`waitsOnRuns`), is a ghost until it starts: dimmed and dashed, as
 *   the queue lane draws a card not started, each run it waits on a link to that run.
 * - What a person has to know to act, besides the gate's own `approve <step>`: a step's question, or a session the harness blocked, two
 *   lines each, whole on hover, each a link to its step on the run's page.
 * - The gate, answered here (`CardGate`). Once answered, what the card said, through the state the answer was given in and the one it
 *   moved the run to (the step approved, or the try asked), until the run moves on from that, the tick filing it, or back, the answer
 *   taken back; the answer kept from the last render is adjusted as the render that sees the new state runs.
 * - A result nobody decided, in a line that fits, whole on hover in the CLI `ls`'s words, a link to where it is decided on the run's page.
 * - Once opened: how far a run waiting on you reaches (`TouchedLine`), and why its record, which adds each tile's attempt and cost,   could
 *   not be read.
 * - In its footer, so the card is no taller for them than a line (`CELL_HEIGHT`): what it has cost, `≥` where an ended attempt has none
 *   on it; the tokens its sessions used, `≥` where one measured none, their split on hover; and on its right, or under them where both   do
 *   not fit, its chips; the hold lifted here, as the CLI's `hold --off` lifts it (`CardLift`); pruned; and why the run is not judged
 *   (`RunSummary.unreadable`), whole on hover; and how many runs it reads as context, which it does not wait on, each on hover.
 * - A handle on its left where the edge from a run it waits on comes in, and one on its right where the edge into each card that   waits on
 *   it leaves.
 */
export function RunNode({
  data: { run, reads, finished, open, detail, trouble, inspected, selected, onToggle, onStep },
}: NodeProps<RunFlowNode>) {
  const now = useNow(clockCounts(run, finished) ? 1_000 : 30_000);
  const cancelled = run.cancelledAt !== null;
  const title = titleOf(run);
  const decide = toDecideOf(run);
  const look = lookOf(run, finished, inspected);
  const gate = gateOfSummary(run);
  const needs = needsOf(run).filter((need) => !(need.kind === 'approve' && need.step === gate?.step));
  const stamp = run.steps.map((step) => `${step.name}:${step.status}`).join('|');
  const [taken, setTaken] = useState<Taken | null>(null);
  if (taken && stamp !== taken.stamp && stamp !== taken.next) setTaken(taken.next === undefined ? { ...taken, next: stamp } : null);
  const said = taken && stamp === (taken.next ?? taken.stamp) ? taken.said : null;
  const clock = runClock(run, now, finished);
  const names = useMemo(() => run.steps.map((step) => step.name), [run.steps]);
  const edgeSteps = useMemo(() => flowSteps(run), [run]);
  const rail = useMemo(() => railOf(names, run.graph, edgeSteps, cancelled), [names, run.graph, edgeSteps, cancelled]);
  const tiles = useMemo(
    () => (open ? tilesOf(names, run.graph, edgeSteps, cancelled) : null),
    [open, names, run.graph, edgeSteps, cancelled],
  );

  return (
    <Card size="sm" {...look.marks} className={`w-fit flex-row items-start gap-0 shadow-sm transition-opacity ${look.className}`}>
      <div className="flex w-88 shrink-0 flex-col gap-3">
        <div className="min-w-0 px-3">
          <CardTitle run={run} title={title} open={open} onToggle={onToggle} />
          <p className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="truncate font-mono" title={run.id}>
              {run.id}
            </span>
            {run.try ? (
              <TryTag agent={run.try.agent} />
            ) : (
              <span
                className="shrink-0"
                title={run.repo ?? (run.work ? `Its steps work in folders under ${run.work}` : 'Its steps work in folders the run made')}
              >
                {run.repo ? repoName(run.repo) : 'folders'}
              </span>
            )}
          </p>
          {run.waiting && <WaitingLine waiting={run.waiting} ghost={look.ghost} />}
          {run.holding && (
            <p
              data-holding={run.holding.onYou ? 'on-you' : 'on-runs'}
              title={`${run.holding.word}\n${run.holding.advice}`}
              className={`mt-1 line-clamp-2 font-mono text-[11px] break-words ${run.holding.onYou ? 'text-yours' : 'text-muted-foreground'}`}
            >
              {run.holding.word}
            </p>
          )}
        </div>

        <StepRail run={run} flow={rail} />

        {needs.length > 0 && (
          <ul aria-label="Needs" className="space-y-0.5 px-3 text-[11px]">
            {needs.map((need) => (
              <li key={need.step} title={needLine(need)} className="line-clamp-2 break-words">
                <RouteLink
                  to="/runs/$runId"
                  params={{ runId: run.id }}
                  hash={stepAnchor(need.step)}
                  data-need={need.kind}
                  data-step={need.step}
                  className="nodrag text-yours hover:underline"
                >
                  {needLine(need)}
                </RouteLink>
              </li>
            ))}
          </ul>
        )}

        {said ? (
          <p data-taken className="px-3 text-[11px] break-words text-muted-foreground">
            {said}
          </p>
        ) : gate ? (
          <CardGate
            runId={run.id}
            gate={gate}
            title={decide?.kind === 'approve' && decide.step === gate.step ? decide.said : `approve ${gate.step}`}
            stamp={stamp}
            onTaken={setTaken}
          />
        ) : null}

        {decide?.kind === 'result' && !cancelled && (
          <p title={decide.said} className="line-clamp-2 px-3 text-[11px] break-words">
            <RouteLink
              to="/runs/$runId"
              params={{ runId: run.id }}
              hash="decide"
              data-to-decide="result"
              className="nodrag text-yours hover:underline"
            >
              {decideLine(decide.branches)}
            </RouteLink>
          </p>
        )}

        {open && run.waitingOnYou.length > 0 && <TouchedLine run={run} />}

        {open && trouble && <p className="px-3 text-[11px] text-failure">{trouble}</p>}

        <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t px-3 pt-2">
          <Took run={run} clock={clock} />
          <Chips run={run} decide={decide !== null} cancelled={cancelled} reads={reads} />
        </div>
      </div>

      {tiles && <StepTiles run={run} detail={detail} flow={tiles} selected={selected} onStep={(step) => onStep(run.id, step)} />}

      <Handle type="target" position={Position.Left} isConnectable={false} className="opacity-0" />
      <Handle type="source" position={Position.Right} isConnectable={false} className="opacity-0" />
    </Card>
  );
}

/**
 * A run card's title line: its title, a link to the run's page, not preloaded; its star (`FavoriteStar`); and the chevron that opens or
 * closes its steps (`onToggle`). Neither button drags the card nor shows the run in the bar.
 */
function CardTitle({ run, title, open, onToggle }: { run: RunSummary; title: string; open: boolean; onToggle: (runId: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Link
        to="/runs/$runId"
        params={{ runId: run.id }}
        preload={false}
        title={title}
        className="nodrag block min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
      >
        {title}
      </Link>
      <FavoriteStar favorite={{ kind: 'run', run: run.id }} name={title} className="nodrag -my-1" />
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Hide steps' : 'Show steps'}
        title={open ? 'Hide its steps' : 'Open its steps'}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(run.id);
        }}
        className="nodrag -mr-1.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ChevronRight aria-hidden className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
    </div>
  );
}

/** How a ghost's card is drawn: dashed and dimmed, as `QueueLane` draws a card not started, and clearer on hover. */
const GHOST = 'border border-dashed border-neutral-400/70 opacity-60 shadow-none hover:opacity-90 dark:border-neutral-600';

/** How a run's card is drawn: whether it is a ghost, its classes, and the marks a check reads it by, a ghost's and the one inspected. */
type Look = { ghost: boolean; className: string; marks: { 'data-ghost-run'?: true; 'data-inspected'?: true } };

/**
 * How a run's card is drawn: ringed in the focus colour, and marked, while the frame's bar shows it (`inspected`), and drawn whole, so a
 * finished card or a ghost is read as clearly as the bar beside it; else ringed while a person has its result to decide (`toDecideOf`),
 * the one finished card that waits for a person; else a ghost while it waits on runs and nothing else (`waitsOnRuns`); else dimmed once
 * `finished`.
 */
function lookOf(run: RunSummary, finished: boolean, inspected: boolean): Look {
  const ghost = waitsOnRuns(run);
  const marks = { ...(ghost && { 'data-ghost-run': true as const }), ...(inspected && { 'data-inspected': true as const }) };
  if (inspected) return { ghost, className: 'ring-2 ring-ring', marks };
  if (toDecideOf(run)) return { ghost: false, className: 'ring-1 ring-yours/60', marks: {} };
  if (ghost) return { ghost, className: GHOST, marks };
  return { ghost, className: finished ? 'opacity-50 hover:opacity-80' : '', marks };
}

/**
 * What a run started `--after` runs waits on, in the CLI `ls`'s word (`waiting.word`), with what the CLI's `decide` says on hover. Yours
 * when only a person moves it; on a ghost's card (`ghost`), each run it waits on a link to that run's page.
 */
function WaitingLine({ waiting, ghost }: { waiting: RunWaiting; ghost: boolean }) {
  return (
    <p
      data-waiting={waiting.onYou ? 'on-you' : 'on-runs'}
      title={waiting.advice}
      className={`mt-1 line-clamp-2 font-mono text-[11px] break-words ${waiting.onYou ? 'text-yours' : 'text-muted-foreground'}`}
    >
      {ghost ? (
        <>
          waiting on{' '}
          {waiting.runs.map(({ run }, i) => (
            <span key={run}>
              {i > 0 && ', '}
              <RouteLink
                to="/runs/$runId"
                params={{ runId: run }}
                data-waits-on={run}
                className="nodrag text-foreground/80 hover:underline"
              >
                {run}
              </RouteLink>
            </span>
          ))}
        </>
      ) : (
        waiting.word
      )}
    </p>
  );
}

/** What a run waiting on you touched, in a line: `touched 2 packages · +979 −12`, from its decision, read once for its state. */
function TouchedLine({ run }: { run: RunSummary }) {
  const { data, error } = useQuery(decisionQuery(run.id, decisionStamp(run)));
  if (error) {
    return (
      <p className="truncate px-3 text-[11px] text-failure" title={error.message}>
        touched: not read — {error.message}
      </p>
    );
  }
  if (!isDecidable(data)) return null;
  const line = touchedSummary(data.touched);
  return (
    <p data-touched-line className="truncate px-3 font-mono text-[11px] text-muted-foreground" title={line}>
      {line}
    </p>
  );
}

/**
 * What a run took, at the left of its card's footer: its clock (`runClock`), with the times in full on hover; what it has cost, `≥`
 * where an ended attempt has none on it; and the tokens its sessions used, their split on hover. Each figure only once there is one.
 */
function Took({ run, clock }: { run: RunSummary; clock: ReturnType<typeof runClock> }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 font-mono text-[11px] text-muted-foreground">
      <time dateTime={clock.at} title={clock.title} className="truncate">
        {clock.words}
      </time>
      {run.cost && (
        <span data-cost title={spentTitle(run.cost, "the run's tries")} className="shrink-0 text-foreground">
          · {run.cost.said}
        </span>
      )}
      {run.tokens && (
        <span data-tokens title={run.tokens.split} className="shrink-0 text-foreground">
          · {run.tokens.said}
        </span>
      )}
    </span>
  );
}

/**
 * A card's chips, on the right of its footer: how many runs it reads as context, each on hover (`reads`); to decide (`decide`); waiting on
 * you; held, with the hold lifted here (`CardLift`); `cancelled`; pruned; and unreadable, why on hover.
 */
function Chips({ run, decide, cancelled, reads }: { run: RunSummary; decide: boolean; cancelled: boolean; reads: string[] }) {
  return (
    <span className="ml-auto flex items-center gap-1">
      {run.context.length > 0 && (
        <Badge variant="outline" data-context title={reads.join('\n')} className="text-neutral-600 dark:text-neutral-300">
          ⧉ reads {run.context.length} {run.context.length === 1 ? 'run' : 'runs'}
        </Badge>
      )}
      {decide && <Badge className="bg-yours text-on-yours">to decide</Badge>}
      {waitsOnYou(run) && <Badge className="bg-yours-container text-on-yours-container">waiting on you</Badge>}
      {run.holding && !cancelled && (
        <Badge title={run.holding.advice} className="bg-rest text-on-rest">
          held
        </Badge>
      )}
      {run.holding && !cancelled && <CardLift id={run.id} />}
      {cancelled && <Badge variant="outline">cancelled</Badge>}
      {run.pruned && (
        <Badge variant="outline" data-pruned title={run.pruned.said} className="text-on-surface-variant">
          pruned
        </Badge>
      )}
      {run.unreadable && (
        <Badge variant="outline" data-unreadable title={run.unreadable} className="border-failure text-failure">
          unreadable
        </Badge>
      )}
    </span>
  );
}
