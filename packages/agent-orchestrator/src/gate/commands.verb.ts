/**
 * `nemia approve`, an entry of the command table: a step's try approved at its gate, with the person's words or their answers to the
 * questions the step asks (`--answer`, `typedAnswers`), or a loop out of rounds ended as it stands, with the person's words (what `nemia
 * accept` was, decision 7: `approveForm`), and what the next tick files because of it.
 */
import { Effect } from 'effect';
import { commandLine, type Args } from '../command/command.ts';
import { Invalid } from '../refusal/refusal.ts';
import { acceptWordsRefusal } from '../round/round.ts';
import { acceptRun } from '../round/round.verb.ts';
import { approveForm } from './form.verb.ts';
import type { Command } from '../command/entry.verb.ts';
import { ANSWER_HELP, answerFlag, typedAnswers, typedOf } from '../question/asked.verb.ts';
import { runStore } from '../record/files.store.ts';
import { stepsOf } from '../record/record.store.ts';
import { writerText as textOf } from '../yours/yours.ts';
import { approvalWordsRefusal } from './gate.ts';
import { approveRun } from './gate.verb.ts';

/** The run's id and the step's name, as the route and the command line name them; no step where none is named. */
const named = (args: Args): { runId: string; step: string | undefined } => ({
  runId: textOf(args, 'runId') ?? '',
  step: textOf(args, 'step'),
});

/** What the next tick files once a step is approved: the step itself, what waits on it, or nothing, so its run can be decided. */
type Next = 'step' | 'waiting' | 'nothing';

/**
 * The refusal of an approval that ends a loop out of rounds given no words, or answers to questions, which a loop's end does not take: the
 * line that ends it, with the words it needs. Refused as what was typed, as `nemia accept` refused it, once the run is there to say which
 * yes is given; a run that is not there is refused as missing first.
 */
function loopRefusal(args: Args): string | null {
  const { runId, step } = named(args);
  const line = `nemia approve ${runId} ${step ?? '[<step>]'} --message "<why>"`;
  if (typedOf(args).length)
    return `${step ?? `${runId}'s loop`} is out of rounds, not at a gate, and ending a loop takes your words, not answers to questions: ${line}. To go round once more instead: nemia retry ${runId} ${step ?? '[<step>]'} --round.`;
  return acceptWordsRefusal(textOf(args, 'message'), `nemia approve ${runId} ${step ?? '[<step>]'}`);
}

/**
 * `nemia approve`: a step's try approved at its gate, or a loop out of rounds ended as it stands; what the next tick files because of it,
 * and the file the approval is written to. `loop` says which.
 */
export const APPROVE: Command<{
  step: string;
  try: number;
  at: string;
  message: string | null;
  file: string;
  next: Next;
  loop: boolean;
}> = {
  name: 'approve',
  usage: '<runId> [<step>] [--answer <n>=<letter>]... [--message "<words>"]',
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
  ],
  spec: {
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'step', takes: 'optional', kind: 'name' },
    ],
    flags: [
      answerFlag('approve'),
      {
        flag: '--message',
        kind: 'text',
        key: 'message',
        takes: '--message takes the words that go with your approval, quoted: nemia approve <runId> [<step>] --message "<words>".',
        twice: 'nemia approve takes --message once: put all your words in it, quoted — nemia approve <runId> [<step>] --message "<words>".',
      },
    ],
    unknown: (arg) =>
      `nemia approve does not take ${arg}. It takes the run, the step, --answer <n>=<letter> and --message "<words>": nemia approve <runId> [<step>] [--answer <n>=<letter>]... [--message "<words>"].`,
  },
  check: (args) => approvalWordsRefusal(textOf(args, 'message'), commandLine(APPROVE, args)),
  writes: true,
  ticks: true,
  class: 'answer',
  route: [
    { method: 'POST', path: '/api/runs/:runId/steps/:step/approve', status: 202 },
    { method: 'POST', path: '/api/runs/:runId/steps/:step/accept', status: 202 },
  ],
  apiTakes: ['answers'],
  apiKeys: ['step', 'try', 'at', 'message', 'file'],
  handler: Effect.fnUntraced(function* (args: Args) {
    const { runId, step } = named(args);
    const words = textOf(args, 'message');
    if ((yield* approveForm(runId, step)) === 'loop') {
      const refused = runStore.runs.exists(runId) ? loopRefusal(args) : null;
      if (refused) return yield* Effect.fail(new Invalid({ message: refused }));
      const { acceptance, file } = yield* acceptRun(runId, step, words);
      const waited = stepsOf(runStore.runs.read(runId)).some((s) => s.after.includes(acceptance.step));
      const { step: looping, try: tryNo, at, message } = acceptance;
      return { step: looping, try: tryNo, at, message, file, next: waited ? 'waiting' : 'nothing', loop: true } as const;
    }
    const gated = step ?? '';
    const typed = typedOf(args);
    const message = typed.length ? yield* typedAnswers(runId, gated, typed, { note: words, approval: true }) : words;
    const { approval, file } = yield* approveRun(runId, gated, message);
    const after = runStore.runs.read(runId);
    const next: Next = !after.steps[gated]?.taskId ? 'step' : stepsOf(after).some((s) => s.after.includes(gated)) ? 'waiting' : 'nothing';
    return { step: gated, try: approval.try, at: approval.at, message: approval.message ?? null, file, next, loop: false };
  }),
  print({ step, try: tryNo, message, file, next, loop }, args) {
    const { runId } = named(args);
    const then =
      next === 'step'
        ? `the next tick files ${step}`
        : next === 'waiting'
          ? 'the next tick files what waits on it'
          : 'nothing waits on it: its run can be decided';
    if (loop) return [`${runId}  accepted: try ${tryNo} of ${step} as it stands, its findings open — ${then}`, `   ${file}`];
    return [
      `${runId}  approved: try ${tryNo} of ${step}${typedOf(args).length ? ', with your answers' : message !== null ? ', with your words' : ''} — ${then}`,
      `   ${file}`,
    ];
  },
};
