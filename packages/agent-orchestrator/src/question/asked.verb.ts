/**
 * The questions a step asks now, read off its current closeout and its frozen step (`askedNow`), for the board's answers and the
 * terminal's alike; and the words a person's `--answer`s at the terminal become (`typedAnswers`), through the same refusal and the same
 * words the board's answers go through. Programs over `EngineService`, run by a caller with `runWith`. Beside them, the values
 * `nemia retry` and `nemia approve` were typed as `--answer` (`typedOf`).
 */
import { Effect } from 'effect';
import { actorWords, type Actor } from 'objects';
import type { Args } from '../command/command.ts';
import { EngineService, asked, type TaskView } from '../runtime-client.ts';
import type { Run } from '../record/record.ts';
import { Invalid } from '../refusal/refusal.ts';
import { judgedSteps, workflowsOf } from '../summary/reads.verb.ts';
import { closeoutOf } from '../views/views.verb.ts';
import { answerRefusal, answerText, approvedAnswerText, askedQuestions, numberedAnswers, type Answer } from './index.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { StoreRoot } from '../config/root.store.ts';

/** Who answered at the terminal, in-process: the person, and where. */
const AT_THE_TERMINAL = `${actorWords({ kind: 'person' })}, at the terminal`;

/** How a person says what they mean to a step that asks no questions, at the terminal. */
const INSTEAD = 'with --message "<words>", without --answer';

/**
 * What `step`'s current closeout asks, field by field in the order its step's fields ask them (`askedQuestions`): none where it asks none,
 * or has not signed off. The step is read as it was frozen on the run, or from its workflow folder under `home`.
 */
const askedNow = Effect.fn('askedNow')(function* (home: string, run: Run, step: string) {
  const e = yield* EngineService;
  const taskId = run.steps[step]?.taskId;
  const views = new Map<string, TaskView>();
  if (taskId) views.set(taskId, yield* asked('view', e.view(taskId)));
  const frozen = judgedSteps(run, (yield* workflowsOf(run, home)).steps).find((s) => s.name === step);
  return askedQuestions(frozen, closeoutOf(views, run, step));
});

/**
 * The words `typed`, a person's `--answer`s to the questions `step` of run `runId` asks now, become, `note` their note: the try's message
 * (`answerText`), or with `approval` the approval's words (`approvedAnswerText`), each saying who gave them (`actor`, the caller where
 * it is known) or, for answers typed in-process, that they were given at the terminal. Fails `Invalid` with why they cannot be: a value
 * `numberedAnswers` cannot resolve, or answers `answerRefusal` refuses — a step that asks none now among them.
 */
export const typedAnswers = Effect.fn('typedAnswers')(function* (
  runId: string,
  step: string,
  typed: readonly string[],
  { note, approval = false, actor }: { note?: string; approval?: boolean; actor?: Actor | undefined } = {},
) {
  const run = yield* (yield* RunDoor).runs.read(RunId.read(runId));
  const questions = (yield* askedNow(yield* StoreRoot, run, step)).flatMap((a) => a.questions);
  const answers = numberedAnswers(questions, typed, `nemia decide ${runId}`);
  const wrong = Array.isArray(answers) ? answerRefusal(questions, answers, INSTEAD) : answers.error;
  if (wrong !== null || !Array.isArray(answers)) return yield* Effect.fail(new Invalid({ message: wrong ?? '' }));
  const by = actor === undefined ? AT_THE_TERMINAL : actorWords(actor);
  return approval ? approvedAnswerText(step, questions, answers, note, by) : answerText(questions, answers, note, by);
});

/**
 * The words `answers`, a person's answers to the questions `step` of run `runId` asks now as the board sends them (by title and label),
 * become, `note` their note: the try's message (`answerText`), or with `approval` the approval's words (`approvedAnswerText`), each saying
 * who gave them (`actor`, the caller where it is known; else the person, on the board). Fails
 * `Invalid` where they do not fit the questions the step's current closeout asks (`answerRefusal`) — a step that asks none now among them,
 * as one whose closeout moved on since the page was read. The step is read from its workflow folder under `home` where the run froze none.
 */
export const givenAnswers = Effect.fn('givenAnswers')(function* (
  runId: string,
  step: string,
  answers: readonly Answer[],
  {
    note,
    approval = false,
    home,
    actor,
  }: { note?: string | undefined; approval?: boolean; home?: string | undefined; actor?: Actor | undefined } = {},
) {
  const run = yield* (yield* RunDoor).runs.read(RunId.read(runId));
  const questions = (yield* askedNow(home ?? (yield* StoreRoot), run, step)).flatMap((a) => a.questions);
  const wrong = answerRefusal(questions, answers);
  if (wrong !== null) return yield* Effect.fail(new Invalid({ message: wrong }));
  const by = actor === undefined ? undefined : actorWords(actor);
  return approval ? approvedAnswerText(step, questions, answers, note, by) : answerText(questions, answers, note, by);
});

/**
 * The `--answer` values typed, in the order given: none where none were.
 * @param args The command line's parsed arguments.
 */
export const typedOf = (args: Args) => {
  const value = args.answer;
  return (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []) satisfies readonly string[] as readonly string[];
};

/**
 * The refusal of `--answer` beside `--recheck`, which files no session to read the answers, or null.
 * @param args The command line's parsed arguments.
 * @param command The command as typed, which the refusal's fixes repeat.
 */
export const recheckAnswerRefusal = (args: Args, command: string) =>
  args.mode === 'recheck' && typedOf(args).length
    ? `--answer carries your answers into the try's brief, and --recheck files no session to read them — it runs the check again, and nothing else. Recheck without answers (${command} --recheck), or give them to a session: ${command} --answer <n>=<letter>.`
    : null;
