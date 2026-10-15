import { useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, PopoverContext } from 'react-aria-components';
import { useQuery } from '@tanstack/react-query';
import { BottomSheet, PreviewCard, PreviewTrigger } from '@/components/ui/ds';
import { agentsQuery, runQuery, type RunSummary } from '@/lib/api';
import { barSaid } from '@/lib/runWords';
import type { StepState } from '@/lib/status';
import { stepCardOf, type StepCardInput } from '@/lib/stepCard';
import { cardOpened, previewSide, useACardOpen, useSheetPreview, type PreviewSide } from '@/lib/useSheetPreview';
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

/**
 * Ends a Tab on the bar that the preview has already moved into its card, so the grid the bar stands in (the table in flight), which
 * takes Tab as leaving the grid, does not move the focus back out of the card.
 */
const intoTheCard = (event: KeyboardEvent): void => {
  if (event.key === 'Tab' && document.activeElement?.closest('[data-slot="preview-card"]')) event.stopPropagation();
};

/** The rail a bar stands in, or null outside one. */
const railOf = (bar: Element | null | undefined): HTMLElement | null => bar?.closest<HTMLElement>('[data-run-steps]') ?? null;

/** A ref that reads the rail of the bar `bar` holds, or the bar outside a rail, each time it is read. */
const railRefOf = (bar: { current: Element | null } | undefined): { readonly current: Element | null } =>
  Object.defineProperty<{ readonly current: Element | null }>({ current: null }, 'current', {
    get: () => railOf(bar?.current) ?? bar?.current ?? null,
  });

/**
 * Gives the kit's preview card its trigger's popover, positioned by the bar's whole rail rather than the bar, so that the card stands
 * clear of every bar of the rail and the pointer slides from one bar to the next; and with no entering animation, during which a card
 * that grows as its run is read is not placed again by its new height, and stays capped to the height its first answer took.
 */
function ByTheRail({ children }: { children: ReactNode }) {
  const context = useContext(PopoverContext) as { triggerRef?: { current: Element | null } } | null;
  const bar = context?.triggerRef;
  const rail = useMemo(() => railRefOf(bar), [bar]);
  return <PopoverContext.Provider value={{ ...context, triggerRef: rail, shouldSkipAnimation: true }}>{children}</PopoverContext.Provider>;
}

/**
 * A bar where a pointer hovers and the window has room: the trigger of the kit's preview, whose card stands by the bar's rail
 * (`previewSide`, read as it opens), clear of its bars, and beside it where the window has room, so that it keeps the window's whole
 * height and shows its action unscrolled; it gives up its surface to the frame, keeps 12 pixels around it for its glow, and scrolls
 * only in a window shorter than itself. While another bar's card is open it opens at once (`useACardOpen`), so that a pointer sliding
 * along a rail opens each card in turn.
 */
function HoverPreview({ run, step, asOf, children }: { run: RailRun; step: RailStep; asOf: Date; children: ReactNode }) {
  const id = useId();
  const bar = useRef<HTMLButtonElement>(null);
  const [side, setSide] = useState<PreviewSide>('end top');
  const warm = useACardOpen();
  useEffect(() => () => cardOpened(id, false), [id]);
  const opened = (open: boolean): void => {
    cardOpened(id, open);
    const rail = railOf(bar.current);
    if (open && rail) setSide(previewSide(rail.getBoundingClientRect(), innerWidth));
  };
  return (
    <PreviewTrigger delay={warm ? 0 : undefined} onOpenChange={opened}>
      <Button
        ref={bar}
        aria-label={barSaid(step.name, step.state)}
        data-step-bar={step.name}
        data-step-preview="card"
        className={BAR_BUTTON}
        onKeyDown={intoTheCard}
      >
        {children}
      </Button>
      <ByTheRail>
        <PreviewCard
          placement={side}
          offset={0}
          className="max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-none bg-transparent p-3 shadow-none"
        >
          <OpenedCard run={run} step={step.name} asOf={asOf} />
        </PreviewCard>
      </ByTheRail>
    </PreviewTrigger>
  );
}

/** A bar where no pointer hovers or the window is compact: a press opens the same card in the kit's modal bottom sheet. */
function SheetPreview({ run, step, asOf, children }: { run: RailRun; step: RailStep; asOf: Date; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const said = barSaid(step.name, step.state);
  return (
    <>
      <Button aria-label={said} data-step-bar={step.name} data-step-preview="sheet" className={BAR_BUTTON} onPress={() => setOpen(true)}>
        {children}
      </Button>
      <BottomSheet variant="modal" isOpen={open} onClose={() => setOpen(false)} aria-label={said} heights={['partial', 'expanded']}>
        <OpenedCard run={run} step={step.name} asOf={asOf} />
      </BottomSheet>
    </>
  );
}

/** A bar of the rail as a button that opens its step's card: by the kit's preview, or as a sheet where it cannot hover. */
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
