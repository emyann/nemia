import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { ChevronRight } from 'lucide-react';
import { Card, IconButton, Tag } from '@/components/ui/ds';
import { decisionQuery } from '@/lib/api/decision';
import type { RunView } from '@/lib/api/judged';
import { judged, type RunRow, type UnjudgedRun } from '@/lib/api/judged';
import { TryTag } from './TryTag';
import { needLine, needsOf, stepAnchor } from '@/lib/asks';
import { decisionStamp, isDecidable, touchedSummary } from '@/lib/decide';
import { CARD_WIDTH, clockCounts, panelWidth, toDecideOf, waitsOnRuns, waitsOnYou } from '@/lib/factory';
import { decideLine, gateOfSummary } from '@/lib/gate';
import { useNow } from '@/lib/useNow';
import { namespaceOf } from '@/lib/factories';
import { ENDED } from '@/lib/words';
import { RouteLink } from '../agent/AgentParts';
import { CardGate, type Taken } from '../inbox/CardGate';
import { CardLift } from './LiftHold';
import { previewBar } from '../step/StepPreview';
import { Run, type PanelRead } from '../look';
import { troubleOf } from '@/lib/api/read';

/**
 * `finished` is a run not in flight: on the floor only when finished runs are asked for, and dimmed.
 * `open` is a run whose card is opened on its steps: `detail` its record once read, which gives each tile its attempt and cost, and
 * `trouble` why it could not be read. `inspected` is a run the frame's bar shows, and `selected` the step of it the bar shows.
 * `onToggle` opens or closes the card, and `onStep` shows a step of it in the bar. `reads` is a line per run it reads as context, its id
 * and title (`readsLines`). `among` is the floor's runs, which its words name by their marks and which wait on it.
 */
type RunNodeData = {
  run: RunRow;
  among: readonly RunView[];
  reads: string[];
  finished: boolean;
  open: boolean;
  detail: PanelRead | null;
  trouble: string | null;
  inspected: boolean;
  selected: string | null;
  onToggle: (runId: string) => void;
  onStep: (runId: string, step: string) => void;
};
export type RunFlowNode = Node<RunNodeData, 'run'>;

/**
 * One run on the Factory floor, drawn by the look's run part (`Run`): at md at rest, the floor's card — factory / workflow, its title, the
 * step it is on with its agent, round, words and budget, its clock, its workflow's graph and its cost — and at xl once the chevron opens
 * it, the run's panel: each step named under the graph, a press on a node showing its step in the frame's bar (`data-tile`, pressed
 * while shown), the facts, the runs it waits on and that wait on it, and the step's last line, once its run is read alone (`detail`).
 * A click on the card shows the run in the bar, and the card is banded while it does (`lookOf`). The title opens the run's page.
 * A closed card is `CARD_WIDTH` wide, narrower than the grid's cell, which leaves the gap between cards; an open one, its panel, is as
 * wide as the cells it claims (`panelWidth`).
 *
 * Under what the part says, the floor's own lines:
 * - What a person has to know to act, besides the gate's own `approve <step>`: a step's question, or a session the harness blocked, two
 *   lines each, whole on hover, each a link to its step on the run's page.
 * - The gate, answered here (`CardGate`). Once answered, what the card said, through the state the answer was given in and the one it
 *   moved the run to (the step approved, or the try asked), until the run moves on from that, the tick filing it, or back, the answer
 *   taken back; the answer kept from the last render is adjusted as the render that sees the new state runs.
 * - A result nobody decided, in a line that fits, whole on hover in the CLI `ls`'s words, a link to where it is decided on the run's page;
 *   the card is banded yellow, the one finished card on the floor that waits for a person rather than for a machine.
 * - Once opened: how far a run waiting on you reaches (`TouchedLine`), and why its record could not be read.
 * - Its chips: a try of an agent, tagged with its agent; how many runs it reads as context; to decide; waiting on you; held, with the
 *   hold lifted here, as the CLI's `hold --off` lifts it (`CardLift`); called off; pruned.
 * - A handle on its left where the edge from a run it waits on comes in, and one on its right where the edge into each card that waits on
 *   it leaves.
 *
 * Its clock moves every second while it counts (`clockCounts`), and every 30 s otherwise. A run the list could not judge
 * (`UnjudgedRun`) is a bare card (`UnjudgedCard`).
 */
export function RunNode({ data }: NodeProps<RunFlowNode>) {
  const { run } = data;
  return judged(run) ? <JudgedCard data={{ ...data, run }} /> : <UnjudgedCard run={run} inspected={data.inspected} />;
}

/**
 * A run the list could not judge, a task it reads having a journal that does not read: its id as its title, a link to its page, the id
 * under it, and in its footer that it is unreadable, the list's words on hover. Nothing of it is judged, so it has no steps to open, no
 * clock and no chip but that one.
 */
function UnjudgedCard({ run, inspected }: { run: UnjudgedRun; inspected: boolean }) {
  return (
    <Card
      variant="outlined"
      {...(inspected && { 'data-inspected': true as const })}
      className={`w-fit shadow-sm transition-opacity ${inspected ? 'ring-2 ring-ring' : ''}`}
      classNames={{ content: 'flex-row items-start gap-0 px-0 py-3' }}
    >
      <div className="flex w-88 shrink-0 flex-col gap-3">
        <div className="min-w-0 px-3">
          <Link
            to="/runs/$runId"
            params={{ runId: run.id }}
            preload={false}
            title={run.id}
            className="nodrag block min-w-0 truncate text-body-medium font-semibold hover:underline"
          >
            {run.id}
          </Link>
          <p className="mt-0.5 truncate font-mono text-body-small text-on-surface-variant" title={run.id}>
            {run.id}
          </p>
        </div>
        <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t px-3 pt-2">
          <span className="ml-auto flex items-center gap-1">
            <Tag variant="outlined" data-unreadable title={run.unjudged} className="border-failure text-failure">
              unreadable
            </Tag>
          </span>
        </div>
      </div>
      <Handle type="target" position={Position.Left} isConnectable={false} className="opacity-0" />
      <Handle type="source" position={Position.Right} isConnectable={false} className="opacity-0" />
    </Card>
  );
}

/** A run judged, on the floor: every part `RunNode` says. */
function JudgedCard({ data }: { data: RunNodeData & { run: RunView } }) {
  const { run, among, reads, finished, open, detail, trouble, inspected, selected, onToggle, onStep } = data;
  const now = useNow(clockCounts(run, finished) ? 1_000 : 30_000);
  const cancelled = run.cancelledAt !== null;
  const decide = toDecideOf(run);
  const look = lookOf(run, inspected);
  const gate = gateOfSummary(run);
  const needs = needsOf(run).filter((need) => !(need.kind === 'approve' && need.step === gate?.step));
  const stamp = run.steps.map((step) => `${step.name}:${step.message}`).join('|');
  const [taken, setTaken] = useState<Taken | null>(null);
  if (taken && stamp !== taken.stamp && stamp !== taken.next) setTaken(taken.next === undefined ? { ...taken, next: stamp } : null);
  const said = taken && stamp === (taken.next ?? taken.stamp) ? taken.said : null;
  const asOf = new Date(now);
  return (
    <div {...look.marks} style={{ width: open ? panelWidth(run.steps.length) : CARD_WIDTH }}>
      <Run
        run={run}
        size={open ? 'xl' : 'md'}
        layout="card"
        asOf={asOf}
        among={among}
        wrap={previewBar(run, asOf)}
        read={detail}
        pick={{ selected, onStep: (step) => onStep(run.id, step) }}
        ringed={look.ringed}
        still="nodrag"
        titleEnd={<Chevron run={run} open={open} onToggle={onToggle} />}
      >
        {needs.length > 0 && <Needs run={run} needs={needs} />}
        {said ? (
          <p data-taken className="m-0 text-body-small break-words text-on-surface-variant">
            {said}
          </p>
        ) : gate ? (
          <CardGate
            run={{ id: run.id, namespace: namespaceOf(run.factory) }}
            gate={gate}
            title={decide?.kind === 'approve' && decide.step === gate.step ? decide.said : `approve ${gate.step}`}
            stamp={stamp}
            onTaken={setTaken}
          />
        ) : null}
        {decide?.kind === 'result' && !cancelled && <DecideLine run={run} said={decide.said} branches={decide.branches} />}
        {open && run.waitingOnYou.length > 0 && <TouchedLine run={run} />}
        {open && trouble && <p className="m-0 text-body-small text-failure">{trouble}</p>}
        <Chips run={run} decide={decide !== null} cancelled={cancelled} reads={reads} />
      </Run>
      <Handle type="target" position={Position.Left} isConnectable={false} className="opacity-0" />
      <Handle type="source" position={Position.Right} isConnectable={false} className="opacity-0" />
    </div>
  );
}

/** What a person has to know to act, besides the gate's own `approve <step>`: two lines each, whole on hover, each a link to its step. */
function Needs({ run, needs }: { run: RunView; needs: ReturnType<typeof needsOf> }) {
  return (
    <ul aria-label="Needs" className="m-0 list-none space-y-0.5 p-0 text-body-small">
      {needs.map((need) => (
        <li key={need.step} title={needLine(need)} className="line-clamp-2 break-words">
          <RouteLink
            to="/runs/$runId"
            params={{ runId: run.id }}
            hash={stepAnchor(need.step)}
            data-need={need.kind}
            data-step={need.step}
            underline="hover"
            className="nodrag text-yours"
          >
            {needLine(need)}
          </RouteLink>
        </li>
      ))}
    </ul>
  );
}

/** A result nobody decided, in a line that fits, whole on hover, a link to where it is decided on the run's page. */
function DecideLine({ run, said, branches }: { run: RunView; said: string; branches: Parameters<typeof decideLine>[0] }) {
  return (
    <p title={said} className="m-0 line-clamp-2 text-body-small break-words">
      <RouteLink
        to="/runs/$runId"
        params={{ runId: run.id }}
        hash="decide"
        data-to-decide="result"
        underline="hover"
        className="nodrag text-yours"
      >
        {decideLine(branches)}
      </RouteLink>
    </p>
  );
}

/**
 * The chevron after a card's title, which opens or closes its steps (`onToggle`): it neither drags the card nor shows the run in the bar.
 */
function Chevron({ run, open, onToggle }: { run: RunView; open: boolean; onToggle: (runId: string) => void }) {
  return (
    <IconButton
      icon={ChevronRight}
      variant="standard"
      size="xsmall"
      aria-expanded={open}
      aria-label={open ? 'Hide steps' : 'Show steps'}
      onPress={() => onToggle(run.id)}
      className="nodrag relative z-10 -mr-1.5 h-6 w-6 shrink-0 before:h-6 before:w-6"
      classNames={{ icon: `size-4 transition-transform ${open ? 'rotate-180' : ''}` }}
    />
  );
}

/** How a run's card is drawn: the marks a check reads it by, a ghost's and the one inspected, and the band around it, if any. */
type Look = { ringed?: 'focus' | 'yours'; marks: { 'data-ghost-run'?: true; 'data-inspected'?: true } };

/**
 * How a run's card is drawn: banded in the focus colour, and marked, while the frame's bar shows it (`inspected`); else banded yellow
 * while a person has its result to decide (`toDecideOf`), the one finished card that waits for a person. A ghost, a run that waits on
 * runs and nothing else (`waitsOnRuns`), is marked: its part's tone draws it outlined, waiting.
 */
function lookOf(run: RunView, inspected: boolean) {
  const ghost = waitsOnRuns(run);
  const marks = { ...(ghost && { 'data-ghost-run': true as const }), ...(inspected && { 'data-inspected': true as const }) };
  if (inspected) return { ringed: 'focus', marks } satisfies Look;
  if (toDecideOf(run)) return { ringed: 'yours', marks: {} } satisfies Look;
  return { marks } satisfies Look;
}

/** What a run waiting on you touched, in a line: `touched 2 packages · +979 −12`, from its decision, read once for its state. */
function TouchedLine({ run }: { run: RunView }) {
  const { data, error } = useQuery(decisionQuery(run.id, decisionStamp(run)));
  if (error) {
    return (
      <p className="truncate px-3 text-body-small text-failure" title={troubleOf(error).words}>
        touched: not read — {troubleOf(error).words}
      </p>
    );
  }
  if (!isDecidable(data)) return null;
  const line = touchedSummary(data.touched);
  return (
    <p data-touched-line className="truncate px-3 font-mono text-body-small text-on-surface-variant" title={line}>
      {line}
    </p>
  );
}

/**
 * A card's chips, at its foot: a try of an agent, tagged with its agent, since its folder is on no page; how many runs it reads as context,
 * each on hover (`reads`); to decide (`decide`); waiting on you; held, with the hold lifted here (`CardLift`); `cancelled`; and pruned.
 */
function Chips({ run, decide, cancelled, reads }: { run: RunView; decide: boolean; cancelled: boolean; reads: string[] }) {
  return (
    <span className="ml-auto flex flex-wrap items-center justify-end gap-1 empty:hidden">
      {run.try && <TryTag agent={run.try.agent} />}
      {run.context.length > 0 && (
        <Tag variant="outlined" data-context title={reads.join('\n')} className="text-on-surface-variant">
          ⧉ reads {run.context.length} {run.context.length === 1 ? 'run' : 'runs'}
        </Tag>
      )}
      {decide && <Tag className="bg-yours text-on-yours">to decide</Tag>}
      {waitsOnYou(run) && <Tag className="bg-yours-container text-on-yours-container">waiting on you</Tag>}
      {run.holding && !cancelled && (
        <Tag title={run.holding.advice} className="bg-rest text-on-rest">
          held
        </Tag>
      )}
      {run.holding && !cancelled && <CardLift id={run.id} namespace={namespaceOf(run.factory)} />}
      {cancelled && <Tag variant="outlined">{ENDED.cancelled.word}</Tag>}
      {run.pruned && (
        <Tag variant="outlined" data-pruned title={run.pruned.said ?? ''} className="text-on-surface-variant">
          pruned
        </Tag>
      )}
    </span>
  );
}
