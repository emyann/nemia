/**
 * What the gate's and `standing`'s specs both say in their laws: whether a step is gated, the try it is on, and whether a
 * person approved that try, each written once, in the record's words.
 */
import type { Run } from '../src/record/record.ts';
import type { Workflow } from '../src/step/step.ts';

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
