/**
 * A factory's wiring, judged: the change a person's verb asks of what a factory offers, hires and schedules (`WiringChange`), why it is
 * refused (`wiringRefusal`), and the factory after it where it is not (`rewired`). Pure: what is on disk — that a step's own file names
 * its agent, that a cron fires — is its caller's to ask, and the words are `factory.ts`'s. `contracts/wiring.contract.ts` proves
 * that a change which would break the door's invariant — a factory hires, schedules and sets a cost line only for a workflow it offers —
 * is refused,
 * and what each accepted change does; that the factory written after it keeps the invariant is the door's model decode
 * (`factoryChecked`, `factories.store.ts`), on every create and rewrite.
 */
import type {
  FireRefusal,
  HireChangeRefusal,
  ReposRewired,
  Rewired,
  TriggerRefusal,
  TriggersRewired,
  WiringRefusal,
  WorkflowChangeRefusal,
} from '../../../contracts/wiring.contract.ts';
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
  triggeredDetachRefusal,
  triggerNameTakenRefusal,
  unofferedTriggerRefusal,
  untriggeredRefusal,
} from '../factory.ts';
import type { WiringRefused } from '../../../contracts/wiring.contract.ts';
import { withName, hiresInto, triggersOn, withHire, withEntry, withoutEntry } from './dictionaries.ts';

export { hiresInto } from './dictionaries.ts';

export type { WiringChange } from '../../../contracts/wiring.contract.ts';

/** The workflow a hire's step `<workflow>/<step>` names. */
const workflowOfStep = (step: string) => step.slice(0, step.indexOf('/'));

/** Whether `dict` holds an entry of its own at `key`: a prototype's name (`constructor`, `valueOf`) is none. */
const holds = (dict: Readonly<Record<string, unknown>>, key: string) => Object.hasOwn(dict, key);

/** The steps of `workflow` a factory's `hires` hire into. */
const hiredInto = (hires: Readonly<Record<string, string>>, workflow: string) =>
  Object.keys(hires).filter((step) => step.startsWith(`${workflow}/`));

/** What each verb did, as its refusal says it was not done. */
const DONE = {
  attach: 'attached',
  detach: 'detached',
  schedule: 'scheduled',
  unschedule: 'unscheduled',
  trigger: 'triggered',
  untrigger: 'untriggered',
} as const;

const invalid = (message: string) => ({ kind: 'Invalid', message }) satisfies WiringRefused;
const missing = (message: string) => ({ kind: 'Missing', message }) satisfies WiringRefused;

/**
 * Why `factory` cannot take `change`, or null where it can, each in the words its verb has always said.
 * @param factory The factory as it is: its name, workflows, hires, schedules and cost lines.
 * @param change The change the person's verb asks: attach, detach, hire, fire, schedule or unschedule, and what it names.
 */
export const wiringRefusal: WiringRefusal = (factory, change) => {
  if (change.verb === 'hire') return hireChangeRefusal(factory, change);
  if (change.verb === 'fire') return fireRefusal(factory, change);
  if (change.verb === 'trigger' || change.verb === 'untrigger') return triggerRefusal(factory, change);
  return workflowChangeRefusal(factory, change);
};

/**
 * Why `factory` cannot take an attach, a detach, a schedule or an unschedule of a workflow: a name that is not one (`Invalid`), then what
 * each verb asks of what the factory offers, schedules and holds. Its own contract, which `wiringRefusal` leans on for these four verbs.
 * @param factory The factory as it is: its name, workflows, hires, schedules, cost lines, repositories and own card triggers.
 * @param change The attach, detach, schedule or unschedule, and the workflow it names.
 * @public
 */
export const workflowChangeRefusal: WorkflowChangeRefusal = (factory, change) => {
  const badName = workflowNameRefusal(change.workflow);
  if (badName !== undefined) return invalid(`${badName} Nothing was ${DONE[change.verb]}.`);
  if (change.verb === 'attach') return attachRefused(factory, change.workflow, change.repo);
  if (change.verb === 'schedule')
    return factory.workflows.includes(change.workflow) ? null : invalid(unofferedScheduleRefusal(factory.name, change.workflow));
  if (change.verb === 'unschedule')
    return !holds(factory.schedules, change.workflow)
      ? missing(unscheduledRefusal(factory.name, change.workflow, Object.keys(factory.schedules)))
      : null;
  return detachRefusal(factory, change.workflow);
};

/**
 * Why `factory` cannot take a trigger or an untrigger: a name that is not one (`Invalid`); a trigger to a workflow it does not offer, or
 * named as a workflow it schedules (`Invalid`); an untrigger of a trigger it does not hold (`Missing`). Its own contract, which
 * `wiringRefusal` leans on for these two verbs.
 * @param factory The factory as it is: its name, workflows, schedules and own card triggers.
 * @param change The trigger written, or the untrigger, and the name it carries.
 * @public
 */
export const triggerRefusal: TriggerRefusal = (factory, change) => {
  const badName = workflowNameRefusal(change.name);
  if (badName !== undefined) return invalid(`${badName} Nothing was ${DONE[change.verb]}.`);
  if (change.verb === 'untrigger')
    return factory.triggers !== undefined && holds(factory.triggers, change.name)
      ? null
      : missing(untriggeredRefusal(factory.name, change.name, Object.keys(factory.triggers ?? {})));
  if (!factory.workflows.includes(change.trigger.target.name))
    return invalid(unofferedTriggerRefusal(factory.name, change.trigger.target.name));
  if (holds(factory.schedules, change.name)) return invalid(triggerNameTakenRefusal(factory.name, change.name));
  return null;
};

/**
 * Why `factory` cannot hire an agent into a step: a step or an agent that is not one, or a workflow it does not offer (`Invalid`). Its own
 * contract, which `wiringRefusal` leans on for a hire.
 * @param factory The factory as it is: its name and workflows.
 * @param change The hire, its step `<workflow>/<step>` and its agent.
 * @public
 */
export const hireChangeRefusal: HireChangeRefusal = (factory, change) => {
  const bad = hireRefusal(change.step, change.agent);
  if (bad !== undefined) return invalid(`${bad} Nothing was hired.`);
  const workflow = workflowOfStep(change.step);
  return factory.workflows.includes(workflow) ? null : invalid(`${unattachedHireRefusal(factory.name, workflow)} Nothing was hired.`);
};

/**
 * Why `factory` cannot fire the agent of a step: it hires no one into it (`Missing`). Its own contract, which `wiringRefusal` leans on
 * for a fire.
 * @param factory The factory as it is: its name and hires.
 * @param change The fire, and the step it names.
 * @public
 */
export const fireRefusal: FireRefusal = (factory, change) =>
  holds(factory.hires, change.step) ? null : missing(unhiredFireRefusal(factory.name, change.step, factory.hires));

/** Why `factory` cannot attach `workflow` on its repository named `repo`: a folder name none or several of its repositories have. */
function attachRefused(factory: Parameters<WiringRefusal>[0], workflow: string, repo: string | undefined) {
  if (repo === undefined) return null;
  const count = reposNamed(factory, repo);
  return (count === 1 ? null : invalid(repoNameRefusal(factory, workflow, repo, count))) satisfies WiringRefused | null;
}

/**
 * Why `factory` cannot be relieved of `workflow`: it does not offer it (`Missing`), or still hires into, schedules or sets a cost line for
 * it (`Invalid`).
 */
function detachRefusal(factory: Parameters<WiringRefusal>[0], workflow: string) {
  if (!factory.workflows.includes(workflow)) return missing(unattachedDetachRefusal(factory, workflow)) satisfies WiringRefused | null;
  if (hiresInto(factory.hires, workflow))
    return invalid(hiredDetachRefusal(factory.name, workflow, hiredInto(factory.hires, workflow))) satisfies WiringRefused | null;
  if (holds(factory.schedules, workflow)) return invalid(scheduledDetachRefusal(factory.name, workflow)) satisfies WiringRefused | null;
  if (factory.costLines !== undefined && holds(factory.costLines, workflow))
    return invalid(costLinedDetachRefusal(factory.name, workflow)) satisfies WiringRefused | null;
  const triggers = triggersOn(factory.triggers, workflow);
  if (triggers.length) return invalid(triggeredDetachRefusal(factory.name, workflow, triggers)) satisfies WiringRefused | null;
  return null;
}

/**
 * A factory's workflows' repositories (`workflowRepos`) after `change`: an attach that names a repository wires the workflow to it, a
 * detach takes the workflow's off, and any other change keeps them; none where none is left.
 * @param wired Each workflow's repository by its name, or undefined where none is wired.
 * @param change The change the person's verb asks: attach, detach, hire, fire, schedule or unschedule, and what it names.
 * @public
 */
export const reposRewired: ReposRewired = (wired, change) => {
  if (change.verb !== 'detach' && (change.verb !== 'attach' || change.repo === undefined)) return wired;
  // oxlint-disable-next-line unicorn/no-useless-fallback-in-spread -- tsverify reads a built map only from a dictionary's spread
  const out: Record<string, string> = { ...(wired ?? {}) };
  if (change.verb === 'attach' && change.repo !== undefined) out[change.workflow] = change.repo;
  if (change.verb === 'detach') delete out[change.workflow];
  return Object.keys(out).length ? out : undefined;
};

/**
 * A factory's own card triggers after `change`: a trigger written by its name, an earlier one of that name replaced, an untrigger taking
 * it back, and any other change keeping them; none where none is left.
 * @param triggers Each card trigger of the factory's own by its name, or undefined where it holds none.
 * @param change The change the person's verb asks, and what it names.
 * @public
 */
export const triggersRewired: TriggersRewired = (triggers, change) => {
  if (change.verb === 'trigger') return withEntry(triggers ?? {}, change.name, change.trigger);
  if (change.verb !== 'untrigger' || triggers === undefined) return triggers;
  const out = withoutEntry(triggers, change.name);
  return Object.keys(out).length ? out : undefined;
};

/**
 * `factory` after `change`, which `wiringRefusal` accepted: its workflows kept sorted and each named once, an attach that names a
 * repository wiring the workflow to it, a detach taking its repository off, a hire replacing the step's earlier one, a schedule the
 * workflow's earlier one; everything else as it was.
 * @param factory The factory as it is.
 * @param change The change the person's verb asks: attach, detach, hire, fire, schedule or unschedule, and what it names.
 */
export const rewired: Rewired = (factory, change) => {
  if (change.verb === 'attach' && change.repo !== undefined)
    return {
      ...factory,
      workflows: withName(factory.workflows, change.workflow),
      workflowRepos: reposRewired(factory.workflowRepos, change),
    };
  if (change.verb === 'attach')
    return factory.workflows.includes(change.workflow) ? factory : { ...factory, workflows: withName(factory.workflows, change.workflow) };
  if (change.verb === 'detach')
    return {
      ...factory,
      workflows: factory.workflows.filter((w) => w !== change.workflow),
      workflowRepos: reposRewired(factory.workflowRepos, change),
    };
  if (change.verb === 'hire') return { ...factory, hires: withHire(factory.hires, change.step, change.agent) };
  if (change.verb === 'fire') return { ...factory, hires: withoutEntry(factory.hires, change.step) };
  if (change.verb === 'schedule') return { ...factory, schedules: withEntry(factory.schedules, change.workflow, change.schedule) };
  if (change.verb === 'trigger' || change.verb === 'untrigger') return { ...factory, triggers: triggersRewired(factory.triggers, change) };
  return { ...factory, schedules: withoutEntry(factory.schedules, change.workflow) };
};
