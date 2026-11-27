import { snackbar } from '@/components/ui/ds';

/** A write whose thing leaves the page once it succeeds: a run removed, pruned or held, a card filed, a proposal declined. */
type Written = 'removed' | 'pruned' | 'held' | 'filed' | 'started' | 'declined';

/** What each write says once it succeeded, naming the thing it wrote. */
const WRITTEN: Record<Written, (name: string) => string> = {
  removed: (run) => `Run ${run} removed`,
  pruned: (run) => `Run ${run} pruned`,
  held: (run) => `Run ${run} held`,
  filed: (card) => `Card ${card} filed`,
  started: (card) => `Card ${card} will start`,
  declined: (proposal) => `Proposal ${proposal} declined`,
};

/**
 * Say in the kit's snackbar, which the frame hosts (`routes/__root.tsx`) so it outlives the page that wrote, that a write succeeded and
 * what it wrote left the page. No Undo is offered: a refusal stays inline beside its form, never here.
 * @param written Which write succeeded.
 * @param name The run's id, the card's or the proposal's name.
 * @param open Opens the thing's page, offered as Open; none where it has no page to go to.
 */
export function sayWritten(written: Written, name: string, open?: () => void) {
  snackbar(WRITTEN[written](name), open ? { action: { label: 'Open', onPress: open } } : {});
}
