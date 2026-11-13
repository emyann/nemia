/**
 * What a task's process tree runs under, and so what admission counts it at (agent-runtime, src/core/admission.ts, `runsUnder`): its
 * own resources, as filed; else the engine's defaults in force when its attempt starts, as a LimitRange's defaults land on a Pod only
 * when the Pod is created, never on one already made — "LimitRange validations occur only at Pod admission stage, not on running Pods.
 * If you add or modify a LimitRange, the Pods that already exist in that namespace continue unchanged" (kubernetes.io, *Limit Ranges*).
 *
 * A queued task is a suspended Job's Pod not yet made: until an attempt of it starts, a resize of the engine's defaults reaches it. An
 * attempt that has started keeps what its `starting` entry recorded, which its cgroup was made under: a resize reaches its next
 * attempt alone. An attempt an older runtime started recorded none, and ran under what its `filed` entry carried, the engine's
 * defaults of then among them.
 *
 * Pure: the pass hands it the task as folded and the defaults the engine holds for the task's harness now (none for a remote agent's,
 * whose process no cgroup of ours holds), and journals or counts what it returns.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { TaskResources } from '../src/core/domain.ts';

/**
 * A task as `runsUnder` reads it: the resources on its `filed` entry (`filed`: its own, or on a journal an older runtime wrote, the
 * engine's defaults written at filing), its attempt in flight (`inFlight`, the last attempt while it has not ended, with what its
 * `starting` entry recorded it runs under; null when none is in flight), and the engine's defaults for its harness now (`defaults`).
 */
export type Sizing = {
  readonly filed: TaskResources | undefined;
  readonly inFlight: { readonly resources: TaskResources | undefined } | null;
  readonly defaults: TaskResources | undefined;
};

/** Two sets of resources say the same: both given or both absent, with the same memory limit and the same memory request. */
const same = (a: TaskResources | undefined, b: TaskResources | undefined): boolean =>
  (a === undefined) === (b === undefined) &&
  a?.limits?.memory === b?.limits?.memory &&
  a?.requests?.memory === b?.requests?.memory;

const runsUnderSpec = spec<(task: Sizing) => TaskResources | undefined>({
  ensures: {
    aStartedAttemptKeepsWhatItStartedUnder: {
      description:
        'An attempt in flight that recorded its resources at its start runs under them, whatever the engine holds now: a resize never reaches a session already started',
      condition: ({ input: [task], output }) =>
        task.inFlight === null || task.inFlight.resources === undefined || same(output, task.inFlight.resources),
    },
    anOlderAttemptRunsUnderItsFiling: {
      description:
        'An attempt in flight that recorded nothing at its start, as an older runtime started one, runs under what its filing carried, and the defaults now change nothing',
      condition: ({ input: [task], output }) =>
        task.inFlight === null || task.inFlight.resources !== undefined || same(output, task.filed),
    },
    ownResourcesAreKept: {
      description: 'A task with no attempt in flight that was filed with resources runs under them, whatever the engine holds now',
      condition: ({ input: [task], output }) => task.inFlight !== null || task.filed === undefined || same(output, task.filed),
    },
    noneOfItsOwnTakesTheDefaultsInForce: {
      description:
        'A task with no attempt in flight that was filed with no resources runs under the defaults the engine holds now, and under nothing where it holds none',
      condition: ({ input: [task], output }) => task.inFlight !== null || task.filed !== undefined || same(output, task.defaults),
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type RunsUnder = Implementation<typeof runsUnderSpec>;
