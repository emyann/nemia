/** What is left for a person to do about a run (`decision`), and the cost lines `wf decide` prints (`costLine`, `runCostLines`). Pure. */
import type { Workflow } from '../step/step.ts';
import { refusedCheck, tryOf, type CloseoutAsked, type Run, type StepStatus, type TaskPhase } from '../record/record.ts';
import type { Closeout } from '../closeout/closeout.ts';
import type { Verdict } from '../check/check.ts';
import type { RetryAsk } from '../retry/index.ts';
import {
  approvedFirst,
  budgetOf,
  heldByCheckout,
  roundSpans,
  runSpend,
  sessionTasks,
  spentWord,
  standing,
  stepSpend,
  type RoundAsk,
  type SpendOf,
  budgetWord,
  dollars,
  readWords,
  type Consumed,
} from '../status/status.ts';
import type { CheckoutHold } from '../cap/cap.ts';
import { assess } from '../tick/assess.ts';
import { resultSteps } from '../branches/branches.ts';

/**
 * What is left for a person to do about this run.
 *
 * A review and a reply are two opinions; something has to say what ships, and that something is
 * not a step. An agent that graded the exchange would be a third opinion with no more standing
 * than the first two, and the one thing it could not do is the thing the moment is for — commit
 * the repository to an answer. So the run ends by handing the choice over, deliberately, instead
 * of settling `succeeded` and going quiet.
 *
 * `shipped` is ASKED, not stored. Whether the work landed is a question git can already answer —
 * is the result branch an ancestor of the base branch — and a stored decision would be a second
 * copy of it, wrong the moment somebody merges by hand. A run still holds no status of its own;
 * cancellation remains the single exception, and it is one because nothing else knows it.
 *
 * Git's yes is not always an answer, though. A result branch is cut at the run's base, which is on the
 * base branch, so a branch nobody committed to is "on the base branch" from the moment it is cut. Read
 * as shipped, a run whose last step failed with nothing committed would say `shipped`: `wf decide` would
 * hide the failure, and a run waiting on it (`--after`) would start. So `shipped` says which yes it is (`Shipped`).
 */
export type Decision =
  | { kind: 'running'; waiting: string[] }
  | { kind: 'cancelled'; at: string }
  | { kind: 'shipped'; branches: string[] }
  | {
      kind: 'awaiting';
      outcome: 'succeeded' | 'failed' | 'blocked';
      branches: string[];
      /**
       * Steps whose task failed or was stopped — over their budget or not, as each list below names a step by how it ended on its own work.
       */
      failed: string[];
      /** Steps that signed off blocked. */
      stuck: string[];
      /** Steps whose check refused them: it ran to its end, and did not exit 0. */
      failedCheck: string[];
      /** Steps whose check did not finish — stopped, or killed before it exited (`refusedCheck`). No verdict on the work. */
      unfinishedCheck: string[];
      /** Steps that ended without the closeout they were asked for. */
      unsigned: string[];
      /** Steps that declared no check: done on their own word. */
      unverified: string[];
      /** Looping steps that asked for another round on the last one their `rounds:` allows. */
      exhausted: string[];
      /**
       * Steps whose tries cost their `budget:` or more where another session of them is the way on, and looping steps whose round waits on
       * one (`stepStatus`).
       */
      overBudget: string[];
      /** Steps whose harness ended their session at their `budget:`. */
      budgetExhausted: string[];
      /**
       * Steps that signed off having been denied a call, and say `denials: fail`: nothing after them is filed, and no check of them ran.
       */
      denied: string[];
      /** Gated steps that signed off and wait for a person's `wf approve` (`stepStatus`): nothing after them is filed. */
      awaitingApproval: string[];
      /** The steps worked on the base branch itself (`--no-worktree`): there is nothing to merge. */
      direct: boolean;
    };

/**
 * Whether a result branch is on the run's base branch, as git says it (`isShipped` in branches.store.ts):
 *
 *   false        it is not
 *   'unchanged'  it is, and only because nothing is committed on it past the run's base — where it was cut
 *   true         it is, with commits past the run's base: work a person merged
 *
 * `decision` calls a run shipped on `true` whatever its steps said, and on `'unchanged'` only when every
 * step succeeded: a branch that never moved says nothing landed, and a run that failed or waits on a
 * person has not shipped for having nothing to merge. Neither while a step waits at its gate: the gate
 * is a person's word on the record, and a merge is not that word — a run `--after` it waits for both.
 */
export type Shipped = boolean | 'unchanged';

/**
 * What is left for a person to do about this run (`Decision`). Pure. Read on `assess`'s inputs: a step a round due files again is held
 * on no budget (`roundSpans`); an ending un-held at its gate (`unheld`) needs no reading here, since the try or round due makes the run
 * `running`, and `gateLines` words that window.
 *
 * `running` names what it waits on, each once: a step whose agent or check is still going, one ready, an ending step waiting for the
 * repository's own checkout (`heldByCheckout`), a step the next tick tries again and a loop going round again.
 *
 * A run that worked directly on its base branch is never asked whether it shipped: git's answer is always yes. Every result branch is
 * asked, not some — a fan-out that ends in two branches is not shipped because one landed — each once, and none after the first that is
 * not on the base branch. A step waiting at its gate is a person's word not yet given, and the run is not shipped while one does, save
 * an ending at its gate that has not run whose result git already has (`resultOnBase`): the merge its gate holds was made by hand, so
 * the run is shipped and a run `--after` it starts (`parentOf`), since its approval is refused and that child would wait for ever.
 *
 * The steps are told apart by how each ended on its own work (`ownStatus`): blocked, a question; failed or stopped, a thing that broke;
 * a check that refused, a thing the run can name; a check that did not finish, one to run again. Being over budget is said beside that,
 * in `overBudget`, never in its place. A loop out of rounds, a cap reached and a call denied broke nothing: each makes the run `blocked`,
 * a person's call.
 *
 * @param verdictOf What each step's current check exited with: a refusal and a check that did not finish are told apart.
 * @param harnessBlocked Whether a task's session is blocked by its harness (`retryable`): a person's try of such a step is waited on too.
 * @param spendOf What each task's sessions cost (`taskSpend`): a step over its budget, or ended at it, is waited on by a person.
 * @param checkout The run whose `workspace: main` step is in the repository's own checkout while this run's waits for it (`checkoutHold` in
 *   ending.verb.ts): what this run is still running for.
 */
export function decision(
  steps: readonly Workflow[],
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  shipped: (branch: string) => Shipped,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  verdictOf: (step: string) => Verdict | undefined = () => undefined,
  asks: readonly RetryAsk[] = [],
  roundAsks: readonly RoundAsk[] = [],
  harnessBlocked: (taskId: string) => boolean = () => false,
  spendOf: SpendOf = () => undefined,
  checkout?: CheckoutHold,
): Decision {
  if (run.cancelledAt) return { kind: 'cancelled', at: run.cancelledAt };

  const { status, ready, retry, round } = assess(
    steps,
    run,
    phaseOf,
    closeoutOf,
    askedCloseout,
    verdictOf,
    asks,
    roundAsks,
    harnessBlocked,
    spendOf,
    [],
    checkout,
  );
  const standingOf = new Map(steps.map((s) => [s.name, standing(s, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf)]));
  const refiled = roundSpans(steps, round);
  const statusOf = new Map(steps.map((s) => [s.name, refiled.has(s.name) ? standingOf.get(s.name)!.own : standingOf.get(s.name)!.status]));
  if (status === 'running') {
    const live = steps
      .filter(
        (s) =>
          statusOf.get(s.name) === 'checking' ||
          (statusOf.get(s.name) === 'running' && ['pending', 'running'].includes(phaseOf(run.steps[s.name].taskId!))),
      )
      .map((s) => s.name);
    const waitsForCheckout = checkout ? steps.filter((s) => heldByCheckout(steps, s.name, checkout)).map((s) => s.name) : [];
    return {
      kind: 'running',
      waiting: [...new Set([...live, ...ready, ...waitsForCheckout, ...retry.map((r) => r.step), ...round.map((r) => r.step)])].sort(),
    };
  }

  const branches = resultSteps(steps)
    .map((s) => run.steps[s.name]?.branch)
    .filter((b): b is string => Boolean(b));

  const direct = run.branch !== undefined && branches.includes(run.branch);

  const said = new Map<string, Shipped>();
  const landed = (branch: string): Shipped => {
    if (!said.has(branch)) said.set(branch, shipped(branch));
    return said.get(branch)!;
  };
  const atGate = steps
    .filter((s) => statusOf.get(s.name) === 'awaiting approval')
    .map((s) => s.name)
    .sort();
  const unrunEnding = (name: string): boolean => !run.steps[name]?.taskId && steps.some((s) => s.name === name && approvedFirst(s, run));
  const byHand =
    atGate.length > 0 && atGate.every(unrunEnding) && branches.length > 0 && !direct && branches.every((b) => landed(b) !== false);
  const awaitingApproval = byHand ? [] : atGate;
  const onBase = branches.length > 0 && !direct && !awaitingApproval.length && branches.every(landed);
  if (onBase && branches.every((b) => landed(b) === true)) return { kind: 'shipped', branches };

  const named = (...want: StepStatus[]) =>
    steps
      .filter((s) => want.includes(standingOf.get(s.name)!.own))
      .map((s) => s.name)
      .sort();
  const stuck = named('blocked');
  const failed = named('failed', 'stopped');
  const checkFailed = named('failed (check)');
  const unfinishedCheck = checkFailed.filter((name) => !refusedCheck(phaseOf(run.steps[name].check!.taskId), verdictOf(name)));
  const failedCheck = checkFailed.filter((name) => !unfinishedCheck.includes(name));
  const unsigned = named('unsigned');
  const unverified = named('unverified');
  const exhausted = named('exhausted');
  const pastBudget = steps
    .filter((s) => statusOf.get(s.name) === 'over budget')
    .map((s) => s.name)
    .sort();
  const budgetExhausted = named('budget exhausted');
  const denied = named('denied');
  const outcome =
    failed.length || checkFailed.length
      ? 'failed'
      : stuck.length ||
          unsigned.length ||
          exhausted.length ||
          pastBudget.length ||
          budgetExhausted.length ||
          denied.length ||
          awaitingApproval.length
        ? 'blocked'
        : 'succeeded';
  if (onBase && outcome === 'succeeded') return { kind: 'shipped', branches };
  return {
    kind: 'awaiting',
    outcome,
    branches,
    failed,
    stuck,
    failedCheck,
    unfinishedCheck,
    unsigned,
    unverified,
    exhausted,
    overBudget: pastBudget,
    budgetExhausted,
    denied,
    awaitingApproval,
    direct,
  };
}

/**
 * A step's `cost` line on `wf decide`, under its `used`: what its current try cost (`used`, as `consumption` reads it) and what it read, by
 * price (`readWords`: `read 21.4M · wrote 412k · peak 167k`, its peak against the step's `context:`) — and for a step whose tries ran more
 * than one session, what they have cost together (`stepSpend`) — then the cap in force on it. Pure. `not measured` where nobody measured,
 * never $0, and nothing of what it read where nobody counted that.
 */
export function costLine(step: Workflow | undefined, run: Run, name: string, used: Consumed | undefined, spendOf: SpendOf): string {
  const current = used?.costUsd !== undefined ? dollars(used.costUsd) : 'not measured';
  const read = readWords(used, step?.context);
  const record = run.steps[name];
  const sessions = sessionTasks(record).length;
  const all = stepSpend(run, name, spendOf);
  const spent =
    sessions > 1
      ? `${current === 'not measured' ? 'this try not measured' : `${current} this try`}${read ? ` · ${read}` : ''} · ${all.measured ? spentWord(all) : 'not measured'} over ${tryOf(run, name)} tries`
      : `${current}${read ? ` · ${read}` : ''}`;
  const cap = step ? budgetOf(step, record) : undefined;
  return `cost  ${spent}${cap !== undefined ? ` · budget ${budgetWord(cap)}` : ''}`;
}

/**
 * The run's `cost` on `wf decide`, after its steps: every step's tries together (`runSpend`), with how many ended attempts have no cost on
 * them — or `not measured`. Pure. None before any attempt has ended.
 */
export function runCostLines(run: Run, spendOf: SpendOf): string[] {
  const spent = runSpend(run, spendOf);
  if (!spent.measured && !spent.unmeasured) return [];
  if (!spent.measured) return ['cost  run not measured'];
  return [
    `cost  run ${dollars(spent.usd)}${spent.unmeasured ? ` measured · ${spent.unmeasured} attempt${spent.unmeasured > 1 ? 's' : ''} not measured` : ''}`,
  ];
}
