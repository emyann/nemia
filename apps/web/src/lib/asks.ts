/**
 * What a step needs from a person, as the board says it, and what the run's page offers to answer it with. Pure.
 *
 * The facts are the api's — a closeout's `needs`, a session the harness blocked and what it said last, `waitingOnYou`, a try a
 * person `asked` for — which are the package's and the engine's. The words that join them to a step, `asks` and `blocked by the
 * harness`, are the board's: the package has none for them.
 */
import type { RunDetail, RunSummary } from './api';
import { stepState } from './status.ts';

type NeedsStep = Pick<RunSummary['steps'][number], 'name' | 'needs' | 'blockedByHarness'>;

/** What one step needs from a person: the question it signed off blocked with, or that the harness blocked its session, and what it said last. */
export type Need = { step: string; kind: 'asks'; needs: string } | { step: string; kind: 'harness'; lastLine: string | null };

/**
 * A step's need, or null. The question of a step that signed off blocked, while it waits on you — not once a person has asked for its
 * next try, which takes it out of `waitingOnYou`. That the harness blocked its session, for as long as it does. Nothing on a run
 * called off: nobody is waiting for the answer any more.
 */
export function needOf(step: NeedsStep, waitingOnYou: boolean, runCancelled: boolean): Need | null {
  if (runCancelled) return null;
  if (step.blockedByHarness) return { step: step.name, kind: 'harness', lastLine: step.blockedByHarness.lastLine };
  if (step.needs && waitingOnYou) return { step: step.name, kind: 'asks', needs: step.needs };
  return null;
}

/** Each step's need, in the run's order: what the Factory's card and the run's banner say. */
export const needsOf = (run: Pick<RunSummary, 'cancelledAt' | 'waitingOnYou'> & { steps: readonly NeedsStep[] }): Need[] =>
  run.steps.flatMap((step) => needOf(step, run.waitingOnYou.includes(step.name), run.cancelledAt !== null) ?? []);

/** A need as its step's node says it, under the step's name: `asks: <needs>`, `blocked by the harness: <what it said last>`. */
export const needText = (need: Need): string =>
  need.kind === 'asks' ? `asks: ${need.needs}` : `blocked by the harness${need.lastLine ? `: ${need.lastLine}` : ''}`;

/** A need with the step it is of, as the card and the banner say it: `implement asks: <needs>`, `implement is blocked by the harness: <…>`. */
export const needLine = (need: Need): string => `${need.step} ${need.kind === 'asks' ? '' : 'is '}${needText(need)}`;

/**
 * What the Decide section offers for a step, each a `wf retry` the api asks for (`askTry`):
 *
 *   answer     it signed off blocked: an answer to its `needs`, carried into a nudge, or a fresh session
 *   continue   the harness blocked its session: a nudge with nothing to say
 *   try-again  its check refused it, or it ended without its closeout: another session, with something to say if you like — and
 *              where a check did not pass, the check run again; first, when it did not finish
 *   asked      a person asked for its next try, which the next tick files: `wf ls`'s note says so
 */
export type Offer =
  | { step: string; kind: 'answer'; needs: string | null }
  | { step: string; kind: 'continue'; lastLine: string | null }
  | { step: string; kind: 'try-again'; recheck: boolean; unfinished: boolean }
  | { step: string; kind: 'asked'; try: number; note: string | null };

/**
 * The offers of a run's page, in the run's order: one per step waiting on you that a try can answer, each step the harness blocked, and
 * each step a person asked for a try of. A loop out of rounds goes round with `wf round`, among the Decide section's commands, and has
 * none. Nothing on a run called off.
 */
export function offersOf(run: Pick<RunDetail, 'cancelledAt' | 'waitingOnYou' | 'steps'>): Offer[] {
  if (run.cancelledAt !== null) return [];
  return run.steps.flatMap((step): Offer[] => {
    if (step.asked) return [{ step: step.name, kind: 'asked', try: step.asked.try, note: step.note }];
    if (step.blockedByHarness) return [{ step: step.name, kind: 'continue', lastLine: step.blockedByHarness.lastLine }];
    if (!run.waitingOnYou.includes(step.name)) return [];
    const state = stepState(step.status, false);
    if (state === 'blocked') return [{ step: step.name, kind: 'answer', needs: step.needs }];
    if (state === 'failed-check') return [{ step: step.name, kind: 'try-again', recheck: true, unfinished: step.check?.verdict === 'unfinished' }];
    if (state === 'unsigned') return [{ step: step.name, kind: 'try-again', recheck: false, unfinished: false }];
    return [];
  });
}
