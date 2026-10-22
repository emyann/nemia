import { Button } from 'react-aria-components';
import type { ListedRun, RunClock } from '@/lib/api';
import { clockBreakdown } from '@/lib/breakdown';
import { runClock } from '@/lib/factory';
import { whenWords } from '@/lib/runWords';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { BreakdownPreview } from './look';

/** What a Clock cell reads of a row: what its clock is written from, and where that wall time went. */
type Clocked = Pick<ListedRun, 'createdAt' | 'startedAt' | 'cancelledAt' | 'waiting' | 'waitingOnYou' | 'atWork' | 'holding'> & {
  clock: RunClock | null;
};

/** The words in the cell, mono and on one line. */
const WORDS = 'font-mono text-body-small whitespace-nowrap';

/**
 * What a run's Clock column says in either runs table: the time at work, to the minute, said against `asOf` — the sessions and the
 * checks that ran, two at once counted once, and none of the waits (`runClock`, drawn as a row says it). A run nothing of which is
 * filed yet says `not started`, never the minutes since it was filed: that wait is not work, and the Created column says it.
 *
 * The words are a button, so a resting pointer and the keyboard both open the preview over it: the breakdown the waiting card's Clock
 * tile shows, from the one function (`clockBreakdown`), its head these very words and its foot the wall time the rows add up to. A row
 * whose `clock` the api could not read has nothing to break down, and draws the words as a plain span that takes no focus, with the
 * times in full on its `title`.
 */
export function RunClockCell({ run, asOf, finished }: { run: Clocked; asOf: Date; finished: boolean }) {
  const clock = runClock(run, asOf.getTime(), finished, 'row');
  if (!run.clock)
    return (
      <span data-clock-words title={clock.title} className={WORDS}>
        {clock.words}
      </span>
    );
  return (
    <BreakdownPreview breakdown={clockBreakdown(run.clock, clock.words, whenWords(new Date(run.createdAt), asOf))}>
      <Button data-clock-words className={cn(WORDS, 'cursor-default rounded-[4px]', focusRing())}>
        {clock.words}
      </Button>
    </BreakdownPreview>
  );
}
