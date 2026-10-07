/**
 * A person's answers to the questions a step asks, as the board sends them on `POST …/retry` and `POST …/approve`: checked against the
 * questions its current closeout asks (`askedQuestions`), and written as the words its next try reads (`answerText`), which
 * `nemia retry --message` would carry, or as its approval's words (`approvedAnswerText`), which `nemia approve --message` would carry.
 */
import { closeoutOf, type RetryHow, judgedSteps, workflowsOf } from 'agent-orchestrator';
import {
  type Answer,
  answerRefusal,
  answerText,
  approvedAnswerText,
  askedQuestions,
  type Question,
  type Run,
} from 'agent-orchestrator/run';
import type { Refusal } from '../guard.ts';
import { engineRead, type Engine } from '../store.ts';

/** The questions `step`'s current closeout asks, in the order its fields ask them: none where it asks none, or has not signed off. */
export async function askedNow(e: Engine['Service'], run: Run, step: string, home: string): Promise<Question[]> {
  const taskId = run.steps[step]?.taskId;
  const views = new Map(taskId ? [[taskId, await engineRead('view', e.view(taskId))]] : []);
  const frozen = judgedSteps(run, workflowsOf(run, home).steps).find((s) => s.name === step);
  return askedQuestions(frozen, closeoutOf(views, run, step)).flatMap((a) => a.questions);
}

/**
 * `how` with `answers` written into its message, the message it had becoming their note; or why they cannot be (400): answers on a
 * recheck, which files no session to read them, and answers that do not fit the questions the step's current closeout asks, in the
 * package's words (`answerRefusal`) — a step that asks none now included, as one whose closeout moved on since the page was read.
 */
export async function answeredHow(
  e: Engine['Service'],
  run: Run,
  step: string,
  how: RetryHow,
  answers: readonly Answer[],
  home: string,
): Promise<RetryHow | Refusal> {
  if (how.mode === 'recheck') {
    return {
      status: 400,
      error:
        '`answers` are carried into the step\'s next try, as `nemia retry --message` carries an answer, and a recheck files no session to read them. Send them with "mode": "nudge" or "fresh".',
    };
  }
  const asked = await askedNow(e, run, step, home);
  const wrong = answerRefusal(asked, answers);
  if (wrong) return { status: 400, error: wrong };
  return { ...how, message: answerText(asked, answers, how.message) };
}

/**
 * The words an approval of `step` carries for `answers`, `message` becoming their note (`approvedAnswerText`); or why they cannot be
 * (400): answers that do not fit the questions the step's current closeout asks, in the package's words (`answerRefusal`) — a step that
 * asks none now included.
 */
export async function answeredApproval(
  e: Engine['Service'],
  run: Run,
  step: string,
  message: string | undefined,
  answers: readonly Answer[],
  home: string,
): Promise<{ message: string } | Refusal> {
  const asked = await askedNow(e, run, step, home);
  const wrong = answerRefusal(asked, answers);
  if (wrong) return { status: 400, error: wrong };
  return { message: approvedAnswerText(step, asked, answers, message) };
}
