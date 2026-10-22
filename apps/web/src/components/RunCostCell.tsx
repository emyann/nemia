import { Button } from 'react-aria-components';
import type { ListedRun } from '@/lib/api';
import { tokensBreakdown } from '@/lib/breakdown';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { BreakdownPreview } from './look';

/** The words in the cell, mono and on one line. */
const WORDS = 'font-mono text-body-small whitespace-nowrap';

/**
 * What a run's Cost column says in either runs table: the cost as the api words it, nothing where none was measured. The words are a
 * button, so a resting pointer and the keyboard both open the preview over it: the run's tokens by kind (`tokensBreakdown`), headed by
 * these very words, from the row the list already carries. A row with a cost and no tokens draws the words as a plain span that takes
 * no focus, as the Clock cell does with no clock (`RunClockCell`).
 */
export function RunCostCell({ run }: { run: Pick<ListedRun, 'cost' | 'tokens'> }) {
  if (!run.cost) return null;
  if (!run.tokens)
    return (
      <span data-cost-words className={WORDS}>
        {run.cost.said}
      </span>
    );
  return (
    <BreakdownPreview breakdown={tokensBreakdown(run.tokens, run.cost.said)}>
      <Button data-cost-words className={cn(WORDS, 'cursor-default rounded-[4px]', focusRing())}>
        {run.cost.said}
      </Button>
    </BreakdownPreview>
  );
}
