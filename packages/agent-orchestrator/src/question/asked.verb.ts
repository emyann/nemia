/**
 * The questions a step asks now, read off its current closeout and its frozen step (`askedNow`), for the board's answers and the
 * terminal's alike; and the words a person's `--answer`s at the terminal become (`typedAnswers`), through the same refusal and the same
 * words the board's answers go through. Programs over `EngineService`, run by a caller with `runWith`. Beside them, the `--answer` flag
 * `nemia retry` and `nemia approve` take (`answerFlag`), what their help says of it (`ANSWER_HELP`) and the values typed (`typedOf`).
 */
import { Effect } from 'effect';
import type { Args, Flag } from '../command/command.ts';
import { EngineService, asked, type TaskView } from '../runtime-client.ts';
import type { Run } from '../record/record.ts';
import { HOME } from '../record/record.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { judgedSteps, workflowsOf } from '../summary/reads.verb.ts';
import { closeoutOf } from '../views/views.verb.ts';
import { answerRefusal, answerText, approvedAnswerText, askedQuestions, numberedAnswers } from './index.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

/** Where a person answered at the terminal, as the words their answers become say it. */
const AT_THE_TERMINAL = 'at the terminal';

/** How a person says what they mean to a step that asks no questions, at the terminal. */
const INSTEAD = 'with --message "<words>", without --answer';

/**
 * What `step`'s current closeout asks, field by field in the order its step's fields ask them (`askedQuestions`): none where it asks none,
 * or has not signed off. The step is read as it was frozen on the run, or from its workflow folder under `home`.
 */
export const askedNow = Effect.fn('askedNow')(function* (run: Run, step: string, home: string = HOME) {
  const e = yield* EngineService;
  const taskId = run.steps[step]?.taskId;
  const views = new Map<string, TaskView>();
  if (taskId) views.set(taskId, yield* asked('view', e.view(taskId)));
  const frozen = judgedSteps(run, workflowsOf(run, home).steps).find((s) => s.name === step);
  return askedQuestions(frozen, closeoutOf(views, run, step));
});

/**
 * The words `typed`, a person's `--answer`s to the questions `step` of run `runId` asks now, become, `note` their note: the try's message
 * (`answerText`), or with `approval` the approval's words (`approvedAnswerText`), each saying they were given at the terminal. Fails
 * `Invalid` with why they cannot be: a value `numberedAnswers` cannot resolve, or answers `answerRefusal` refuses — a step that asks none
 * now among them.
 */
export const typedAnswers = Effect.fn('typedAnswers')(function* (
  runId: string,
  step: string,
  typed: readonly string[],
  { note, approval = false }: { note?: string; approval?: boolean } = {},
) {
  const run = yield* (yield* RunDoor).runs.read(RunId.read(runId));
  const questions = (yield* askedNow(run, step)).flatMap((a) => a.questions);
  const answers = numberedAnswers(questions, typed, `nemia decide ${runId}`);
  const wrong = Array.isArray(answers) ? answerRefusal(questions, answers, INSTEAD) : answers.error;
  if (wrong !== null || !Array.isArray(answers)) return yield* Effect.fail(new Invalid({ message: wrong ?? '' }));
  return approval
    ? approvedAnswerText(step, questions, answers, note, AT_THE_TERMINAL)
    : answerText(questions, answers, note, AT_THE_TERMINAL);
});

/** What `nemia retry`'s and `nemia approve`'s help say of `--answer`. */
export const ANSWER_HELP = [
  '--answer <n>=<letter>: answer question n, numbered as nemia decide',
  '<runId> prints them, with the option its letter names; once for each',
  'question: "<n>=a,c" chooses several where it takes several,',
  '"<n>=a: <words>" adds your own words, "<n>: <words>" says words',
  'alone; --message is then the note under your answers',
];

/** The `--answer` flag of `nemia <verb>`, given once for each question: the command line's alone, the api taking `answers` as data. */
export const answerFlag = (verb: 'retry' | 'approve'): Flag => ({
  flag: '--answer',
  kind: 'text',
  key: 'answer',
  many: true,
  takes: `--answer takes a question's number and the letter of its option, as nemia decide <runId> prints them: nemia ${verb} <runId> <step> --answer 1=a`,
  only: { side: 'cli', why: 'the api takes the answers as data, by question title and option label (`answers`)' },
});

/** The `--answer` values typed, in the order given: none where none were. */
export const typedOf = (args: Args): readonly string[] => {
  const value = args.answer;
  return Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
};

/** The refusal of `--answer` beside `--recheck`, which files no session to read the answers, or null. */
export const recheckAnswerRefusal = (args: Args, command: string): string | null =>
  args.mode === 'recheck' && typedOf(args).length
    ? `--answer carries your answers into the try's brief, and --recheck files no session to read them — it runs the check again, and nothing else. Recheck without answers (${command} --recheck), or give them to a session: ${command} --answer <n>=<letter>.`
    : null;
