import { useState, type ReactNode } from 'react';
import { Button } from 'react-aria-components';
import { useQuery } from '@tanstack/react-query';
import { BottomSheet, PreviewCard, PreviewTrigger } from '@/components/ui/ds';
import { agentsQuery, runQuery, type RunSummary } from '@/lib/api';
import { barSaid } from '@/lib/runWords';
import type { StepState } from '@/lib/status';
import { stepCardOf, type StepCardInput } from '@/lib/stepCard';
import { useSheetPreview } from '@/lib/useSheetPreview';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { StepCard } from './StepCard';

/** The run a rail belongs to, as its row on the list gives it. */
type RailRun = Pick<RunSummary, 'id' | 'cancelledAt' | 'holding' | 'steps'>;

/** A bar of the rail as the rail hands it: its step's name and state. */
type RailStep = { name: string; state: StepState };

/** A bar's button: 32 pixels tall, its 8-pixel bar drawn in its middle, pulled in so that the rail keeps its height. */
const BAR_BUTTON = cn('-my-3 grid h-8 w-full cursor-pointer content-center outline-none', focusRing());

/**
 * The card of a step, read once it opens: the run's own answer (one read a run, held by the query's cache) and the agents, at the
 * instant the run was read; while they are read, what the row already knows.
 */
function OpenedCard({ run, step, asOf }: { run: RailRun; step: string; asOf: Date }) {
  const detail = useQuery(runQuery(run.id));
  const agents = useQuery(agentsQuery);
  const input: StepCardInput = { run, step, detail: detail.data, agents: agents.data, now: asOf };
  return <StepCard facts={stepCardOf(input)} />;
}

/** A bar where a pointer hovers and the window has room: the trigger of the kit's preview, whose card gives up its surface to the frame. */
function HoverPreview({ run, step, asOf, children }: { run: RailRun; step: RailStep; asOf: Date; children: ReactNode }) {
  return (
    <PreviewTrigger>
      <Button aria-label={barSaid(step.name, step.state)} data-step-bar={step.name} className={BAR_BUTTON}>
        {children}
      </Button>
      <PreviewCard placement="bottom start" className="max-w-[calc(100vw-2rem)] rounded-none bg-transparent p-0 shadow-none">
        <OpenedCard run={run} step={step.name} asOf={asOf} />
      </PreviewCard>
    </PreviewTrigger>
  );
}

/** A bar where no pointer hovers or the window is compact: a press opens the same card in the kit's modal bottom sheet. */
function SheetPreview({ run, step, asOf, children }: { run: RailRun; step: RailStep; asOf: Date; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const said = barSaid(step.name, step.state);
  return (
    <>
      <Button aria-label={said} data-step-bar={step.name} className={BAR_BUTTON} onPress={() => setOpen(true)}>
        {children}
      </Button>
      <BottomSheet variant="modal" isOpen={open} onClose={() => setOpen(false)} aria-label={said} heights={['partial', 'expanded']}>
        <OpenedCard run={run} step={step.name} asOf={asOf} />
      </BottomSheet>
    </>
  );
}

/** A bar of the rail as a button that opens its step's card: by the kit's preview, or as a sheet where it cannot hover (`useSheetPreview`). */
function BarPreview(props: { run: RailRun; step: RailStep; asOf: Date; children: ReactNode }) {
  return useSheetPreview() ? <SheetPreview {...props} /> : <HoverPreview {...props} />;
}

/** What wraps each bar of `run`'s rail (`RunSteps`' `wrap`): a button that opens its step's card, its times said at `asOf`. */
export const previewBar =
  (run: RailRun, asOf: Date) =>
  (bar: ReactNode, step: RailStep): ReactNode => (
    <BarPreview run={run} step={step} asOf={asOf}>
      {bar}
    </BarPreview>
  );
