import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleDashed, CircleDot, type LucideIcon } from 'lucide-react';
import type { MilestoneRead, MilestoneState } from 'objects';
import { CutFrame, TextLink } from '@/components/look';
import { Button } from '@/components/ui/ds';
import { cn } from '@/components/ui/ds/utils';
import { milestonesQuery } from '@/lib/api/readiness';
import { keepStarterDismissed, MILESTONE_LINKS, MILESTONE_NAMES, readStarterDismissed, starterShown } from '@/lib/gettingStarted';

/** How each state of a milestone is drawn: a glyph and a word, so it is read without its colour. */
const MARK: Record<MilestoneState, { word: string; icon: LucideIcon; className: string }> = {
  done: { word: 'Done', icon: CircleCheck, className: 'text-on-surface-variant' },
  next: { word: 'Next', icon: CircleDot, className: 'text-yours' },
  later: { word: 'Later', icon: CircleDashed, className: 'text-on-surface-variant' },
};

/** One milestone: its mark, its name, and what it says; the next one linked to its page where it has one. */
function Row({ milestone }: { milestone: MilestoneRead }) {
  const mark = MARK[milestone.state];
  const Icon = mark.icon;
  const link = milestone.state === 'next' ? MILESTONE_LINKS[milestone.name] : undefined;
  return (
    <li data-milestone={milestone.name} data-milestone-state={milestone.state} className="flex items-start gap-2 py-1.5">
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', mark.className)} />
      <span className="sr-only">{mark.word}:</span>
      <div className="flex min-w-0 flex-col">
        {link === undefined ? (
          <span className="text-label-large text-on-surface">{MILESTONE_NAMES[milestone.name]}</span>
        ) : (
          <TextLink to={link} data-milestone-link className="text-label-large">
            {MILESTONE_NAMES[milestone.name]}
          </TextLink>
        )}
        <span className="text-body-small text-on-surface-variant">{milestone.message}</span>
      </div>
    </li>
  );
}

/** The floor's Getting started list: the four milestones in order, each read from the store, the next one linked, and Dismiss. */
export function GettingStarted({ milestones, onDismiss }: { milestones: readonly MilestoneRead[]; onDismiss: () => void }) {
  return (
    <CutFrame size={12}>
      <section data-getting-started aria-labelledby="getting-started" className="flex flex-col gap-2 p-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="getting-started" className="text-title-small font-title-small">
            Getting started
          </h2>
          <Button variant="text" size="xsmall" data-getting-started-dismiss onPress={onDismiss}>
            Dismiss
          </Button>
        </header>
        <ol className="grid gap-x-6 @xl/page:grid-cols-2 @4xl/page:grid-cols-4">
          {milestones.map((m) => (
            <Row key={m.name} milestone={m} />
          ))}
        </ol>
      </section>
    </CutFrame>
  );
}

/**
 * Getting started on the floor: the store's milestones as the api reads them, shown until a change is merged or the person dismisses it
 * in this browser (`starterShown`); nothing while the read is out or refused.
 */
export function GettingStartedOnFloor() {
  const milestones = useQuery(milestonesQuery);
  const [dismissed, setDismissed] = useState(readStarterDismissed);
  if (milestones.data === undefined || !starterShown(milestones.data.milestones, dismissed)) return null;
  return (
    <GettingStarted
      milestones={milestones.data.milestones}
      onDismiss={() => {
        keepStarterDismissed();
        setDismissed(true);
      }}
    />
  );
}
