/**
 * What the gate's and `standing`'s specs both say in their laws: whether a step is gated, the try it is on, and whether a
 * person approved that try, each written once, in the record's words.
 */
import type { Run } from '../src/record/record.ts';
import type { Workflow } from '../src/step/step.ts';
import type { Factory } from '../src/factory/factory.ts';
import { hiresInto, type WiringChange } from '../src/wiring/wiring.ts';

/** Whether a step is gated: by its workflow, or by the run (`--gate`). */
export const gated = (step: Workflow, run: Run): boolean => step.gate === true || (run.gates ?? []).includes(step.name);
/** The try a step is on, from 1: one past the tries its record keeps. */
export const tryNow = (run: Run, name: string): number => {
  const tries = run.steps[name]?.tries;
  return tries === undefined ? 1 : tries.length + 1;
};
/** Whether a person approved the try a step is on. */
export const approved = (run: Run, name: string): boolean =>
  (run.approvals ?? []).some((x) => x.step === name && x.try === tryNow(run, name));

/** Whether a factory hires and schedules only into workflows it offers: the Factory door's invariant (`factory.model.ts`). */
export const keepsTheOffer = (factory: Pick<Factory, 'workflows' | 'hires' | 'schedules'>): boolean =>
  hiresOffered(factory) && schedulesOffered(factory);

/** Whether a factory hires only into workflows it offers. */
export const hiresOffered = (factory: Pick<Factory, 'workflows' | 'hires'>): boolean =>
  Object.keys(factory.hires).every((step) => factory.workflows.includes(step.slice(0, step.indexOf('/'))));

/** Whether a factory schedules only workflows it offers. */
export const schedulesOffered = (factory: Pick<Factory, 'workflows' | 'schedules'>): boolean =>
  Object.keys(factory.schedules).every((workflow) => factory.workflows.includes(workflow));

/**
 * Whether a factory takes a change of its wiring, its names aside, as `wiringRefusal` judges it: a hire or a schedule only into a
 * workflow it offers, a detach only of one it offers and no longer hires into nor schedules, a fire only of a step it hires into, an
 * unschedule only of a workflow it schedules.
 */
export const accepted = (factory: Pick<Factory, 'workflows' | 'hires' | 'schedules'>, change: WiringChange): boolean => {
  if (change.verb === 'hire') return factory.workflows.includes(change.step.slice(0, change.step.indexOf('/')));
  if (change.verb === 'schedule') return factory.workflows.includes(change.workflow);
  if (change.verb === 'detach')
    return (
      factory.workflows.includes(change.workflow) &&
      !hiresInto(factory.hires, change.workflow) &&
      !Object.hasOwn(factory.schedules, change.workflow)
    );
  if (change.verb === 'fire') return Object.hasOwn(factory.hires, change.step);
  if (change.verb === 'unschedule') return Object.hasOwn(factory.schedules, change.workflow);
  return true;
};
