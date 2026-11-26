import { Body } from '@/components/ui/ds';
import type { RunView } from '@/lib/api/judged';
import { container } from '@/lib/meaning';
import { assigneeName } from '@/lib/runWords';
import { timeOfDay } from '@/lib/timeOfDay';
import { NOW_WORDS } from '@/lib/words';
import { cn } from '@/components/ui/ds/utils';
import { Actor } from '../actor/Actor';
import { cutShape } from './cut';

/** The cut of the assignee line's top-right corner, as the hold line's. */
const CUT = 9;

/**
 * Who has a run in hand, as its row, its page and its card say it under its words: the hold line's grey cut block (`data-assignee`),
 * told apart by its first words — who has it, and when it comes back to the person if its ask goes unanswered, or that nothing is timed
 * while nothing is asked; then why, as they said it, two lines at most and the whole on hover, where they said it; then who put it
 * (`Actor`), where the api knows. It never says "you": the board does not know who reads it.
 * @param props.assignee Who has the run, as the api serves it.
 */
export function AssigneeLine({ assignee }: { assignee: NonNullable<RunView['assignee']> }) {
  const back = assignee.comesBackAt === null ? NOW_WORDS.notTimed : NOW_WORDS.backAt(timeOfDay(new Date(assignee.comesBackAt)));
  return (
    <span
      data-assignee
      className={cn('flex w-full max-w-80 flex-col gap-0.5 px-2 py-1', container.grey)}
      style={{ clipPath: cutShape(CUT, 'top-right') }}
    >
      <Body
        component="span"
        size="small"
        data-assignee-who
        className="break-words text-on-surface"
        title={assignee.comesBackAt ?? undefined}
      >
        {`${NOW_WORDS.hasIt(assigneeName(assignee))} · ${back}`}
      </Body>
      {assignee.why !== undefined && (
        <Body component="span" size="small" data-assignee-why title={assignee.why} className="line-clamp-2 break-words">
          {assignee.why}
        </Body>
      )}
      {assignee.actor !== undefined && (
        <span data-assignee-by className="flex min-w-0 flex-wrap items-center gap-x-1">
          <Actor actor={assignee.actor} />
        </span>
      )}
    </span>
  );
}
