/**
 * What a person can do to a whole run, behind one button in its header: Remove (a try), Hold or Lift (a hold standing), and Prune (a run
 * over that holds something on disk), each asking its own question once pressed. None where the run offers none. The list is
 * `runActionsOf`, which the menu a right-click opens where the run is listed reads too (`RunActions`), each action asking there the same
 * question (`RunQuestion`) in the same popover (`QuestionPopover`).
 */
import { useRef, useState, type RefObject } from 'react';
import { Ellipsis } from 'lucide-react';
import { Button, Menu, Popover } from '@/components/ui/ds';
import type { RunView } from '@/lib/api/judged';
import { runActionsOf, type RunAction } from '@/lib/runActions';
import type { RunDetail } from '@/lib/runView';
import { HoldQuestion } from './HoldRun';
import { LiftHold } from './LiftHold';
import { PruneQuestion } from './PruneRun';
import { RemoveRun } from './RemoveRun';

/** The name each question's surface is given, wherever it is asked. */
const ASKED: Record<RunAction, (id: string) => string> = {
  remove: (id) => `Remove ${id}`,
  lift: (id) => `Lift the hold on ${id}`,
  hold: (id) => `Hold ${id}`,
  prune: (id) => `Prune ${id}`,
};

/**
 * The run's menu: one button opening the kit's `Menu` of the run's actions (`runActionsOf`), by a press or the keyboard, each item, once
 * pressed and the menu closed, asking its question in a popover beside the button; nothing where the run offers none. A removal asked
 * here goes back to Runs, the run's page being gone.
 */
export function RunMenu({ run }: { run: RunDetail }) {
  const button = useRef<HTMLButtonElement>(null);
  const [asked, setAsked] = useState<RunAction | null>(null);
  const actions = runActionsOf(run);
  if (!actions.length) return null;
  return (
    <>
      <Menu
        placement="bottom end"
        offset={6}
        triggerButton={
          <Button
            ref={button}
            variant="outlined"
            size="xsmall"
            icon={Ellipsis}
            data-run-menu={actions.map((action) => action.key).join(' ')}
            aria-label={`Actions on ${run.id}`}
          >
            Actions
          </Button>
        }
        items={actions.map(({ key, label }) => ({ id: key, label, onAction: () => setAsked(key) }))}
      />
      <QuestionPopover anchor={button} asked={asked ? { run, action: asked } : null} onClose={() => setAsked(null)} leave />
    </>
  );
}

/**
 * The popover an action's question is asked in, once its press in a menu was made, beside `anchor` (the menu's button, the listed run's
 * row or card), named as the action (`ASKED`): `asked` is the run and the action, null while none is; `onClose` closes it, on Escape, a
 * press outside, Keep it, Cancel, Close, or the write done; `leave` sends a removal back to Runs, asked on the run's own page.
 */
export function QuestionPopover({
  anchor,
  asked,
  onClose,
  leave = false,
}: {
  anchor: RefObject<Element | null>;
  asked: { run: RunView; action: RunAction } | null;
  onClose: () => void;
  leave?: boolean;
}) {
  return (
    <Popover
      triggerRef={anchor}
      isOpen={asked !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="bottom end"
      aria-label={asked ? ASKED[asked.action](asked.run.id) : 'Actions on the run'}
      className="max-h-[inherit] w-96 space-y-3 overflow-y-auto"
    >
      {asked && <RunQuestion run={asked.run} action={asked.action} onClose={onClose} leave={leave} />}
    </Popover>
  );
}

/**
 * The question an action asks once its press in a menu was made: Remove and Lift their second press with Keep it, Hold its form, Prune its
 * choice and its second press. `onClose` closes the surface it is asked in, on Keep it, Cancel or Close, and once the write is done; each
 * write reads the run and the lists again (`runsMoved`). `leave` sends a removal back to Runs.
 */
export function RunQuestion({
  run,
  action,
  onClose,
  leave = false,
}: {
  run: RunView;
  action: RunAction;
  onClose: () => void;
  leave?: boolean;
}) {
  if (action === 'remove') return <RemoveRun id={run.id} onClose={onClose} leave={leave} />;
  if (action === 'lift') return <LiftHold id={run.id} onClose={onClose} />;
  if (action === 'hold') return <HoldQuestion run={run} onClose={onClose} />;
  return <PruneQuestion run={run} onClose={onClose} />;
}
