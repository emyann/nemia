/**
 * The caps a pass keeps over runs: runs in flight (`RunSlot`, `runAdmitted`, `heldRuns`), one run's step in a repository's own checkout at
 * a time (`heldCheckouts`), and what is still in flight when a run is called off (`inFlight`). Pure. Sessions at work per pool are the
 * runtime's to admit, under the ceiling `engine()` hands it (`runtime-client.ts`).
 */
import type { StepSpec } from '../step/step.ts';
import type { Run, TaskPhase } from '../record/record.ts';
import { hasStarted, runReady } from '../wait/wait.ts';
import type { Assessment } from '../tick/assess.ts';
import type { SlotSettled } from '../../contracts/slot-settled.contract.ts';
import { runEnded } from '../run-ending/run-ending.ts';

/**
 * Which run's `workspace: base` step is working in a repository's own checkout while another run's waits for it (`heldCheckouts`): the run,
 * and its step.
 */
export type CheckoutHold = { run: string; step: string };

/**
 * A run's claim on a repository's own checkout on a pass (`checkoutHold` in ending.verb.ts): the `workspace: base` step that works there,
 * the repository, and either `holds` — its task is filed and the engine holds it in flight, so the step is in that checkout now — or `at`,
 * the time of the word that would file it (`claimedAt`): a person's approval or ask, or the run's creation for an ending its workflow
 * files with no gate, and for the try the run files itself of an ending whose try made no commit. That time orders the runs waiting
 * for it.
 */
export type MainClaim = { id: string; repo: string; step: string; holds: boolean; at?: string };

/**
 * The runs whose ending step waits for a checkout another run's step has, each with the run and step holding it. Pure.
 *
 * An ending step works in the repository's own checkout, which is one directory on the base branch: two of them at once read the same
 * `git status`, trial merge over each other, and the loser's `git merge --abort` throws away the winner's staged merge. Prose in a
 * `ship.md` is not a constraint, so the machinery holds the second: a run whose `workspace: base` task is in flight has the checkout, and
 * every other run of the same repository waiting to file one is held until it settles, and a run in it is never held. With none in it,
 * the oldest word takes it — then by id — so which pass reads which run first decides nothing.
 *
 * Level-triggered, like the rest: the claims are read from the world on the pass that asks, including what that pass has already filed,
 * and a run held on one pass is asked again on the next.
 * @param claims Each run's claim on its repository's checkout: whether its ending step holds it, else since when it waits for it.
 */
export function heldCheckouts(claims: readonly MainClaim[]) {
  const held = new Map<string, CheckoutHold>();
  const repos = new Map<string, MainClaim[]>();
  for (const c of claims) repos.set(c.repo, [...(repos.get(c.repo) ?? []), c]);
  for (const group of repos.values()) {
    let taken = group.find((c) => c.holds);
    const waiting = group
      .flatMap((c) => (!c.holds && c.at !== undefined ? [{ claim: c, at: c.at }] : []))
      .sort((a, b) => a.at.localeCompare(b.at) || a.claim.id.localeCompare(b.claim.id))
      .map(({ claim }) => claim);
    for (const c of waiting) {
      if (!taken) taken = c;
      else if (taken.id !== c.id) held.set(c.id, { run: taken.id, step: taken.step });
    }
  }
  return held;
}

/**
 * The cap on runs in flight (`WF_MAX_RUNS`), and how many are in flight as a run with nothing filed is judged: every run that has started
 * and is in flight on the pass (`slotNeed`), then each run with nothing filed admitted before it, oldest first (`admissionOrder`) — serial,
 * as the engine admits its tasks, so a run admitted on a pass counts for the next one on the same pass. `cap` 0 is no cap.
 */
export type RunSlot = { inFlight: number; cap: number };

/**
 * What a run asks of the cap on a pass. Pure.
 *
 * `inFlight`: it counts against the cap — a task of it, a step's or a check's, filed and not settled (`inFlight`), or, on a run that has
 * started and nobody called off, something the pass files (a step ready, a check, try or round due) or the checkout holds back
 * (`Assessment.held`) or the store's pause does (`Assessment.paused`): a run between two steps is still in flight, and one whose ending
 * waits on another run's in one directory, or on the lift, waits on no person, and would otherwise free the very slot it is queued for. A
 * cancelled run counts while the engine is still stopping what it had in flight; one that waits on a person, or has finished, does not.
 *
 * `wants`: it has nothing filed, nobody called it off, the runs it waits on have succeeded or been released (`runReady`), and a root is
 * ready — a run slot is
 * what it waits for. A run waiting on runs (`--after`) wants none, and counts only once it is filed.
 *
 * Neither, for a run whose workflow takes no slot at all (`takesNoSlot`, `slot: none`): it is a session that watches the runs the cap
 * holds, so the cap neither counts it nor holds it.
 *
 * @param run The run's record.
 * @param phaseOf The phase of a task the engine holds, by its id.
 * @param a The pass's assessment of the run: the steps ready, the checks, tries and rounds due, and those the checkout or the pause holds.
 * @param released Whether the run of that id has succeeded or been released, which a run waiting on runs (`--after`) asks.
 * @param steps The run's steps, for the one workflow the cap does not hold (`takesNoSlot`). Left out, every run is counted.
 */
export function slotNeed(
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  a: Pick<Assessment, 'ready' | 'check' | 'retry' | 'round' | 'waitingOnCheckout' | 'waitingOnPause'>,
  released: (runId: string) => boolean,
  steps: readonly Pick<StepSpec, 'slot'>[] = [],
) {
  if (takesNoSlot(steps)) return { inFlight: false, wants: false };
  const started = hasStarted(run);
  const due =
    a.ready.length + a.check.length + a.retry.length + a.round.length + a.waitingOnCheckout.length + (a.waitingOnPause?.steps.length ?? 0) >
    0;
  return {
    inFlight: inFlight(run, phaseOf).length > 0 || (started && !run.cancelledAt && due),
    wants: !started && !run.cancelledAt && a.ready.length > 0 && runReady(run, released),
  };
}

/**
 * Whether a run of these steps is outside the cap on runs in flight: its workflow says `slot: none`, which `validate` allows only on a
 * workflow of one step. Pure. It counts against nothing and waits for nothing — a session that watches the runs the cap holds.
 * @param steps The run's steps, the slot each says.
 */
export const takesNoSlot = (steps: readonly Pick<StepSpec, 'slot'>[]) => steps.some((s) => s.slot === 'none');

/**
 * Whether the tick may file the roots of this run on this pass: fewer runs in flight than the cap, or no cap. Pure. Always, for a run that
 * has started — the cap holds only a run with nothing filed — for one judged with no slot, which is `advance` called outside a tick, and
 * for one whose workflow takes no slot at all (`takesNoSlot`).
 * @param run The run's record.
 * @param slot The cap and the count in flight, or undefined where `advance` is called outside a tick.
 * @param steps The run's steps, the slot each says; left out, the run takes a slot.
 */
export const runAdmitted = (run: Run, slot: RunSlot | undefined, steps: readonly Pick<StepSpec, 'slot'>[] = []) =>
  hasStarted(run) || !slot || slotFree(slot) || takesNoSlot(steps);

/**
 * Whether a run slot is free: fewer runs in flight than the cap, or no cap. Pure. What a queued card is started on, after every run has
 * been advanced.
 * @param slot The cap and the count in flight; a cap of 0 is no cap.
 */
export const slotFree = (slot: RunSlot) => slot.cap <= 0 || slot.inFlight < slot.cap;

/**
 * Runs in the order a pass admits them: oldest by `createdAt`, then by id. Pure.
 * @param runs The runs to order.
 */
export const admissionOrder = <R extends Pick<Run, 'id' | 'createdAt'>>(runs: readonly R[]) =>
  [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

/**
 * The runs the cap holds, each with the count it was held at, as a pass would judge them from the store as it stands (`slotNeed`): every
 * run in flight counted, then each that wants a slot admitted oldest first while one is free — and counted — and held once none is. Pure.
 * What `nemia ls` and `nemia decide` say between passes; none with no cap.
 * @param runs Each run with what it asks of the cap (`slotNeed`).
 * @param cap The most runs in flight at once; 0 or less is no cap.
 */
export function heldRuns(runs: ReadonlyArray<Pick<Run, 'id' | 'createdAt'> & { inFlight: boolean; wants: boolean }>, cap: number) {
  const held = new Map<string, RunSlot>();
  if (cap <= 0) return held;
  let inFlight = runs.filter((r) => r.inFlight).length;
  for (const r of admissionOrder(runs.filter((x) => x.wants))) {
    if (inFlight < cap) inFlight++;
    else held.set(r.id, { inFlight, cap });
  }
  return held;
}

/** A run the cap holds, in the words the feed keeps of it (`feedWords`): the count in flight is left to `nemia ls`. */
export const SLOT_WAIT = 'waiting for a run slot';

/**
 * A run the cap holds, as `nemia ls` says it on its roots: `waiting for a run slot (2 of 2 in flight)`.
 * @param slot The cap and the count in flight it was held at.
 */
export const slotWord = (slot: RunSlot) => `${SLOT_WAIT} (${slot.inFlight} of ${slot.cap} in flight)`;

/**
 * The daemon's two ceilings, as it says them when it starts: sessions at work per pool (`WF_MAX_CONCURRENT`; `claude`, `codex` and checks
 * each a pool, a blocked session holding no slot), and runs in flight (`WF_MAX_RUNS`) — `no cap` when none; and the memory limit each
 * session runs under when its step names none (`WF_MEMORY_LIMIT`), in the slice it names (`WF_CGROUP_PARENT`), on a line of its own
 * only where one is set; and, where the floor of the machine's memory is given (`reserved`), its admission by memory on a line of its
 * own: what each session asks (`request`, `WF_MEMORY_REQUEST`, else its limit) and the floor kept for the daemon and the machine
 * (`WF_MEMORY_RESERVED`, else its default), which no session is admitted into; and, where room is kept for a person's turn (`kept`,
 * `WF_KEPT_TURNS`), a line of its own: the places kept per pool beyond the ceiling, which only a person's turn takes, and the memory kept
 * with them where the floor is given.
 * @param c The daemon's ceilings: sessions per pool, the turns kept for a person (0 or absent is none), runs in flight (0 is no cap),
 * and the memory limit, slice, request and floor, each undefined where none is set.
 */
export const ceilingLines = (c: {
  sessions: number;
  kept?: number;
  runs: number;
  memory?: string;
  cgroupParent?: string;
  request?: string;
  reserved?: string;
}) => [
  `sessions at work per pool: at most ${c.sessions} at once — claude, codex, checks each a pool (WF_MAX_CONCURRENT)`,
  `runs in flight: ${c.runs > 0 ? `at most ${c.runs} at once — a run with nothing filed waits for a slot, oldest first` : 'no cap'} (WF_MAX_RUNS)`,
  ...(c.memory === undefined
    ? []
    : [
        `memory per session: at most ${c.memory}, unless its step names its own memory: — a process past it is killed in its session's scope alone${c.cgroupParent === undefined ? '' : `, each scope in ${c.cgroupParent}`} (WF_MEMORY_LIMIT${c.cgroupParent === undefined ? '' : ', WF_CGROUP_PARENT'})`,
      ]),
  ...(c.reserved === undefined
    ? []
    : [
        `sessions admitted by memory: a session waits until what it asks — ${c.request ?? (c.memory === undefined ? "its step's memory:, where it names one" : `its limit, ${c.memory}`)} — fits the machine above the ${c.reserved} kept for the daemon and the machine (WF_MEMORY_REQUEST, WF_MEMORY_RESERVED)`,
      ]),
  ...(c.kept === undefined || c.kept === 0
    ? []
    : [
        `kept for a person's turn: ${c.kept} per pool beyond WF_MAX_CONCURRENT, so at most ${c.sessions + c.kept} at once — an answer, a retry or an upgrade a person asked for goes first and takes it${c.reserved === undefined || (c.request ?? c.memory) === undefined ? '' : `, with ${c.kept} × ${c.request ?? c.memory} of the machine's memory no other work is admitted into`} (WF_KEPT_TURNS)`,
      ]),
];

export type InFlight = { name: string; taskId: string };

/**
 * The tasks the engine is still holding for this run — steps and their checks: filed, and settled neither way. A check is stopped with a
 * run called off like any task, and a `pending` task counts, since the next tick would start it.
 * @param run The run's record.
 * @param phaseOf The phase of a task the engine holds, by its id.
 */
export function inFlight(run: Run, phaseOf: (taskId: string) => TaskPhase) {
  const live: InFlight[] = [];
  for (const [name, step] of Object.entries(run.steps)) {
    for (const [label, taskId] of [
      [name, step.taskId],
      [`${name} (check)`, step.check?.taskId],
    ] as const) {
      if (!taskId) continue;
      const phase = phaseOf(taskId);
      if (phase === 'pending' || phase === 'running') live.push({ name: label, taskId });
    }
  }
  return live;
}

/**
 * Whether the cap may leave a run out of its count without judging it again (`slot-settled.contract.ts`): its judgement as the informer
 * serves it, none where the informer judges it again, says it ended — succeeded, failed or called off — and nothing of it moves or is
 * due. Such a run is neither in flight nor held (`slotNeed`); every other run is judged as a pass judges it. Pure.
 * @param kept The run's judgement as the informer serves it, or undefined where the informer judges it again.
 */
export const slotSettled: SlotSettled = (kept) => kept !== undefined && !kept.moving && runEnded(kept.status);
