/**
 * `nemia approve`, an entry of the command table: a step's try approved at its gate, with the person's words or their answers to the
 * questions the step asks (`--answer`, `typedAnswers`), or a loop out of rounds ended as it stands, with the person's words (what `nemia
 * accept` was, decision 7: `approveForm`), and what the next tick files because of it.
 */
import { StoreRoot } from '../config/root.store.ts';
import { Effect, Schema } from 'effect';
import { Actor, APPROVE_WORDS, approveRefusal, RunApprove } from 'objects';
import { Invalid } from '../refusal/refusal.ts';
import { acceptWordsRefusal } from '../round/round.ts';
import { acceptRun } from '../round/round.verb.ts';
import { approveForm } from './form.verb.ts';
import { checked, type Served } from '../command/entry.verb.ts';
import { givenAnswers, typedAnswers } from '../question/asked.verb.ts';
import { runsAtOnce } from '../runs/runs.store.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import { approveRun, takeBackRun } from './gate.verb.ts';
import { dollarsOf } from '../keys/index.ts';
import { budgetArgs, type StepBudget } from '../budget/budget.ts';

/**
 * What `nemia approve` takes: the run and the step (none for a run's only loop), and the approval as the api is sent it (`objects`'
 * `RunApprove`) — its words, a person's `answers` by title and label, the caps it sets (`budgets`, by step and dollars) — with what the
 * command line types in their place: `answer`, the `--answer`s by number and letter, and `budget`, the `--budget`s as `<step>=<amount>`;
 * and who approves (`actor`, objects' `Actor`), which the api hands of its caller and the approval keeps — none from the command line.
 */
export const ApproveInput = Schema.Struct({
  runId: Schema.String,
  step: Schema.optionalKey(Schema.String),
  ...RunApprove.fields,
  answer: Schema.optionalKey(Schema.Array(Schema.String)),
  budget: Schema.optionalKey(Schema.Array(Schema.String)),
  actor: Schema.optionalKey(Actor),
});
export type ApproveInput = typeof ApproveInput.Type;

/** The caps an approval gives, as `<step>=<amount>`: the `--budget`s typed, then the `budgets` sent by step and dollars (`budgetArgs`). */
const budgetsTyped = ({ budget, budgets }: ApproveInput): readonly string[] => [...(budget ?? []), ...budgetArgs(budgets ?? [])];

/**
 * The budgets an approval gives, each `<step>=<amount>` read as the step's name and dollars above zero (`dollarsOf`), or why one is not:
 * in words that show the line to type. Which steps they may name is the approval's (`approveRun`).
 */
function givenBudgets(input: ApproveInput): StepBudget[] | string {
  const { runId, step } = input;
  const given: StepBudget[] = [];
  for (const typed of budgetsTyped(input)) {
    const at = typed.lastIndexOf('=');
    const name = at > 0 ? typed.slice(0, at).trim() : '';
    const usd = at > 0 ? dollarsOf(typed.slice(at + 1).trim()) : undefined;
    if (!name || usd === undefined)
      return `--budget ${typed} is not a step and an amount: give the step after the gate and its cap in dollars above zero, in digits — nemia approve ${runId} ${step ?? '<step>'} --budget <step>=<amount>, like --budget implement=60.`;
    given.push({ step: name, usd });
  }
  return given;
}

/** What the next tick files once a step is approved: the step itself, what waits on it, or nothing, so its run can be decided. */
type Next = 'step' | 'waiting' | 'nothing';

/**
 * The refusal of an approval that ends a loop out of rounds given no words, or answers to questions, which a loop's end does not take: the
 * line that ends it, with the words it needs. Refused as what was typed, as `nemia accept` refused it, once the run is there to say which
 * yes is given; a run that is not there is refused as missing first.
 */
function loopRefusal({ runId, step, answer, answers, message }: ApproveInput): string | null {
  const line = `nemia approve ${runId} ${step ?? '[<step>]'} --message "<why>"`;
  if (answer?.length || answers?.length)
    return `${step ?? `${runId}'s loop`} is out of rounds, not at a gate, and ending a loop takes your words, not answers to questions: ${line}. To go round once more instead: nemia retry ${runId} ${step ?? '[<step>]'} --round.`;
  return acceptWordsRefusal(message, `nemia approve ${runId} ${step ?? '[<step>]'}`);
}

/** The refusal of `--budget` on ending a loop out of rounds, which sets no cap, or null. */
function budgetsLoopRefusal(input: ApproveInput): string | null {
  const { runId, step } = input;
  return budgetsTyped(input).length
    ? `${step ?? `${runId}'s loop`} is out of rounds, not at a gate, and ending a loop sets no step's cap: nemia approve ${runId} ${step ?? '[<step>]'} --message "<why>". To raise a step's cap, retry it with one: nemia retry ${runId} <step> --budget <amount>.`
    : null;
}

/**
 * `nemia approve` of a loop out of rounds: its form refused first where the run is there to read (`budgetsLoopRefusal`, `loopRefusal`),
 * then the loop accepted as it stands (`acceptRun`), with who accepted it (`actor`) where the caller was handed.
 */
const loopAccepted = Effect.fnUntraced(function* (input: ApproveInput, home: string) {
  const { runId, step, message: words, actor } = input;
  const refused = runsAtOnce(home).runs.exists(runId) ? (budgetsLoopRefusal(input) ?? loopRefusal(input)) : null;
  if (refused) return yield* Effect.fail(new Invalid({ message: refused }));
  const { acceptance, file } = yield* acceptRun(runId, step, words, actor);
  const waited = (yield* stepsOf(runsAtOnce(home).runs.read(runId))).some((s) => s.after.includes(acceptance.step));
  const { step: looping, try: tryNo, at, message } = acceptance;
  const by = acceptance.actor ? { actor: acceptance.actor } : {};
  const next: Next = waited ? 'waiting' : 'nothing';
  return { step: looping, try: tryNo, at, message, file, ...by, next, loop: true, caps: [] };
});

/**
 * `nemia approve --off`: the approval of a step that stands approved while nothing it approved has been filed, taken back (`takeBackRun`),
 * with who took it back (`actor`) where the caller was handed. It takes the step, and no words, answers or caps (`approveRefusal` refuses
 * them as typed; sent to the api, they are refused here). It answers no `next`: the step waits at its gate again.
 */
const takenBack = Effect.fnUntraced(function* (input: ApproveInput) {
  const { runId, step, actor } = input;
  if (input.answers?.length || input.budgets?.length || input.message !== undefined)
    return yield* Effect.fail(
      new Invalid({
        message: `--off takes back an approval and gives none, so it takes no message, answers or budgets: nemia approve ${runId} ${step ?? '<step>'} --off.`,
      }),
    );
  if (step === undefined)
    return yield* Effect.fail(
      new Invalid({
        message: `--off takes back the approval of a step, named: nemia approve ${runId} <step> --off, the step as nemia ls ${runId} lists it.`,
      }),
    );
  const { approval, file, takenBack: back } = yield* takeBackRun(runId, step, actor);
  return {
    step,
    try: approval.try,
    at: approval.at,
    message: approval.message ?? null,
    file,
    ...(approval.actor ? { actor: approval.actor } : {}),
    loop: false,
    caps: [],
    takenBack: back,
  };
});

/**
 * `nemia approve`: a step's try approved at its gate, or a loop out of rounds ended as it stands; what the next tick files because of it,
 * and the file the approval is written to, and who gave it (`actor`) where the caller was handed. `loop` says which. With `off`, the
 * approval taken back instead, as it was given, its file where it was set aside, and when and by whom (`takenBack`), and no `next`: the
 * step waits at its gate again.
 */
export const APPROVE: Served<
  {
    step: string;
    try: number;
    at: string;
    message: string | null;
    file: string;
    actor?: Actor;
    next?: Next;
    loop: boolean;
    caps: Array<{ step: string; usd: number; above: boolean; workflow: number | null }>;
    takenBack?: { at: string; actor?: Actor };
  },
  ApproveInput
> = {
  ...APPROVE_WORDS,
  input: ApproveInput,
  handler: Effect.fnUntraced(function* (input: ApproveInput) {
    const home = yield* StoreRoot;
    const { answers: _answers, budgets: _budgets, actor, ...flags } = input;
    yield* checked(approveRefusal(flags));
    const { runId, step } = input;
    if (input.off === true) return yield* takenBack(input);
    const words = input.message;
    if ((yield* approveForm(runId, step)) === 'loop') return yield* loopAccepted(input, home);
    const gated = step ?? '';
    const given = givenBudgets(input);
    if (typeof given === 'string') return yield* Effect.fail(new Invalid({ message: given }));
    const typed = input.answer ?? [];
    const message =
      input.answers !== undefined
        ? yield* givenAnswers(runId, gated, input.answers, { note: words, approval: true, home, actor })
        : typed.length
          ? yield* typedAnswers(runId, gated, typed, { note: words, approval: true, actor })
          : words;
    const { approval, file, caps, above } = yield* approveRun(runId, gated, message, given, actor);
    const after = runsAtOnce(home).runs.read(runId);
    const ceilings = yield* stepsOf(after);
    const next: Next = !after.steps[gated]?.taskId
      ? 'step'
      : (yield* stepsOf(after)).some((s) => s.after.includes(gated))
        ? 'waiting'
        : 'nothing';
    const capped = caps.map((c) => ({
      ...c,
      above: above.includes(c.step),
      workflow: ceilings.find((s) => s.name === c.step)?.budget ?? null,
    }));
    return {
      step: gated,
      try: approval.try,
      at: approval.at,
      message: approval.message ?? null,
      file,
      ...(approval.actor ? { actor: approval.actor } : {}),
      next,
      loop: false,
      caps: capped,
    };
  }),
};
