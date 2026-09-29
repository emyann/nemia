/**
 * Which queued tasks the pass lets start: the per-pool ceiling on sessions, which the runtime does not keep. Pure.
 *
 * Every task the orchestrator files is `queued: true` (`runtime-client.ts`), and the runtime starts one only once it is admitted. The
 * tick hands this file the views the runtime's own pass built off its one observation (`TickReport.views`), and admits what `toAdmit`
 * returns (`e.admit`), which the runtime starts on its next pass. Nothing here reads the runtime: a second `e.list()` or `e.view` would be
 * a second `claude agents` call every pass (`pool.test.ts` counts them).
 *
 * The same file holds the other caps a pass keeps: runs in flight (`RunSlot`, `runAdmitted`, `heldRuns`), one run's step in a
 * repository's own checkout at a time (`heldCheckouts`), and what is still in flight when a run is called off (`inFlight`).
 */
import type { Workflow } from '../step/step.ts';
import type { Run, TaskPhase } from '../record/record.ts';
import { MOMENTUM, stepMomentum } from '../status/status.ts';
import { hasStarted, runReady } from '../wait/wait.ts';
import type { Assessment } from '../tick/assess.ts';

/**
 * The pool each harness's sessions count against. Claude Code's job and its background session are one subscription, so they share one
 * ceiling; a harness no line names is a pool of its own.
 */
export const POOLS: Readonly<Record<string, string>> = { claude: 'claude', 'claude-detached': 'claude', codex: 'codex', check: 'check' };

/** The pool a task's harness counts against; a task with no harness takes the runtime's name for it, `default`. */
export const poolOf = (harness: string | undefined): string => {
  const h = harness ?? 'default';
  return Object.hasOwn(POOLS, h) ? POOLS[h] : h;
};

/**
 * The part of the runtime's `TaskView` admission reads, written out: a pure file imports no runtime, a type included
 * (`test/boundary.test.ts`). The runtime's view fits it.
 */
export type AdmissionView = {
  id: string;
  phase: string;
  admission?: 'queued' | 'admitted';
  state: { harness?: string; filedAt?: string };
};

/**
 * Whether a task holds a slot of its pool: a session at work (`running (working)`, `working (quiescent)`), one spawned and not yet in the
 * harness's registry (`starting`), and one admitted and not yet started, which the runtime's next pass starts. A session blocked on a
 * person (`needs-human`), a task held open for an answer (`input-required`), one between attempts and one settled hold none: nobody is
 * working on them, and a slot they held would be a slot nobody used.
 */
export const holdsSlot = (view: Pick<AdmissionView, 'phase' | 'admission'>): boolean =>
  view.admission === 'admitted' || view.phase === 'starting' || view.phase === 'running (working)' || view.phase === 'working (quiescent)';

/** A run and the steps of its workflow (`stepsOf`), which the caller reads: this file reads no disk. */
export type MomentumOf = { run: Pick<Run, 'steps'>; steps: ReadonlyArray<Pick<Workflow, 'name' | 'after'>> };

/**
 * The momentum of each task a run names, by `advance.verb.ts`'s filing rules: a step's first task `stepMomentum(step)` (none, 0, for a
 * run's first steps; `MOMENTUM` for a step after another); every later try, round and check `MOMENTUM`, since none is a run's first filing.
 * An id no run names — a store edited by hand, a run removed while its task waited — is 0.
 */
export function momentumOf(entries: Iterable<MomentumOf>): (taskId: string) => number {
  const of = new Map<string, number>();
  for (const { run, steps } of entries) {
    for (const step of steps) {
      const rec = run.steps[step.name];
      if (!rec) continue;
      const ids = [...(rec.tries ?? []).map((t) => t.taskId), ...(rec.taskId ? [rec.taskId] : [])];
      ids.forEach((id, i) => of.set(id, i === 0 ? stepMomentum(step) : MOMENTUM));
      for (const check of [...(rec.tries ?? []).map((t) => t.check), rec.check]) if (check) of.set(check.taskId, MOMENTUM);
    }
  }
  return (taskId) => of.get(taskId) ?? 0;
}

/** A filing time as a number to sort by; one that does not parse goes last. */
const filedMs = (view: AdmissionView): number => {
  const ms = Date.parse(view.state.filedAt ?? '');
  return Number.isNaN(ms) ? Infinity : ms;
};

/**
 * The queued tasks to admit this pass: per pool, while the sessions holding a slot (`holdsSlot`) are under `ceiling`, the waiting tasks
 * in order — momentum first, higher first, then the earlier filing, then the lower id — each one admitted counted at once. Nothing
 * running is stopped for a waiting task, and a ceiling of 0 or less admits nothing.
 */
export function toAdmit({
  views,
  momentum,
  ceiling,
}: {
  views: readonly AdmissionView[];
  momentum: (taskId: string) => number;
  ceiling: number;
}): string[] {
  const used = new Map<string, number>();
  for (const v of views) if (holdsSlot(v)) used.set(poolOf(v.state.harness), (used.get(poolOf(v.state.harness)) ?? 0) + 1);
  const waiting = views
    .filter((v) => v.admission === 'queued')
    .map((v) => ({ v, m: momentum(v.id), t: filedMs(v) }))
    .sort((a, b) => b.m - a.m || (a.t === b.t ? 0 : a.t < b.t ? -1 : 1) || (a.v.id < b.v.id ? -1 : a.v.id > b.v.id ? 1 : 0));
  const admitted: string[] = [];
  for (const { v } of waiting) {
    const pool = poolOf(v.state.harness);
    const n = used.get(pool) ?? 0;
    if (n >= ceiling) continue;
    used.set(pool, n + 1);
    admitted.push(v.id);
  }
  return admitted;
}

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
 * The cap on runs in flight (`WF_MAX_RUNS`), and how many are in flight as a run with nothing filed is judged: every run that has started and
 * is in flight on the pass (`slotNeed`), then each run with nothing filed admitted before it, oldest first (`admissionOrder`) — serial, as the
 * engine admits its tasks, so a run admitted on a pass counts for the next one on the same pass. `cap` 0 is no cap.
 */
export type RunSlot = { inFlight: number; cap: number };

/**
 * What a run asks of the cap on a pass. Pure.
 *
 * `inFlight`: it counts against the cap — a task of it, a step's or a check's, filed and not settled (`inFlight`), or, on a run that has
 * started and nobody called off, something the pass files (a step ready, a check, try or round due) or the checkout holds back
 * (`Assessment.held`): a run between two steps is still in flight, and one whose ending waits on another run's in one directory waits on
 * no person, and would otherwise free the very slot it is queued for. A cancelled run counts while the engine is still stopping what it
 * had in flight; one that waits on a person, or has finished, does not.
 *
 * `wants`: it has nothing filed, nobody called it off, the runs it waits on have shipped (`runReady`), and a root is ready — a run slot is what
 * it waits for. A run waiting on runs (`--after`) wants none, and counts only once it is filed.
 *
 * Neither, for a run whose workflow takes no slot at all (`takesNoSlot`, `slot: none`): it is a session that watches the runs the cap holds,
 * so the cap neither counts it nor holds it.
 *
 * @param steps The run's steps, for the one workflow the cap does not hold (`takesNoSlot`). Left out, every run is counted.
 */
export function slotNeed(
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  a: Pick<Assessment, 'ready' | 'check' | 'retry' | 'round' | 'held'>,
  shipped: (runId: string) => boolean,
  steps: readonly Pick<Workflow, 'slot'>[] = [],
): { inFlight: boolean; wants: boolean } {
  if (takesNoSlot(steps)) return { inFlight: false, wants: false };
  const started = hasStarted(run);
  const due = a.ready.length + a.check.length + a.retry.length + a.round.length + a.held.length > 0;
  return {
    inFlight: inFlight(run, phaseOf).length > 0 || (started && !run.cancelledAt && due),
    wants: !started && !run.cancelledAt && a.ready.length > 0 && runReady(run, shipped),
  };
}

/**
 * Whether a run of these steps is outside the cap on runs in flight: its workflow says `slot: none`, which `validate` allows only on a
 * workflow of one step. Pure. It counts against nothing and waits for nothing — a session that watches the runs the cap holds.
 */
export const takesNoSlot = (steps: readonly Pick<Workflow, 'slot'>[]): boolean => steps.some((s) => s.slot === 'none');

/**
 * Whether the tick may file the roots of this run on this pass: fewer runs in flight than the cap, or no cap. Pure. Always, for a run that has
 * started — the cap holds only a run with nothing filed — for one judged with no slot, which is `advance` called outside a tick, and for one
 * whose workflow takes no slot at all (`takesNoSlot`).
 */
export const runAdmitted = (run: Run, slot: RunSlot | undefined, steps: readonly Pick<Workflow, 'slot'>[] = []): boolean =>
  hasStarted(run) || !slot || slotFree(slot) || takesNoSlot(steps);

/** Whether a run slot is free: fewer runs in flight than the cap, or no cap. Pure. What a queued card is started on, after every run has been advanced. */
export const slotFree = (slot: RunSlot): boolean => slot.cap <= 0 || slot.inFlight < slot.cap;

/** Runs in the order a pass admits them: oldest by `createdAt`, then by id. Pure. */
export const admissionOrder = <R extends Pick<Run, 'id' | 'createdAt'>>(runs: readonly R[]): R[] =>
  [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

/**
 * The runs the cap holds, each with the count it was held at, as a pass would judge them from the store as it stands (`slotNeed`): every run
 * in flight counted, then each that wants a slot admitted oldest first while one is free — and counted — and held once none is. Pure. What
 * `wf ls` and `wf decide` say between passes; none with no cap.
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

/** A run the cap holds, in the words the feed keeps of it (`feedWords`): the count in flight is left to `wf ls`. */
export const SLOT_WAIT = 'waiting for a run slot';

/** A run the cap holds, as `wf ls` says it on its roots: `waiting for a run slot (2 of 2 in flight)`. */
export const slotWord = (slot: RunSlot): string => `${SLOT_WAIT} (${slot.inFlight} of ${slot.cap} in flight)`;

/**
 * The daemon's two ceilings, as `wf up` says them when it starts: sessions at work per pool (`WF_MAX_CONCURRENT`; `claude` with `claude-detached`,
 * `codex` and checks each a pool, a blocked session holding no slot), and runs in flight (`WF_MAX_RUNS`) — `no cap` when none.
 */
export const ceilingLines = (c: { sessions: number; runs: number }): string[] => [
  `sessions at work per pool: at most ${c.sessions} at once — claude with claude-detached, codex, checks each a pool (WF_MAX_CONCURRENT)`,
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
