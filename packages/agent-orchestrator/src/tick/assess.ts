/**
 * What should happen to a run now (`assess`), decided from the engine's view of each task and nothing else: what the tick files, and
 * whether the run is finished and what stopped it (`stoppedOnWord`). Pure; the tick acts on it, and the verbs and the screens ask it.
 */
import { retriesDue, type Retry, type RetryAsk } from '../retry/index.ts';
import type { RetryBriefing } from '../brief/index.ts';
import {
  waitsOnCheckout,
  roundSpans,
  standing,
  unheld,
  type BranchStanding,
  type Round,
  type RoundAsk,
  type SpendOf,
} from '../status/status.ts';
import { toDecide, type ToDecide } from '../ending/ending.ts';
import type { Workflow } from '../step/step.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import { satisfiesAfter, stopsFollowers, type CloseoutAsked, type Run, type StepStatus, type TaskPhase } from '../record/record.ts';
import { envelopeRefusals, type Closeout } from '../closeout/index.ts';
import type { Verdict } from '../check/check.ts';
import type { CheckoutHold } from '../cap/cap.ts';
import { roundsDue } from '../round/round.ts';

export type Assessment = {
  /** Steps whose predecessors are all verified or unverified, and which have not been filed. File these. */
  ready: string[];
  /** Steps that signed off with a `check:` nobody has filed yet. File their checks. */
  check: string[];
  /** Steps to try again, and how: a check `retries:` still covers, or a person's `nemia retry`. File these. */
  retry: Retry[];
  /** Loops to go round again: a looping step that said `again: true` with rounds left, or a person's `nemia retry --round`. File these. */
  round: Round[];
  /** Steps that cannot run, because something they wait on stops what follows it (`stopsFollowers`). */
  unreachable: string[];
  /**
   * Steps waiting on the repository's own checkout on this pass (`waitsOnCheckout`): an ending a person's word would file, or a try of one,
   * while another run's `workspace: base` step is in that one directory. Nothing of them is filed, and the run is running for them — so the
   * cap on runs in flight still counts it (`slotNeed`), as it counts a run whose next step the pass files.
   */
  waitingOnCheckout: string[];
  /**
   * The run in one word. `failed` is a run in which a step broke: its task failed or was stopped, or its check refused it or did not
   * finish. A run stopped on a person alone is not `failed`: `awaiting approval` when every step that stops what follows it waits at its
   * gate, and `waiting` when a person's word is what stops it otherwise — a step that signed off blocked, or unsigned, a loop out of
   * rounds, a cap reached (`stoppedOnWord`). Each of the three is a run that stopped: it is at rest, and no longer in flight.
   */
  status: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'awaiting approval' | 'waiting';
  /**
   * What a person has to decide about the run's result, when the run is at it and nobody has (`toDecide`). Absent while there is nothing.
   */
  toDecide?: ToDecide;
  /**
   * The runs a person holds this one until (`Run.hold`), while the hold stands: the run is `running`, and nothing is due — no step, check,
   * try or round — nor asked of anyone (`toDecide`). What is in flight runs on. Absent on a run nobody holds.
   */
  holdUntil?: string[];
  /**
   * What waits on the store's pause (`Run.pause`) on this pass: every step whose session, try, round or check the pass would file, by
   * name (`steps`), and the steps among them whose check is what waits (`checks`). Nothing of them is filed, and the run counts against the
   * cap on runs in flight for them, as for `waitingOnCheckout`. Absent while the store is not paused, and on a run nothing of which waits
   * on the pause.
   */
  waitingOnPause?: { steps: string[]; checks: string[] };
};

/**
 * What should happen to this run now. Pure — hand it the engine's view of each task and it decides; it reads no disk and calls no
 * engine.
 *
 * - A cancelled run files nothing more, however its predecessors ended: no step, no check, no try, no round.
 * - A pruned run honours no person's ask, since its worktrees are gone (`mayFile`): an ask written by hand is no try due. A held run
 *   honours none until the hold lifts, files nothing and asks nothing of a person; it is `running`, since a hold is no decision about the
 *   work, with `holdUntil`, and keeps `unreachable`, since what can never run is a fact about the steps.
 * - A step about to be tried again, and a looping step whose loop goes round again, is `running`: what waits on it waits. No step of a
 *   round due is `over budget` (`roundSpans`): the round is what a person raised the cap for.
 * - An ending step that `waitsOnCheckout` is not filed, neither a first session nor a person's try of it, since two sessions trial merging
 *   in one checkout collide: it goes to `waitingOnCheckout`, is filed once the other run's step settles, and a try of it stays `running`,
 *   so the run still counts against the cap on runs in flight.
 * - An ending held at its gate on work this pass files again (`unheld`) is `waiting`: its gate holds on what that work says.
 * - A check already filed is never filed twice; a step that waits on one that stops its followers is `unreachable`, never left to hang.
 * - While the store is paused (`Run.pause`) nothing is due — no step, check, try or round, nor one waiting on the checkout — and what
 *   would be goes to `waitingOnPause`; a person's asks are honoured as for any run, so a step asked for again is `running`, and its ask
 *   waits on its file for the lift. What a person decides (`toDecide`) is still asked: a word given is kept for the next pass.
 *
 * @param closeoutOf How each step signed off, when it left a closeout: a session that ends cleanly can still say `outcome: "blocked"`,
 *   which the engine cannot tell from finished work.
 * @param askedCloseout Whether a task was asked for a closeout: the schema on the engine's record of its filing.
 * @param verdictOf What each step's current check exited with, read only for a check that did not pass (`refusedCheck`). Left out, no
 *   check has refused, so no try of `retries:` is due.
 * @param asks What people asked for with `nemia retry`, and the run has not consumed yet.
 * @param roundAsks What people asked for with `nemia retry --round`, and the run has not consumed yet.
 * @param harnessBlocked Whether a task's session is blocked by its harness (`retryable`): what makes a person's try of such a step due, to
 *   stop it first.
 * @param spendOf What each task's sessions cost (`taskSpend`): what holds a step over its `budget:`. Left out, no step is over.
 * @param standings Where each result branch stands against the base branch on this pass (`branchStandings` in branches.store.ts): what says
 *   a run whose folder has no gated ending is one nobody has decided (`toDecide`). Left out, no branch is ahead, and only a gate says so.
 * @param checkout The run whose `workspace: base` step is in the repository's own checkout (`checkoutHold` in ending.verb.ts), if one is.
 *   Left out, nothing holds the checkout.
 */
export function assess(
  steps: readonly Workflow[],
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  verdictOf: (step: string) => Verdict | undefined = () => undefined,
  asks: readonly RetryAsk[] = [],
  roundAsks: readonly RoundAsk[] = [],
  harnessBlocked: (taskId: string) => boolean = () => false,
  spendOf: SpendOf = () => undefined,
  standings: readonly BranchStanding[] = [],
  checkout?: CheckoutHold,
): Assessment {
  if (run.cancelledAt) return { ready: [], check: [], retry: [], round: [], unreachable: [], waitingOnCheckout: [], status: 'cancelled' };
  if (run.pruned) [asks, roundAsks] = [[], []];
  if (run.hold) [asks, roundAsks] = [[], []];

  const stood = new Map(steps.map((s) => [s.name, standing(s, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf)]));
  const status = new Map(steps.map((s) => [s.name, stood.get(s.name)!.status]));
  const due = retriesDue(steps, run, phaseOf, closeoutOf, askedCloseout, verdictOf, asks, harnessBlocked, spendOf);
  const retry = due.filter((r) => !waitsOnCheckout(steps, r.step, checkout));
  const waitingOnCheckout: string[] = due.filter((r) => waitsOnCheckout(steps, r.step, checkout)).map((r) => r.step);
  for (const r of due) status.set(r.step, 'running');
  const round = roundsDue(steps, run, phaseOf, closeoutOf, askedCloseout, roundAsks, spendOf);
  for (const name of roundSpans(steps, round)) if (status.get(name) === 'over budget') status.set(name, stood.get(name)!.own);
  for (const r of round) status.set(r.step, 'running');
  for (const name of unheld(steps, run, retry, round)) status.set(name, 'pending');
  const ready: string[] = [];
  const check: string[] = [];
  const unreachable: string[] = [];

  for (const step of steps) {
    const own = status.get(step.name)!;
    if (own === 'checking' && !run.steps[step.name]?.check) check.push(step.name);
    if (own !== 'pending') continue;
    const deps = step.after.map((a) => status.get(a) ?? 'pending');
    if (deps.some(stopsFollowers)) unreachable.push(step.name);
    else if (!deps.every(satisfiesAfter)) continue;
    else if (waitsOnCheckout(steps, step.name, checkout)) waitingOnCheckout.push(step.name);
    else ready.push(step.name);
  }

  const all = [...status.values()];
  const overall: Assessment['status'] = all.every(satisfiesAfter)
    ? 'succeeded'
    : unreachable.length || all.some(stopsFollowers)
      ? stoppedOnWord(steps.map((s) => ({ status: status.get(s.name)!, own: stood.get(s.name)!.own })))
      : 'running';

  if (run.hold)
    return { ready: [], check: [], retry: [], round: [], unreachable, waitingOnCheckout: [], status: 'running', holdUntil: run.hold.until };
  const decide = toDecide(steps, run, overall, (name) => status.get(name) ?? 'pending', standings);
  const assessed: Assessment = {
    ready,
    check,
    retry,
    round,
    unreachable,
    waitingOnCheckout,
    status: overall,
    ...(decide ? { toDecide: decide } : {}),
  };
  return underPause(run, assessed);
}

/** The assessment as the store's pause leaves it (`Run.pause`): nothing due, and what was due named in `waitingOnPause`. Pure. */
function underPause(run: Run, a: Assessment): Assessment {
  if (!run.pause) return a;
  const steps = [
    ...new Set([...a.ready, ...a.check, ...a.retry.map((r) => r.step), ...a.round.map((r) => r.step), ...a.waitingOnCheckout]),
  ];
  const checks = [...new Set([...a.check, ...a.retry.filter((r) => r.mode === 'recheck').map((r) => r.step)])];
  const waitingOnPause = steps.length ? { waitingOnPause: { steps, checks } } : {};
  return { ...a, ready: [], check: [], retry: [], round: [], waitingOnCheckout: [], ...waitingOnPause };
}

/**
 * The status of a run that stopped short of succeeding: `failed` where a step broke, else what it waits on a person for. Pure. Off each
 * step's status as the run reads it, and its own ending under that (`standing`), as `decision` reads it: a step whose task failed and that
 * is over its budget reads `over budget`, and it still broke. A step about to be tried again reads `running`, and stops nothing.
 */
function stoppedOnWord(each: ReadonlyArray<{ status: StepStatus; own: StepStatus }>): Assessment['status'] {
  const stops = each.filter((s) => stopsFollowers(s.status));
  if (stops.some((s) => [s.status, s.own].some((w) => w === 'failed' || w === 'stopped' || w === 'failed (check)'))) return 'failed';
  return stops.length && stops.every((s) => s.status === 'awaiting approval') ? 'awaiting approval' : 'waiting';
}

/** What the run refused of the last try's closeout's envelope (`envelopeRefusals`), as its next try is told it; nothing for none. */
export const refusedTold = (said: Closeout | undefined): Pick<RetryBriefing, 'refused'> => {
  const refused = said ? envelopeRefusals(said) : [];
  return refused.length ? { refused } : {};
};

/**
 * What a filing says of how its session runs — the harness's arguments, a session to continue, a hold and a closing statement's schema —
 * for a step on a local harness, and nothing for one on a remote A2A agent (`harness: a2a:<name>`), which runs as its operator configured
 * it. The runtime refuses a `config` with any key in it, one whose value is undefined included (`remoteRefuses`), so the fields are left
 * out, not emptied; and a try of a remote step is a new Task, never a turn of the last one.
 */
export const localFields = <T extends object>(step: Workflow, fields: () => T): T | Record<string, never> =>
  isRemoteHarness(step.harness) ? {} : fields();
