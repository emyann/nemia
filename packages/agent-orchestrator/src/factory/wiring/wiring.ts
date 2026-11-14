/**
 * A factory's wiring, judged: the change a person's verb asks of what a factory offers, hires and schedules (`WiringChange`), why it is
 * refused (`wiringRefusal`), and the factory after it where it is not (`rewired`). Pure: what is on disk — that a step's own file names
 * its agent, that a cron fires — is its caller's to ask, and the words are `factory.ts`'s. `contracts/wiring.contract.ts` proves
 * that a change which would break the door's invariant — a factory hires, schedules and sets a cost line only for a workflow it offers —
 * is refused,
 * and what each accepted change does; that the factory written after it keeps the invariant is the door's model decode
 * (`factoryChecked`, `factories.store.ts`), on every create and rewrite.
 */
import type { ReposRewired, Rewired, WiringRefusal } from '../../../contracts/wiring.contract.ts';
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
} from '../factory.ts';
import type { WiringRefused } from '../../../contracts/wiring.contract.ts';
import { withName, hiresInto, withHire, withEntry, withoutEntry } from './dictionaries.ts';

export { withName, hiresInto, withHire, withEntry, withoutEntry } from './dictionaries.ts';

export type { WiringChange, WiringRefused } from '../../../contracts/wiring.contract.ts';

/** The workflow a hire's step `<workflow>/<step>` names. */
const workflowOfStep = (step: string): string => step.slice(0, step.indexOf('/'));

/** Whether `dict` holds an entry of its own at `key`: a prototype's name (`constructor`, `valueOf`) is none. */
const holds = (dict: Readonly<Record<string, unknown>>, key: string): boolean => Object.hasOwn(dict, key);

/** The steps of `workflow` a factory's `hires` hire into. */
const hiredInto = (hires: Readonly<Record<string, string>>, workflow: string): string[] =>
  Object.keys(hires).filter((step) => step.startsWith(`${workflow}/`));

/** What each verb did, as its refusal says it was not done. */
const DONE = { attach: 'attached', detach: 'detached', schedule: 'scheduled', unschedule: 'unscheduled' } as const;

const invalid = (message: string): WiringRefused => ({ kind: 'Invalid', message });
const missing = (message: string): WiringRefused => ({ kind: 'Missing', message });

/** Why `factory` cannot take `change`, or null where it can, each in the words its verb has always said. */
export const wiringRefusal: WiringRefusal = (factory, change) => {
  if (change.verb === 'hire') return hireRefused(factory, change.step, change.agent);
  if (change.verb === 'fire')
    return !holds(factory.hires, change.step) ? missing(unhiredFireRefusal(factory.name, change.step, factory.hires)) : null;
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

/** Why `factory` cannot hire `agent` into `step`: a step or an agent that is not one, or a workflow it does not offer (`Invalid`). */
function hireRefused(factory: Parameters<WiringRefusal>[0], step: string, agent: string): WiringRefused | null {
  const bad = hireRefusal(step, agent);
  if (bad !== undefined) return invalid(`${bad} Nothing was hired.`);
  const workflow = workflowOfStep(step);
  return factory.workflows.includes(workflow) ? null : invalid(`${unattachedHireRefusal(factory.name, workflow)} Nothing was hired.`);
}

/** Why `factory` cannot attach `workflow` on its repository named `repo`: a folder name none or several of its repositories have. */
function attachRefused(factory: Parameters<WiringRefusal>[0], workflow: string, repo: string | undefined): WiringRefused | null {
  if (repo === undefined) return null;
  const count = reposNamed(factory, repo);
  return count === 1 ? null : invalid(repoNameRefusal(factory, workflow, repo, count));
}

/**
 * Why `factory` cannot be relieved of `workflow`: it does not offer it (`Missing`), or still hires into, schedules or sets a cost line for
 * it (`Invalid`).
 */
function detachRefusal(factory: Parameters<WiringRefusal>[0], workflow: string): WiringRefused | null {
  if (!factory.workflows.includes(workflow)) return missing(unattachedDetachRefusal(factory, workflow));
  if (hiresInto(factory.hires, workflow)) return invalid(hiredDetachRefusal(factory.name, workflow, hiredInto(factory.hires, workflow)));
  if (holds(factory.schedules, workflow)) return invalid(scheduledDetachRefusal(factory.name, workflow));
  if (factory.costLines !== undefined && holds(factory.costLines, workflow)) return invalid(costLinedDetachRefusal(factory.name, workflow));
  return null;
}

/**
 * A factory's workflows' repositories (`workflowRepos`) after `change`: an attach that names a repository wires the workflow to it, a
 * detach takes the workflow's off, and any other change keeps them; none where none is left.
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
 * `factory` after `change`, which `wiringRefusal` accepted: its workflows kept sorted and each named once, an attach that names a
 * repository wiring the workflow to it, a detach taking its repository off, a hire replacing the step's earlier one, a schedule the
 * workflow's earlier one; everything else as it was.
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
  return { ...factory, schedules: withoutEntry(factory.schedules, change.workflow) };
};
