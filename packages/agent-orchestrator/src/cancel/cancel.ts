/** What cancelling a run has to do, and what to tell the person who asked (`cancelPlan`). Pure. */
import { inFlight, type InFlight } from '../cap/cap.ts';
import type { Workflow } from '../step/step.ts';
import type { CloseoutAsked, Run, TaskPhase } from '../record/record.ts';
import type { Closeout } from '../closeout/closeout.ts';
import type { Verdict } from '../check/check.ts';
import type { RetryAsk } from '../retry/index.ts';
import { standing, type RoundAsk, type SpendOf } from '../status/status.ts';
import { assess } from '../tick/assess.ts';

/**
 * What cancelling this run has to do — and, because they are the same decision, what to tell the
 * person who asked. Pure, like `assess`, and tested the same way.
 *
 * Three answers, because cancelling anything at any time is a normal thing for a person to do and
 * none of it is an error:
 *
 *   - **cancel** — mark the run and ask the engine to stop whatever it has in flight. Possibly
 *     nothing: a run cancelled before its first tick has filed no task at all, and marking it is
 *     still the whole point, because that is what stops the next tick filing the first step.
 *   - **already-cancelled** — someone got there first, and the time they did it stands rather than
 *     being re-stamped. Anything STILL in flight is asked to stop again all the same: cancelling
 *     is level-triggered like everything else here, so running it twice is how a person fixes a
 *     step that slipped through the first time rather than something they have to reason about.
 *   - **finished** — it ended on its own, and there is nothing left for a tick to do either: no
 *     step in flight AND none ready to file. It is deliberately NOT relabelled — a run that
 *     succeeded succeeded, and overwriting that would make `wf ls` lie about work that landed.
 *
 * "Finished" has to mean both of those — and no step waiting at its gate, whose approval would file what follows — because
 * `failed` does not mean a run has stopped moving:
 * in a fan-out where `a` failed and `b` succeeded, a step waiting only on `b` is still READY while
 * the run as a whole reads failed. Treating that as finished would write no mark, and the next tick
 * would file the step anyway — the exact thing cancelling is for.
 */
export type CancelPlan =
  | { kind: 'cancel'; stop: InFlight[] }
  | { kind: 'already-cancelled'; at: string; stop: InFlight[] }
  | { kind: 'finished'; status: 'succeeded' | 'failed' };

/**
 * What cancelling the run has to do (`CancelPlan`). Whatever is in flight is stopped whatever the rest of the run looks like: a fan-out
 * can have one sibling still working while another has failed the run. With nothing in flight, the run is finished only when no step is
 * ready and no check, try or round is due (`assess`), and no step waits at its gate, whose approval would file what waits on it.
 *
 * @param spendOf What each task's sessions cost (`taskSpend`): a step over its budget has no try due, and nothing is filed for it.
 */
export function cancelPlan(
  steps: readonly Workflow[],
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  verdictOf: (step: string) => Verdict | undefined = () => undefined,
  asks: readonly RetryAsk[] = [],
  roundAsks: readonly RoundAsk[] = [],
  spendOf: SpendOf = () => undefined,
): CancelPlan {
  const stop = inFlight(run, phaseOf);
  if (run.cancelledAt) return { kind: 'already-cancelled', at: run.cancelledAt, stop };
  if (stop.length) return { kind: 'cancel', stop };

  const { ready, check, retry, round, status } = assess(
    steps,
    run,
    phaseOf,
    closeoutOf,
    askedCloseout,
    verdictOf,
    asks,
    roundAsks,
    () => false,
    spendOf,
  );
  const atGate = steps.some(
    (s) => standing(s, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf).status === 'awaiting approval',
  );
  if (!ready.length && !check.length && !retry.length && !round.length && !atGate && (status === 'succeeded' || status === 'failed'))
    return { kind: 'finished', status };
  return { kind: 'cancel', stop: [] };
}
