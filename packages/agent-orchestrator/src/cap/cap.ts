/**
 * The caps a pass keeps over runs: runs in flight (`RunSlot`, `runAdmitted`, `heldRuns`), one run's step in a repository's own checkout at
 * a time (`heldCheckouts`), and what is still in flight when a run is called off (`inFlight`). Pure. Sessions at work per pool are the
 * runtime's to admit, under the ceiling `engine()` hands it (`runtime-client.ts`).
 */
import type { Workflow } from '../step/step.ts';
import type { Run, TaskPhase } from '../record/record.ts';
import { hasStarted, runReady } from '../wait/wait.ts';
import type { Assessment } from '../tick/assess.ts';

/**
 * Which run's `workspace: main` step is working in a repository's own checkout while another run's waits for it (`heldCheckouts`): the run,
 * and its step.
 */
export type CheckoutHold = { run: string; step: string };

/**
 * A run's claim on a repository's own checkout on a pass (`checkoutHold` in ending.verb.ts): the `workspace: main` step that works there,
 * the repository, and either `holds` — its task is filed and the engine holds it in flight, so the step is in that checkout now — or `at`,
 * the time of the approval that would file it (`approvalOf`), which is what orders the runs waiting for it.
 */
export type MainClaim = { id: string; repo: string; step: string; holds: boolean; at?: string };

/**
 * The runs whose ending step waits for a checkout another run's step has, each with the run and step holding it. Pure.
 *
 * An ending step works in the repository's own checkout, which is one directory on the base branch: two of them at once read the same
 * `git status`, trial merge over each other, and the loser's `git merge --abort` throws away the winner's staged merge. Prose in a
 * `ship.md` is not a constraint, so the machinery holds the second: a run whose `workspace: main` task is in flight has the checkout, and
 * every other run of the same repository waiting to file one is held until it settles, and a run in it is never held. With none in it,
 * the oldest approval takes it — then by id — so which pass reads which run first decides nothing.
 *
 * Level-triggered, like the rest: the claims are read from the world on the pass that asks, including what that pass has already filed,
 * and a run held on one pass is asked again on the next.
 */
export function heldCheckouts(claims: readonly MainClaim[]): Map<string, CheckoutHold> {
  const held = new Map<string, CheckoutHold>();
  const repos = new Map<string, MainClaim[]>();
  for (const c of claims) repos.set(c.repo, [...(repos.get(c.repo) ?? []), c]);
  for (const group of repos.values()) {
    let taken = group.find((c) => c.holds);
    const waiting = group
      .filter((c) => !c.holds && c.at !== undefined)
      .sort((a, b) => a.at!.localeCompare(b.at!) || a.id.localeCompare(b.id));
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
 * `wants`: it has nothing filed, nobody called it off, the runs it waits on have landed (`runReady`), and a root is ready — a run slot is
 * what it waits for. A run waiting on runs (`--after`) wants none, and counts only once it is filed.
 *
 * Neither, for a run whose workflow takes no slot at all (`takesNoSlot`, `slot: none`): it is a session that watches the runs the cap
 * holds, so the cap neither counts it nor holds it.
 *
 * @param steps The run's steps, for the one workflow the cap does not hold (`takesNoSlot`). Left out, every run is counted.
 */
export function slotNeed(
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  a: Pick<Assessment, 'ready' | 'check' | 'retry' | 'round' | 'waitingOnCheckout' | 'waitingOnPause'>,
  landed: (runId: string) => boolean,
  steps: readonly Pick<Workflow, 'slot'>[] = [],
): { inFlight: boolean; wants: boolean } {
  if (takesNoSlot(steps)) return { inFlight: false, wants: false };
  const started = hasStarted(run);
  const due = a.ready.length + a.check.length + a.retry.length + a.round.length + a.waitingOnCheckout.length + (a.waitingOnPause?.steps.length ?? 0) > 0;
  return {
    inFlight: inFlight(run, phaseOf).length > 0 || (started && !run.cancelledAt && due),
    wants: !started && !run.cancelledAt && a.ready.length > 0 && runReady(run, landed),
  };
}

/**
 * Whether a run of these steps is outside the cap on runs in flight: its workflow says `slot: none`, which `validate` allows only on a
 * workflow of one step. Pure. It counts against nothing and waits for nothing — a session that watches the runs the cap holds.
 */
export const takesNoSlot = (steps: readonly Pick<Workflow, 'slot'>[]): boolean => steps.some((s) => s.slot === 'none');

/**
 * Whether the tick may file the roots of this run on this pass: fewer runs in flight than the cap, or no cap. Pure. Always, for a run that
 * has started — the cap holds only a run with nothing filed — for one judged with no slot, which is `advance` called outside a tick, and
 * for one whose workflow takes no slot at all (`takesNoSlot`).
 */
export const runAdmitted = (run: Run, slot: RunSlot | undefined, steps: readonly Pick<Workflow, 'slot'>[] = []): boolean =>
  hasStarted(run) || !slot || slotFree(slot) || takesNoSlot(steps);

/**
 * Whether a run slot is free: fewer runs in flight than the cap, or no cap. Pure. What a queued card is started on, after every run has
 * been advanced.
 */
export const slotFree = (slot: RunSlot): boolean => slot.cap <= 0 || slot.inFlight < slot.cap;

/** Runs in the order a pass admits them: oldest by `createdAt`, then by id. Pure. */
export const admissionOrder = <R extends Pick<Run, 'id' | 'createdAt'>>(runs: readonly R[]): R[] =>
  [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

/**
 * The runs the cap holds, each with the count it was held at, as a pass would judge them from the store as it stands (`slotNeed`): every
 * run in flight counted, then each that wants a slot admitted oldest first while one is free — and counted — and held once none is. Pure.
 * What `nemia ls` and `nemia decide` say between passes; none with no cap.
 */
export function heldRuns(
  runs: ReadonlyArray<Pick<Run, 'id' | 'createdAt'> & { inFlight: boolean; wants: boolean }>,
  cap: number,
): Map<string, RunSlot> {
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

/** A run the cap holds, as `nemia ls` says it on its roots: `waiting for a run slot (2 of 2 in flight)`. */
export const slotWord = (slot: RunSlot): string => `${SLOT_WAIT} (${slot.inFlight} of ${slot.cap} in flight)`;

/**
 * The daemon's two ceilings, as it says them when it starts: sessions at work per pool (`WF_MAX_CONCURRENT`; `claude`, `codex` and checks
 * each a pool, a blocked session holding no slot), and runs in flight (`WF_MAX_RUNS`) — `no cap` when none.
 */
export const ceilingLines = (c: { sessions: number; runs: number }): string[] => [
  `sessions at work per pool: at most ${c.sessions} at once — claude, codex, checks each a pool (WF_MAX_CONCURRENT)`,
  `runs in flight: ${c.runs > 0 ? `at most ${c.runs} at once — a run with nothing filed waits for a slot, oldest first` : 'no cap'} (WF_MAX_RUNS)`,
];

export type InFlight = { name: string; taskId: string };

/**
 * The tasks the engine is still holding for this run — steps and their checks: filed, and settled neither way. A check is stopped with a
 * run called off like any task, and a `pending` task counts, since the next tick would start it.
 */
export function inFlight(run: Run, phaseOf: (taskId: string) => TaskPhase): InFlight[] {
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
