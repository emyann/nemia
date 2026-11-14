/**
 * Whether a run has ended, and for good (agent-orchestrator, src/run-ending/run-ending.ts, `runEndingOf`): the one reading of a run's
 * status that every reader asking "is this run over" takes — the cap on runs in flight, a need's fix, a proposal's apply, the sweep
 * that frees worktrees, the run's timing. A run's status is worked out afresh on every pass from its steps (`assess`), never written, so
 * this says no move of it: it says what each status means to what comes after.
 *
 * The readers once each kept their own list of statuses, and parted on a failed run, which has ended and can still be tried again: it
 * is `broken`, a word of its own, so a reader says which of the two it asks.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { RunStatusWord } from 'objects';

/**
 * How a run stands to its end: `going` while it runs or is stopped on a person, whose word or lift sends it on; `broken` once a step
 * of it broke, which ends it until a person tries the step again; `over` once it succeeded or was called off, which nothing reopens.
 */
export type RunEnding = 'going' | 'broken' | 'over';

const runEndingSpec = spec<(status: RunStatusWord) => RunEnding>({
  ensures: {
    goingWhileItRunsOrWaitsOnAPerson: {
      description: 'A run is going exactly while it runs, waits at a gate, or waits on a person for anything else',
      condition: ({ input: [status], output }) =>
        (output === 'going') === (status === 'running' || status === 'awaiting approval' || status === 'waiting'),
    },
    brokenExactlyWhenAStepBroke: {
      description: 'A run is broken exactly when it failed: it has ended, and a try of the step that broke sends it on',
      condition: ({ input: [status], output }) => (output === 'broken') === (status === 'failed'),
    },
    overExactlyWhenNothingReopensIt: {
      description: 'A run is over exactly when it succeeded or a person called it off: nothing of it is tried again',
      condition: ({ input: [status], output }) => (output === 'over') === (status === 'succeeded' || status === 'cancelled'),
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type RunEndingOf = Implementation<typeof runEndingSpec>;
