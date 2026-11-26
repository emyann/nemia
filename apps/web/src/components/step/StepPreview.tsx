import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, TooltipTrigger } from '@/components/ui/ds';
import { HeldTooltip } from '@/components/look';
import { agentsQuery } from '@/lib/api/agents';
import type { RunView } from '@/lib/api/judged';
import { type WaitOn } from 'objects';
import { useRunRead } from '@/lib/runView';
import { barSaid } from '@/lib/runWords';
import type { StepState } from '@/lib/status';
import { headOf } from '@/lib/stepPart';
import { useBar } from '@/lib/useBar';
import { StepGlance } from './StepGlance';

/** The run a rail belongs to, as its row on the list gives it. */
type RailRun = Pick<RunView, 'id' | 'cancelledAt' | 'holding' | 'steps'>;

/** A node of the graph as the graph hands it: its step's name, state and wait. */
type RailStep = { name: string; state: StepState; on: WaitOn | null };

/** A node's button, the kit's pressable: the whole of its holder on the graph, 24 pixels square on a row, its mark drawn in its middle. */
const BAR_BUTTON = 'grid size-full place-items-center rounded-none';

/**
 * The glance of a step, read once its tooltip opens: the run's own answer (one read a run, held by the query's cache) and the agents,
 * at the instant the run was read; while they are read, the head of what the row already knows.
 */
function Glanced({ run, step, asOf }: { run: RailRun; step: string; asOf: Date }) {
  const detail = useRunRead(run.id);
  const agents = useQuery(agentsQuery);
  return <StepGlance head={headOf({ run, step, detail: detail.view, agents: agents.data, now: asOf })} />;
}

/**
 * A bar of the rail: the kit's pressable under the kit's rich tooltip, which holds the step's glance on hover and on focus, and a press,
 * or Enter, opens the step in the frame's side sheet (`useBar`).
 */
function Bar({ run, step, asOf, children }: { run: RailRun; step: RailStep; asOf: Date; children: ReactNode }) {
  const bar = useBar();
  const said = barSaid(step.name, step.state, step.on, run.holding != null);
  return (
    <TooltipTrigger delay={300}>
      <Pressable
        aria-label={said}
        data-step-bar={step.name}
        className={BAR_BUTTON}
        onPress={() => bar.toggle({ kind: 'step', run: run.id, step: step.name })}
      >
        {children}
      </Pressable>
      <HeldTooltip variant="rich" placement="bottom start">
        <Glanced run={run} step={step.name} asOf={asOf} />
      </HeldTooltip>
    </TooltipTrigger>
  );
}

/**
 * What wraps each node of `run`'s graph (`StepGraph`'s `wrap`): a button that shows its step's glance and opens its step in the side
 * sheet, its times said at `asOf`.
 *
 * @param run the run whose rail it is
 * @param asOf the instant its times are said at
 */
export const previewBar = (run: RailRun, asOf: Date) => (bar: ReactNode, step: RailStep) => (
  <Bar run={run} step={step} asOf={asOf}>
    {bar}
  </Bar>
);
