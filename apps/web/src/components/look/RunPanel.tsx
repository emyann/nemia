import type { ReactNode } from 'react';
import type * as RunObject from 'objects';
import { Button as AriaButton } from 'react-aria-components';
import { cn, focusRing } from '@/components/ui/ds/utils';
import type { RunView } from '@/lib/api/judged';
import { isLive } from '@/lib/canvas';
import { durationWords } from '@/lib/duration';
import { repoName } from '@/lib/factory';
import { dollars } from '@/lib/money';
import { instantWords } from '@/lib/instant';
import { waitersOf } from '@/lib/nowChip';
import { railStates, type Now } from '@/lib/runWords';
import { OPENS } from '@/lib/words';
import { CutButton } from './CutButton';
import { RunMark, type NamedRun } from './RunMarks';
import { StepGraph } from './StepGraph';
import { Body, Label } from '@/components/ui/ds';

/**
 * What the panel reads of its run alone, once read (`runObjectQuery`): each step's attempts, filing, cost and its session's last line,
 * as the run's object holds them; a list carries none of the last lines.
 */
export type PanelRead = {
  readonly steps: readonly Pick<RunObject.RunStepStatus, 'name' | 'attempts' | 'taskId' | 'spent' | 'budget' | 'lastLine'>[];
};

/** The run the panel draws beside what the part draws for every size. */
type PanelRun = RunView;

/** How long a step's latest attempt took, to the minute, or has run while it runs; none before its first or where it has no end. */
const tookOf = (attempts: PanelRead['steps'][number]['attempts'], live: boolean, now: number) => {
  const latest = attempts.latest;
  if (!latest) return null;
  const end = latest.endedAt ? Date.parse(latest.endedAt) : live ? now : null;
  return end === null ? null : durationWords(end - Date.parse(latest.startedAt), 'minute');
};

/**
 * Each step as the panel names it under its node: its agent as the run froze it, and once read its latest attempt's time and its cost
 * to the minute, and what its tries spent, said at `now`.
 */
function namedSteps(run: PanelRun, read: PanelRead | null, now: number) {
  const drawn = railStates(run.steps, run.cancelledAt !== null, run.holding != null);
  const reads = new Map(read?.steps.map((step) => [step.name, step]));
  return new Map(
    run.steps.map((step, i) => {
      const got = reads.get(step.name);
      const time = got ? tookOf(got.attempts, isLive(drawn[i]?.state ?? 'unknown'), now) : null;
      const cost = got?.spent?.said ?? null;
      return [step.name, { agent: step.spec?.agent ?? null, said: [time, cost].filter(Boolean).join(' · ') }];
    }),
  );
}

/** A fact of the panel: its key in small caps, its value, and a line under it. */
function Fact({ name, value, under }: { name: string; value: ReactNode; under?: string | null }) {
  return (
    <span data-fact={name.toLowerCase()} className="flex min-w-0 flex-col gap-0.5">
      <Label size="small" component="span" colorRole="on-surface-variant" className="uppercase">{name}</Label>
      <Body size="large" component="span" colorRole="on-surface" className="font-mono">{value}</Body>
      {under && <Body size="small" component="span" colorRole="on-surface-variant">{under}</Body>}
    </span>
  );
}

/** What a run's gates say: how many, and of the first that waits on you, or else the last passed, its word. */
function gatesUnder(run: PanelRun) {
  if (run.gates.length === 0) return { value: 'none', under: null };
  const gated = run.gates.map((gate) => gate.step);
  const yours = gated.find((gate) => run.waitingOnYou.includes(gate));
  if (yours) return { value: String(run.gates.length), under: `${yours} waits on you` };
  const passed = gated.filter((gate) => run.steps.find((step) => step.name === gate)?.phase === 'succeeded');
  return { value: String(run.gates.length), under: passed.length > 0 ? `${passed.join(', ')} approved` : null };
}

/** Where a run's steps work: its repository by name, or `folders` where it has none, the whole path or the folders' home on hover. */
function WorksIn({ run }: { run: PanelRun }) {
  const where = run.repo ?? (run.work ? `Its steps work in folders under ${run.work}` : 'Its steps work in folders the run made');
  return (
    <span data-fact="works-in" className="col-span-4 grid grid-cols-[120px_1fr] items-baseline gap-3 pt-2">
      <Label size="small" component="span" colorRole="on-surface-variant" className="uppercase">Works in</Label>
      <Body size="medium" component="span" colorRole="on-surface"
        data-works-in={run.repo ? 'repository' : 'folders'}
        title={where}
        className="truncate font-mono"
      >
        {run.repo ? repoName(run.repo) : 'folders'}
      </Body>
    </span>
  );
}

/**
 * The panel's facts: the clock with its start, the cost against the step's budget, the tokens and what was read, the gates, and where
 * its steps work.
 */
export function Facts({
  run,
  now,
  clock,
  asOf,
  className,
}: {
  run: PanelRun;
  now: Now | null;
  clock: ReactNode;
  asOf: Date;
  className?: string;
}) {
  const gates = gatesUnder(run);
  const started = run.startedAt ? `since ${instantWords(new Date(run.startedAt), asOf)}` : 'not started';
  const step = now?.budget ? `step ${dollars(now.budget.spent)} of ${now.budget.capSaid}` : null;
  return (
    <span data-run-facts className={className}>
      <Fact name="Clock" value={clock} under={started} />
      <Fact name="Cost" value={<span className="text-on-surface">{run.cost?.said ?? '—'}</span>} under={step} />
      <Fact name="Tokens" value={run.tokens?.said ?? '—'} under={run.read ? `${run.read.said} context` : null} />
      <Fact name="Gates" value={gates.value} under={gates.under} />
      <WorksIn run={run} />
    </span>
  );
}

/** The runs a run waits on: those of its waits and hold not landed, and the run whose ending holds the checkout it waits on. */
const waitsOnOf = (run: PanelRun) => [
  ...new Set([
    ...(run.waiting?.runs.filter((waited) => !waited.missing).map((waited) => waited.run) ?? []),
    ...(run.holding?.runs.filter((held) => !held.landed).map((held) => held.run) ?? []),
    ...run.steps.flatMap((step) => (step.baseHeldBy ? [step.baseHeldBy.run] : [])),
  ]),
];

/** A line of runs: its key, then each run by its mark, or `no run`. */
function RunsLine({ name, ids, among }: { name: string; ids: readonly string[]; among: readonly NamedRun[] }) {
  return (
    <span data-runs={name} className="grid grid-cols-[120px_1fr] items-baseline gap-3">
      <Label size="small" component="span" colorRole="on-surface-variant" className="uppercase">{name}</Label>
      {ids.length === 0 ? (
        <Body size="medium" component="span" colorRole="on-surface-variant">no run</Body>
      ) : (
        <span className="flex flex-wrap gap-x-3.5 gap-y-1">
          {ids.map((id) => (
            <RunMark key={id} id={id} run={among.find((one) => one.id === id)} />
          ))}
        </span>
      )}
    </span>
  );
}

/** The runs this one waits on and the runs that wait on it, each a mark, found among the surface's runs. */
export function RunsWaiting({ run, among, className }: { run: PanelRun; among: readonly (NamedRun & PanelRun)[]; className?: string }) {
  return (
    <span data-run-runs className={className}>
      <RunsLine name="Waits on" ids={waitsOnOf(run)} among={among} />
      <RunsLine name="Waited on by" ids={waitersOf(among, run.id)} among={among} />
    </span>
  );
}

/** The panel's foot: its step's session's last line, once read, in mono on the floor's ground, and Open run. */
export function PanelFoot({
  run,
  step,
  read,
  still,
  className,
}: {
  run: PanelRun;
  step: string | null;
  read: PanelRead | null;
  still?: string;
  className?: string;
}) {
  const line = read?.steps.find((one) => one.name === step)?.lastLine ?? null;
  return (
    <span data-foot className={className}>
      <Body size="small" component="span" colorRole="on-surface-variant"
        data-last-line
        title={line ?? undefined}
        className={cn('min-w-0 flex-1 truncate bg-background px-3 py-2 font-mono')}
      >
        <span aria-hidden="true">› </span>
        {line ?? '—'}
      </Body>
      <CutButton to="/runs/$runId" params={{ runId: run.id }} quiet className={still}>
        {OPENS}
      </CutButton>
    </span>
  );
}

/** The run's steps as its graph, each named under its node (`namedSteps`), wide enough that no column folds. */
export function NamedGraph({
  run,
  read,
  now,
  wrap,
}: {
  run: PanelRun;
  read: PanelRead | null;
  now: number;
  wrap?: Parameters<typeof StepGraph>[0]['wrap'];
}) {
  return <StepGraph run={run} wrap={wrap} width={Math.max(400, run.steps.length * 104)} named={namedSteps(run, read, now)} />;
}

/**
 * What wraps each node of the panel's graph where a press shows its step: a button, `data-tile` its step, pressed while it is the
 * step shown, that hands its step to `onStep`; `still` its class (`nodrag` on the floor).
 * @param pick The step shown, and what a press does with a step.
 * @param still The class of the button.
 */
export const pickWrap =
  (pick: { selected: string | null; onStep: (step: string) => void }, still?: string) =>
  (node: ReactNode, step: { name: string; state: string }) => (
    <AriaButton
      data-tile={step.name}
      data-state={step.state}
      aria-label={`Inspect step ${step.name}`}
      aria-pressed={pick.selected === step.name}
      onPress={() => pick.onStep(step.name)}
      className={cn(
        'grid size-full cursor-pointer place-items-center rounded-sm aria-pressed:bg-surface-container-highest',
        focusRing(),
        still,
      )}
    >
      {node}
    </AriaButton>
  );
