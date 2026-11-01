/**
 * A factory's wiring, judged (agent-orchestrator, src/wiring/wiring.ts): why a person's change of what a factory offers, hires and
 * schedules is refused (`wiringRefusal`), and the factory after one it accepts (`rewired`). The refusal's laws are the Factory door's
 * invariant — a factory hires and schedules only into a workflow it offers — so a change that would break it is refused; the
 * rewire's say what each change does, and the door's model decode refuses a factory written that breaks the invariant. The names a
 * change carries are judged by `hireRefusal` and `workflowNameRefusal`, declared pure and nothing more: whether a name is well formed
 * is theirs, and their tests'.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import {
  hiredDetachRefusal,
  hireRefusal,
  scheduledDetachRefusal,
  unattachedDetachRefusal,
  unattachedHireRefusal,
  unhiredFireRefusal,
  unofferedScheduleRefusal,
  unscheduledRefusal,
  workflowNameRefusal,
  type Factory,
} from '../src/factory/factory.ts';
import { hiresInto, withEntry, withHire, withName, withoutEntry, type WiringChange, type WiringRefused } from '../src/wiring/wiring.ts';
import { accepted } from './laws.ts';

export const hireNamed = assume(hireRefusal, { pure: false });
export const workflowNamed = assume(workflowNameRefusal, { pure: true });
/** The words of each refusal: what they say is nobody's law, only that they are a sentence. */
export const words = [
  assume(unattachedHireRefusal, { pure: true }),
  assume(unhiredFireRefusal, { pure: true }),
  assume(unattachedDetachRefusal, { pure: true }),
  assume(hiredDetachRefusal, { pure: true }),
  assume(scheduledDetachRefusal, { pure: true }),
  assume(unofferedScheduleRefusal, { pure: true }),
  assume(unscheduledRefusal, { pure: true }),
];

/** Whether hires hire into a workflow's steps: the domain's word, read the same by the laws and the code. */
export const hiring = assume(hiresInto, { pure: true });

/** Names given one more hold it, and each they held. */
export const named = assume(withName, {
  pure: true,
  ensures: {
    holdsIt: ({ input: [, name], output }) => output.includes(name),
    keepsEach: ({ input: [names], output }) => names.every((n) => output.includes(n)),
  },
});
/** Hires given a hire hold it, and no step besides those they held. */
export const hireAdded = assume(withHire, {
  pure: true,
  ensures: {
    holdsIt: ({ input: [, step, agent], output }) => output[step] === agent,
    noOtherKey: ({ input: [hires, step], output }) => Object.keys(output).every((k) => k === step || Object.hasOwn(hires, k)),
  },
});
/** A dictionary given an entry holds one at its key, and no key besides those it held. */
export const entryAdded = assume(withEntry, {
  pure: true,
  ensures: {
    holdsIt: ({ input: [, key], output }) => Object.hasOwn(output, key),
    noOtherKey: ({ input: [dict, key], output }) => Object.keys(output).every((k) => k === key || Object.hasOwn(dict, k)),
  },
});
/** A dictionary relieved of an entry holds none at that key, and no key it did not hold. */
export const entryRemoved = assume(withoutEntry, {
  pure: true,
  ensures: {
    holdsNone: ({ input: [, key], output }) => !Object.hasOwn(output, key),
    noOtherKey: ({ input: [dict], output }) => Object.keys(output).every((k) => Object.hasOwn(dict, k)),
  },
});

const wiringRefusalSpec = spec<(factory: Factory, change: WiringChange) => WiringRefused | null>({
  ensures: {
    hireOnlyIntoOffered: {
      description: 'A hire into a step of a workflow the factory does not offer is refused',
      condition: ({ input: [factory, change], output }) =>
        change.verb !== 'hire' || factory.workflows.includes(change.step.slice(0, change.step.indexOf('/'))) || output !== null,
    },
    fireOnlyHired: {
      description: 'A fire of a step it hires no one into is refused, as Missing',
      condition: ({ input: [factory, change], output }) =>
        change.verb !== 'fire' || Object.hasOwn(factory.hires, change.step) || output?.kind === 'Missing',
    },
    detachOnlyOffered: {
      description: 'A detach of a well-named workflow it does not offer is refused, as Missing',
      condition: ({ input: [factory, change], output }) =>
        change.verb !== 'detach' ||
        workflowNameRefusal(change.workflow) !== undefined ||
        factory.workflows.includes(change.workflow) ||
        output?.kind === 'Missing',
    },
    detachLeavesNoHire: {
      description: 'A detach of a workflow it still hires into is refused',
      condition: ({ input: [factory, change], output }) =>
        change.verb !== 'detach' || !hiresInto(factory.hires, change.workflow) || output !== null,
    },
    detachLeavesNoSchedule: {
      description: 'A detach of a workflow it schedules is refused',
      condition: ({ input: [factory, change], output }) =>
        change.verb !== 'detach' || !Object.hasOwn(factory.schedules, change.workflow) || output !== null,
    },
    scheduleOnlyOffered: {
      description: 'A schedule of a workflow it does not offer is refused',
      condition: ({ input: [factory, change], output }) =>
        change.verb !== 'schedule' || factory.workflows.includes(change.workflow) || output !== null,
    },
    unscheduleOnlyScheduled: {
      description: 'An unschedule of a well-named workflow it does not schedule is refused, as Missing',
      condition: ({ input: [factory, change], output }) =>
        change.verb !== 'unschedule' ||
        workflowNameRefusal(change.workflow) !== undefined ||
        Object.hasOwn(factory.schedules, change.workflow) ||
        output?.kind === 'Missing',
    },
    attachAccepted: {
      description: 'An attach of a well-named workflow is never refused',
      condition: ({ input: [, change], output }) =>
        change.verb !== 'attach' || workflowNameRefusal(change.workflow) !== undefined || output === null,
    },
    takesWhatItCan: {
      description: 'A change but a hire, well named, that the factory can take is never refused',
      condition: ({ input: [factory, change], output }) =>
        change.verb === 'hire' ||
        (change.verb !== 'fire' && workflowNameRefusal(change.workflow) !== undefined) ||
        !accepted(factory, change) ||
        output === null,
    },
  },
});
export type WiringRefusal = Implementation<typeof wiringRefusalSpec>;

const rewiredSpec = spec<(factory: Factory, change: WiringChange) => Factory>({
  /**
   * Its callers rewire only by a change `wiringRefusal` accepts (`accepted`). That the factory after it still keeps the invariant is
   * the model's to refuse otherwise: the Factory door decodes every factory it writes through `Factory` (`factoryChecked`).
   */
  requires: ({ input: [factory, change] }) => accepted(factory, change),
  ensures: {
    detachWithdraws: {
      description: 'After a detach the factory no longer offers the workflow',
      condition: ({ input: [, change], output }) => change.verb !== 'detach' || !output.workflows.includes(change.workflow),
    },
    fireLeaves: {
      description: 'After a fire the step is hired into no more',
      condition: ({ input: [, change], output }) => change.verb !== 'fire' || !Object.hasOwn(output.hires, change.step),
    },
    scheduleHolds: {
      description: 'After a schedule the factory schedules the workflow',
      condition: ({ input: [, change], output }) => change.verb !== 'schedule' || Object.hasOwn(output.schedules, change.workflow),
    },
    unscheduleLeaves: {
      description: 'After an unschedule the factory schedules the workflow no more',
      condition: ({ input: [, change], output }) => change.verb !== 'unschedule' || !Object.hasOwn(output.schedules, change.workflow),
    },
    keepsRepos: {
      description: 'A wiring change never changes the repositories',
      condition: ({ input: [factory], output }) =>
        output.repos.length === factory.repos.length && output.repos.every((repo, i) => repo === factory.repos[i]),
    },
    hireNames: {
      description: 'After a hire the step names the hired agent',
      condition: ({ input: [, change], output }) => change.verb !== 'hire' || output.hires[change.step] === change.agent,
    },
    attachOffers: {
      description: 'After an attach the factory offers the workflow',
      condition: ({ input: [, change], output }) => change.verb !== 'attach' || output.workflows.includes(change.workflow),
    },
  },
});
export type Rewired = Implementation<typeof rewiredSpec>;
