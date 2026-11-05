/**
 * When a run's ending claims the repository's own checkout (agent-orchestrator, src/ending/ending.ts): `claimedAt`, the time that orders
 * a run waiting to file its `workspace: base` step behind the others (`MainClaim.at`, `heldCheckouts` in src/cap/cap.ts), or none, where
 * nothing would file it and it claims nothing. Read by `checkoutHold` and `mainClaim` (src/ending/ending.verb.ts), which ask the engine
 * and `assess` only of a run it gives a time, and keep that claim only where the pass would in fact file the ending or a try of it.
 *
 * A person's word files an ending at its gate, and a person's `nemia retry` a try of one. An ending with no gate is filed by its workflow
 * instead, with nobody's word, once the step before it passes (`quick`'s land, routed by its review): it works in that one checkout all
 * the same, so it claims it, ordered by the run's creation, the workflow's word, given when the run began.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What of a run's ending its claim is judged from, read off the record and the run's asks. `asked`: when the person's word that would file
 * it was given (`endingAsked`: the approval of an ending not yet filed, or the ask for the next try of one that was), none where there is
 * none. `gated`: it waits at a gate (`hasGate`). `filed`: a try of it has been filed (its record has a task). `createdAt`: when the run
 * was created (`Run.createdAt`).
 */
export type EndingWord = {
  readonly asked: string | undefined;
  readonly gated: boolean;
  readonly filed: boolean;
  readonly createdAt: string;
};

/** Nobody has asked: no approval of it, no ask for its next try. */
const unasked = (w: EndingWord): boolean => w.asked === undefined;

const claimedAtSpec = spec<(w: EndingWord) => string | undefined>({
  /** Each time is a moment the store wrote (`nemia approve`, `nemia retry`, the run's start), never empty. */
  requires: ({ input: [w] }) => w.createdAt.length > 0 && (w.asked === undefined || w.asked.length > 0),
  ensures: {
    aPersonsWordOrdersTheClaim: {
      description: 'An ending a person asked for claims the checkout as of their word: the approval, or the ask for its next try',
      condition: ({ input: [w], output }) => unasked(w) || output === w.asked,
    },
    aGateWaitsOnItsApproval: {
      description: 'A gated ending not yet filed that nobody approved claims nothing: nothing files it but a person',
      condition: ({ input: [w], output }) => !(unasked(w) && w.gated && !w.filed) || output === undefined,
    },
    theWorkflowFilesAnUngatedEnding: {
      description:
        'An ending with no gate, not yet filed, claims the checkout with nobody’s word, as of the run’s creation: its workflow files it once the step before it passes',
      condition: ({ input: [w], output }) => !(unasked(w) && !w.gated && !w.filed) || output === w.createdAt,
    },
    aTryWaitsOnItsAsk: {
      description: 'A filed ending nobody asked to try again claims nothing: its next try is filed on a person’s `nemia retry`',
      condition: ({ input: [w], output }) => !(unasked(w) && w.filed) || output === undefined,
    },
  },
});

/** `claimedAt`'s type, which the code takes: it then imports nothing of tsverify. */
export type ClaimedAt = Implementation<typeof claimedAtSpec>;
