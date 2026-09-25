/**
 * Which queued tasks the pass lets start: the per-pool ceiling on sessions, moved up from the runtime (thin runtime stage 4c). Pure.
 *
 * Every task the orchestrator files is `queued: true` (`runtime-client.ts`), and the runtime starts one only once it is admitted. The
 * tick hands this file the views the runtime's own pass built off its one observation (`TickReport.views`), and admits what `toAdmit`
 * returns (`e.admit`), which the runtime starts on its next pass. Nothing here reads the runtime: a second `e.list()` or `e.view` would be
 * a second `claude agents` call every pass (`pool.test.ts` counts them).
 */
import { MOMENTUM, priorityOf, type Run } from './run.ts';
import type { Workflow } from './workflow.ts';

/**
 * The pool each harness's sessions count against. Claude Code's job and its background session are one subscription, so they share one
 * ceiling; a harness no line names is a pool of its own, as it was in the runtime.
 */
export const POOLS: Readonly<Record<string, string>> = { claude: 'claude', 'claude-detached': 'claude', codex: 'codex', check: 'check' };

/** The pool a task's harness counts against; a task with no harness takes the runtime's name for it, `default`. */
export const poolOf = (harness: string | undefined): string => {
  const h = harness ?? 'default';
  return Object.hasOwn(POOLS, h) ? POOLS[h]! : h;
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
 * person (`needs-human`), a task held open for an answer (`input-required`), one between attempts and one settled hold none, as in the
 * runtime: nobody is working on them, and a slot they held would be a slot nobody used.
 */
export const holdsSlot = (view: Pick<AdmissionView, 'phase' | 'admission'>): boolean =>
  view.admission === 'admitted' || view.phase === 'starting' || view.phase === 'running (working)' || view.phase === 'working (quiescent)';

/** A run and the steps of its workflow (`stepsOf`), which the caller reads: this file reads no disk. */
export type MomentumOf = { run: Pick<Run, 'steps'>; steps: ReadonlyArray<Pick<Workflow, 'name' | 'after'>> };

/**
 * The momentum of each task a run names, by `tick.ts`'s filing rules, as the runtime's `priority` once carried it: a step's first task
 * `priorityOf(step)` (none, 0, for a run's first steps; `MOMENTUM` for a step after another); every later try, round and check `MOMENTUM`,
 * since none is a run's first filing. An id no run names — a store edited by hand, a run removed while its task waited — is 0.
 */
export function momentumOf(entries: Iterable<MomentumOf>): (taskId: string) => number {
  const of = new Map<string, number>();
  for (const { run, steps } of entries) {
    for (const step of steps) {
      const rec = run.steps[step.name];
      if (!rec) continue;
      const ids = [...(rec.tries ?? []).map((t) => t.taskId), ...(rec.taskId ? [rec.taskId] : [])];
      ids.forEach((id, i) => of.set(id, i === 0 ? priorityOf(step) ?? 0 : MOMENTUM));
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
export function toAdmit({ views, momentum, ceiling }: { views: readonly AdmissionView[]; momentum: (taskId: string) => number; ceiling: number }): string[] {
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
