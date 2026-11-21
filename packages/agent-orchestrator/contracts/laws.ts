/**
 * What the gate's and `standing`'s specs both say in their laws: whether a step is gated, the try it is on, and whether a
 * person approved that try, each written once, in the record's words.
 */
import type { Run } from '../src/record/record.ts';
import type { StepSpec } from '../src/step/step.ts';
import { reposNamed, type Factory } from '../src/factory/factory.ts';
import { hiresInto, type WiringChange } from '../src/factory/wiring/wiring.ts';
import { triggersOn } from '../src/factory/wiring/dictionaries.ts';

/** Whether a step is gated: by its workflow, or by the run (`--gate`). */
export const gated = (step: StepSpec, run: Run) => step.gate === true || (run.gates ?? []).includes(step.name);
/** The try a step is on, from 1: one past the tries its record keeps. */
export const tryNow = (run: Run, name: string) => {
  const tries = run.steps[name]?.tries;
  return tries === undefined ? 1 : tries.length + 1;
};
/** Whether a person approved the try a step is on. */
export const approved = (run: Run, name: string) => (run.approvals ?? []).some((x) => x.step === name && x.try === tryNow(run, name));

/**
 * Whether a factory takes a change of its wiring, its names aside, as `wiringRefusal` judges it: a hire or a schedule only into a workflow
 * it offers, a detach only of one it offers and no longer hires into, schedules nor sets a cost line for, a fire only of a step it hires
 * into, an unschedule only of a workflow it schedules, an attach that names a repository only by a folder name one of its repositories
 * alone has; a trigger only to a workflow it offers and under a name no schedule of it holds, a detach only of a workflow no trigger
 * targets, an untrigger only of a trigger it holds. Composed of `triggerAccepted` and `workflowAccepted`, which `wiringRefusal`'s laws
 * of a trigger (`takesWhatItCanOfATrigger`) and of a workflow (`takesWhatItCanOfAWorkflow`) state, as its parts' laws do.
 */
export const accepted = (
  factory: Pick<Factory, 'volumes' | 'workflows' | 'hires' | 'schedules' | 'costLines' | 'triggers'>,
  change: WiringChange,
) => {
  if (change.verb === 'hire') return factory.workflows.includes(change.step.slice(0, change.step.indexOf('/')));
  if (change.verb === 'fire') return Object.hasOwn(factory.hires, change.step);
  if (change.verb === 'trigger' || change.verb === 'untrigger') return triggerAccepted(factory, change);
  return workflowAccepted(factory, change);
};

/**
 * `accepted` of a trigger or an untrigger: a trigger only to a workflow offered and under a name no schedule holds, an untrigger only of
 * a trigger held.
 */
export const triggerAccepted = (
  factory: Pick<Factory, 'workflows' | 'schedules' | 'triggers'>,
  change: Extract<WiringChange, { readonly verb: 'trigger' | 'untrigger' }>,
) =>
  change.verb === 'trigger'
    ? factory.workflows.includes(change.trigger.target.name) && !Object.hasOwn(factory.schedules, change.name)
    : triggerHeld(factory, change.name);

/** `accepted` of an attach, a detach, a schedule or an unschedule, as `accepted` says of each. */
export const workflowAccepted = (
  factory: Pick<Factory, 'volumes' | 'workflows' | 'hires' | 'schedules' | 'costLines' | 'triggers'>,
  change: Extract<WiringChange, { readonly verb: 'attach' | 'detach' | 'schedule' | 'unschedule' }>,
) => {
  if (change.verb === 'schedule') return factory.workflows.includes(change.workflow);
  if (change.verb === 'detach')
    return (
      factory.workflows.includes(change.workflow) &&
      !hiresInto(factory.hires, change.workflow) &&
      !Object.hasOwn(factory.schedules, change.workflow) &&
      !(factory.costLines !== undefined && Object.hasOwn(factory.costLines, change.workflow)) &&
      !targets(factory, change.workflow)
    );
  if (change.verb === 'unschedule') return Object.hasOwn(factory.schedules, change.workflow);
  return change.repo === undefined || reposNamed(factory, change.repo) === 1;
};

/** Whether a factory holds a trigger of its own by `name`. */
export const triggerHeld = (factory: Pick<Factory, 'triggers'>, name: string) =>
  factory.triggers !== undefined && Object.hasOwn(factory.triggers, name);

/** Whether a trigger of the factory targets `workflow`: one of its triggers is on it (`triggersOn`). */
export const targets = (factory: Pick<Factory, 'triggers'>, workflow: string) => triggersOn(factory.triggers, workflow).length !== 0;
