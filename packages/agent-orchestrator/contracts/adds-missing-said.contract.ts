/**
 * What a pass owes the feed of one factory's library adds (agent-orchestrator, src/feed/feed.ts): the reason of the line it writes about
 * the factory (`involved {kind: 'Factory'}`), or none. `said` is what the feed said last of that factory's adds, read off the feed's own
 * lines (`foldFeed`), none where it said nothing; `missing` is whether an add the factory records is `missing` now — the library holds
 * no item of its kind and name — as the pass read it (`addsMissingNow`).
 *
 * A standing word, not a one-shot: an add going missing is said once, and the last one found again or taken off once, however many
 * passes read it and whichever daemon reads the feed after a restart (level-triggered). A factory whose adds the feed never said
 * missing is never said resolved.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The reasons a factory's adds line names: an add the library no longer holds, or none missing any more. */
export type AddsReason = 'AddsMissing' | 'AddsResolved';

const MISSING: AddsReason = 'AddsMissing';
const RESOLVED: AddsReason = 'AddsResolved';

const addsMissingDueSpec = spec<(said: AddsReason | undefined, missing: boolean) => AddsReason | undefined>({
  ensures: {
    aMissingAddIsSaid: {
      description:
        'A factory with an add the library no longer holds is said to miss it, where the feed said nothing or said its adds resolved',
      condition: ({ input: [said, missing], output }) => !missing || said === MISSING || output === MISSING,
    },
    missingIsNotSaidAgain: {
      description: 'A factory the feed last said misses an add, and that still does, owes no line',
      condition: ({ input: [said, missing], output }) => !missing || said !== MISSING || output === undefined,
    },
    resolvedFollowsMissing: {
      description: 'A factory the feed last said misses an add, and that misses none now, is said to have its adds resolved',
      condition: ({ input: [said, missing], output }) => missing || said !== MISSING || output === RESOLVED,
    },
    nothingMissingOwesNothing: {
      description: 'A factory that misses no add, of which the feed has no missing add to resolve, owes no line',
      condition: ({ input: [said, missing], output }) => missing || said === MISSING || output === undefined,
    },
  },
});

/** `addsMissingDue`'s type, which `src/feed/feed.ts` takes. */
export type AddsMissingDue = Implementation<typeof addsMissingDueSpec>;
