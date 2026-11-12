/**
 * A detached run's lease (agent-runtime, src/harness/detached/run-file.ts, `leaseWord`): the word a run file's state is read as, given
 * the worker's own word, how long ago its last beat was, the lease a beat holds, and what a look found of the worker's process. A slow
 * worker is not a dead one: a `working` run is read `failed` only when its beat is stale and its worker's process is not seen running.
 * The laws speak of the worker's words and of its process, never of how the function is written.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What one look found of a run's worker process, by the identity its spawn recorded (its pid, when that pid started, and the boot):
 * `running`, that very process is there; `gone`, it is not, or it ran in another boot; `unknown`, no identity was recorded (a run
 * file spawned before one was) or this machine cannot say (no `/proc`), and the clock alone judges, as it did before.
 */
export type WorkerSeen = 'running' | 'gone' | 'unknown';

/** Whether a beat `beatAgeMs` old is within a lease of `leaseMs`: an age that cannot be read (`NaN`) is not. */
const fresh = (beatAgeMs: number, leaseMs: number): boolean => beatAgeMs <= leaseMs;

const leaseWordSpec = spec<(state: string, beatAgeMs: number, leaseMs: number, worker: WorkerSeen) => string>({
  requires: ({ input: [, , leaseMs] }) => leaseMs > 0,
  ensures: {
    anEndIsKept: {
      description: 'A run whose worker wrote anything but working reads its own word, whatever its beat and its process',
      condition: ({ input: [state], output }) => (state !== 'working' ? output === state : true),
    },
    aFreshBeatWorks: {
      description: 'A working run whose beat is within its lease is working, whatever a look found of its process',
      condition: ({ input: [state, beatAgeMs, leaseMs], output }) =>
        state === 'working' && fresh(beatAgeMs, leaseMs) ? output === 'working' : true,
    },
    slowIsNotDead: {
      description:
        'A working run whose beat is stale and whose worker is seen running is working: its first beat late, or a beat late under load',
      condition: ({ input: [state, beatAgeMs, leaseMs, worker], output }) =>
        state === 'working' && !fresh(beatAgeMs, leaseMs) && worker === 'running' ? output === 'working' : true,
    },
    staleAndGoneIsFailed: {
      description: 'A working run whose beat is stale and whose worker is gone is failed: nobody is left to write its end',
      condition: ({ input: [state, beatAgeMs, leaseMs, worker], output }) =>
        state === 'working' && !fresh(beatAgeMs, leaseMs) && worker === 'gone' ? output === 'failed' : true,
    },
    unknownFallsBackToTheClock: {
      description: 'A working run whose beat is stale and whose worker cannot be identified is failed, as the clock alone said before',
      condition: ({ input: [state, beatAgeMs, leaseMs, worker], output }) =>
        state === 'working' && !fresh(beatAgeMs, leaseMs) && worker === 'unknown' ? output === 'failed' : true,
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type LeaseWord = Implementation<typeof leaseWordSpec>;
