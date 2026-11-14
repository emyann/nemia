/**
 * A step's part: one model (`stepPartOf`, lib/stepPart.ts) drawn at three sizes — on the graph's node (S), as the preview card (M), and
 * whole in the ledger, the step bar and the step's page (L) — by leaving slots out, never by reordering them (`slotsOf`): its head, what
 * it asks of you, what it got, what it said, what it gave, and its detail. So the node, the card, the ledger's row, the bar and the step's
 * page cannot disagree. Each step keeps its own try picker, the address keeping the choice (`?try=`), and every slot is of that try.
 */
import type { AgentListing } from '@/lib/api/agents';
import type { RunDetail, StepView } from '@/lib/runView';
import { slotsOf, stepPartOf, type PartSize, type StepPartModel } from '@/lib/stepPart';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';
import { CutFrame } from '../../look';
import { PartAsks } from './PartAsks';
import { PartDetail } from './PartDetail';
import { PartGave } from './PartGave';
import { PartGot } from './PartGot';
import { PartHead } from './PartHead';
import { PartSaid } from './PartSaid';
import { TryPicker } from './TryPicker';

/** The agents a head names a role from: as the agents' listing gives them. */
type Agents = ReadonlyArray<Pick<AgentListing, 'name' | 'role'>>;

/** How wide each size is drawn: the node's width, the card's, and the whole of what holds it. */
const WIDTH: Record<PartSize, string> = { S: 'w-56', M: 'w-[416px] max-w-full', L: 'w-full' };

/** The space inside each size's frame. */
const INSIDE: Record<PartSize, string> = { S: 'gap-1.5 p-2.5', M: 'gap-3.5 p-4', L: 'gap-4 p-4' };

/** One slot of the part but its head, drawn where the step holds something for it. */
function Slot({
  slot,
  part,
  run,
  step,
  size,
}: {
  slot: Exclude<ReturnType<typeof slotsOf>[number]['slot'], 'head'>;
  part: StepPartModel;
  run: RunDetail;
  step: StepView;
  size: PartSize;
}) {
  if (slot === 'asks') return part.asks === 'none' ? null : <PartAsks run={run} step={step} asks={part.asks} size={size} />;
  if (slot === 'got') return part.got === 'none' ? null : <PartGot run={run} got={part.got} />;
  if (slot === 'said') return part.said === 'none' ? null : <PartSaid step={step} said={part.said} />;
  if (slot === 'gave') return part.gave === 'none' ? null : <PartGave step={step} gave={part.gave} size={size} />;
  return part.detail === 'none' ? null : <PartDetail run={run} step={step} detail={part.detail} />;
}

/**
 * The part of the step `step` of the run's view `view`, at `size`. `agents` gives its agent a role where they are read; `now` the
 * instant its times are said at, else the clock, read again every 30 seconds. `here` is the step's own page, where the head links to no
 * page; `id` the part's anchor, as the ledger names it (`step-<name>`).
 */
export function StepPart({
  view,
  step,
  size,
  agents,
  now,
  here = false,
  id,
}: {
  view: RunDetail;
  step: string;
  size: PartSize;
  agents?: Agents | undefined;
  now?: Date;
  here?: boolean;
  id?: string;
}) {
  const ticking = useNow(30_000);
  const part = stepPartOf(view, step, now ?? new Date(ticking), agents);
  const own = view.steps.find((s) => s.name === step);
  return (
    <CutFrame hue={part.head.hue} size={size === 'S' ? 12 : 24} className={cn(WIDTH[size], size === 'L' && 'scroll-mt-4')}>
      <article
        id={id}
        data-step-part={size}
        data-step-name={step}
        aria-label={step}
        className={cn('flex min-w-0 flex-col text-on-surface', INSIDE[size])}
      >
        {slotsOf(part, size).map(({ slot }) =>
          slot === 'head' ? (
            <div key={slot} className="flex flex-col gap-2">
              <PartHead head={part.head} size={size} action={size === 'M' || (size === 'L' && !here)} />
              {size === 'L' && own && <TryPicker step={step} tries={own.tries} shown={own.shown} />}
            </div>
          ) : (
            own && <Slot key={slot} slot={slot} part={part} run={view} step={own} size={size} />
          ),
        )}
      </article>
    </CutFrame>
  );
}
