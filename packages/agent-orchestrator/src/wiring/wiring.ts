/**
 * A factory's wiring, judged: the change a person's verb asks of what a factory offers, hires and schedules (`WiringChange`), why it is
 * refused (`wiringRefusal`), and the factory after it where it is not (`rewired`). Pure: what is on disk — that a step's own file names
 * its agent, that a cron fires — is its caller's to ask, and the words are `factory.ts`'s. `contracts/wiring.contract.ts` proves
 * that a change which would break the door's invariant — a factory hires and schedules only into a workflow it offers — is refused,
 * and what each accepted change does; that the factory written after it keeps the invariant is the door's model decode
 * (`factoryChecked`, `factories.store.ts`), on every create and rewrite.
 */
import type { Rewired, WiringRefusal } from '../../contracts/wiring.contract.ts';
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
  type Schedule,
} from '../factory/factory.ts';

/**
 * A change of a factory's wiring, by its verb: a workflow attached or detached, an agent hired into a step `<workflow>/<step>` or fired
 * from it, a workflow's schedule written or taken back.
 */
export type WiringChange =
  | { readonly verb: 'attach'; readonly workflow: string }
  | { readonly verb: 'detach'; readonly workflow: string }
  | { readonly verb: 'hire'; readonly step: string; readonly agent: string }
  | { readonly verb: 'fire'; readonly step: string }
  | { readonly verb: 'schedule'; readonly workflow: string; readonly schedule: Schedule }
  | { readonly verb: 'unschedule'; readonly workflow: string };

/** What a change of wiring is refused as: a name or a state that cannot take it (`Invalid`), or what it names is not there (`Missing`). */
export type WiringRefused = { readonly kind: 'Invalid' | 'Missing'; readonly message: string };

/** The workflow a hire's step `<workflow>/<step>` names. */
const workflowOfStep = (step: string): string => step.slice(0, step.indexOf('/'));

/** Whether `dict` holds an entry of its own at `key`: a prototype's name (`constructor`, `valueOf`) is none. */
const holds = (dict: Readonly<Record<string, unknown>>, key: string): boolean => Object.hasOwn(dict, key);

/** The steps of `workflow` a factory's `hires` hire into. */
const hiredInto = (hires: Readonly<Record<string, string>>, workflow: string): string[] =>
  Object.keys(hires).filter((step) => step.startsWith(`${workflow}/`));

/** `names` with `name`, sorted, each named once. */
export const withName = (names: readonly string[], name: string): string[] => [...new Set([...names, name])].sort();

/** Whether `hires` hire into a step of the workflow `workflow`: a hire's key is `<workflow>/<step>`. */
export const hiresInto = (hires: Readonly<Record<string, string>>, workflow: string): boolean =>
  Object.keys(hires).some((step) => step.startsWith(`${workflow}/`));

/** `hires` with `agent` hired into `step`, an earlier hire there replaced. */
export const withHire = (hires: Readonly<Record<string, string>>, step: string, agent: string): Record<string, string> => ({
  ...hires,
  [step]: agent,
});

/** `dict` with `value` at `key`, an earlier one there replaced. */
export const withEntry = <V>(dict: Readonly<Record<string, V>>, key: string, value: V): Record<string, V> => ({ ...dict, [key]: value });

/** `dict` with no entry at `key`. */
export const withoutEntry = <V>(dict: Readonly<Record<string, V>>, key: string): Record<string, V> => {
  const { [key]: _gone, ...rest } = dict;
  return rest;
};

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
  if (change.verb === 'attach') return null;
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

/** Why `factory` cannot be relieved of `workflow`: it does not offer it (`Missing`), or still hires into or schedules it (`Invalid`). */
function detachRefusal(factory: Parameters<WiringRefusal>[0], workflow: string): WiringRefused | null {
  if (!factory.workflows.includes(workflow)) return missing(unattachedDetachRefusal(factory, workflow));
  if (hiresInto(factory.hires, workflow)) return invalid(hiredDetachRefusal(factory.name, workflow, hiredInto(factory.hires, workflow)));
  if (holds(factory.schedules, workflow)) return invalid(scheduledDetachRefusal(factory.name, workflow));
  return null;
}

/**
 * `factory` after `change`, which `wiringRefusal` accepted: its workflows kept sorted and each named once, a hire replacing the step's
 * earlier one, a schedule the workflow's earlier one; everything else as it was.
 */
export const rewired: Rewired = (factory, change) => {
  if (change.verb === 'attach')
    return factory.workflows.includes(change.workflow) ? factory : { ...factory, workflows: withName(factory.workflows, change.workflow) };
  if (change.verb === 'detach') return { ...factory, workflows: factory.workflows.filter((w) => w !== change.workflow) };
  if (change.verb === 'hire') return { ...factory, hires: withHire(factory.hires, change.step, change.agent) };
  if (change.verb === 'fire') return { ...factory, hires: withoutEntry(factory.hires, change.step) };
  if (change.verb === 'schedule') return { ...factory, schedules: withEntry(factory.schedules, change.workflow, change.schedule) };
  return { ...factory, schedules: withoutEntry(factory.schedules, change.workflow) };
};
