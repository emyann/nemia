/**
 * What a person's marks on a run leave of it (agent-orchestrator, src/record/record.ts): `honoursAsks`, whether a person's ask of the run
 * is honoured, and anything asked of a person, on this pass, and `endedForGood`, whether the run will never file anything again.
 *
 * Three marks stop a run's asks: it was called off (`nemia cancel`, `Run.cancelledAt`), pruned (`nemia prune`, `Run.pruned`, its
 * worktrees gone) or held (`nemia hold`, `Run.hold`). A hold lifts, the other two never do: so a read that says what the run does on this
 * pass (a try or a round due, a step waiting on you, an ask a verb refuses) reads `honoursAsks`, and a read that says what the run will
 * still need once a hold lifts (a task kept open for a person's word, the collisions its landing owes, the pins its next filing takes)
 * reads `endedForGood`. Every guard that wrote `cancelledAt || pruned || hold`, or the same without the hold, reads one of the two.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * The marks of a run the two read, as `readRun` composes them on the record: `cancelledAt`, the moment `nemia cancel` wrote; `pruned`,
 * what `nemia prune` recorded; `hold`, the hold a person put. Each absent while it is not so. Of `pruned` and `hold` only the moment
 * each was written is named (`at`, which `Pruned` and `Hold` both carry): the verifier models no bare `object`.
 */
export type RunMarks = {
  readonly cancelledAt?: string | undefined;
  readonly pruned?: { readonly at: string } | undefined;
  readonly hold?: { readonly at: string } | undefined;
};

/** The run was called off. */
const calledOff = (r: RunMarks): boolean => r.cancelledAt !== undefined;

/** The run was pruned: its worktrees are gone. */
const pruned = (r: RunMarks): boolean => r.pruned !== undefined;

/** A hold stands on the run. */
const held = (r: RunMarks): boolean => r.hold !== undefined;

/** A cancellation is a moment written by `nemia cancel`, never empty (`readRun` reads the record's `cancelledAt` as it is). */
const written = (r: RunMarks): boolean => r.cancelledAt === undefined || r.cancelledAt.length > 0;

const endedForGoodSpec = spec<(run: RunMarks) => boolean>({
  requires: ({ input: [run] }) => written(run),
  ensures: {
    aCalledOffRunIsEndedForGood: {
      description: 'A run called off will never file anything again, whatever else is so of it',
      condition: ({ input: [run], output }) => !calledOff(run) || output,
    },
    aPrunedRunIsEndedForGood: {
      description: 'A pruned run will never file anything again: its worktrees are gone',
      condition: ({ input: [run], output }) => !pruned(run) || output,
    },
    aHoldEndsNothing: {
      description: 'A run neither called off nor pruned is not ended for good, held or not: a hold lifts, and the run files on after it',
      condition: ({ input: [run], output }) => calledOff(run) || pruned(run) || !output,
    },
  },
});
export type EndedForGood = Implementation<typeof endedForGoodSpec>;

const honoursAsksSpec = spec<(run: RunMarks) => boolean>({
  requires: ({ input: [run] }) => written(run),
  ensures: {
    aHeldRunHonoursNoAsk: {
      description: 'A held run honours no ask and asks nothing of a person until its hold lifts',
      condition: ({ input: [run], output }) => !held(run) || !output,
    },
    aCalledOffRunHonoursNoAsk: {
      description: 'A run called off honours no ask: nothing of it is filed again',
      condition: ({ input: [run], output }) => !calledOff(run) || !output,
    },
    aPrunedRunHonoursNoAsk: {
      description: 'A pruned run honours no ask: an ask written by hand is no try due, its worktrees being gone',
      condition: ({ input: [run], output }) => !pruned(run) || !output,
    },
    anUnmarkedRunHonoursAsks: {
      description: 'A run nobody called off, pruned or held honours a person’s asks',
      condition: ({ input: [run], output }) => calledOff(run) || pruned(run) || held(run) || output,
    },
  },
});
export type HonoursAsks = Implementation<typeof honoursAsksSpec>;
