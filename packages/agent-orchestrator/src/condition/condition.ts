/**
 * What a step's condition means (agent-orchestrator): where a check that waits on one stands off what was written for it
 * (`conditionStanding`, proved by contracts/condition-standing.contract.ts), whether a caller may write it (`conditionWriteRefusal`,
 * proved by contracts/condition-write.contract.ts), and the file a write is kept in, read on every pass and laid on the run's record
 * (`personConditions`, `withConditions`, `unconditioned`), as a person's route is (`src/route/person-route.ts`). Pure: the verb writes,
 * the pass reads, and nothing is carried between them.
 */
import type { ConditionStanding } from '../../contracts/condition-standing.contract.ts';
import type { ConditionWriteRefusalOf } from '../../contracts/condition-write.contract.ts';
import { WRITTEN_CONDITION_STATUSES } from 'objects';
import type { ConditionWritten, Run, StepRecord } from '../record/record.ts';

/**
 * Where a check that waits on a condition stands: passed once its condition is written True for the try the step is on, refused once it
 * is written False for it, running until then: not written, written Unknown, or written for another try, whose verdict is never the
 * current try's.
 * @param written What was written for the condition, or null where nothing was.
 * @param current The try the step is on, from 1.
 */
export const conditionStanding: ConditionStanding = (written, current) => {
  if (written === null || written.try !== current) return 'running';
  if (written.status === 'True') return 'passed';
  if (written.status === 'False') return 'refused';
  return 'running';
};

/**
 * Why a caller may not write a step's condition, or null where it may: a session of the step itself never does (`own-step`), the step
 * must wait on the condition (`undeclared`), and the write must speak of the try the step is on (`other-try`).
 * @param writer The run and step the caller's token was minted for, each null for a caller that is no step's session.
 * @param target The run, the step, the condition and the try written for.
 * @param step The conditions the step waits on, and the try it is on.
 */
export const conditionWriteRefusal: ConditionWriteRefusalOf = (writer, target, step) => {
  if (writer.run === target.run && writer.step === target.step) return 'own-step';
  if (!step.waitsOn.some((name) => name === target.condition)) return 'undeclared';
  if (target.try !== step.currentTry) return 'other-try';
  return null;
};

export type WrittenFor = ConditionWritten;

/**
 * The name of a condition's file in a run's asks folder: `condition-<step>~<n>~<name>`, which `~` no step's or condition's name holds.
 * @param step The step the condition is written for.
 * @param n The try it speaks of.
 * @param name The condition's name.
 */
export const conditionAsk = (step: string, n: number, name: string) => `condition-${step}~${n}~${name}`;

/**
 * The conditions written for a run's steps, from the names in its asks and a reader of each: a file that does not read as a condition
 * written conditions nothing. Never consumed: read on every pass, as an approval is.
 * @param names The names of the files in the run's asks folder.
 * @param read A reader of a file there, by its name: what it holds as JSON, or why it could not be read.
 */
export function personConditions(names: readonly string[], read: (name: string) => { read: unknown } | { unreadable: string }) {
  return names.flatMap((name) => {
    if (!name.startsWith('condition-')) return [];
    const held = read(name);
    const said = 'read' in held && typeof held.read === 'object' && held.read !== null ? (held.read as Record<string, unknown>) : {};
    const { step, name: condition, status, message, at, transitionedAt, by } = said;
    const [wrote, tried] = [said.try, typeof said.try === 'number' && Number.isInteger(said.try) && said.try >= 1];
    if (typeof step !== 'string' || typeof condition !== 'string' || typeof wrote !== 'number' || !tried) return [];
    if (!WRITTEN_CONDITION_STATUSES.some((s) => s === status) || typeof message !== 'string' || typeof at !== 'string') return [];
    return [
      {
        step,
        name: condition,
        try: wrote,
        status: status as ConditionWritten['status'],
        message,
        at,
        transitionedAt: typeof transitionedAt === 'string' ? transitionedAt : at,
        by: typeof by === 'string' ? by : null,
      } satisfies WrittenFor,
    ];
  });
}

/**
 * The run with each written condition laid on its step's record, under its name, for the try the step is on: what was written for any
 * other try is not laid, so the record holds only what speaks of the try now.
 * @param run The run whose step records are laid on.
 * @param written The conditions written (`personConditions`).
 */
export const withConditions = <R extends Pick<Run, 'steps'>>(run: R, written: readonly WrittenFor[]) => {
  const steps = { ...run.steps };
  for (const w of written) {
    const record = steps[w.step];
    if (record && w.try === (record.tries?.length ?? 0) + 1)
      steps[w.step] = { ...record, conditions: { ...record.conditions, [w.name]: w } };
  }
  return { ...run, steps };
};

/**
 * A record without any written condition on a step, which is their file's and never the record's: what a rewrite writes.
 * @param run The record a rewrite writes.
 */
export const unconditioned = <R extends Pick<Run, 'steps'>>(run: R) => ({
  ...run,
  steps: Object.fromEntries(
    Object.entries(run.steps).map(([name, record]) => {
      if (record.conditions === undefined) return [name, record];
      const { conditions: _, ...rest } = record;
      return [name, rest satisfies StepRecord];
    }),
  ),
});

/**
 * What was written for a step's condition on the try it is on, or null where nothing was.
 * @param run The run.
 * @param step The step's name.
 * @param name The condition's name.
 */
export const writtenFor = (run: Pick<Run, 'steps'>, step: string, name: string) => {
  const w = run.steps[step]?.conditions?.[name];
  return w === undefined ? null : w;
};

/**
 * Where a step's check on a condition stands now, off what was written for the try the step is on.
 * @param run The run.
 * @param step The step's name.
 * @param name The condition's name.
 */
export const standingOfCondition = (run: Pick<Run, 'steps'>, step: string, name: string) =>
  conditionStanding(writtenFor(run, step, name), (run.steps[step]?.tries?.length ?? 0) + 1);

/**
 * What a step says while its checks wait on conditions that are not decided: for each, that it is not written for this try, or written
 * Unknown with its message, and what to do next, that the program of its factory that writes it runs (its task's id begins `program-`,
 * `nemia ls`) or a person writes it (`nemia condition`). Empty where every condition is decided.
 * @param run The run, whose step record holds what was written for the try the step is on.
 * @param runId The run's id, which the command to type names.
 * @param step The step's name.
 * @param names The conditions the step's checks wait on.
 */
export const conditionWaitWords = (run: Pick<Run, 'steps'>, runId: string, step: string, names: readonly string[]) =>
  names
    .filter((name) => standingOfCondition(run, step, name) === 'running')
    .map((name) => {
      const written = writtenFor(run, step, name);
      const said = written === null ? 'not written for this try' : `written Unknown${written.message === '' ? '' : `: ${written.message}`}`;
      return `waits on condition ${name}, ${said}: its writer runs in the factory (a task \`program-…\` in \`nemia ls\`), or write it: nemia condition ${runId} ${step} ${name} --status True`;
    })
    .join(' · ');
