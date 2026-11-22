/**
 * Which queued tasks a pass admits, and why each other one waits (agent-runtime, src/core/admission.ts, `admitOne`, what
 * `admitting` decides of each waiter in turn): the per-pool ceiling (`maxConcurrent`) as today, and beside it the machine's memory, as
 * Kubernetes' scheduler admits a Pod on a node only while the requests of what runs there fit the node's allocatable memory. A task's
 * need is its memory request, `resources.requests.memory`, else its limit (Kubernetes gives a container that names a limit and no
 * request a request equal to its limit), else nothing.
 *
 * Two readings of the machine bound what is admitted, both off one reading per pass (`MachineMemory`), the floor kept for the daemon
 * and the machine (`reservedBytes`) taken off each:
 *
 * - the requests: what every task holding a slot needs, and what this pass admits, within the machine's total less the floor — what
 *   is promised, so a session at work that has not yet grown to its request is counted at it;
 * - the memory available now: what this pass admits, and what holds a slot with no process yet (admitted, or starting), within the
 *   memory the kernel says is available less the floor — what the machine has, so a process the runtime did not start is counted.
 *
 * Room is kept for the turns of a priority or higher (`KeptRoom`, the engine's `keptRoom`): places beyond each pool's ceiling and
 * memory within the room, which a waiter below that priority is never admitted into, as a ResourceQuota scoped to a PriorityClass
 * bounds what the pods of the other classes consume. Kubernetes keeps such capacity free by placeholder pods it preempts
 * (overprovisioning); the runtime stops nothing that runs, so the room is kept by admission alone, never taken back. A waiter that may
 * take kept room (`kept`) takes a kept place before a place under the ceiling, so the work below it keeps the ceiling's full count while
 * no more of them run than there are kept places; one beyond them counts under the ceiling like any other.
 *
 * Pure: the pass hands it the tasks holding a slot and the queued tasks in the order a free slot goes to them (`byTurn`), and journals
 * what it returns. Nothing is carried between passes: the next pass reads the machine again.
 *
 * The laws are `admitOne`'s, each a fact of one waiter: a law of the whole pass sums over its waiters, which the verifier proves only
 * through a loop's invariant written in the code, and the code imports nothing of the verifier. What the whole pass keeps is held by
 * `test/admission.test.ts`, on passes the test builds.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * The machine as one pass read it: its total memory and the memory the kernel says is available (MemTotal, MemAvailable), and the
 * floor the engine keeps for the daemon and the machine (`reservedBytes`, kubelet's system-reserved), each in bytes.
 */
export type MachineMemory = { readonly totalBytes: number; readonly availableBytes: number; readonly reservedBytes: number };

/**
 * The room kept for the turns of a priority or higher, as one pass holds it: the places kept in each pool beyond its ceiling
 * (`slots`) and the memory kept within the machine's room (`bytes`), each nothing where none is kept. The tasks that may take it are
 * the pass's to tell (`Holder.kept`, `Waiter.kept`).
 */
export type KeptRoom = { readonly slots: number; readonly bytes: number };

/**
 * A task holding a slot (`holdsSlot`): its pool, its need in bytes, whether its process is there to be counted in what is
 * available, and whether its turn may take kept room (`kept`), so it holds a kept place and its need is counted against the kept
 * memory first.
 */
export type Holder = { readonly pool: string; readonly needBytes: number; readonly running: boolean; readonly kept: boolean };

/** A queued task waiting for its turn: its id, its pool, its need in bytes, and whether its turn may take kept room. */
export type Waiter = { readonly id: string; readonly pool: string; readonly needBytes: number; readonly kept: boolean };

/**
 * What one pass is handed: the ceiling per pool, the room kept beyond it and within the machine's room, the machine (null where it
 * was not read), the holders, and the waiters in turn.
 */
export type AdmissionPass = {
  readonly ceiling: number;
  readonly kept: KeptRoom;
  readonly machine: MachineMemory | null;
  readonly holders: readonly Holder[];
  readonly waiting: readonly Waiter[];
};

/**
 * Why a pass did not admit a waiter it judged: its pool has no place left to it (`slot`), or its need does not fit the room left to it
 * (`memory`), with the need and that room, in bytes, at least nothing, and the kept memory withheld from it (`keptBytes`, present
 * exactly when it may not take kept room and some is kept free).
 */
export type PassWait =
  | { readonly for: 'slot'; readonly pool: string; readonly ceiling: number }
  | { readonly for: 'memory'; readonly needBytes: number; readonly roomBytes: number; readonly keptBytes?: number };

/**
 * Why a queued task was not admitted on a pass: what the pass judged of it (`PassWait`), or the engine admitting nothing at all while
 * it is `unschedulable`, as a node marked so takes no new Pod, said of every queued task and judged of none.
 */
export type AdmissionWait = PassWait | { readonly for: 'unschedulable' };

/** What a pass admits, in turn, and why each other waiter waits. */
export type Admitted = {
  readonly admit: readonly string[];
  readonly waits: readonly { readonly id: string; readonly wait: AdmissionWait }[];
};

/** The most bytes the laws speak of: a pebibyte, so that no sum of a few of them rounds. */
const MOST = 2 ** 50;

/** A whole number of bytes from nothing to `MOST`. */
const bytes = (n: number) => Number.isInteger(n) && n >= 0 && n <= MOST;

/**
 * One waiter as a pass meets it, in turn: the ceiling per pool, how many tasks of its pool hold a place under the ceiling by then
 * (`inPool`: the holders and those this pass admitted before it, less those in a kept place), the kept places of its pool still free
 * by then (`keptSlots`), the room the machine has left by then (`roomBytes`: the room before the pass less what it admitted before this
 * one, below nothing where the machine is already past it; null where the machine was not read), the kept memory still free by then
 * (`keptBytes`: the kept memory less what the kept holders and the kept waiters admitted before it need, at least nothing), its need,
 * its pool, and whether its turn may take kept room (`kept`). A pass asks this of each of its waiters in order, each one's counts and
 * room what the waiters before it left.
 */
export type OneWaiter = {
  readonly ceiling: number;
  readonly inPool: number;
  readonly keptSlots: number;
  readonly roomBytes: number | null;
  readonly keptBytes: number;
  readonly needBytes: number;
  readonly pool: string;
  readonly kept: boolean;
};

/**
 * A waiter admitted: the room left once its need is counted (null where the machine was not read), its pool's count under the
 * ceiling, the kept places of its pool still free, and the kept memory still free, each with it.
 */
export type Admit = {
  readonly for: 'admitted';
  readonly roomBytes: number | null;
  readonly inPool: number;
  readonly keptSlots: number;
  readonly keptBytes: number;
};

/** Whether the waiter may take a kept place of its pool: its turn may take kept room, and one is still free. */
const keptPlace = (one: OneWaiter) => one.kept && one.keptSlots > 0;

/** Whether its pool has a place for the waiter: one under the ceiling, or a kept one it may take. */
const hasPlace = (one: OneWaiter) => one.inPool < one.ceiling || keptPlace(one);

/** The kept memory withheld from the waiter: none for a turn that may take kept room, else what is still kept free. */
const withheld = (one: OneWaiter) => (one.kept ? 0 : one.keptBytes);

/** The room left to the waiter: the room the machine has left less the kept memory withheld from it, or null with no reading. */
const roomFor = (one: OneWaiter) => (one.roomBytes === null ? null : one.roomBytes - withheld(one));

/** Whether the room left to the waiter takes its need: a need of nothing always fits, and with no reading only the places decide. */
const fits = (one: OneWaiter) => {
  const room = roomFor(one);
  return room === null || one.needBytes === 0 || one.needBytes <= room;
};

/**
 * `admitOne`'s laws: the whole of what a pass decides of one waiter. Each law of a pass is a law of one waiter kept at every waiter in
 * turn: the ceiling is kept because a waiter is admitted under it only below it and counted at once, and a kept place goes only to a
 * turn that may take it; what is admitted fits the machine, and leaves the kept memory free of any turn that may not take it, because
 * each need fits the room left to it, and the room left falls by exactly that need; a wait says the truth of the places or the room as
 * the waiter met them.
 */
const admitOneSpec = spec<(one: OneWaiter) => Admit | PassWait>({
  requires: ({ input: [one] }) => {
    const room = one.roomBytes;
    return (
      bytes(one.ceiling) &&
      one.ceiling >= 1 &&
      bytes(one.inPool) &&
      bytes(one.keptSlots) &&
      bytes(one.keptBytes) &&
      bytes(one.needBytes) &&
      (room === null || (Number.isInteger(room) && room >= -MOST && room <= MOST))
    );
  },
  ensures: {
    ceilingKept: {
      description:
        'A waiter is admitted into a place under the ceiling only while its pool holds fewer there than the ceiling, counted there at once, and into a kept place only where its turn may take kept room and one is free, that place then taken',
      condition: ({ input: [one], output }) =>
        output.for !== 'admitted' ||
        (one.inPool < one.ceiling && output.inPool === one.inPool + 1 && output.keptSlots === one.keptSlots) ||
        (keptPlace(one) && output.inPool === one.inPool && output.keptSlots === one.keptSlots - 1),
    },
    keptPlaceFirst: {
      description:
        'A turn that may take kept room takes a kept place while one is free, and leaves the places under the ceiling to the others',
      condition: ({ input: [one], output }) =>
        output.for !== 'admitted' || !keptPlace(one) || (output.inPool === one.inPool && output.keptSlots === one.keptSlots - 1),
    },
    needFitsTheRoom: {
      description:
        'A waiter admitted on a machine read needs no more than the room left to it — the room the machine has left, less the kept memory still free where its turn may not take kept room — or nothing',
      condition: ({ input: [one], output }) => output.for !== 'admitted' || fits(one),
    },
    roomFallsByTheNeed: {
      description:
        'Admitting a waiter takes exactly its need off the room the machine has left, and no room is made up where none was read',
      condition: ({ input: [one], output }) => {
        const room = one.roomBytes;
        return output.for !== 'admitted' || (room === null ? output.roomBytes === null : output.roomBytes === room - one.needBytes);
      },
    },
    keptMemoryFallsByAKeptNeed: {
      description:
        'Admitting a turn that may take kept room takes its need off the kept memory still free, down to nothing, and admitting any other leaves it as it was',
      condition: ({ input: [one], output }) =>
        output.for !== 'admitted' ||
        output.keptBytes === (one.kept ? (one.needBytes >= one.keptBytes ? 0 : one.keptBytes - one.needBytes) : one.keptBytes),
    },
    slotWaitMeansNoPlace: {
      description:
        'A waiter waits for a slot exactly when its pool has no place for it — at the ceiling, and no kept place it may take — and is told its pool and the ceiling',
      condition: ({ input: [one], output }) =>
        (output.for === 'slot') === !hasPlace(one) &&
        (output.for !== 'slot' || (output.pool === one.pool && output.ceiling === one.ceiling)),
    },
    memoryWaitMeansItDidNotFit: {
      description:
        'A waiter waits for memory exactly when its pool has a place for it and its need is more than the room left to it on a machine read, and is told its need, that room at least nothing, and the kept memory withheld from it where any is',
      condition: ({ input: [one], output }) => {
        const room = roomFor(one);
        const held = withheld(one);
        return (
          (output.for === 'memory') === (hasPlace(one) && !fits(one)) &&
          (output.for !== 'memory' ||
            (room !== null &&
              output.needBytes === one.needBytes &&
              output.roomBytes === (room < 0 ? 0 : room) &&
              output.roomBytes < output.needBytes &&
              output.keptBytes === (held > 0 ? held : undefined)))
        );
      },
    },
    unreadMachineAdmitsByThePlacesAlone: {
      description: 'With no reading of the machine, no waiter waits for memory: one whose pool has a place for it is admitted',
      condition: ({ input: [one], output }) => one.roomBytes !== null || output.for !== 'memory',
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type AdmitOne = Implementation<typeof admitOneSpec>;
