import type { RunView } from '@/lib/api/judged';
import { container } from '@/lib/meaning';
import { NOW_WORDS } from '@/lib/words';
import { cn } from '@/components/ui/ds/utils';
import { Actor } from '../actor/Actor';
import { cutShape } from './cut';

/** The cut of the hold line's top-right corner, as a tag's. */
const CUT = 9;

/**
 * A held run's hold, as its row says it under its words: a grey block (`data-hold`), the ground of the run page's Held banner, cut at
 * its top right as the look's tags are. It says why the run is held, as the person who put the hold said it, two lines at most and the
 * whole on hover, or that they gave no reason; then who they said they are (`by`), and who put it (`Actor`), each where the hold has it.
 * The hold is grey whoever it waits on: the row's words and chip say whether it waits on a person.
 * @param holding The run's hold, as the api serves it.
 */
export function HoldLine({ holding }: { holding: NonNullable<RunView['holding']> }) {
  const said = holding.by !== undefined || holding.actor !== undefined;
  return (
    <span
      data-hold
      className={cn('flex w-full max-w-80 flex-col gap-0.5 px-2 py-1 text-body-small', container.grey)}
      style={{ clipPath: cutShape(CUT, 'top-right') }}
    >
      <span data-hold-why title={holding.why} className={cn('line-clamp-2 break-words', holding.why && 'text-on-surface')}>
        {holding.why ?? NOW_WORDS.noWhy}
      </span>
      {said && (
        <span data-hold-by className="flex min-w-0 flex-wrap items-center gap-x-1">
          {holding.by !== undefined && <span className="break-words">{`${NOW_WORDS.by} ${holding.by}`}</span>}
          {holding.by !== undefined && holding.actor !== undefined && <span aria-hidden>·</span>}
          <Actor actor={holding.actor} />
        </span>
      )}
    </span>
  );
}
