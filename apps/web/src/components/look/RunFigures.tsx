import { Button } from 'react-aria-components';
import type { ListedRun, RunClock as Clock } from '@/lib/api/runs';
import { clockBreakdown, tokensBreakdown } from '@/lib/breakdown';
import { runClock } from '@/lib/factory';
import { whenWords } from '@/lib/runWords';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { Body } from '@/components/ui/ds';
import { BreakdownPreview } from './Breakdown';

/** What a Clock cell reads of a row: what its clock is written from, and where that wall time went. */
type Clocked = Pick<ListedRun, 'createdAt' | 'startedAt' | 'cancelledAt' | 'waiting' | 'waitingOnYou' | 'atWork' | 'holding'> & {
  clock: Clock | null;
};

/** The words in the cell, mono and on one line. */
const WORDS = 'font-mono whitespace-nowrap';

/**
 * What a run's Clock column says in either runs table: the time at work, to the minute, said against `asOf` — the sessions and the
 * checks that ran, two at once counted once, and none of the waits (`runClock`, drawn as a row says it). A run nothing of which is
 * filed yet says `not started`, never the minutes since it was filed: that wait is not work, and the Created column says it.
 *
 * The words are a button, so a resting pointer and the keyboard both open the preview over it: the breakdown the waiting card's Clock
 * tile shows, from the one function (`clockBreakdown`), its head these very words and its foot the wall time the rows add up to. A row
 * whose `clock` the api could not read has nothing to break down, and draws the words as a plain span that takes no focus, with the
 * times in full on its `title`. Either carries the instant they count from, `data-clock-from`. `size` is the words' body role, small
 * where a part draws them smaller than a row, and `className` their ink.
 */
export function RunClock({
  run,
  asOf,
  finished,
  size = 'medium',
  className,
}: {
  run: Clocked;
  asOf: Date;
  finished: boolean;
  size?: 'small' | 'medium';
  className?: string;
}) {
  const clock = runClock(run, asOf.getTime(), finished, 'row');
  if (!run.clock)
    return (
      <Body size={size} component="span" data-clock-words data-clock-from={clock.at} title={clock.title} className={cn(WORDS, className)}>
        {clock.words}
      </Body>
    );
  return (
    <BreakdownPreview breakdown={clockBreakdown(run.clock, clock.words, whenWords(new Date(run.createdAt), asOf))}>
      <Button data-clock-words data-clock-from={clock.at} className={cn(WORDS, className, 'cursor-default rounded-[4px]', focusRing())}>
        <Body size={size} component="span">
          {clock.words}
        </Body>
      </Button>
    </BreakdownPreview>
  );
}

/**
 * What a run's Cost column says in either runs table: the cost as the api words it, nothing where none was measured. The words are a
 * button, so a resting pointer and the keyboard both open the preview over it: the run's tokens by kind (`tokensBreakdown`), headed by
 * these very words, from the row the list already carries. A row with a cost and no tokens draws the words as a plain span that takes
 * no focus, as the Clock cell does with no clock (`RunClock`). `size` sets the words' body role, as the clock's does.
 */
export function RunCost({ run, size = 'medium' }: { run: Pick<ListedRun, 'cost' | 'tokens'>; size?: 'small' | 'medium' }) {
  if (!run.cost) return null;
  if (!run.tokens)
    return (
      <Body size={size} component="span" data-cost-words className={WORDS}>
        {run.cost.said}
      </Body>
    );
  return (
    <BreakdownPreview breakdown={tokensBreakdown(run.tokens, run.cost.said)}>
      <Button data-cost-words className={cn(WORDS, 'cursor-default rounded-[4px]', focusRing())}>
        <Body size={size} component="span">
          {run.cost.said}
        </Body>
      </Button>
    </BreakdownPreview>
  );
}
