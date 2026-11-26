/**
 * Which queued tasks a pass admits: a ceiling on the sessions at work in each pool, the machine's memory beside it (the requests of
 * what holds a slot against its total, and what has no process yet against what is available now, each less a floor), and the order
 * waiting tasks are given a free slot — and why each other one waits.
 * Pure: the pass hands it the views it built off its one observation (`tick` in `engine/engine.ts`) and one reading of the machine,
 * and journals what it returns.
 */
import type { AdmissionPass, AdmissionWait, AdmitOne, Holder, MachineMemory, PassWait } from '../../contracts/admission.contract.ts';
import type { RunsUnder, Sizing } from '../../contracts/runs-under.contract.ts';
import type { TaskPhase } from './session.ts';
import type { TaskResources } from './domain.ts';
import { memoryBytesOf } from './memory.ts';

export type { AdmissionPass, AdmissionWait, Admitted, Holder, MachineMemory, Waiter } from '../../contracts/admission.contract.ts';
export type { RunsUnder } from '../../contracts/runs-under.contract.ts';

/**
 * The room the machine has for newcomers before a pass admits any, in bytes: the lesser of its total less the floor and what every
 * holder needs (what is promised), and what is available now less the floor and what the holders with no process yet need (what the
 * kernel does not see yet). Below nothing where the machine is already past either.
 * Exported only for the tests that import it.
 * @param m The machine's memory as the pass read it, and the floor kept off it.
 * @param holders The tasks holding a slot, each with its need and whether its process is there.
 */
export const roomOf = (m: MachineMemory, holders: readonly Holder[]) => {
  let promised = 0;
  let unseen = 0;
  for (const h of holders) {
    promised += h.needBytes;
    if (!h.running) unseen += h.needBytes;
  }
  return Math.min(m.totalBytes - m.reservedBytes - promised, m.availableBytes - m.reservedBytes - unseen);
};

/**
 * A wait for memory: the need, the room left to the waiter at least nothing, and the kept memory withheld from it where any is.
 * @param needBytes What the waiter needs.
 * @param left The room left to it, below nothing where the machine is past it.
 * @param withheld The kept memory withheld from it.
 */
const memoryWait = (needBytes: number, left: number, withheld: number) => {
  const roomBytes = left < 0 ? 0 : left;
  return withheld > 0
    ? ({ for: 'memory', needBytes, roomBytes, keptBytes: withheld } satisfies PassWait)
    : ({ for: 'memory', needBytes, roomBytes } satisfies PassWait);
};

/**
 * The kept memory left once a need is counted against it, down to nothing.
 * @param kept The kept memory still free.
 * @param need The need counted.
 */
const keptLeft = (kept: number, need: number) => (need >= kept ? 0 : kept - need);

/**
 * What a pass decides of one waiter, in turn: a turn that may take kept room takes a kept place of its pool while one is free, any
 * other a place under the ceiling, and one with neither waits for a slot; one that needs more than the room left to it — the room the
 * machine has left, less the kept memory still free where its turn may not take kept room — waits for memory, told its need, that
 * room and the kept memory withheld; any other is admitted, its need taken off the room (and off the kept memory, for a turn that may
 * take it) and its place counted. A waiter that needs nothing always fits, and with no reading of the machine only the places decide.
 * Proved by `contracts/admission.contract.ts`.
 * @param one The waiter: its pool, need and whether it may take kept room, the ceiling, its pool's count under the ceiling and kept
 * places free, the room left (null with no reading) and the kept memory free.
 * @public
 */
export const admitOne: AdmitOne = (one) => {
  const keptPlace = one.kept && one.keptSlots > 0;
  if (!keptPlace && one.inPool >= one.ceiling) return { for: 'slot', pool: one.pool, ceiling: one.ceiling };
  const room = one.roomBytes;
  const withheld = one.kept ? 0 : one.keptBytes;
  if (room !== null && one.needBytes > 0 && one.needBytes > room - withheld) return memoryWait(one.needBytes, room - withheld, withheld);
  const keptBytes = one.kept ? keptLeft(one.keptBytes, one.needBytes) : one.keptBytes;
  return {
    for: 'admitted',
    roomBytes: room === null ? null : room - one.needBytes,
    inPool: keptPlace ? one.inPool : one.inPool + 1,
    keptSlots: keptPlace ? one.keptSlots - 1 : one.keptSlots,
    keptBytes,
  };
};

/**
 * Which waiters a pass admits, in turn, and why each other waits: `admitOne` taken at each waiter, handed its pool's count under the
 * ceiling, its pool's kept places still free, the room and the kept memory the waiters before it left. The kept holders of a pool
 * fill its kept places first, so its count under the ceiling is its holders less those in a kept place; the kept holders' needs use
 * up the kept memory first. A waiter that waits never stops the ones after it, as a scheduler goes on to the next Pod: a smaller one
 * behind it may fit. The laws of the whole pass, which sum over its waiters, are held by `test/admission.test.ts`.
 * @param pass The ceiling, the room kept, the machine's memory (null where it was not read), the holders of a slot and the waiters in
 * turn.
 */
export const admitting = (pass: AdmissionPass) => {
  let room = pass.machine === null ? null : roomOf(pass.machine, pass.holders);
  const held = new Map<string, number>();
  const keptHeld = new Map<string, number>();
  let keptBytes = pass.kept.bytes;
  for (const h of pass.holders) {
    held.set(h.pool, (held.get(h.pool) ?? 0) + 1);
    if (!h.kept) continue;
    keptHeld.set(h.pool, (keptHeld.get(h.pool) ?? 0) + 1);
    keptBytes = keptLeft(keptBytes, h.needBytes);
  }
  const inPool = new Map<string, number>();
  const keptSlots = new Map<string, number>();
  for (const [pool, n] of held) {
    const inKept = Math.min(keptHeld.get(pool) ?? 0, pass.kept.slots);
    inPool.set(pool, n - inKept);
    keptSlots.set(pool, pass.kept.slots - inKept);
  }
  const admit: string[] = [];
  const waits: { id: string; wait: AdmissionWait }[] = [];
  for (const w of pass.waiting) {
    const answer = admitOne({
      ceiling: pass.ceiling,
      inPool: inPool.get(w.pool) ?? 0,
      keptSlots: keptSlots.get(w.pool) ?? pass.kept.slots,
      roomBytes: room,
      keptBytes,
      needBytes: w.needBytes,
      pool: w.pool,
      kept: w.kept,
    });
    if (answer.for !== 'admitted') {
      waits.push({ id: w.id, wait: answer });
      continue;
    }
    room = answer.roomBytes;
    keptBytes = answer.keptBytes;
    inPool.set(w.pool, answer.inPool);
    keptSlots.set(w.pool, answer.keptSlots);
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
    inputs?: readonly { priority?: number }[];
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
  /**
   * The room kept for the turns of `priority` or higher, as the engine holds it now, asked once per pass: `slots` places in each pool
   * beyond its ceiling and `bytes` of the machine's room, which no turn below `priority` is admitted into. Absent, or answering
   * `undefined`, none is kept.
   */
  kept?: () => { readonly priority: number; readonly slots: number; readonly bytes: number } | undefined;
};

/**
 * What a task's process tree runs under, and so what admission counts it at: an attempt in flight keeps what its `starting` entry
 * recorded (one an older runtime started recorded none, and runs under its filing); with none in flight, the task's own resources,
 * else the engine's defaults in force now, as a LimitRange's land on a Pod only when it is created; a task that names a memory request
 * and no memory limit takes the engine's default limit beside its request, as a LimitRange's default limit lands. Proved by
 * `contracts/runs-under.contract.ts`.
 */
export const runsUnder: RunsUnder = ({ filed, inFlight, defaults }: Sizing) => {
  if (inFlight !== null) return inFlight.resources ?? filed;
  const request = filed?.requests?.memory;
  const limit = defaults?.limits?.memory;
  if (request === undefined || filed?.limits?.memory !== undefined || limit === undefined) return filed ?? defaults;
  return { limits: { memory: limit }, requests: { memory: request } };
};

/** The attempt of a task's view still in flight, its last while it has not ended, or `null`. */
const inFlightOf = (view: AdmissionView) => {
  const last = view.state.attempts?.at(-1);
  return last === undefined || last.ended !== null ? null : { resources: last.resources };
};

/** What admission counts a task at, in bytes: what it runs under (`runsUnder`) as `rule` holds its defaults now (`needBytesOf`). */
const needOf = (view: AdmissionView, rule: AdmissionRule) =>
  needBytesOf(runsUnder({ filed: view.state.resources, inFlight: inFlightOf(view), defaults: rule.defaultsOf?.(view.state.harness) }));

/**
 * What a task needs of the machine's memory, in bytes, as admission counts it: its request (`resources.requests.memory`), else its
 * limit, which stands for its request as Kubernetes gives a container that names a limit and no request, else nothing.
 * @param resources What the task runs under, or undefined where it runs under none.
 */
const needBytesOf = (resources: TaskResources | undefined) => {
  const quantity = resources?.requests?.memory ?? resources?.limits?.memory;
  return (quantity === undefined ? undefined : memoryBytesOf(quantity)) ?? 0;
};

/**
 * The pool a harness counts against when the engine names none for it: its own name, and `default` for a task with no harness.
 * @param harness The task's harness, or undefined where it names none.
 */
export const ownPool = (harness: string | undefined) => harness ?? 'default';

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
 * @param view The task's phase and its admission mark.
 */
export const holdsSlot = (view: Pick<AdmissionView, 'phase' | 'admission'>) => view.admission === 'admitted' || HOLDS_SLOT[view.phase];

/** A filing time as a number to sort by; one that does not parse goes last. */
const filedMs = (view: AdmissionView) => {
  const ms = Date.parse(view.state.filedAt ?? '');
  return Number.isNaN(ms) ? Infinity : ms;
};

/**
 * The priority of a task's turn: its last answer's, where that answer gave one, else its filing's, else 0. A queued task held open
 * waits on its last answer's turn, and a turn is a process of its own, which carries a priority as a Pod does.
 * Exported only for the tests that import it.
 * @param view The task's filed priority and its answers.
 */
const turnPriority = (view: Pick<AdmissionView, 'state'>) => view.state.inputs?.at(-1)?.priority ?? view.state.priority ?? 0;

/** Two waiting tasks in the order a free slot goes to them: the higher turn's priority, then the earlier filing, then the lower id. */
const byTurn = (a: AdmissionView, b: AdmissionView) => {
  const pa = turnPriority(a);
  const pb = turnPriority(b);
  if (pa !== pb) return pb - pa;
  const ta = filedMs(a);
  const tb = filedMs(b);
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** No room kept: what a pass holds where the rule keeps none. */
const NONE_KEPT = { priority: Infinity, slots: 0, bytes: 0 };

/**
 * The queued tasks to admit, and why each other one waits: the tasks holding a slot (`holdsSlot`), each with its pool, its need
 * (`needOf`, the engine's defaults now for one with none of its own and no attempt in flight), whether its process is there
 * (`working`, `quiescent`) and whether its turn may take kept room (`turnPriority` at or above `rule.kept`'s), and the waiting tasks
 * in turn (`byTurn`), handed to `admitting` with the machine as `rule.machine` reads it once and the room `rule.kept` keeps. Nothing
 * running is stopped for a waiting task. No ceiling admits nothing and says no wait; a rule `unschedulable` says true of as the pass
 * asks it admits nothing and says of every queued task that it waits for that (`unschedulable`).
 * @param views Every task's view off the pass's one observation.
 * @param rule What the engine admits under: the ceiling, the pools, the machine's memory, the defaults and the room kept.
 */
export function toAdmit(views: readonly AdmissionView[], rule: AdmissionRule) {
  const { ceiling, poolOf } = rule;
  if (ceiling === undefined) return { admit: [], waits: [] };
  const queued = views.filter((w) => w.admission === 'queued');
  if (rule.unschedulable?.()) {
    const wait: AdmissionWait = { for: 'unschedulable' };
    return { admit: [], waits: queued.map((v) => ({ id: v.id, wait })) };
  }
  const kept = rule.kept?.() ?? NONE_KEPT;
  const holders = views.filter(holdsSlot).map((v) => ({
    pool: poolOf(v.state.harness),
    needBytes: needOf(v, rule),
    running: v.phase === 'working' || v.phase === 'quiescent',
    kept: turnPriority(v) >= kept.priority,
  }));
  const waiting = queued
    .sort(byTurn)
    .map((v) => ({ id: v.id, pool: poolOf(v.state.harness), needBytes: needOf(v, rule), kept: turnPriority(v) >= kept.priority }));
  return admitting({
    ceiling,
    kept: { slots: kept.slots, bytes: kept.bytes },
    machine: rule.machine?.() ?? null,
    holders,
    waiting,
  });
}
