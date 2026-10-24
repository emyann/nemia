/**
 * The session page's composer, as rules: whether it may send to a step's session, and what was said to the step, with what the page has
 * just said. Pure, so the rules are held by tests without a browser (test/say.test.ts).
 *
 * The facts are the api's — the step's word, its task, the run's cancellation, and `said`, off the engine's journal — which are the
 * package's and the engine's. What is said where there is nobody to say anything to is the board's: the composer is not drawn at all,
 * and the stopped band carries these words, which point at where a person can act instead (`components/session/SessionBand.tsx`).
 */
import type { RunDetail, Said } from './api';
import { stepState } from './status.ts';

/** Whether the composer may send to a step's session — or why not, and where to go instead. */
export type Sayable = { open: true } | { open: false; why: string };

/**
 * Open while the step's current try has a session in flight, as the run's page words the step: at work, quiet, starting, or blocked by its
 * harness — a session waiting on a person is running, and the engine hands it the words. Closed, with the reason, for a run called off, a
 * step not filed, a task the engine has no record of, one filed and not started, and a session that has ended — signed off, checked, failed
 * or stopped — which is the run page's to answer or try again. A held run stays open: a hold stops what is filed next and the answers to a
 * gate, never a session at work, and the CLI's `say` is not refused on it. What the page cannot see coming, the api refuses in the
 * package's words or the engine's, and the composer shows that refusal as it is.
 */
export function sayable(
  run: Pick<RunDetail, 'cancelledAt'>,
  step: Pick<RunDetail['steps'][number], 'name' | 'taskId' | 'phase' | 'reason'>,
): Sayable {
  if (run.cancelledAt !== null) {
    return {
      open: false,
      why: `The run was called off, so ${step.name}'s session is being stopped, not steered, and nothing more is filed for it.`,
    };
  }
  if (!step.taskId)
    return { open: false, why: `${step.name} is not filed yet, so it has no session to say anything to. Say it here once it runs.` };
  const state = stepState(step.phase, step.reason, false, false);
  if (state === 'working' || state === 'needs-human') return { open: true };
  if (state === 'unknown')
    return { open: false, why: `The engine has no record of ${step.name}'s task, so there is no session to say anything to.` };
  if (state === 'waiting') {
    return {
      open: false,
      why: `${step.name} is filed and its session has not started, so there is nobody to say anything to yet. Say it here once it runs.`,
    };
  }
  return {
    open: false,
    why: `${step.name}'s session has ended, so there is nobody to say anything to. To tell the step something, answer it or try it again from the run page, and the next try is told what you write.`,
  };
}

/**
 * What was said to a step as the api last read it, with what this page has said since that the read does not have yet: once each, in the
 * order said.
 */
export function mergeSaid(read: readonly Said[], sent: readonly Said[]): Said[] {
  const key = (s: Said) => `${s.attempt}:${s.at}`;
  const known = new Set(read.map(key));
  return [...read, ...sent.filter((s) => !known.has(key(s)))].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
