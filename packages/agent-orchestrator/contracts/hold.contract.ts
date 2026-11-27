/**
 * A person's hold on a run (agent-orchestrator, src/wait/wait.ts): `holdStop`, what of the run itself refuses a hold (`nemia hold`), and
 * `holdNeedsYou`, whether a hold that stands waits on a person. A hold names the runs it waits on to succeed (`--until`, released as
 * contracts/waited-run.contract.ts says), or none: then it is held until a person lifts it (`nemia hold <run> --off`), as Kubernetes'
 * Job `spec.suspend` holds a Job, and no tick lifts it. A folder run is held as any other: a wait reads no branch.
 *
 * `holdRefusal` words the stop `holdStop` decides, then judges each run named (`afterRefusal`'s reasons, a circle), which reads paths and
 * walks the store and is held by its tests. `holdingOf` (summary/judged.verb.ts), which the run's decision carries as its `holding`
 * (`decisionRead`, decide/decision.verb.ts), and `nemia ls` (`asksLines`, list/list.ts) read `holdNeedsYou` alike, so the board's bell,
 * `nemia ls`'s line and the decision cannot say different things of one hold.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * A run this one waits on and that has not released it, as `nemia ls` and `nemia decide` name it: its id and, when it never succeeds
 * without a person, why — the store has no such run, it was cancelled, or it failed (`waitStanding`'s `yours`). `released` only on a
 * hold whose every run has released it, in the moment before the tick lifts it (`holdsOf`). `unread`, why its workflow was not read,
 * which the next pass asks again.
 */
export type Wait = { run: string; missing?: true; cancelledAt?: string; failed?: true; released?: true; unread?: string };

/**
 * What of a run a hold is judged from, read before anything is written (`hold`, wait/wait.verb.ts). `cancelled`, `pruned`: the run was
 * cancelled, or pruned (`Run.cancelledAt`, `Run.pruned`). `succeeded`: its status is `succeeded`, so nothing of it is left to file.
 * `held`: a hold already stands on it (`Run.hold`).
 */
export type HoldPut = {
  cancelled: boolean;
  pruned: boolean;
  succeeded: boolean;
  held: boolean;
};

/** What of the run refuses its hold, in the order `holdRefusal` says it: the first that is so is the one said. */
export type HoldStop = 'cancelled' | 'pruned' | 'succeeded' | 'held';

/** Nothing of the run is left to file: it is called off, pruned, or it succeeded. */
const over = (p: HoldPut) => p.cancelled || p.pruned || p.succeeded;

const holdStopSpec = spec<(p: HoldPut) => HoldStop | null>({
  ensures: {
    takenExactlyWhenNothingOfTheRunStopsIt: {
      description: 'A hold is taken exactly when the run is neither cancelled, pruned, succeeded nor held already, whatever it waits on',
      condition: ({ input: [p], output }) => (output === null) === (!over(p) && !p.held),
    },
    cancelledIsSaidFirst: {
      description: 'A cancelled run is refused as cancelled, whatever else is so of it',
      condition: ({ input: [p], output }) => !p.cancelled || output === 'cancelled',
    },
    prunedIsSaidNext: {
      description: 'A pruned run nobody cancelled is refused as pruned',
      condition: ({ input: [p], output }) => p.cancelled || !p.pruned || output === 'pruned',
    },
    succeededIsSaidNext: {
      description: 'A run that succeeded, nobody having cancelled or pruned it, is refused as succeeded: nothing of it is left to file',
      condition: ({ input: [p], output }) => p.cancelled || p.pruned || !p.succeeded || output === 'succeeded',
    },
    heldIsSaidOfARunLeftToFile: {
      description: 'A run already held, with work left to file, is refused as held: a hold is put once, whole',
      condition: ({ input: [p], output }) => over(p) || !p.held || output === 'held',
    },
  },
});
export type HoldStopOf = Implementation<typeof holdStopSpec>;

/**
 * A run a hold names that never succeeds without a person: the store has no such run, it was cancelled, or it failed (`neverSucceeds`,
 * wait/wait.ts).
 */
const neverSucceeds = (w: Wait) => w.missing === true || w.cancelledAt !== undefined || w.failed === true;

const holdNeedsYouSpec = spec<(holds: readonly Wait[]) => boolean>({
  /** A cancellation is a moment written by `nemia cancel`, never empty (`waitOf` reads the record's `cancelledAt` as it is). */
  requires: ({ input: [holds] }) => holds.every((w) => w.cancelledAt === undefined || w.cancelledAt.length > 0),
  ensures: {
    aHoldOnNoRunAsksNothing: {
      description:
        'A hold that names no run waits on nobody: it is the person’s word already given, lifted by their hand alone, and asks nothing',
      condition: ({ input: [holds], output }) => holds.length > 0 || output === false,
    },
    yoursExactlyWhenARunItNamesNeverSucceeds: {
      description: 'A hold waits on you exactly when a run it names never succeeds without a person: missing, cancelled or failed',
      condition: ({ input: [holds], output }) => output === holds.some(neverSucceeds),
    },
  },
});
export type HoldNeedsYou = Implementation<typeof holdNeedsYouSpec>;
