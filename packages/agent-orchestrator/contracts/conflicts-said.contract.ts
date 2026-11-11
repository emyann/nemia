/**
 * What a pass owes the feed of one factory's upgrade conflicts (agent-orchestrator, src/feed/feed.ts): the reason of the line it writes
 * about the factory (`involved {kind: 'Factory'}`), or none. `said` is what the feed said last of that factory's conflicts, read off the
 * feed's own lines (`foldFeed`), none where it said nothing; `pending` is whether the factory's `ConflictsPending` condition is `True`
 * in the status the controller wrote, as the pass read it.
 *
 * A standing word, not a one-shot: the condition turning `True` is said once, and turning back `False` once, however many passes
 * read it and whichever daemon reads the feed after a restart (level-triggered). A factory whose conflicts the feed never said pending
 * is never said settled, as a factory left at `manual` is never said a level.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The reasons a factory's conflicts line names: an upgrade waiting on a person's choice, or that wait over. */
export type ConflictsReason = 'ConflictsPending' | 'ConflictsSettled';

const PENDING: ConflictsReason = 'ConflictsPending';
const SETTLED: ConflictsReason = 'ConflictsSettled';

const conflictsDueSpec = spec<(said: ConflictsReason | undefined, pending: boolean) => ConflictsReason | undefined>({
  ensures: {
    aPendingConflictIsSaid: {
      description:
        'A factory whose upgrade waits on a choice is said to have conflicts pending, where the feed said nothing of it or said them settled',
      condition: ({ input: [said, pending], output }) => !pending || said === PENDING || output === PENDING,
    },
    pendingIsNotSaidAgain: {
      description: 'A factory the feed last said has conflicts pending, and that still has, owes no line',
      condition: ({ input: [said, pending], output }) => !pending || said !== PENDING || output === undefined,
    },
    settledFollowsPending: {
      description: 'A factory the feed last said has conflicts pending, and that has none now, is said to have them settled',
      condition: ({ input: [said, pending], output }) => pending || said !== PENDING || output === SETTLED,
    },
    noConflictOwesNothing: {
      description: 'A factory with no conflict pending, of which the feed has no pending conflict to settle, owes no line',
      condition: ({ input: [said, pending], output }) => pending || said === PENDING || output === undefined,
    },
  },
});

/** `conflictsDue`'s type, which `src/feed/feed.ts` takes. */
export type ConflictsDue = Implementation<typeof conflictsDueSpec>;
