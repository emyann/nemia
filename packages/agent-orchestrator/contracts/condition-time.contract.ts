/**
 * When a factory's condition last moved (agent-orchestrator, src/applied/condition-time.ts): the `lastTransitionTime` the
 * controller writes on each condition of a templated factory's `status.json`, as Kubernetes' SetStatusCondition keeps it. `before`
 * is the condition of the same `type` the file held, null where it held none; its time null on a file written before the field. A reason
 * or a message that changes moves no time: only the status does.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { ConditionStatus } from 'objects';

/** The condition of one type a status file held: its status, and when it last moved, null on a file written before the field. */
export type HeldCondition = { readonly status: ConditionStatus; readonly lastTransitionTime: string | null };

const transitionedAtSpec = spec<(before: HeldCondition | null, status: ConditionStatus, now: string) => string>({
  ensures: {
    newIsStampedNow: {
      description: 'A condition the factory did not have is stamped with the time it was observed',
      condition: ({ input: [before, , now], output }) => before !== null || output === now,
    },
    sameStatusKeepsItsTime: {
      description: 'A condition whose status did not change keeps the time it last moved',
      condition: ({ input: [before, status], output }) =>
        before === null || before.status !== status || before.lastTransitionTime === null || output === before.lastTransitionTime,
    },
    movedIsStampedNow: {
      description: 'A condition whose status changed is stamped with the time it was observed',
      condition: ({ input: [before, status, now], output }) => before === null || before.status === status || output === now,
    },
    unstampedIsStampedNow: {
      description: 'A condition a file kept with no time is stamped with the time it was observed',
      condition: ({ input: [before, , now], output }) => before === null || before.lastTransitionTime !== null || output === now,
    },
  },
});

/** `transitionedAt`'s type, which `src/applied/condition-time.ts` takes. */
export type TransitionedAt = Implementation<typeof transitionedAtSpec>;
