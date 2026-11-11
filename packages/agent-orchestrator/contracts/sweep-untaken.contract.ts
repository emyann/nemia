/**
 * Why the daemon's sweep does not take a finished run as a candidate (agent-orchestrator, src/forget/prune/prune.ts): `untaken`, read
 * of each run a pass answered, beside `freeable`. A candidate is a repository's run the pass found at rest that succeeded or was
 * cancelled; what is said of one the sweep then leaves is the prune's judgement's (`freeSaid`). A finished run the pass did not find at
 * rest is no candidate, and nothing is asked of its place: most such runs are at rest a pass or two later, and say nothing. Two reasons
 * stand until a person acts, and each is said, so a run is never left for good in silence: a hold on a run that succeeded (`held`),
 * which only its lift (`nemia hold <id> --off`), or the runs it names landing, ends; and a record that froze no workflow (`unfrozen`),
 * which no pass finds at rest, ever. A cancelled run is never said held: its hold keeps it out of no rest (`rest-hold.contract.ts`).
 *
 * The run's worktrees being on disk (`worktrees/<id>`) is read by the caller, as it is of a candidate: the function reads no disk.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * A run as a pass answered it, as far as `untaken` reads it: its status (`Answered.status`), whether the pass found it at rest
 * (`feed.atRest`), whether it worked in a repository (`isRepositoryRun`), whether a hold stands on it (`Run.hold`), and whether its
 * record froze its workflow (`Run.workflow`).
 */
export type Unswept = { status: string; atRest: boolean; repository: boolean; held: boolean; frozen: boolean };

/** Why a finished run is left out of the sweep's candidates for as long as a person does not act: held, or a record with no workflow. */
export type UntakenWhy = 'held' | 'unfrozen';

/** Finished, as the retention reads it: succeeded or cancelled. */
const finished = (r: Unswept): boolean => r.status === 'succeeded' || r.status === 'cancelled';

/** Out of the candidates for a reason the sweep says: finished, a repository's, and not found at rest. */
const leftOut = (r: Unswept): boolean => finished(r) && r.repository && !r.atRest;

/** A hold on a run that succeeded: the one hold that keeps a finished run out of rest. */
const heldSucceeded = (r: Unswept): boolean => r.status === 'succeeded' && r.held;

const untakenSpec = spec<(run: Unswept) => UntakenWhy | null>({
  ensures: {
    aRunAtRestIsTheJudgementsToSay: {
      description: 'A run the pass found at rest is a candidate, or none of the rule: the sweep says nothing of it here',
      condition: ({ input: [r], output }) => !r.atRest || output === null,
    },
    aRunNotFinishedIsNoneOfTheRules: {
      description: 'A run that neither succeeded nor was cancelled is none of the retention’s, and nothing is said of it',
      condition: ({ input: [r], output }) => finished(r) || output === null,
    },
    aFolderRunIsNoneOfTheRules: {
      description: 'A folder run’s folders are its work, kept until it is forgotten: nothing is said of it',
      condition: ({ input: [r], output }) => r.repository || output === null,
    },
    aHeldRunThatSucceededIsSaidHeld: {
      description: 'A run that succeeded, held and so not at rest, is said held',
      condition: ({ input: [r], output }) => !(leftOut(r) && heldSucceeded(r)) || output === 'held',
    },
    aCancelledRunIsNeverSaidHeld: {
      description: 'A cancelled run is never said held: its hold keeps it out of no rest',
      condition: ({ input: [r], output }) => r.status !== 'cancelled' || output !== 'held',
    },
    anUnfrozenRecordIsSaid: {
      description: 'A finished run whose record froze no workflow, and that no hold explains, is said unfrozen: no pass finds it at rest',
      condition: ({ input: [r], output }) => !(leftOut(r) && !heldSucceeded(r) && !r.frozen) || output === 'unfrozen',
    },
    aPassingClauseSaysNothing: {
      description: 'A finished run out of rest for a clause a later pass clears — a task settling, a pass that acted — is said nothing',
      condition: ({ input: [r], output }) => !(leftOut(r) && !heldSucceeded(r) && r.frozen) || output === null,
    },
  },
});
export type Untaken = Implementation<typeof untakenSpec>;
