/**
 * A person's hold on a run (agent-orchestrator, src/wait/wait.ts): `holdStop`, what of the run itself refuses a hold (`nemia hold`), and
 * `holdNeedsYou`, whether a hold that stands waits on a person. A hold names the runs it waits on to land (`--until`), or none: then it
 * is held until a person lifts it (`nemia hold <run> --off`), as Kubernetes' Job `spec.suspend` holds a Job, and no tick lifts it.
 *
 * `holdRefusal` words the stop `holdStop` decides, then judges each run named (`afterRefusal`'s reasons, a circle), which reads paths and
 * walks the store and is held by its tests. `holdingOf` (summary/judged.verb.ts), which the run's decision carries as its `holding`
 * (`decisionRead`, decide/decision.verb.ts), and `nemia ls` (`asksLines`, list/list.ts) read `holdNeedsYou` alike, so the board's bell,
 * `nemia ls`'s line and the decision cannot say different things of one hold.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * A run this one waits on, as `nemia ls` and `nemia decide` name it: its id and, when it may never land without a person, why — the store
 * has no such run, it was cancelled, or a result branch it recorded is gone, and git cannot find it on the base. `landed` only on a hold
 * whose every run has landed, in the moment before the tick lifts it (`holdsOf`). `unread`, why where its branches stand was not read,
 * which the next pass asks again.
 */
export type Wait = { run: string; missing?: true; cancelledAt?: string; gone?: string[]; landed?: true; unread?: string };

/**
 * What of a run a hold is judged from, read before anything is written (`hold`, wait/wait.verb.ts). `cancelled`, `pruned`: the run was
 * cancelled, or pruned (`Run.cancelledAt`, `Run.pruned`). `finished`: it has landed, as `nemia decide` says it, or succeeded with nothing
 * left but a person's merge; null for neither. `held`: a hold already stands on it (`Run.hold`). `folder`: its team works in folders
 * (`place: folder`), so it has no branch to land on. `until`: the runs the hold is to wait on, none for a hold only a person lifts.
 */
export type HoldPut = {
  cancelled: boolean;
  pruned: boolean;
  finished: 'landed' | 'succeeded' | null;
  held: boolean;
  folder: boolean;
  until: readonly string[];
};

/** What of the run refuses its hold, in the order `holdRefusal` says it: the first that is so is the one said. */
export type HoldStop = 'cancelled' | 'pruned' | 'landed' | 'succeeded' | 'held' | 'folder';

/** Nothing of the run is left to file: it is called off, pruned, or finished. */
const over = (p: HoldPut): boolean => p.cancelled || p.pruned || p.finished !== null;

/** Nothing of the run stops a hold before a folder run's wait is asked: not over, and not held already. */
const open = (p: HoldPut): boolean => !over(p) && !p.held;

/** The hold waits on runs to land on a branch: it names at least one. */
const waitsOnRuns = (p: HoldPut): boolean => p.until.length > 0;

const holdStopSpec = spec<(p: HoldPut) => HoldStop | null>({
  ensures: {
    takenExactlyWhenNothingOfTheRunStopsIt: {
      description:
        'A hold is taken exactly when the run is neither cancelled, pruned, finished nor held already, and is no folder run asked to wait on runs',
      condition: ({ input: [p], output }) => (output === null) === (open(p) && !(p.folder && waitsOnRuns(p))),
    },
    namingNoRunIsNoReasonToRefuse: {
      description: 'A hold that names no run to wait on is taken of a run nothing else stops: it is held until a person lifts it',
      condition: ({ input: [p], output }) => !(open(p) && !waitsOnRuns(p)) || output === null,
    },
    aFolderRunIsHeldOnlyUntilLifted: {
      description: 'A folder run is refused a hold that waits on runs to land, which it has no branch for, and never one that names none',
      condition: ({ input: [p], output }) => (output === 'folder') === (open(p) && p.folder && waitsOnRuns(p)),
    },
    cancelledIsSaidFirst: {
      description: 'A cancelled run is refused as cancelled, whatever else is so of it',
      condition: ({ input: [p], output }) => !p.cancelled || output === 'cancelled',
    },
    prunedIsSaidNext: {
      description: 'A pruned run nobody cancelled is refused as pruned',
      condition: ({ input: [p], output }) => p.cancelled || !p.pruned || output === 'pruned',
    },
    finishedIsSaidAsItFinished: {
      description: 'A finished run nobody cancelled or pruned is refused as it finished: landed, or succeeded with its merge left',
      condition: ({ input: [p], output }) => p.cancelled || p.pruned || p.finished === null || output === p.finished,
    },
    heldIsSaidOfARunLeftToFile: {
      description: 'A run already held, with work left to file, is refused as held: a hold is put once, whole',
      condition: ({ input: [p], output }) => over(p) || !p.held || output === 'held',
    },
  },
});
export type HoldStopOf = Implementation<typeof holdStopSpec>;

/**
 * A run a hold names that never lands without a person: the store has no such run, it was cancelled, or a result branch it recorded is
 * gone (`neverLands`, wait/wait.ts).
 */
const neverLands = (w: Wait): boolean => w.missing === true || w.cancelledAt !== undefined || (w.gone !== undefined && w.gone.length > 0);

const holdNeedsYouSpec = spec<(holds: readonly Wait[]) => boolean>({
  /** A cancellation is a moment written by `nemia cancel`, never empty (`waitOf` reads the record's `cancelledAt` as it is). */
  requires: ({ input: [holds] }) => holds.every((w) => w.cancelledAt === undefined || w.cancelledAt.length > 0),
  ensures: {
    aHoldOnNoRunAsksNothing: {
      description:
        'A hold that names no run waits on nobody: it is the person’s word already given, lifted by their hand alone, and asks nothing',
      condition: ({ input: [holds], output }) => holds.length > 0 || output === false,
    },
    yoursExactlyWhenARunItNamesNeverLands: {
      description: 'A hold waits on you exactly when a run it names never lands without a person',
      condition: ({ input: [holds], output }) => output === holds.some(neverLands),
    },
  },
});
export type HoldNeedsYou = Implementation<typeof holdNeedsYouSpec>;
