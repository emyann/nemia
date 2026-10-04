/**
 * A person's answers to the questions a step asks, as the board sends them on `POST …/retry`: checked against the questions its current
 * closeout asks (`askedQuestions`), and written as the words its next try reads (`answerText`), which `wf retry --message` would carry.
 */
import { closeoutOf, type RetryHow, judgedSteps, workflowsOf } from 'agent-orchestrator';
import { type Answer, answerRefusal, answerText, askedQuestions, type Run } from 'agent-orchestrator/run';
import type { Refusal } from '../guard.ts';
import { type Engine } from '../store.ts';

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
        '`answers` are carried into the step\'s next try, as `wf retry --message` carries an answer, and a recheck files no session to read them. Send them with "mode": "nudge" or "fresh".',
    };
  }
  const taskId = run.steps[step]?.taskId;
  const views = new Map(taskId ? [[taskId, await e.view(taskId)]] : []);
  const frozen = judgedSteps(run, workflowsOf(run, home).steps).find((s) => s.name === step);
  const asked = askedQuestions(frozen, closeoutOf(views, run, step)).flatMap((a) => a.questions);
  const wrong = answerRefusal(asked, answers);
  if (wrong) return { status: 400, error: wrong };
  return { ...how, message: answerText(asked, answers, how.message) };
}
