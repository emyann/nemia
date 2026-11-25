import { CutButton } from '@/components/look';
import type { FirstBeat } from '../../../contracts/first-card.contract.ts';
import { firstBeatOf, firstRunOf } from '@/lib/firstCard';
import type { RunView } from '@/lib/api/judged';
import { container } from '@/lib/meaning';
import { cn } from '@/lib/utils';
import { Body } from '@/components/ui/ds';

/** What each beat's hint says. */
const SAYS: Readonly<Record<FirstBeat, string>> = {
  card: 'This is your card’s run: the daemon files its first step on its next pass.',
  steps: 'Each step is an agent at work. Press one in the graph to watch it.',
  gate: 'It waits on you: read the work, then approve it to land, or send it back.',
  landed: 'Landed: your first change is on the base branch.',
};

/**
 * One hint of the welcome's first card, drawn on the run's page where its beat is (`beat`): shown only where the run is the first
 * card's and stands at that beat now (`firstBeatOf`), read from the run as the api answers it, so it moves on when the person does the
 * thing, wherever they did it. The gate's is drawn in the colour of what waits on a person; landed's leads to what is next.
 */
export function FirstHint({ run, beat }: { run: Pick<RunView, 'labels' | 'status' | 'steps'>; beat: FirstBeat }) {
  if (firstBeatOf(firstRunOf(run)) !== beat) return null;
  return (
    <aside
      data-first-hint={beat}
      aria-label="Your first card"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-shape-small px-4 py-3',
        container[beat === 'gate' ? 'yours' : 'grey'],
      )}
    >
      <Body size="medium" className="m-0">
        {SAYS[beat]}
      </Body>
      {beat === 'landed' && (
        <CutButton data-first-next to="/welcome/next">
          What next
        </CutButton>
      )}
    </aside>
  );
}
