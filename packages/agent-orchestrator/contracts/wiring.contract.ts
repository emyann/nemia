/**
 * A factory's wiring, judged (agent-orchestrator, src/factory/wiring/wiring.ts): why a person's change of what a factory offers, hires and
 * schedules is refused (`wiringRefusal`), and the factory after one it accepts (`rewired`). The refusal's laws are the Factory door's
 * invariant — a factory hires, schedules and sets a cost line only for a workflow it offers — so a change that would break it is refused;
 * the rewire's say what each change does, and the door's model decode refuses a factory written that breaks the invariant. The names a
 * change carries are judged by `hireRefusal` and `workflowNameRefusal`, declared pure and nothing more: whether a name is well formed is
 * theirs, and their tests'.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import {
  costLinedDetachRefusal,
  hiredDetachRefusal,
  hireRefusal,
  scheduledDetachRefusal,
  unattachedDetachRefusal,
  unattachedHireRefusal,
  unhiredFireRefusal,
  unofferedScheduleRefusal,
  unscheduledRefusal,
  workflowNameRefusal,
  repoNameRefusal,
  reposNamed,
  type Factory,
  type Schedule,
} from '../src/factory/factory.ts';
import { hiresInto, withEntry, withHire, withName, withoutEntry } from '../src/factory/wiring/dictionaries.ts';
import { accepted } from './laws.ts';

/**
 * A change of a factory's wiring, by its verb: a workflow attached or detached, an agent hired into a step `<workflow>/<step>` or fired
 * from it, a workflow's schedule written or taken back.
 */
export type WiringChange =
  | { readonly verb: 'attach'; readonly workflow: string; readonly repo?: string }
  | { readonly verb: 'detach'; readonly workflow: string }
  | { readonly verb: 'hire'; readonly step: string; readonly agent: string }
  | { readonly verb: 'fire'; readonly step: string }
  | { readonly verb: 'schedule'; readonly workflow: string; readonly schedule: Schedule }
  | { readonly verb: 'unschedule'; readonly workflow: string };

/** What a change of wiring is refused as: a name or a state that cannot take it (`Invalid`), or what it names is not there (`Missing`). */
export type WiringRefused = { readonly kind: 'Invalid' | 'Missing'; readonly message: string };

export const hireNamed = assume(hireRefusal, { pure: false });
export const workflowNamed = assume(workflowNameRefusal, { pure: true });
/** The words of each refusal: what they say is nobody's law, only that they are a sentence. */
export const words = [
  assume(unattachedHireRefusal, { pure: true }),
  assume(unhiredFireRefusal, { pure: true }),
  assume(unattachedDetachRefusal, { pure: true }),
  assume(hiredDetachRefusal, { pure: true }),
  assume(scheduledDetachRefusal, { pure: true }),
  assume(costLinedDetachRefusal, { pure: true }),
  assume(unofferedScheduleRefusal, { pure: true }),
  assume(unscheduledRefusal, { pure: true }),
  assume(repoNameRefusal, { pure: true }),
];

/**
 * How many of a factory's repositories have a folder name: the domain's word for a repository the wiring names, read the same by the laws
 * and the code; what a folder name is (the last segment of a resolved path) is its tests'.
 */
export const repoCount = assume(reposNamed, { pure: true });

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
  /**
   * Whether a hire into a workflow the factory offers is refused turns on whether its step and agent are names
   * (`hireRefusal`), declared not pure (`hireNamed`, `pure: false`), so a law that asks it cannot say what the code was told.
   * It cannot be declared pure: the verifier refuses `pure: true`, since it calls `stepNameRefusal`, which calls
   * `new TextEncoder().encode`, a method the purity check cannot see into. Left to the code, and held by `hireRefusal`'s tests
   * (`src/factory/factory.test.ts`). What a refusal is refused as is said by the laws below.
   */
  open: ['output'],
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
    detachLeavesNoCostLine: {
      description: 'A detach of a workflow it sets a cost line for is refused, as Invalid',
      condition: ({ input: [factory, change], output }) =>
        change.verb !== 'detach' ||
        !factory.workflows.includes(change.workflow) ||
        factory.costLines === undefined ||
        !Object.hasOwn(factory.costLines, change.workflow) ||
        output?.kind === 'Invalid',
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
      description:
        'An attach of a well-named workflow that names no repository, or one by a folder name one repository alone has, is never refused',
      condition: ({ input: [factory, change], output }) =>
        change.verb !== 'attach' ||
        workflowNameRefusal(change.workflow) !== undefined ||
        (change.repo !== undefined && reposNamed(factory, change.repo) !== 1) ||
        output === null,
    },
    attachRepoKnown: {
      description:
        'An attach that names a repository by a folder name none of its repositories has, or several share, is refused, as Invalid',
      condition: ({ input: [factory, change], output }) =>
        change.verb !== 'attach' || change.repo === undefined || reposNamed(factory, change.repo) === 1 || output?.kind === 'Invalid',
    },
    takesWhatItCan: {
      description: 'A change but a hire, well named, that the factory can take is never refused',
      condition: ({ input: [factory, change], output }) =>
        change.verb === 'hire' ||
        (change.verb !== 'fire' && workflowNameRefusal(change.workflow) !== undefined) ||
        !accepted(factory, change) ||
        output === null,
    },
    aBadNameIsInvalid: {
      description: 'A change of a workflow whose name is not one is refused as Invalid, whatever the factory holds',
      condition: ({ input: [, change], output }) =>
        change.verb === 'hire' ||
        change.verb === 'fire' ||
        workflowNameRefusal(change.workflow) === undefined ||
        output?.kind === 'Invalid',
    },
    missingOnlyOfWhatIsNotThere: {
      description:
        'Missing only where what the change names is not there: a step it hires no one into, a workflow it does not offer or schedule',
      condition: ({ input: [factory, change], output }) =>
        output?.kind !== 'Missing' ||
        (change.verb === 'fire' && !Object.hasOwn(factory.hires, change.step)) ||
        (change.verb === 'detach' && !factory.workflows.includes(change.workflow)) ||
        (change.verb === 'unschedule' && !Object.hasOwn(factory.schedules, change.workflow)),
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
  /**
   * A wiring change copies the factory's instruction, revisions, template, tree, volumes, harness settings, cost lines and origins as they
   * were, by a spread, and the verifier reads no optional field through one (tsverify's `docs/reads.md`: "a field read through a spread,
   * where the spread value may lack it"), so no law can say they are kept: left to the code, which names none of them, until the verifier
   * reads one.
   * That a factory's volumes and harness settings survive a wiring change is held by the tests of its verbs (`test/factory-start.test.ts`,
   * its volume and setting checkpoints). Its generation is carried the same way: the door counts it on the write that follows
   * (`generationAfter`, `contracts/generation.contract.ts`), never the wiring.
   */
  open: [
    'output.generation',
    'output.instruction',
    'output.revisions',
    'output.template',
    'output.tree',
    'output.volumes',
    'output.harnessSettings',
    'output.costLines',
    'output.origins',
    'output.workflowRepos',
  ],
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
    keepsItsName: {
      description: 'A wiring change never renames the factory',
      condition: ({ input: [factory], output }) => output.name === factory.name,
    },
    attachOffers: {
      description: 'After an attach the factory offers the workflow',
      condition: ({ input: [, change], output }) => change.verb !== 'attach' || output.workflows.includes(change.workflow),
    },
  },
});
export type Rewired = Implementation<typeof rewiredSpec>;

/**
 * The workflows' repositories after a change of the wiring (`reposRewired`), which `rewired` writes as the factory's `workflowRepos`
 * on an attach that names one and on a detach: its own function, since the verifier reads no optional field of the factory through the
 * spread `rewired` copies the rest by (tsverify's `docs/reads.md`), so `rewired` leaves `output.workflowRepos` open to these laws. A
 * workflow named `__proto__` is left out of `attachWiresRepo`: a record holds no key of that name, JavaScript setting the prototype
 * there instead, and no workflow is so named.
 */
const reposRewiredSpec = spec<
  (wired: Readonly<Record<string, string>> | undefined, change: WiringChange) => Readonly<Record<string, string>> | undefined
>({
  /**
   * Whether a wiring that names no repository is said by an empty record or by none is the code's: the factory's file writes neither
   * (`fileContentOf`, `factory.store.ts`), and a start reads both as naming none (`workflowRepo`).
   */
  open: ['output'],
  ensures: {
    attachWiresRepo: {
      description: 'After an attach that names a repository, the workflow works on it',
      condition: ({ input: [, change], output }) =>
        change.verb !== 'attach' ||
        change.repo === undefined ||
        change.workflow === '__proto__' ||
        (output !== undefined && Object.hasOwn(output, change.workflow) && output[change.workflow] === change.repo),
    },
    detachUnwires: {
      description: 'After a detach the factory names no repository for the workflow',
      condition: ({ input: [, change], output }) =>
        change.verb !== 'detach' || output === undefined || !Object.hasOwn(output, change.workflow),
    },
  },
});
export type ReposRewired = Implementation<typeof reposRewiredSpec>;
