import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { decisionQuery, type RunDetail, type RunSummary } from '@/lib/api';
import { TryTag } from './TryTag';
import { needLine, needsOf, stepAnchor } from '@/lib/asks';
import { spentTitle } from '@/lib/cost';
import { decisionStamp, isDecidable, touchedSummary } from '@/lib/decide';
import { clockCounts, repoName, runClock, titleOf, toDecideOf, waitsOnYou } from '@/lib/factory';
import { flowSteps, railOf, tilesOf } from '@/lib/flow';
import { decideLine, gateOfSummary } from '@/lib/gate';
import { useNow } from '@/lib/useNow';
import { RouteLink } from './AgentParts';
import { CardGate, type Taken } from './CardGate';
import { StepRail, StepTiles } from './StepRail';

/**
 * `finished` is a run not in flight: on the floor only when finished runs are asked for, and dimmed.
 * `open` is a run whose card is opened on its steps: `detail` its record once read, which gives each tile its attempt and cost, and
 * `trouble` why it could not be read. `selected` is the step whose inspector is open. `onToggle` opens or closes the card, and
 * `onStep` inspects a step of it.
 */
export type RunNodeData = {
  run: RunSummary;
  finished: boolean;
  open: boolean;
  detail: RunDetail | null;
  trouble: string | null;
  selected: string | null;
  onToggle: (runId: string) => void;
  onStep: (runId: string, step: string) => void;
};
export type RunFlowNode = Node<RunNodeData, 'run'>;

/**
 * One run on the Factory floor: what was asked, where, what each step is doing — a small flowchart of them (`StepRail`) — and for
 * how long.
 *
 * The chevron, or a click anywhere on the card, opens it: the card grows to the right with every step a tile (`StepTiles`), and a
 * tile opens its step's inspector. The title opens the run's page. `w-88` is `CARD_WIDTH`, narrower than the grid's cell, which
 * leaves the gap between cards.
 */
export function RunNode({ data: { run, finished, open, detail, trouble, selected, onToggle, onStep } }: NodeProps<RunFlowNode>) {
  // Every second while its clock counts (`clockCounts`); a finished run's "started … ago" moves slowly.
  const now = useNow(clockCounts(run, finished) ? 1_000 : 30_000);
  const cancelled = run.cancelledAt !== null;
  const title = titleOf(run);
  const decide = toDecideOf(run);
  // The gate the card answers, and the needs besides it: the gate's own `approve <step>` is its line, not a need said twice.
  const gate = gateOfSummary(run);
  const needs = needsOf(run).filter((need) => !(need.kind === 'approve' && need.step === gate?.step));
  // What the card said when a person answered its gate: through the state the answer was given in and the one it moved the run to (the
  // step approved, or the try asked), until the run moves on from that — the tick filing it — or back, the answer taken back.
  const stamp = run.steps.map((step) => `${step.name}:${step.status}`).join('|');
  const [taken, setTaken] = useState<Taken | null>(null);
  useEffect(() => {
    if (!taken || stamp === taken.stamp || stamp === taken.next) return;
    setTaken(taken.next === undefined ? { ...taken, next: stamp } : null);
  }, [stamp, taken]);
  const said = taken && (stamp === (taken.next ?? taken.stamp)) ? taken.said : null;
  // How long it has been at work, from its first filing — or, before that, how long it has waited (`runClock`).
  const clock = runClock(run, now, finished);
  // The flowchart, off the list's own record of the run: its graph, and each step's word.
  const names = useMemo(() => run.steps.map((step) => step.name), [run.steps]);
  const edgeSteps = useMemo(() => flowSteps(run), [run]);
  const rail = useMemo(() => railOf(names, run.graph, edgeSteps, cancelled), [names, run.graph, edgeSteps, cancelled]);
  const tiles = useMemo(() => (open ? tilesOf(names, run.graph, edgeSteps, cancelled) : null), [open, names, run.graph, edgeSteps, cancelled]);

  return (
    // Marked while nobody has decided its result, and not dimmed as a finished card is: nothing of it moves, so it is finished, and it is
    // on the floor because it is the one card there that is waiting for a person rather than for a machine.
    <Card size="sm" className={`w-fit flex-row items-start gap-0 shadow-sm transition-opacity ${decide ? 'ring-1 ring-emerald-500/60' : finished ? 'opacity-50 hover:opacity-80' : ''}`}>
      <div className="flex w-88 shrink-0 flex-col gap-3">
        <div className="min-w-0 px-3">
          <div className="flex items-center gap-1">
            {/* Not preloaded on hover: only an open run reads its detail. */}
            <Link
              to="/runs/$runId"
              params={{ runId: run.id }}
              preload={false}
              title={title}
              className="nodrag block min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
            >
              {title}
            </Link>
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? 'Hide steps' : 'Show steps'}
              title={open ? 'Hide its steps' : 'Open its steps'}
              onClick={(event) => {
                // The card toggles on a click too; this one click is the chevron's.
                event.stopPropagation();
                onToggle(run.id);
              }}
              className="nodrag -mr-1.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight aria-hidden className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <p className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="truncate font-mono" title={run.id}>
              {run.id}
            </span>
            {/* A folder run has no repository: its steps work in folders the run made (`workspace: folder`). */}
            {/* A try of an agent, started from its page, is a folder run of the store's own: tagged, since its folder is on no page. */}
            {run.try ? (
              <TryTag agent={run.try.agent} />
            ) : (
              <span className="shrink-0" title={run.repo ?? (run.work ? `Its steps work in folders under ${run.work}` : 'Its steps work in folders the run made')}>
                {run.repo ? repoName(run.repo) : 'folders'}
              </span>
            )}
          </p>
          {/* On whom a run started `--after` waits, in `wf ls`'s word — amber when one never ships without you — and what to do, on hover. */}
          {run.waiting && (
            <p
              data-waiting={run.waiting.onYou ? 'on-you' : 'on-runs'}
              title={run.waiting.advice}
              className={`mt-1 line-clamp-2 font-mono text-[11px] break-words ${run.waiting.onYou ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}
            >
              {run.waiting.word}
            </p>
          )}
          {/* A person's hold on it (`wf hold`), in `wf ls`'s word — amber once only a person lifts it — and what to do, on hover. It is what the
              card says instead of a gate: while it stands, nothing of the run is asked of anyone, and no Approve would be taken. */}
          {run.holding && (
            <p
              data-holding={run.holding.onYou ? 'on-you' : 'on-runs'}
              title={run.holding.advice}
              className={`mt-1 line-clamp-2 font-mono text-[11px] break-words ${run.holding.onYou ? 'text-amber-800 dark:text-amber-300' : 'text-violet-800 dark:text-violet-300'}`}
            >
              {run.holding.word}
            </p>
          )}
        </div>

        <StepRail run={run} flow={rail} />

        {/* What a person has to know to act: a step's question, or a session the harness blocked. Two lines each, whole on hover, each a link
            to its step on the run's page, where it is answered. */}
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
                  className={`nodrag hover:underline ${need.kind === 'harness' ? 'text-orange-800 dark:text-orange-300' : 'text-amber-800 dark:text-amber-300'}`}
                >
                  {needLine(need)}
                </RouteLink>
              </li>
            ))}
          </ul>
        )}

        {/* A gate, answered here: what approving does and where a send-back goes, and Approve and Send back. Once answered, what happened and
            what comes next, until the run moves. */}
        {said ? (
          <p data-taken className="px-3 text-[11px] break-words text-emerald-800 dark:text-emerald-300">
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

        {/* A result nobody decided: said in a line that fits, whole on hover in `wf ls`'s words, decided on the run's page. */}
        {decide?.kind === 'git' && !cancelled && (
          <p title={decide.said} className="line-clamp-2 px-3 text-[11px] break-words">
            <RouteLink
              to="/runs/$runId"
              params={{ runId: run.id }}
              hash="decide"
              data-to-decide="git"
              className="nodrag text-emerald-800 hover:underline dark:text-emerald-300"
            >
              {decideLine(decide.branches)}
            </RouteLink>
          </p>
        )}

        {/* For triage among the runs waiting on you: how far the work reaches, read once the card is opened. */}
        {open && run.waitingOnYou.length > 0 && <TouchedLine run={run} />}

        {/* The tiles are the list's; what the run's record adds to them — each step's attempt and cost — could not be read. */}
        {open && trouble && <p className="px-3 text-[11px] text-red-600 dark:text-red-400">{trouble}</p>}

        <div className="flex min-h-6 items-center justify-between gap-2 border-t px-3 pt-2">
          <span className="flex min-w-0 items-baseline gap-1.5 font-mono text-[11px] text-muted-foreground">
            <time dateTime={clock.at} title={clock.title} className="truncate">
              {clock.words}
            </time>
            {/* What it has cost, beside its age, once a cost was measured: `≥` where an ended attempt has none on it. */}
            {run.cost && (
              <span data-cost title={spentTitle(run.cost, "the run's tries")} className="shrink-0 text-foreground">
                · {run.cost.said}
              </span>
            )}
          </span>
          <span className="flex gap-1">
            {decide && (
              <Badge className="bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">to decide</Badge>
            )}
            {waitsOnYou(run) && (
              <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">waiting on you</Badge>
            )}
            {run.holding && !cancelled && (
              <Badge title={run.holding.advice} className="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">held</Badge>
            )}
            {cancelled && <Badge variant="outline">cancelled</Badge>}
          </span>
        </div>
      </div>

      {tiles && <StepTiles run={run} detail={detail} flow={tiles} selected={selected} onStep={(step) => onStep(run.id, step)} />}

      {/* Where the edge from a run this one waits on comes in. */}
      <Handle type="target" position={Position.Left} isConnectable={false} className="opacity-0" />
      {/* Where the edge into each card that waits on it leaves the card. */}
      <Handle type="source" position={Position.Right} isConnectable={false} className="opacity-0" />
    </Card>
  );
}

/** What a run waiting on you touched, in a line: `touched 2 packages · +979 −12`, from its decision, read once for its state. */
function TouchedLine({ run }: { run: RunSummary }) {
  const { data, error } = useQuery(decisionQuery(run.id, decisionStamp(run)));
  if (error) {
    return (
      <p className="truncate px-3 text-[11px] text-red-600 dark:text-red-400" title={error.message}>
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
