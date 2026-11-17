/**
 * What a person can do to a whole run, behind one button in its header: Remove (a try), Hold or Lift (a hold standing), and Prune (a run
 * over that holds something on disk), each the existing control with its own question and refusal. None where the run offers none. The
 * list is `runActionsOf`, which the menu a right-click opens where the run is listed reads too (`RunActions`), each action asking there
 * the same question (`RunQuestion`).
 */
import { Ellipsis } from 'lucide-react';
import { Button, Popover, PopoverTrigger } from '@/components/ui/ds';
import type { RunView } from '@/lib/api/judged';
import { runActionsOf, type RunAction } from '@/lib/runActions';
import type { RunDetail } from '@/lib/runView';
import { HoldQuestion, HoldRun } from './HoldRun';
import { LiftHold } from './LiftHold';
import { PruneQuestion, PruneRun } from './PruneRun';
import { RemoveRun } from './RemoveRun';

/** The run's menu: one button opening the run's actions (`runActionsOf`), each opening its own question; nothing where it offers none. */
export function RunMenu({ run }: { run: RunDetail }) {
  const actions = runActionsOf(run).map((action) => action.key);
  if (!actions.length) return null;
  return (
    <PopoverTrigger>
      <Button variant="outlined" size="xsmall" icon={Ellipsis} data-run-menu={actions.join(' ')} aria-label={`Actions on ${run.id}`}>
        Actions
      </Button>
      <Popover
        aria-label={`Actions on ${run.id}`}
        data-run-actions
        placement="bottom end"
        offset={6}
        className="flex w-80 flex-col items-start gap-3"
      >
        {actions.includes('remove') && <RemoveRun id={run.id} />}
        {actions.includes('lift') && <LiftHold id={run.id} />}
        {actions.includes('hold') && <HoldRun run={run} />}
        {actions.includes('prune') && <PruneRun run={run} />}
      </Popover>
    </PopoverTrigger>
  );
}

/**
 * The question an action asks once its press in a menu was made, as the run's page asks it: Remove and Lift their second press with Keep
 * it, Hold its form, Prune its choice and its second press. `onClose` closes the surface it is asked in, on Keep it, Cancel or Close, and
 * once the write is done; each write reads the run and the lists again (`runsMoved`).
 */
export function RunQuestion({ run, action, onClose }: { run: RunView; action: RunAction; onClose: () => void }) {
  if (action === 'remove') return <RemoveRun id={run.id} onClose={onClose} />;
  if (action === 'lift') return <LiftHold id={run.id} onClose={onClose} />;
  if (action === 'hold') return <HoldQuestion run={run} onClose={onClose} />;
  return <PruneQuestion run={run} onClose={onClose} />;
}
