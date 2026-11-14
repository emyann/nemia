/**
 * Which queued tasks a pass admits: a ceiling on the sessions at work in each pool, the machine's memory beside it (the requests of
 * what holds a slot against its total, and what has no process yet against what is available now, each less a floor), and the order
 * waiting tasks are given a free slot — and why each other one waits.
 * Pure: the pass hands it the views it built off its one observation (`tick` in `engine/engine.ts`) and one reading of the machine,
 * and journals what it returns.
 */
import type {
  AdmissionPass,
  AdmissionWait,
  Admitted,
  AdmitOne,
  Holder,
  MachineMemory,
  Waiter,
} from '../../contracts/admission.contract.ts';
import type { RunsUnder, Sizing } from '../../contracts/runs-under.contract.ts';
import type { TaskPhase } from './session.ts';
import type { TaskResources } from './domain.ts';
import { memoryBytesOf } from './memory.ts';

export type {
  AdmissionPass,
  OneWaiter,
  AdmissionWait,
  Admit,
  Admitted,
  Holder,
  MachineMemory,
  Waiter,
} from '../../contracts/admission.contract.ts';
export type { RunsUnder, Sizing } from '../../contracts/runs-under.contract.ts';

/**
 * The room the machine has for newcomers before a pass admits any, in bytes: the lesser of its total less the floor and what every
 * holder needs (what is promised), and what is available now less the floor and what the holders with no process yet need (what the
 * kernel does not see yet). Below nothing where the machine is already past either.
 * Exported only for the tests that import it.
 */
export const roomOf = (m: MachineMemory, holders: readonly Holder[]): number => {
  let promised = 0;
  let unseen = 0;
  for (const h of holders) {
    promised += h.needBytes;
    if (!h.running) unseen += h.needBytes;
  }
  return Math.min(m.totalBytes - m.reservedBytes - promised, m.availableBytes - m.reservedBytes - unseen);
};

/**
 * What a pass decides of one waiter, in turn: a waiter whose pool has no free slot under the ceiling waits for a slot; one that needs
 * more than the room the machine has left waits for memory, told its need and the room; any other is admitted, its need taken off
 * the room and its slot counted. A waiter that needs nothing always fits, and with no reading of the machine only the ceiling
 * decides. Proved by `contracts/admission.contract.ts`.
 */
export const admitOne: AdmitOne = (one) => {
  if (one.inPool >= one.ceiling) return { for: 'slot', pool: one.pool, ceiling: one.ceiling };
  const room = one.roomBytes;
  if (room !== null && one.needBytes > 0 && one.needBytes > room) {
    return { for: 'memory', needBytes: one.needBytes, roomBytes: room < 0 ? 0 : room };
  }
  return { for: 'admitted', roomBytes: room === null ? null : room - one.needBytes, inPool: one.inPool + 1 };
};

/**
 * Which waiters a pass admits, in turn, and why each other waits: `admitOne` taken at each waiter, handed its pool's count and the
 * room the waiters before it left. A waiter that waits never stops the ones after it, as a scheduler goes on to the next Pod: a smaller
 * one behind it may fit. The laws of the whole pass, which sum over its waiters, are held by `test/admission.test.ts`.
 */
export const admitting = (pass: AdmissionPass): Admitted => {
  let room = pass.machine === null ? null : roomOf(pass.machine, pass.holders);
  const inPool = new Map<string, number>();
  for (const h of pass.holders) inPool.set(h.pool, (inPool.get(h.pool) ?? 0) + 1);
  const admit: string[] = [];
  const waits: { id: string; wait: AdmissionWait }[] = [];
  for (const w of pass.waiting) {
    const answer = admitOne({
      ceiling: pass.ceiling,
      inPool: inPool.get(w.pool) ?? 0,
      roomBytes: room,
      needBytes: w.needBytes,
      pool: w.pool,
    });
    if (answer.for !== 'admitted') {
      waits.push({ id: w.id, wait: answer });
      continue;
    }
    room = answer.roomBytes;
    inPool.set(w.pool, answer.inPool);
    admit.push(w.id);
  }
  return { admit, waits };
};

/**
 * The part of a task's view admission reads.
 * Exported only for the tests that import it.
 */
export type AdmissionView = {
  id: string;
  phase: TaskPhase;
  admission?: 'queued' | 'admitted';
  state: {
    harness?: string;
    filedAt?: string;
    priority?: number;
    resources?: TaskResources;
    attempts?: readonly { ended: unknown; resources?: TaskResources }[];
  };
};

/**
 * What the engine admits under: `ceiling`, the sessions at work at once in each pool; `unschedulable`, asked on every pass, true while
 * the engine admits nothing, as a node marked `unschedulable` takes no new Pod; `poolOf`, the pool a harness's sessions count
 * against; and `machine`, asked once per pass, the machine's memory and the floor kept off it (`MachineMemory`), or `undefined` where
 * it could not be read — absent, or answering nothing, the ceiling alone admits. No ceiling admits nothing: a task filed `queued`
 * then waits for `admit`.
 */
export type AdmissionRule = {
  ceiling?: number;
  unschedulable?: () => boolean;
  poolOf: (harness: string | undefined) => string;
  machine?: () => MachineMemory | undefined;
  /**
   * The engine's defaults for a task of `harness` that names no resources of its own, as it holds them now, as a LimitRange's: asked
   * at each admission and at each attempt's start (`runsUnder`), so a resize reaches every task not yet started. Absent, or answering
   * `undefined` (a remote agent's task, whose process no cgroup of ours holds), a task with none runs under none.
   */
  defaultsOf?: (harness: string | undefined) => TaskResources | undefined;
};

/**
 * What a task's process tree runs under, and so what admission counts it at: an attempt in flight keeps what its `starting` entry
 * recorded (one an older runtime started recorded none, and runs under its filing); with none in flight, the task's own resources,
 * else the engine's defaults in force now, as a LimitRange's land on a Pod only when it is created. Proved by
 * `contracts/runs-under.contract.ts`.
 */
export const runsUnder: RunsUnder = ({ filed, inFlight, defaults }: Sizing) =>
  inFlight !== null ? (inFlight.resources ?? filed) : (filed ?? defaults);

/** The attempt of a task's view still in flight, its last while it has not ended, or `null`. */
const inFlightOf = (view: AdmissionView): { resources: TaskResources | undefined } | null => {
  const last = view.state.attempts?.at(-1);
  return last === undefined || last.ended !== null ? null : { resources: last.resources };
};

/** What admission counts a task at, in bytes: what it runs under (`runsUnder`) as `rule` holds its defaults now (`needBytesOf`). */
const needOf = (view: AdmissionView, rule: AdmissionRule): number =>
  needBytesOf(runsUnder({ filed: view.state.resources, inFlight: inFlightOf(view), defaults: rule.defaultsOf?.(view.state.harness) }));

/**
 * What a task needs of the machine's memory, in bytes, as admission counts it: its request (`resources.requests.memory`), else its
 * limit, which stands for its request as Kubernetes gives a container that names a limit and no request, else nothing.
 */
export const needBytesOf = (resources: TaskResources | undefined): number => {
  const quantity = resources?.requests?.memory ?? resources?.limits?.memory;
  return (quantity === undefined ? undefined : memoryBytesOf(quantity)) ?? 0;
};

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
 * Exported only for the tests that import it.
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
 * The queued tasks to admit, and why each other one waits: the tasks holding a slot (`holdsSlot`), each with its pool, its need
 * (`needOf`, the engine's defaults now for one with none of its own and no attempt in flight) and whether its process is there
 * (`working`, `quiescent`), and the waiting tasks in turn (`byTurn`), handed to
 * `admitting` with the machine as `rule.machine` reads it once. Nothing running is stopped for a waiting task; no ceiling admits
 * nothing, and nor does a rule `unschedulable` says true of as the pass asks it, each saying no wait.
 */
export function toAdmit(views: readonly AdmissionView[], rule: AdmissionRule): Admitted {
  const { ceiling, poolOf } = rule;
  if (ceiling === undefined || rule.unschedulable?.()) return { admit: [], waits: [] };
  const holders = views.filter(holdsSlot).map((v): Holder => ({
    pool: poolOf(v.state.harness),
    needBytes: needOf(v, rule),
    running: v.phase === 'working' || v.phase === 'quiescent',
  }));
  const waiting = views
    .filter((w) => w.admission === 'queued')
    .sort(byTurn)
    .map((v): Waiter => ({ id: v.id, pool: poolOf(v.state.harness), needBytes: needOf(v, rule) }));
  return admitting({ ceiling, machine: rule.machine?.() ?? null, holders, waiting });
}
