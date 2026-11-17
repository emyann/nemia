/**
 * What a person can do to a whole run, behind one button in its header: Remove (a try), Hold or Lift (a hold standing), and Prune (a run
 * over that holds something on disk), each the existing control with its own question and refusal. None where the run offers none.
 */
import { Ellipsis } from 'lucide-react';
import { Button, Popover, PopoverTrigger } from '@/components/ui/ds';
import { holdable } from '@/lib/hold';
import { prunable } from '@/lib/prune';
import type { RunDetail } from '@/lib/runView';
import { HoldRun } from './HoldRun';
import { LiftHold } from './LiftHold';
import { PruneRun } from './PruneRun';
import { RemoveRun } from './RemoveRun';

/**
 * The run's actions: Remove for a try, Lift while held, else Hold where it can be held, and Prune where it would take anything.
 *
 * @param run the run the actions are on
 */
export const runActionsOf = (run: RunDetail): Array<'remove' | 'hold' | 'lift' | 'prune'> => [
  ...(run.try ? (['remove'] as const) : []),
  ...(run.holding ? (['lift'] as const) : holdable(run) ? (['hold'] as const) : []),
  ...(prunable(run) ? (['prune'] as const) : []),
];

/** The run's menu: one button opening the run's actions (`runActionsOf`), each opening its own question; nothing where it offers none. */
export function RunMenu({ run }: { run: RunDetail }) {
  const actions = runActionsOf(run);
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
