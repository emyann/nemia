/**
 * A person's ask taken back before the pass spent it: a try (`nemia retry <run> <step> --off`), a round (`nemia retry <run> [<step>]
 * --round --off`), a merge of the base (`nemia refresh <run> [<step>] --base --off`), a loop's acceptance and a record at a gate's key
 * that reads as no approval (`nemia approve <run> <step> --off`). What refuses it (`askTakeBackStop`, proved by
 * `contracts/ask-take-back.contract.ts`), the key it is taken back at (`askTakenAt`), and the refusal in words (`askTakeBackJudged`).
 * An approval standing is the gate's (`takeBackJudged`, `src/gate/gate.ts`). Pure.
 */
import type {
  AskHeld,
  AskTakeBackStop,
  AskTakeBackStopOf,
  AskTakenOf,
} from '../../contracts/ask-take-back.contract.ts';
import { tryOf, type AskKey, type Run } from '../record/record.ts';
import type { StepSpec } from '../step/step.ts';
import { roundOf } from '../status/status.ts';

export type { AskHeld, AskTakenOf } from '../../contracts/ask-take-back.contract.ts';

/** Whether the kind is asked of a loop alone: a round, a merge of the base, an acceptance. */
const ofALoop = (of: AskTakenOf) => of === 'round' || of === 'base' || of === 'loop';

/**
 * What refuses a take-back, in the order it is said, or null where the ask is taken back: a step the run does not have; a loop's ask of a
 * step that closes no loop; nothing at the ask's key; an acceptance whose waiting steps have a task. A stray at the key is always set
 * aside.
 */
export const askTakeBackStop: AskTakeBackStopOf = ({ of, known, looping, held, handedOn }) =>
  !known
    ? 'unknown'
    : ofALoop(of) && !looping
      ? 'loopless'
      : held === 'none'
        ? 'unasked'
        : held === 'ask' && handedOn
          ? 'handed-on'
          : null;

/** What each kind of ask is, as a refusal names it. */
const ASK_WORDS: Record<AskTakenOf, string> = {
  try: 'a try',
  round: 'a round',
  base: 'a merge of the base',
  loop: 'an acceptance',
  gate: 'an approval',
};

/** The step a take-back of `of` is asked of: the step named, or of a loop's ask named by none the run's one loop; why not, else. */
function stepAsked(of: AskTakenOf, steps: readonly StepSpec[], run: Run, name: string | undefined) {
  const loops = steps.filter((s) => s.loop);
  if (name !== undefined) {
    const step = steps.find((s) => s.name === name);
    if (step === undefined || run.steps[name] === undefined) return { stop: 'unknown' as const, name };
    return { step };
  }
  if (!ofALoop(of) || loops.length > 1) return { stop: 'unknown' as const, name: undefined };
  const [only] = loops;
  return only ? { step: only } : { stop: 'loopless' as const, name: undefined };
}

/**
 * The key the ask of `of` a person takes back waits at — the step's next try, the loop's next round, its target's next try that merges,
 * the looping step's try accepted, the gate's try approved — or undefined where the step cannot hold one.
 * @param of The kind of ask taken back.
 * @param steps The workflow's steps.
 * @param run The run the ask is of.
 * @param name The step the person named, or undefined where they named none (a loop's ask of the run's one loop).
 */
export function askTakenAt(of: AskTakenOf, steps: readonly StepSpec[], run: Run, name: string | undefined) {
  const asked = stepAsked(of, steps, run, name);
  const { step } = asked;
  if (step === undefined) return undefined;
  if (ofALoop(of) && step.loop === undefined) return undefined;
  const key: AskKey =
    of === 'try'
      ? { of, step: step.name, n: tryOf(run, step.name) + 1 }
      : of === 'round'
        ? { of, step: step.name, n: roundOf(run, step.name) + 1 }
        : of === 'base'
          ? { of, step: step.loop ?? step.name, n: tryOf(run, step.loop ?? step.name) + 1 }
          : { of, step: step.name, n: tryOf(run, step.name) };
  return { key, step: step.name };
}

/**
 * The command that takes back an ask of `of` of `step`, as a refusal names it.
 * @param of The kind of ask.
 * @param id The run's id.
 * @param step The step the ask is of: for a loop's ask, the looping step.
 */
export function takeBackCommand(of: AskTakenOf, id: string, step: string) {
  return of === 'try'
    ? `nemia retry ${id} ${step} --off`
    : of === 'round'
      ? `nemia retry ${id} ${step} --round --off`
      : of === 'base'
        ? `nemia refresh ${id} ${step} --base --off`
        : `nemia approve ${id} ${step} --off`;
}

/** The command that asks an ask of `of` of `step` again. */
const askAgain = (of: AskTakenOf, id: string, step: string) =>
  of === 'try'
    ? `nemia retry ${id} ${step}`
    : of === 'round'
      ? `nemia retry ${id} ${step} --round`
      : of === 'base'
        ? `nemia refresh ${id} ${step} --base`
        : of === 'loop'
          ? `nemia approve ${id} ${step} --message "<why>"`
          : `nemia approve ${id} ${step}`;

/** What a take-back is judged to: the key it sets aside and the step it is of, or why it is refused. */
type Judged = { key: AskKey; step: string } | { refused: string; stop: AskTakeBackStop };

/**
 * Whether a person may take back the ask of `of` — the key it sets aside, where `askTakeBackStop` lets it — or why not, in words that
 * name the fix. Pure.
 * @param of The kind of ask taken back.
 * @param steps The workflow's steps.
 * @param run The run the ask is of.
 * @param name The step the person named, or undefined where they named none (a loop's ask of the run's one loop).
 * @param held What waits at the ask's key (`asks.held`), read at the key `askTakenAt` names; none where it names none.
 */
export function askTakeBackJudged(
  of: AskTakenOf,
  steps: readonly StepSpec[],
  run: Run,
  name: string | undefined,
  held: AskHeld,
) {
  const asked = stepAsked(of, steps, run, name);
  const { step } = asked;
  const at = askTakenAt(of, steps, run, name);
  const handedOn =
    of === 'loop' && step !== undefined && steps.some((s) => s.after.includes(step.name) && Boolean(run.steps[s.name]?.taskId));
  const stop = askTakeBackStop({
    of,
    known: step !== undefined,
    looping: step?.loop !== undefined,
    held: at === undefined ? 'none' : held,
    handedOn,
  });
  const loops = steps.filter((s) => s.loop).map((s) => s.name);
  const no = (refused: string) => ({ refused, stop: stop ?? 'unasked' }) satisfies Judged as Judged;
  if (stop === null && at !== undefined) return at satisfies Judged as Judged;
  if (step === undefined) {
    if (name !== undefined)
      return no(`${run.id} has no step "${name}" — its steps are ${steps.map((s) => s.name).join(', ')}.`);
    return no(
      loops.length
        ? `${run.id} has ${loops.length} loops, closing at ${loops.join(', ')}: name the one whose ask to take back — ${takeBackCommand(of, run.id, '<step>')}.`
        : `no step of ${run.id} has \`loop:\`, so it has no ${ASK_WORDS[of].replace(/^an? /, '')} to take back. See where it stands: nemia ls ${run.id}.`,
    );
  }
  if (stop === 'loopless')
    return no(
      `${step.name} has no \`loop:\`, so there is no ${ASK_WORDS[of].replace(/^an? /, '')} of its loop to take back${loops.length ? ` — this run's loops close at ${loops.join(', ')}` : ''}. See where it stands: nemia ls ${run.id}.`,
    );
  if (stop === 'handed-on')
    return no(
      `${step.name}'s loop was accepted as it stands, and that acceptance has handed on: what waits on it has been filed, so taking it back would undo nothing. See where the run stands: nemia ls ${run.id}.`,
    );
  const n = at?.key.n ?? tryOf(run, step.name);
  const target = at?.key.step ?? step.name;
  const what =
    of === 'round'
      ? `round ${n} of ${step.name}'s loop is not asked for`
      : of === 'base'
        ? `no merge of the base into ${target}'s work is asked`
        : of === 'loop'
          ? `try ${n} of ${step.name} is not accepted as it stands`
          : of === 'gate'
            ? `nothing waits at the approval of try ${n} of ${step.name}`
            : `try ${n} of ${step.name} is not asked for`;
  return no(
    `${what}, so there is nothing to take back. To ask it: ${askAgain(of, run.id, step.name)}. See where it stands: nemia ls ${run.id}.`,
  );
}
