/**
 * Which queued tasks a pass admits: a ceiling on the sessions at work in each pool, and the order waiting tasks are given a free slot.
 * Pure: the pass hands it the views it built off its one observation (`tick` in `engine/engine.ts`) and journals what it returns.
 */
import type { TaskPhase } from './session.ts';

/** The part of a task's view admission reads. */
export type AdmissionView = {
  id: string;
  phase: TaskPhase;
  admission?: 'queued' | 'admitted';
  state: { harness?: string; filedAt?: string; priority?: number };
};

/**
 * What the engine admits under: `ceiling`, the sessions at work at once in each pool; `unschedulable`, asked on every pass, true while
 * the engine admits nothing, as a node marked `unschedulable` takes no new Pod; and `poolOf`, the pool a harness's sessions count
 * against. No ceiling admits nothing: a task filed `queued` then waits for `admit`.
 */
export type AdmissionRule = { ceiling?: number; unschedulable?: () => boolean; poolOf: (harness: string | undefined) => string };

/** The pool a harness counts against when the engine names none for it: its own name, and `default` for a task with no harness. */
export const ownPool = (harness: string | undefined): string => harness ?? 'default';

/**
 * Whether a task in each phase holds a slot of its pool: a session at work (`working`, `quiescent`) and one spawned and not yet in the
 * harness's registry (`starting`) do. A session blocked on a person (`needs-human`), a task held open for an answer
 * (`input-required`), one open between turns (`idle`), one its harness respawns (`restarting`), one whose harness says it ended
 * (`ending`), one between attempts and one settled hold none: nobody is working on them, and a slot they held would be a slot nobody
 * used.
 */
const HOLDS_SLOT: Record<TaskPhase, boolean> = {
  pending: false,
  starting: true,
  working: true,
  quiescent: true,
  'needs-human': false,
  'input-required': false,
  idle: false,
  restarting: false,
  'between-attempts': false,
  ending: false,
  succeeded: false,
  failed: false,
  stopped: false,
};

/**
 * Whether a task holds a slot of its pool: by its phase (`HOLDS_SLOT`), or admitted and not yet started, which the next pass starts.
 */
export const holdsSlot = (view: Pick<AdmissionView, 'phase' | 'admission'>): boolean =>
  view.admission === 'admitted' || HOLDS_SLOT[view.phase];

/** A filing time as a number to sort by; one that does not parse goes last. */
const filedMs = (view: AdmissionView): number => {
  const ms = Date.parse(view.state.filedAt ?? '');
  return Number.isNaN(ms) ? Infinity : ms;
};

/** Two waiting tasks in the order a free slot goes to them: the higher priority, then the earlier filing, then the lower id. */
const byTurn = (a: AdmissionView, b: AdmissionView): number => {
  const pa = a.state.priority ?? 0;
  const pb = b.state.priority ?? 0;
  if (pa !== pb) return pb - pa;
  const ta = filedMs(a);
  const tb = filedMs(b);
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/**
 * The queued tasks to admit: per pool, while the sessions holding a slot (`holdsSlot`) are under the ceiling, the waiting tasks in turn
 * (`byTurn`), each one admitted counted at once. Nothing running is stopped for a waiting task; no ceiling admits nothing, and nor does
 * a rule `unschedulable` says true of as the pass asks it.
 */
export function toAdmit(views: readonly AdmissionView[], rule: AdmissionRule): string[] {
  const { ceiling, poolOf } = rule;
  if (ceiling === undefined || rule.unschedulable?.()) return [];
  const used = new Map<string, number>();
  for (const v of views) if (holdsSlot(v)) used.set(poolOf(v.state.harness), (used.get(poolOf(v.state.harness)) ?? 0) + 1);
  const admitted: string[] = [];
  for (const v of views.filter((w) => w.admission === 'queued').sort(byTurn)) {
    const pool = poolOf(v.state.harness);
    const n = used.get(pool) ?? 0;
    if (n >= ceiling) continue;
    used.set(pool, n + 1);
    admitted.push(v.id);
  }
  return admitted;
}
