/**
 * Whether a person's hold keeps a run out of rest (agent-orchestrator, src/rest/rest.ts): `holdKeepsOut`, the `hold` clause of
 * `restBlockers`. A hold is a clause because the pass of a held run reads other runs — whether those the hold names have landed — to
 * lift it (`liftHold`, tick/advance.verb.ts), and what moves with another run is no input the tick's memo watches. A cancelled run's
 * pass reads none of them: `liftHold` returns at once for it, and `waitedOn` (wait/wait.ts) names no run it is held until. Its hold
 * then moves nothing a pass reads, and keeps it out of rest no more than it keeps it from anything else: a cancelled run files nothing,
 * held or not.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What of a run the hold clause reads: whether a hold stands on it (`Run.hold`), and whether it was cancelled (`Run.cancelledAt`). */
export type HeldRun = { held: boolean; cancelled: boolean };

const holdKeepsOutSpec = spec<(run: HeldRun) => boolean>({
  ensures: {
    aStandingHoldKeepsOut: {
      description: 'A hold on a run nobody cancelled keeps it out of rest: whether the runs it names land is theirs, read on every pass',
      condition: ({ input: [run], output }) => !(run.held && !run.cancelled) || output === true,
    },
    aCancelledRunsHoldKeepsNothing: {
      description: 'A cancelled run is kept out of rest by no hold: its pass reads no run the hold names, and lifts nothing',
      condition: ({ input: [run], output }) => !run.cancelled || output === false,
    },
    noHoldKeepsNothing: {
      description: 'A run nobody holds is kept out of rest by no hold',
      condition: ({ input: [run], output }) => run.held || output === false,
    },
  },
});
export type HoldKeepsOut = Implementation<typeof holdKeepsOutSpec>;
