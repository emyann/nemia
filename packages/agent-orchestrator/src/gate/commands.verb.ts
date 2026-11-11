/**
 * `nemia approve`, an entry of the command table: a step's try approved at its gate, with the person's words or their answers to the
 * questions the step asks (`--answer`, `typedAnswers`), or a loop out of rounds ended as it stands, with the person's words (what `nemia
 * accept` was, decision 7: `approveForm`), and what the next tick files because of it.
 */
import { StoreRoot } from '../config/root.store.ts';
import { Effect, Schema } from 'effect';
import { RunApprove } from 'objects';
import { commandLine, type Args } from '../command/command.ts';
import { Invalid } from '../refusal/refusal.ts';
import { acceptWordsRefusal } from '../round/round.ts';
import { acceptRun } from '../round/round.verb.ts';
import { approveForm } from './form.verb.ts';
import { checked, type Command } from '../command/entry.verb.ts';
import { ANSWER_HELP, answerFlag, givenAnswers, typedAnswers } from '../question/asked.verb.ts';
import { runsAtOnce } from '../runs/runs.store.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import { approvalWordsRefusal } from './gate.ts';
import { approveRun } from './gate.verb.ts';
import { dollarsOf } from '../keys/index.ts';
import { dollars } from '../money/money.ts';
import { budgetArgs, type StepBudget } from '../budget/budget.ts';

/**
 * What `nemia approve` takes: the run and the step (none for a run's only loop), and the approval as the api is sent it (`objects`'
 * `RunApprove`) — its words, a person's `answers` by title and label, the caps it sets (`budgets`, by step and dollars) — with what the
 * command line types in their place: `answer`, the `--answer`s by number and letter, and `budget`, the `--budget`s as `<step>=<amount>`.
 */
export const ApproveInput = Schema.Struct({
  runId: Schema.String,
  step: Schema.optionalKey(Schema.String),
  ...RunApprove.fields,
  answer: Schema.optionalKey(Schema.Array(Schema.String)),
  budget: Schema.optionalKey(Schema.Array(Schema.String)),
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

/** The refusal of an approval's words before anything is read: empty words (`approvalWordsRefusal`). */
const approveRefusal = (args: Args): string | null =>
  approvalWordsRefusal(typeof args.message === 'string' ? args.message : undefined, commandLine(APPROVE, args));

/**
 * `nemia approve`: a step's try approved at its gate, or a loop out of rounds ended as it stands; what the next tick files because of it,
 * and the file the approval is written to. `loop` says which.
 */
export const APPROVE: Command<
  {
    step: string;
    try: number;
    at: string;
    message: string | null;
    file: string;
    next: Next;
    loop: boolean;
    caps: Array<{ step: string; usd: number; above: boolean; workflow: number | null }>;
  },
  ApproveInput
> = {
  name: 'approve',
  served: [{ endpoint: 'runs.approve' }],
  usage: '<runId> [<step>] [--answer <n>=<letter>]... [--budget <step>=<amount>]... [--message "<words>"]',
  help: [
    'let a step waiting at its gate hand on: what waits on it is filed on',
    'the next tick, and every step after the gate is handed your words',
    'under ## Approved. To send it back instead, with what to change:',
    'nemia retry <runId> <step> --message "<objection>"',
    'Of a loop out of rounds — the step that closes it, or the run alone',
    'where it has one loop — enough: the loop ends on your words, with its',
    'findings open, --message "<why>" required. What waits on the looping',
    'step is filed as if it had said again: false, and every step after',
    'the loop is handed your words and those findings under ## Accepted.',
    'To go round once more instead: nemia retry <runId> [<step>] --round',
    ...ANSWER_HELP,
    '--budget <step>=<amount>: the cap of a step after the gate, in',
    'dollars, over what the step proposed for it; once for each step.',
    'Your approval makes the budgets the step proposed the caps of the',
    'steps after the gate, and auto never approves unasked a cap above',
    "a step's own budget",
  ],
  spec: {
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'step', takes: 'optional', kind: 'name' },
    ],
    flags: [
      answerFlag('approve'),
      {
        flag: '--budget',
        kind: 'text',
        key: 'budget',
        many: true,
        takes:
          '--budget takes a step after the gate and its cap in dollars: nemia approve <runId> <step> --budget <step>=<amount>, like --budget implement=60',
        only: { side: 'cli', why: 'the api takes the budgets as data, by step and dollars (`budgets`)' },
      },
      {
        flag: '--message',
        kind: 'text',
        key: 'message',
        takes: '--message takes the words that go with your approval, quoted: nemia approve <runId> [<step>] --message "<words>".',
        twice: 'nemia approve takes --message once: put all your words in it, quoted — nemia approve <runId> [<step>] --message "<words>".',
      },
    ],
    unknown: (arg) =>
      `nemia approve does not take ${arg}. It takes the run, the step, --answer <n>=<letter>, --budget <step>=<amount> and --message "<words>": nemia approve <runId> [<step>] [--answer <n>=<letter>]... [--budget <step>=<amount>]... [--message "<words>"].`,
  },
  check: approveRefusal,
  writes: true,
  ticks: true,
  class: 'answer',
  only: { side: 'cli', why: "the api serves it as the Run's `approve` of `objects`' Api, calling this handler" },
  input: ApproveInput,
  handler: Effect.fnUntraced(function* (input: ApproveInput) {
    const home = yield* StoreRoot;
    const { answers: _answers, budgets: _budgets, ...flags } = input;
    yield* checked(approveRefusal(flags));
    const { runId, step } = input;
    const words = input.message;
    if ((yield* approveForm(runId, step)) === 'loop') {
      const refused = runsAtOnce(home).runs.exists(runId) ? (budgetsLoopRefusal(input) ?? loopRefusal(input)) : null;
      if (refused) return yield* Effect.fail(new Invalid({ message: refused }));
      const { acceptance, file } = yield* acceptRun(runId, step, words);
      const waited = (yield* stepsOf(runsAtOnce(home).runs.read(runId))).some((s) => s.after.includes(acceptance.step));
      const { step: looping, try: tryNo, at, message } = acceptance;
      return { step: looping, try: tryNo, at, message, file, next: waited ? 'waiting' : 'nothing', loop: true, caps: [] };
    }
    const gated = step ?? '';
    const given = givenBudgets(input);
    if (typeof given === 'string') return yield* Effect.fail(new Invalid({ message: given }));
    const typed = input.answer ?? [];
    const message =
      input.answers !== undefined
        ? yield* givenAnswers(runId, gated, input.answers, { note: words, approval: true, home })
        : typed.length
          ? yield* typedAnswers(runId, gated, typed, { note: words, approval: true })
          : words;
    const { approval, file, caps, above } = yield* approveRun(runId, gated, message, given);
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
      next,
      loop: false,
      caps: capped,
    };
  }),
  print({ step, try: tryNo, message, file, next, loop, caps }, { runId, answer, answers }) {
    const then =
      next === 'step'
        ? `the next tick files ${step}`
        : next === 'waiting'
          ? 'the next tick files what waits on it'
          : 'nothing waits on it: its run can be decided';
    if (loop) return [`${runId}  accepted: try ${tryNo} of ${step} as it stands, its findings open — ${then}`, `   ${file}`];
    return [
      `${runId}  approved: try ${tryNo} of ${step}${answer?.length || answers?.length ? ', with your answers' : message !== null ? ', with your words' : ''} — ${then}`,
      ...caps.map(
        (c) =>
          `   cap  ${c.step} ${dollars(c.usd)}${c.above && c.workflow !== null ? ` (above the workflow's ${dollars(c.workflow)})` : ''}`,
      ),
      `   ${file}`,
    ];
  },
};
