import type { ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Cell, Row, Tooltip, TooltipTrigger } from '@/components/ui/ds';
import { cn } from '@/components/ui/ds/utils';
import type { RunView } from '@/lib/api/judged';
import type { RunClock as Clock } from '@/lib/api/runs';
import { namespaceOf } from '@/lib/factories';
import { titleOf } from '@/lib/factory';
import { workflowNameOf } from '@/lib/api/workflows';
import { ink } from '@/lib/meaning';
import { waitersOf } from '@/lib/nowChip';
import { nowOf, presentWait, type Now } from '@/lib/runWords';
import { says, type RunLayout, type RunSays, type RunSize } from '@/lib/runSays';
import { ENDED, OPENS } from '@/lib/words';
import { CutButton } from './CutButton';
import { cutRing } from './cut';
import { CutFrame, FRAMED_ROW, type FrameHue } from './CutFrame';
import { runRecipe, type RunTone } from './run.recipe.ts';
import { RunClock, RunCost } from './RunFigures';
import { Chip, Fan, Pips, Ring, RunMark, Words } from './RunMarks';
import { RunMeta } from './RunMeta';
import { Facts, NamedGraph, PanelFoot, pickWrap, RunsWaiting, type PanelRead } from './RunPanel';
import { StepGraph } from './StepGraph';
import { TextLink } from './TextLink';

/** A run as the part draws it: its view, and where the list carries them, its clock's breakdown and its present wait on a person. */
type PartRun = RunView & { readonly clock?: Clock | null; readonly waitingSince?: string | null };

/** What a host puts each node of the graph inside: a button that opens the step, or shows it in the floor's bar. */
type GraphWrap = Parameters<typeof StepGraph>[0]['wrap'];

/** The props of a run at a size. */
export type RunProps = {
  run: PartRun;
  size: RunSize;
  layout?: RunLayout;
  asOf: Date;
  among?: readonly PartRun[];
  wrap?: GraphWrap;
  read?: PanelRead | null;
  titleEnd?: ReactNode;
  pick?: StepPick;
  ringed?: 'focus' | 'yours';
  still?: string;
  children?: ReactNode;
  className?: string;
};

/** The step a panel's press shows, and what a press on a node does with its step: the floor shows it in its bar. */
type StepPick = { selected: string | null; onStep: (step: string) => void };

/**
 * The band around a card, in the cut's shape, a few pixels off its edge: the focus colour while it is shown, yellow while it is to decide.
 */
const RING: Record<'focus' | 'yours', string> = { focus: 'bg-ring', yours: 'bg-yours/60' };

/** Each tone's frame: its edge in the tone's hue where it is at work, waits on you or failed; the line's ink for the rest. */
const HUE: Record<RunTone, FrameHue> = { alive: 'alive', yours: 'yours', failure: 'failure', waits: 'none', rest: 'none' };

/** The cut of each size's frame. */
const CUT = { sm: 9, md: 12, lg: 24, xl: 28 } as const;

/** What a finished run says now: its last step at rest, and how it ended. */
const endedOf = (run: PartRun) =>
  ({
    step: run.steps.at(-1)?.name ?? '',
    tone: 'rest',
    agent: null,
    round: null,
    budget: null,
    words: [run.outcome ? ENDED[run.outcome].word : ENDED.succeeded.word],
  }) satisfies Now;

/** What the part reads once for every size: the run's step now (`nowOf`, or how it ended), its tone, its slots and its ladder. */
function readOf({ run, size, layout = 'card' }: Pick<RunProps, 'run' | 'size' | 'layout'>) {
  const now = nowOf(run) ?? endedOf(run);
  const s = runRecipe({ size, layout, tone: now.tone });
  return { now, s, say: says(size, layout), finished: run.state === 'finished', title: titleOf(run) };
}

type Look = ReturnType<typeof readOf>;

/** The marks a slot carries: what of the ladder it says, look by the part's tests. */
const saying = (...things: RunSays[]) => ({ 'data-run-says': things.join(' ') });

/**
 * A run at a size, one part whatever surface draws it: each size says everything the size under it does, and more (`says`,
 * `lib/runSays.ts`), drawn by one recipe (`runRecipe`) in its tone (`ChipTone`, the run's chip's colour).
 *
 * - **xs**, a mark: the step now's diamond and the id's end, a link (`RunMark`), where a run is named inside something else.
 * - **sm**, a line: and the step now as a small chip, the title on one line and the clock.
 * - **md**, a row of the runs table (`layout="row"`, the kit's `Row` with its Run, Now, Clock and Cost cells) or a card of the floor: and
 *   factory / workflow, the agent, the round as pips, the words of its wait (a run named a mark), the step graph (each node inside `wrap`),
 *   the step's budget ring, its cost and how many of `among` wait on it; a row its labels too.
 * - **lg**, a card: and its labels and Open run; a card that waits on you glows.
 * - **xl**, a panel: and each step named under the graph, the facts, the runs it waits on and that wait on it, and the step's last line
 *   from `read`, the run read alone.
 *
 * `asOf` is the instant its clock is said at. `pick` makes each node of the panel's graph a button that shows its step (`data-tile`,
 * pressed while it is the step shown); `ringed` draws a band in the cut's shape around a card, the focus colour or yellow. `titleEnd`
 * stands after the title (the floor's chevron), `children` under what the part says (the floor's lines), and `still` is the class of every
 * control the part draws (`nodrag` on the floor). A finished run is drawn at rest, by its last step and how it ended.
 * @param props The run, the size to draw it at, and what the surface gives it (`RunProps`).
 */
export function Run(props: RunProps) {
  const { run, size, among = [] } = props;
  if (size === 'xs') {
    const s = runRecipe({ size });
    return (
      <span data-run={run.id} {...saying('state', 'id')} className={cn(s.base(), props.className)}>
        <RunMark id={run.id} run={run} />
      </span>
    );
  }
  const look = readOf(props);
  if (size === 'sm') return <RunLine {...props} look={look} />;
  if (size === 'md' && props.layout === 'row') return <RunRow {...props} look={look} />;
  if (size === 'md') return <RunCard {...props} look={look} among={among} />;
  return <RunBig {...props} look={look} among={among} />;
}

/**
 * The run's title, a link to its page, on a card raised over the copy control's target (a row's leaves it the control's); whole in the
 * kit's tooltip where it is cut to a line; a card's heading where `heading`.
 */
function Title({ run, look, still, end, heading }: { run: PartRun; look: Look; still?: string; end?: ReactNode; heading?: boolean }) {
  const Holder = heading ? 'h3' : 'span';
  return (
    <Holder {...saying('title')} className="m-0 flex min-w-0 items-start gap-1">
      <TooltipTrigger delay={300}>
        <TextLink to="/runs/$runId" params={{ runId: run.id }} className={cn(look.s.title(), still)}>
          {look.title}
        </TextLink>
        <Tooltip>{look.title}</Tooltip>
      </TooltipTrigger>
      {end}
    </Holder>
  );
}

/** The run's clock: how long it has waited on you this time, in yellow, where the list dates that wait; else its time at work. */
function ClockSaid({ run, look, asOf }: { run: PartRun; look: Look; asOf: Date }) {
  if (look.now.tone === 'yours' && run.waitingSince) {
    const waited = presentWait({ waitingSince: run.waitingSince }, asOf);
    return (
      <span data-waited {...saying('clock')} className={cn(look.s.clock(), ink.yours)}>
        waited {waited}
      </span>
    );
  }
  return (
    <span {...saying('clock')} className="inline-flex">
      <RunClock run={{ ...run, clock: run.clock ?? null }} asOf={asOf} finished={look.finished} className={look.s.clock()} />
    </span>
  );
}

/** The run's cost, in ink, with its tokens by kind over it; nothing where none was measured. */
function CostSaid({ run, className }: { run: PartRun; className?: string }) {
  return (
    <span data-cost {...saying('cost')} className="inline-flex shrink-0 text-on-surface">
      <RunCost run={run} className={className} />
    </span>
  );
}

/** The step now, as a chip, its agent and its round, as md and up say them; `small` on a card at md, `words` on the panel. */
function NowMarks({ look, small = false, words = false }: { look: Look; small?: boolean; words?: boolean }) {
  const { now, s } = look;
  return (
    <>
      <span {...saying('state', 'step')} className="inline-flex shrink-0">
        <Chip now={now} small={small} />
      </span>
      {now.agent && (
        <span data-now-agent {...saying('agent')} className={s.agent()}>
          {now.agent}
        </span>
      )}
      {now.round && (
        <span {...saying('round')} className="inline-flex shrink-0">
          <Pips round={now.round} tone={now.tone} words={words} />
        </span>
      )}
    </>
  );
}

/**
 * The few words of the run's wait, on its line, cut to it on a card, with on hover the api's words for its wait or hold, else the words
 * whole, and the advice.
 */
function WordsSaid({ run, look, among, cut }: { run: PartRun; look: Look; among: readonly PartRun[]; cut?: boolean }) {
  const words = look.now.words;
  if (words.length === 0) return null;
  const whole = words.map((part) => (typeof part === 'string' ? part : part.run)).join(' ');
  const said = run.waiting?.word || run.holding?.word;
  return (
    <span {...saying('words')} className={cn('min-w-0', cut && 'truncate')}>
      <Words
        words={words}
        tone={look.now.tone}
        among={among.filter((other) => other.id !== run.id)}
        title={cut ? [said || whole, run.waiting?.advice || run.holding?.advice].filter(Boolean).join('\n') : undefined}
        className={cn(cut && 'text-body-small')}
      />
    </span>
  );
}

/** A small line: the id's end, the step now as a small chip, the title on one line, and the clock. */
function RunLine({ run, asOf, still, className, look }: RunProps & { look: Look }) {
  const { s } = look;
  return (
    <CutFrame hue="none" size={CUT.sm} className={className}>
      <span data-run={run.id} data-now={look.now.tone} className={s.base()}>
        <span {...saying('id')} className={s.id()}>
          {run.id.slice(-4)}
        </span>
        <span {...saying('state', 'step')} className="inline-flex shrink-0">
          <Chip now={look.now} small />
        </span>
        <Title run={run} look={look} still={still} />
        <ClockSaid run={run} look={look} asOf={asOf} />
      </span>
    </CutFrame>
  );
}

/**
 * The run as a row of the runs table: its Run cell (title over its meta line), its Now cell (marks over its graph), Clock and Cost. The
 * row opens the run's page, as its title does, on a press or Enter, through the board's router (the kit's interactive row, with its
 * hover, pressed and focus states); a control inside it does its own thing.
 */
function RunRow({ run, asOf, among = [], wrap, still, look }: RunProps & { look: Look }) {
  const waiters = waitersOf(among, run.id).length;
  const navigate = useNavigate();
  return (
    <Row
      id={run.id}
      data-run={run.id}
      className={FRAMED_ROW}
      onAction={() => void navigate({ to: '/runs/$runId', params: { runId: run.id } })}
    >
      <Cell className="py-3">
        <span className="flex min-w-0 flex-col gap-1">
          <Title run={run} look={look} still={still} />
          <span {...saying('id', 'where', 'labels')} className="flex min-w-0">
            <RunMeta run={run} />
          </span>
        </span>
      </Cell>
      <Cell className="py-3">
        <span data-now={look.now.tone} className="flex min-w-0 flex-col gap-2">
          <span className={cn(look.s.now(), 'flex-wrap')}>
            <NowMarks look={look} />
            <WordsSaid run={run} look={look} among={among} />
            <span className={look.s.end()}>
              {waiters > 0 && (
                <span {...saying('waitedBy')} className="inline-flex">
                  <Fan count={waiters} />
                </span>
              )}
              {look.now.budget && (
                <span {...saying('budget')} className="inline-flex">
                  <Ring budget={look.now.budget} />
                </span>
              )}
            </span>
          </span>
          <span {...saying('graph')} className={look.s.steps()}>
            <StepGraph run={run} wrap={wrap} />
          </span>
        </span>
      </Cell>
      <Cell data-clock>
        <span {...saying('clock')} className="inline-flex">
          <RunClock run={{ ...run, clock: run.clock ?? null }} asOf={asOf} finished={look.finished} />
        </span>
      </Cell>
      <Cell data-cost className="font-mono text-body-small whitespace-nowrap">
        <CostSaid run={run} />
      </Cell>
    </Row>
  );
}

/** The run in its cut frame, in its tone: its edge, its ground, and the glow of a card at lg and up that waits on you. */
function Framed({
  run,
  look,
  size,
  ringed,
  className,
  children,
}: {
  run: PartRun;
  look: Look;
  size: 'md' | 'lg' | 'xl';
  ringed?: 'focus' | 'yours';
  className?: string;
  children: ReactNode;
}) {
  const tone = look.now.tone;
  return (
    <span className="relative block">
      {ringed && (
        <span
          aria-hidden="true"
          data-ringed={ringed}
          className={cn('pointer-events-none absolute -inset-[5px]', RING[ringed])}
          style={{ clipPath: cutRing(CUT[size], 2, 2) }}
        />
      )}
      <CutFrame hue={HUE[tone]} size={CUT[size]} ground={look.s.ground()} glow={tone === 'yours' && size !== 'md'} className={className}>
        <article aria-label={look.title} data-run={run.id} data-now={tone} data-tone={tone} data-size={size} className={look.s.base()}>
          {children}
        </article>
      </CutFrame>
    </span>
  );
}

/** Where the run runs, as the card's eyebrow says it: its factory and its workflow, as a path. */
function Eyebrow({ run }: { run: PartRun }) {
  const factory = namespaceOf(run.factory);
  const workflow = workflowNameOf(run.workflowDir);
  return (
    <span data-run-where {...saying('where')} className="inline-flex min-w-0 items-center gap-1">
      <span data-factory={factory}>{factory}</span>
      <span aria-hidden="true">/</span>
      <span data-workflow={workflow}>{workflow}</span>
    </span>
  );
}

/** The run as a card at md, the floor's: its eyebrow, its title on two lines, its step now and its graph over its cost. */
function RunCard({
  run,
  asOf,
  among,
  wrap,
  titleEnd,
  ringed,
  still,
  children,
  className,
  look,
}: RunProps & { look: Look; among: readonly PartRun[] }) {
  const { s, now } = look;
  const waiters = waitersOf(among, run.id).length;
  return (
    <Framed run={run} look={look} size="md" ringed={ringed} className={className}>
      <span className={s.head()}>
        <Eyebrow run={run} />
        <span className="inline-flex shrink-0 items-center gap-2 tracking-normal normal-case">
          {waiters > 0 && (
            <span {...saying('waitedBy')} className="inline-flex">
              <Fan count={waiters} />
            </span>
          )}
          <span {...saying('id')} className={cn(s.id(), 'text-label-small')}>
            {run.id.slice(-4)}
          </span>
        </span>
      </span>
      <Title run={run} look={look} still={still} end={titleEnd} heading />
      <span className={s.now()}>
        <NowMarks look={look} small />
        <WordsSaid run={run} look={look} among={among} cut />
        <span className={cn(s.end(), 'gap-1.5')}>
          {now.budget && (
            <span {...saying('budget')} className="inline-flex">
              <Ring budget={now.budget} />
            </span>
          )}
          <ClockSaid run={run} look={look} asOf={asOf} />
        </span>
      </span>
      <span data-foot className={s.foot()}>
        <span {...saying('graph')} className={s.steps()}>
          <StepGraph run={run} wrap={wrap} className={still} />
        </span>
        <CostSaid run={run} className="text-body-small" />
      </span>
      {children}
    </Framed>
  );
}

/** The run as a card at lg or a panel at xl: its meta line, its title, its step now, then its graph and Open run, or the panel's parts. */
function RunBig(props: RunProps & { look: Look; among: readonly PartRun[] }) {
  const { run, size, asOf, among, wrap, titleEnd, ringed, still, children, className, look } = props;
  const { s, now } = look;
  const xl = size === 'xl';
  const waiters = waitersOf(among, run.id).length;
  return (
    <Framed run={run} look={look} size={xl ? 'xl' : 'lg'} ringed={ringed} className={className}>
      <span {...saying('id', 'where', 'labels')} className={cn(s.head(), 'flex')}>
        <RunMeta run={run} whole={xl} />
      </span>
      <Title run={run} look={look} still={still} end={titleEnd} heading />
      <span className={s.now()}>
        <NowMarks look={look} words={xl} />
        <WordsSaid run={run} look={look} among={among} />
        <span className={s.end()}>
          {!xl && waiters > 0 && (
            <span {...saying('waitedBy')} className="inline-flex">
              <Fan count={waiters} />
            </span>
          )}
          {now.budget && (
            <span {...saying('budget')} className="inline-flex">
              <Ring budget={now.budget} words={xl} />
            </span>
          )}
          {!xl && <ClockSaid run={run} look={look} asOf={asOf} />}
        </span>
      </span>
      {xl ? (
        <PanelParts {...props} />
      ) : (
        <span data-foot className={s.foot()}>
          <span {...saying('graph')} className={s.steps()}>
            <StepGraph run={run} wrap={wrap} className={still} />
          </span>
          <CostSaid run={run} className="text-body-small" />
          <span {...saying('action')} className="ml-auto inline-flex">
            <CutButton to="/runs/$runId" params={{ runId: run.id }} quiet className={still}>
              {OPENS}
            </CutButton>
          </span>
        </span>
      )}
      {children}
    </Framed>
  );
}

/** What the panel adds under the step now: each step named under the graph, the facts, the runs, the last line and Open run. */
function PanelParts({ run, asOf, among, wrap, pick, read = null, still, look }: RunProps & { look: Look; among: readonly PartRun[] }) {
  const waiters = waitersOf(among, run.id);
  return (
    <>
      <span {...saying('graph', 'named')} className={look.s.steps()}>
        <NamedGraph run={run} read={read} now={asOf.getTime()} wrap={pick ? pickWrap(pick, still) : wrap} />
      </span>
      <span {...saying('facts', 'clock', 'cost')} className="contents">
        <Facts run={run} now={nowOf(run)} asOf={asOf} clock={<ClockSaid run={run} look={look} asOf={asOf} />} className={look.s.facts()} />
      </span>
      <span {...saying('runs', 'waitedBy')} data-waiters={waiters.length} className="contents">
        <RunsWaiting run={run} among={among} className={look.s.runs()} />
      </span>
      <span {...saying('lastLine', 'action')} className="contents">
        <PanelFoot run={run} step={look.now.step} read={read} still={still} className={look.s.foot()} />
      </span>
    </>
  );
}
