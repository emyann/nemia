/**
 * Whether a caller may write a step's condition (agent-orchestrator, src/condition/condition.ts, `conditionWriteRefusal`): judged by
 * the condition's verb before anything is written, the run and the step already found (a run or a step not there is `Missing`, the
 * door's, before this). Its refusals, first that holds:
 *
 * - `own-step`: the caller is a session of the very step it writes for, its own try's session or one of its checks (a token minted for
 *   that run and that step), whatever the condition: a step never vouches for its own work. A person, a token the person minted, and a
 *   session of any other step or of no run (a template's program) are not refused by it.
 * - `undeclared`: the step waits on no condition of that name (no check of its `checks:` names it in `condition:`).
 * - `other-try`: the write speaks of a try that is not the one the step is on: a writer reads the step's try again and writes for it.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Why a condition's write is refused. */
export type ConditionWriteRefusal = 'own-step' | 'undeclared' | 'other-try';

/** Who writes: the run and step its session's token was minted for, each null for a caller that is no step's session. */
export type ConditionWriter = { readonly run: string | null; readonly step: string | null };

/** What is written for: the run, the step, the condition's name, and the try it speaks of. */
export type ConditionTarget = { readonly run: string; readonly step: string; readonly condition: string; readonly try: number };

/** The step as its run's record and its workflow say it: the conditions its checks wait on, and the try it is on, from 1. */
export type ConditionStep = { readonly waitsOn: readonly string[]; readonly currentTry: number };

/** Whether the writer is a session of the target's own step. */
const ownStep = (writer: ConditionWriter, target: ConditionTarget) => writer.run === target.run && writer.step === target.step;

/** Whether the step waits on the target's condition. */
const declared = (step: ConditionStep, target: ConditionTarget) => step.waitsOn.some((name) => name === target.condition);

const conditionWriteRefusalSpec = spec<
  (writer: ConditionWriter, target: ConditionTarget, step: ConditionStep) => ConditionWriteRefusal | null
>({
  ensures: {
    ownStepIsRefused: {
      description: "A session of the step itself is refused writing any of that step's conditions",
      condition: ({ input: [writer, target], output }) => !ownStep(writer, target) || output === 'own-step',
    },
    undeclaredIsRefused: {
      description: 'Another writer is refused a condition the step does not wait on',
      condition: ({ input: [writer, target, step], output }) =>
        ownStep(writer, target) || declared(step, target) || output === 'undeclared',
    },
    otherTryIsRefused: {
      description: 'Another writer is refused a declared condition written for a try the step is not on',
      condition: ({ input: [writer, target, step], output }) =>
        ownStep(writer, target) || !declared(step, target) || target.try === step.currentTry || output === 'other-try',
    },
    writtenExactlyWhenNothingRefuses: {
      description: "A write by anyone but the step's own session, of a condition the step waits on, for the try it is on, is taken",
      condition: ({ input: [writer, target, step], output }) =>
        (output === null) === (!ownStep(writer, target) && declared(step, target) && target.try === step.currentTry),
    },
  },
});

/** `conditionWriteRefusal`'s type, which `src/condition/condition.ts` takes. */
export type ConditionWriteRefusalOf = Implementation<typeof conditionWriteRefusalSpec>;
