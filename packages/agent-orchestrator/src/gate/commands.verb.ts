/**
 * `nemia approve`, an entry of the command table: a step's try approved at its gate, with the person's words or their answers to the
 * questions the step asks (`--answer`, `typedAnswers`), and what the next tick files because of it.
 */
import { Effect } from 'effect';
import { commandLine, type Args } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { ANSWER_HELP, answerFlag, typedAnswers, typedOf } from '../question/asked.verb.ts';
import { runStore } from '../record/files.store.ts';
import { stepsOf } from '../record/record.store.ts';
import { writerText as textOf } from '../yours/yours.ts';
import { approvalWordsRefusal } from './gate.ts';
import { approveRun } from './gate.verb.ts';

/** The run's id and the step's name, as the route and the command line name them. */
const named = (args: Args): { runId: string; step: string } => ({ runId: textOf(args, 'runId') ?? '', step: textOf(args, 'step') ?? '' });

/** What the next tick files once a step is approved: the step itself, what waits on it, or nothing, so its run can be decided. */
type Next = 'step' | 'waiting' | 'nothing';

/** `nemia approve`: a step's try approved at its gate, what the next tick files because of it, and the file the approval is written to. */
export const APPROVE: Command<{ try: number; at: string; message: string | null; file: string; next: Next }> = {
  name: 'approve',
  usage: '<runId> <step> [--answer <n>=<letter>]... [--message "<words>"]',
  help: [
    'let a step waiting at its gate hand on: what waits on it is filed on',
    'the next tick, and every step after the gate is handed your words',
    'under ## Approved. To send it back instead, with what to change:',
    'nemia retry <runId> <step> --message "<objection>"',
    ...ANSWER_HELP,
  ],
  spec: {
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'step', takes: 'required', kind: 'name' },
    ],
    flags: [
      answerFlag('approve'),
      {
        flag: '--message',
        kind: 'text',
        key: 'message',
        takes: '--message takes the words that go with your approval, quoted: nemia approve <runId> <step> --message "<words>".',
        twice: 'nemia approve takes --message once: put all your words in it, quoted — nemia approve <runId> <step> --message "<words>".',
      },
    ],
    unknown: (arg) =>
      `nemia approve does not take ${arg}. It takes the run, the step, --answer <n>=<letter> and --message "<words>": nemia approve <runId> <step> [--answer <n>=<letter>]... [--message "<words>"].`,
  },
  check: (args) => approvalWordsRefusal(textOf(args, 'message'), commandLine(APPROVE, args)),
  writes: true,
  ticks: true,
  class: 'answer',
  route: { method: 'POST', path: '/api/runs/:runId/steps/:step/approve', status: 202 },
  apiTakes: ['answers'],
  apiKeys: ['try', 'at', 'message', 'file'],
  handler: Effect.fnUntraced(function* (args: Args) {
    const { runId, step } = named(args);
    const typed = typedOf(args);
    const words = textOf(args, 'message');
    const message = typed.length ? yield* typedAnswers(runId, step, typed, { note: words, approval: true }) : words;
    const { approval, file } = yield* approveRun(runId, step, message);
    const after = runStore.runs.read(runId);
    const next: Next = !after.steps[step]?.taskId ? 'step' : stepsOf(after).some((s) => s.after.includes(step)) ? 'waiting' : 'nothing';
    return { try: approval.try, at: approval.at, message: approval.message ?? null, file, next };
  }),
  print({ try: tryNo, message, file, next }, args) {
    const { runId, step } = named(args);
    const then =
      next === 'step'
        ? `the next tick files ${step}`
        : next === 'waiting'
          ? 'the next tick files what waits on it'
          : 'nothing waits on it: its run can be decided';
    return [
      `${runId}  approved: try ${tryNo} of ${step}${typedOf(args).length ? ', with your answers' : message !== null ? ', with your words' : ''} — ${then}`,
      `   ${file}`,
    ];
  },
};
