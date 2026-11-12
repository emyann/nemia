/**
 * What is sent to the processes a detached run left behind (agent-runtime, src/harness/detached/left.ts, `leftSignal`): a run whose
 * worker is gone, or wrote its end, while its harness's process group or its scope still holds a process. Nobody is left to give them
 * their stop grace, so the runner's stop gives it, level-triggered: SIGTERM from the first time a stop was asked, and SIGKILL once the
 * run's stop grace has passed since. Nothing where nothing is left. The laws speak of the signal, never of how it is chosen.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The signal sent to what a run left, or none. */
export type LeftSignal = 'none' | 'SIGTERM' | 'SIGKILL';

/** Whether a stop asked `askedAgoMs` ago is still within a grace of `graceMs`: an age that cannot be read (`NaN`) is not. */
const withinGrace = (askedAgoMs: number, graceMs: number): boolean => askedAgoMs <= graceMs;

const leftSignalSpec = spec<(left: boolean, askedAgoMs: number | undefined, graceMs: number) => LeftSignal>({
  requires: ({ input: [, , graceMs] }) => graceMs >= 0,
  ensures: {
    nothingLeftNothingSent: {
      description: 'A run that left no process is sent nothing',
      condition: ({ input: [left], output }) => (!left ? output === 'none' : true),
    },
    somethingLeftIsSentASignal: {
      description: 'A run that left a process is always sent a signal: what it left is never let run on',
      condition: ({ input: [left], output }) => (left ? output !== 'none' : true),
    },
    firstAskTerminates: {
      description: 'The first stop asked of what a run left is SIGTERM, so a harness may end on its own',
      condition: ({ input: [left, askedAgoMs], output }) => (left && askedAgoMs === undefined ? output === 'SIGTERM' : true),
    },
    withinGraceTerminates: {
      description: 'Within the stop grace since the first ask, what is left is asked again with SIGTERM, never killed',
      condition: ({ input: [left, askedAgoMs, graceMs], output }) =>
        left && askedAgoMs !== undefined && withinGrace(askedAgoMs, graceMs) ? output === 'SIGTERM' : true,
    },
    pastGraceKills: {
      description: 'Past the stop grace since the first ask, what is left is killed',
      condition: ({ input: [left, askedAgoMs, graceMs], output }) =>
        left && askedAgoMs !== undefined && !withinGrace(askedAgoMs, graceMs) ? output === 'SIGKILL' : true,
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type LeftSignalOf = Implementation<typeof leftSignalSpec>;
