/**
 * What should happen to a run now (`assess`), decided from the engine's view of each task and nothing else: what the tick files, and
 * whether the run is finished and what stopped it (`stoppedOnWord`). Pure; the tick acts on it, and the verbs and the screens ask it.
 */
import { retriesDue, type CheckKillOf, type Retry, type RetryAsk, type TipOf } from '../retry/index.ts';
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
import type { StepSpec } from '../step/step.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import {
  honoursAsks,
  satisfiesAfter,
  stopsFollowers,
  type CloseoutAsked,
  type Run,
  type StepStatus,
  type TaskPhase,
} from '../record/record.ts';
import type { Closeout } from '../closeout/index.ts';
import { closeoutRefusals } from '../question/index.ts';
import type { Verdict } from '../check/index.ts';
import type { CheckoutHold } from '../cap/cap.ts';
import { roundsDue } from '../round/round.ts';
import { conditionOf, nodeFate, nodeKind } from '../route/index.ts';
import { answeredRoute, routedWords } from '../route/routed/index.ts';
import type { RunStatusWord } from 'objects';
import { hasStarted } from '../wait/wait.ts';
import { needsWaited, type NeedHeld, type NeedWaited } from '../needs/index.ts';

export type Assessment = {
  /**
   * Steps whose predecessors are all satisfied — verified, unverified or sent — or skipped, at least one satisfied, on the route their
   * condition answered (`nodeFate`), and which have not been filed. File these. Never a table condition, which the pass answers unfiled,
   * nor a workflow node (`send`).
   */
  ready: string[];
  /** Workflow nodes (`workflow:`) due their card, on the route taken and never sent. Send these: each files a card for its workflow. */
  send: string[];
  /** Steps that signed off with a `check:` nobody has filed yet. File their checks. */
  check: string[];
  /** Steps to try again, and how: a check `retries:` still covers, or a person's `nemia retry`. File these. */
  retry: Retry[];
  /** Loops to go round again: a looping step that said `again: true` with rounds left, or a person's `nemia retry --round`. File these. */
  round: Round[];
  /** Steps that cannot run, because something they wait on stops what follows it (`stopsFollowers`). */
  unreachable: string[];
  /**
   * Steps waiting on the repository's own checkout on this pass (`waitsOnCheckout`): an ending a person's word, or its workflow, would
   * file, or a try of one, while another run's `workspace: base` step is in that one directory. Nothing of them is filed, and the run is
   * running for them — so the cap on runs in flight still counts it (`slotNeed`), as it counts a run whose next step the pass files.
   */
  waitingOnCheckout: string[];
  /**
   * The run in one word. `failed` is a run in which a step broke: its task failed or was stopped, or its check refused it or did not
   * finish. A run stopped on a person alone is not `failed`: `awaiting approval` when every step that stops what follows it waits at its
   * gate, and `waiting` when a person's word is what stops it otherwise — a step that signed off blocked, or unsigned, a loop out of
   * rounds, a cap reached (`stoppedOnWord`). Each of the three is a run that stopped: it is at rest, and no longer in flight.
   */
  status: RunStatusWord;
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
   * The needs of the run's workflow and place a run that has filed nothing waits on (`needsHolding`), each with what it is and what puts it
   * in place: nothing is due nor asked of anyone, the run is `running` and takes no slot, since it has filed nothing, and its next pass
   * after a need reads met files its first step. Absent on a run no need holds.
   */
  waitingOnNeeds?: NeedWaited[];
  /**
   * What waits on the store's pause (`Run.pause`) on this pass: every step whose session, try, round or check the pass would file, by
   * name (`steps`), and the steps among them whose check is what waits (`checks`). Nothing of them is filed, and the run counts against the
   * cap on runs in flight for them, as for `waitingOnCheckout`. Absent while the store is not paused, and on a run nothing of which waits
   * on the pause.
   */
  waitingOnPause?: { steps: string[]; checks: string[] };
  /**
   * Where each step stands on this pass, before any try, round or routing moves it (`standing`): its word, and its own work's under it.
   * What the listing words each row from, and `decision` reads, so neither stands a step again.
   */
  stepWords: ReadonlyMap<string, { status: StepStatus; own: StepStatus }>;
  /**
   * The tries and rounds due on this pass before the checkout or the store's pause hold them back: what a person's ask, a check's
   * `retries:` or a loop's `again` makes due. `retry` and `round` are what of them the pass files now. None on a run cancelled or held,
   * and none of a person's ask on a pruned one (`honoursAsks`).
   */
  due: { retry: Retry[]; round: Round[] };
  /** The steps the work due on this pass sends back (`unheld`): an ending at its gate that waits for that work again. */
  unheld: string[];
};

/**
 * What `assess` reads of a run, as one value: the run, its frozen steps, the readers made once of the engine's views (`readersOf` in
 * told.verb.ts), a person's asks, where the result branches stand and who holds the checkout. `RunRead` (told.verb.ts) is this and what a
 * filing reads besides; a pure caller is handed one.
 */
export type AssessRead = {
  readonly steps: readonly StepSpec[];
  readonly run: Run;
  /** Each task's phase, as the engine's view of it says (`phaseOfView`). */
  readonly phaseOf: (taskId: string) => TaskPhase;
  /** How each step signed off, when it left a closeout (`closeoutReader`): a clean session can still say `outcome: "blocked"`. */
  readonly signedOff: (step: string) => Closeout | undefined;
  /** Whether a task was asked for a closeout (`closeoutAsked`). */
  readonly asked: (taskId: string) => CloseoutAsked;
  /** What each step's current check exited with (`exitVerdicts`), read only for a check that did not pass. */
  readonly verdictOf: (step: string) => Verdict | undefined;
  /** What the OOM killer did to each step's current check (`checkKills`): a check the machine killed is run again by `retries:`. */
  readonly checkKillOf: CheckKillOf;
  /** Whether a task's session is blocked by its harness (`harnessBlocked`): what makes a person's try of it due, to stop it first. */
  readonly sessionBlocked: (taskId: string) => boolean;
  /** What each task's sessions cost (`spendReader`): what holds a step over its `budget:`. */
  readonly spendOf: SpendOf;
  /** What people asked for with `nemia retry`, and the run has not consumed yet. */
  readonly asks: readonly RetryAsk[];
  /** What people asked for with `nemia retry --round`, and the run has not consumed yet. */
  readonly roundAsks: readonly RoundAsk[];
  /** Where each result branch stands against the base branch: what says a run with no gated ending is one nobody has decided. */
  readonly standings: readonly BranchStanding[];
  /** The run whose `workspace: base` step is in the repository's own checkout (`checkoutHold`), if one is. */
  readonly checkout: CheckoutHold | undefined;
  /**
   * The needs of the run's workflow and of its place as the latest sweep read them, each with its words (`runNeeds`): what holds a run that
   * has filed nothing. Left out, none, as where the process keeps no reading.
   */
  readonly needs?: readonly NeedHeld[];
  /**
   * Where each branch of the run's repository is now, as the reader read it (the pass's heads, `nemia decide`'s and the list's `git`): what
   * a person's `--recheck` of a blocked step is judged on (`blockedRecheck`). Left out, none was read, and no blocked step is rechecked.
   */
  readonly tipOf?: TipOf;
};

/**
 * What should happen to this run now. Pure — hand it the engine's view of each task and it decides; it reads no disk and calls no
 * engine.
 *
 * - A cancelled run files nothing more, however its predecessors ended: no step, no check, no try, no round.
 * - A pruned run honours no person's ask, since its worktrees are gone (`mayFile`): an ask written by hand is no try due. A held run
 *   honours none until the hold lifts, files nothing and asks nothing of a person; it is `running`, since a hold is no decision about the
 *   work, with `holdUntil`, and keeps `unreachable`, since what can never run is a fact about the steps.
 * - A run that has filed nothing waits on each need of its workflow and place read missing (`needsWaited`), after a person's hold: it
 *   files nothing, asks nothing, is `running` with `waitingOnNeeds`, and takes no slot; a run that has filed a task is never held so.
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
 * The read is the pass's (`readRun`), and every reader of a run is handed it, so the tick, the verbs and the screens say one thing of it.
 */
export function assess(read: AssessRead): Assessment {
  const {
    steps,
    run,
    phaseOf,
    signedOff: closeoutOf,
    asked: askedCloseout,
    verdictOf,
    checkKillOf,
    sessionBlocked,
    spendOf,
    standings,
    checkout,
  } = read;
  const [asks, roundAsks] = honoursAsks(run) ? [read.asks, read.roundAsks] : [[], []];
  const stood = new Map(steps.map((s) => [s.name, standing(s, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf)]));
  const stepWords = new Map([...stood].map(([name, st]) => [name, { status: st.status, own: st.own }]));
  const nothing = {
    ready: [],
    send: [],
    check: [],
    retry: [],
    round: [],
    waitingOnCheckout: [],
    stepWords,
    due: { retry: [], round: [] },
    unheld: [],
  };
  if (run.cancelledAt) return { ...nothing, unreachable: [], status: 'cancelled' };

  const status = routedWords(steps, run, new Map([...stood].map(([name, st]) => [name, st.status])), closeoutOf);
  const due = retriesDue(steps, run, phaseOf, closeoutOf, askedCloseout, verdictOf, asks, sessionBlocked, spendOf, checkKillOf, read.tipOf);
  const retry = due.filter((r) => !waitsOnCheckout(steps, r.step, checkout));
  const waitingOnCheckout: string[] = due.filter((r) => waitsOnCheckout(steps, r.step, checkout)).map((r) => r.step);
  for (const r of due) status.set(r.step, 'running');
  const round = roundsDue(steps, run, phaseOf, closeoutOf, askedCloseout, roundAsks, spendOf, verdictOf);
  unspent(status, stood, roundSpans(steps, round));
  for (const r of round) status.set(r.step, 'running');
  const sentBack = [...unheld(steps, run, retry, round)];
  for (const name of sentBack) status.set(name, 'pending');
  const { ready, send, check, unreachable } = dueSteps(steps, run, status, closeoutOf, checkout, waitingOnCheckout);

  const all = [...status.values()];
  const overall: Assessment['status'] = succeeded(all)
    ? 'succeeded'
    : unreachable.length || all.some(stopsFollowers)
      ? stoppedOnWord(steps.flatMap((s) => wordsOf(status.get(s.name), stood.get(s.name))))
      : 'running';

  if (run.hold) return { ...nothing, unreachable, status: 'running', holdUntil: [...run.hold.until] };
  const waitingOnNeeds = needsWaited(hasStarted(run), read.needs ?? []);
  if (waitingOnNeeds.length) return { ...nothing, unreachable, status: 'running', waitingOnNeeds };
  const decide = toDecide(steps, run, overall, (name) => status.get(name) ?? 'pending', standings);
  const assessed: Assessment = {
    ready,
    send,
    check,
    retry,
    round,
    unreachable,
    waitingOnCheckout,
    status: overall,
    ...(decide ? { toDecide: decide } : {}),
    stepWords,
    due: { retry: due, round },
    unheld: sentBack,
  };
  return underPause(run, assessed);
}

/**
 * What of the run's steps is due on this pass, off each step's word: a check nobody has filed, a node whose fate is ready (`nodeFate`, its
 * condition's route and its parents' words) filed as a session, or sent its card where it is a workflow node, or held for the checkout —
 * never a table condition, which the pass answers unfiled — and one that waits on a step that stops it, unreachable. Pure.
 */
function dueSteps(
  steps: readonly StepSpec[],
  run: Run,
  status: ReadonlyMap<string, StepStatus>,
  closeoutOf: (step: string) => Closeout | undefined,
  checkout: CheckoutHold | undefined,
  waitingOnCheckout: string[],
): Pick<Assessment, 'ready' | 'send' | 'check' | 'unreachable'> {
  const due: Pick<Assessment, 'ready' | 'send' | 'check' | 'unreachable'> = { ready: [], send: [], check: [], unreachable: [] };
  const wordOf = (name: string): StepStatus => status.get(name) ?? 'pending';
  for (const step of steps) {
    const own = status.get(step.name);
    if (own === 'checking' && !run.steps[step.name]?.check) due.check.push(step.name);
    if (own !== 'pending') continue;
    const condition = conditionOf(step, steps);
    const answered = condition ? answeredRoute(condition, run, closeoutOf, wordOf, steps) : undefined;
    const fate = nodeFate(step.when, answered?.kind === 'route' ? answered.route : undefined, step.after.map(wordOf));
    if (fate === 'unreachable') due.unreachable.push(step.name);
    else if (fate !== 'ready' || step.route?.kind === 'table') continue;
    else if (nodeKind(step) === 'workflow') due.send.push(step.name);
    else if (waitsOnCheckout(steps, step.name, checkout)) waitingOnCheckout.push(step.name);
    else due.ready.push(step.name);
  }
  return due;
}

/** Whether a run's words say it succeeded: every node satisfied, sent or skipped, and at least one that ran. */
const succeeded = (all: readonly StepStatus[]): boolean =>
  all.every((s) => satisfiesAfter(s) || s === 'skipped') && (all.length === 0 || all.some(satisfiesAfter));

/** The assessment as the store's pause leaves it (`Run.pause`): nothing due, and what was due named in `waitingOnPause`. Pure. */
function underPause(run: Run, a: Assessment): Assessment {
  if (!run.pause) return a;
  const steps = [
    ...new Set([...a.ready, ...a.send, ...a.check, ...a.retry.map((r) => r.step), ...a.round.map((r) => r.step), ...a.waitingOnCheckout]),
  ];
  const checks = [...new Set([...a.check, ...a.retry.filter((r) => r.mode === 'recheck').map((r) => r.step)])];
  const waitingOnPause = steps.length ? { waitingOnPause: { steps, checks } } : {};
  return { ...a, ready: [], send: [], check: [], retry: [], round: [], waitingOnCheckout: [], ...waitingOnPause };
}

/** Read each step of a round due (`roundSpans`) that is `over budget` as its own ending under it, in `status`: never one not stood. */
function unspent(status: Map<string, StepStatus>, stood: ReadonlyMap<string, { own: StepStatus }>, names: Iterable<string>): void {
  for (const name of names) {
    const st = stood.get(name);
    if (st && status.get(name) === 'over budget') status.set(name, st.own);
  }
}

/** A step's status and its own ending under it (`standing`), for `stoppedOnWord`: none for a step the assessment did not stand. */
const wordsOf = (status: StepStatus | undefined, stood: { own: StepStatus } | undefined): { status: StepStatus; own: StepStatus }[] =>
  status !== undefined && stood !== undefined ? [{ status, own: stood.own }] : [];

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

/** What the run refused of the last try's closeout (`closeoutRefusals`), as its next try is told it; nothing for none. */
export const refusedTold = (
  step: StepSpec | undefined,
  said: Closeout | undefined,
  steps: readonly StepSpec[],
): Pick<RetryBriefing, 'refused'> => {
  const refused = said ? closeoutRefusals(step, said, steps) : [];
  return refused.length ? { refused } : {};
};

/**
 * What a filing says of how its session runs — the harness's arguments, a session to continue, a hold and a closing statement's schema —
 * for a step on a local harness, and nothing for one on a remote A2A agent (`harness: a2a:<name>`), which runs as its operator configured
 * it. The runtime refuses a `config` with any key in it, one whose value is undefined included (`remoteRefuses`), so the fields are left
 * out, not emptied; and a try of a remote step is a new Task, never a turn of the last one.
 */
export const localFields = <T extends object>(step: StepSpec, fields: () => T): T | Record<string, never> =>
  isRemoteHarness(step.harness) ? {} : fields();
