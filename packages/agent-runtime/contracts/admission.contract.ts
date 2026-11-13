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
 * A task holding a slot (`holdsSlot`): its pool, its need in bytes, and whether its process is there to be counted in what is
 * available.
 */
export type Holder = { readonly pool: string; readonly needBytes: number; readonly running: boolean };

/** A queued task waiting for its turn: its id, its pool, and its need in bytes. */
export type Waiter = { readonly id: string; readonly pool: string; readonly needBytes: number };

/** What one pass is handed: the ceiling per pool, the machine (null where it was not read), the holders, and the waiters in turn. */
export type AdmissionPass = {
  readonly ceiling: number;
  readonly machine: MachineMemory | null;
  readonly holders: readonly Holder[];
  readonly waiting: readonly Waiter[];
};

/**
 * Why a queued task was not admitted on a pass: its pool is at the ceiling (`slot`), or its need does not fit the room the machine has
 * left (`memory`), with the need and that room, in bytes, at least nothing.
 */
export type AdmissionWait =
  | { readonly for: 'slot'; readonly pool: string; readonly ceiling: number }
  | { readonly for: 'memory'; readonly needBytes: number; readonly roomBytes: number };

/** What a pass admits, in turn, and why each other waiter waits. */
export type Admitted = {
  readonly admit: readonly string[];
  readonly waits: readonly { readonly id: string; readonly wait: AdmissionWait }[];
};

/** The most bytes the laws speak of: a pebibyte, so that no sum of a few of them rounds. */
const MOST = 2 ** 50;

/** A whole number of bytes from nothing to `MOST`. */
const bytes = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= MOST;

/**
 * One waiter as a pass meets it, in turn: the ceiling per pool, how many tasks of its pool hold a slot by then (`inPool`: the holders
 * and those this pass admitted before it), the room the machine has left by then (`roomBytes`: the room before the pass less what it
 * admitted before this one, below nothing where the machine is already past it; null where the machine was not read), its need and
 * its pool. A pass asks this of each of its waiters in order, each one's `inPool` and room what the waiters before it left.
 */
export type OneWaiter = {
  readonly ceiling: number;
  readonly inPool: number;
  readonly roomBytes: number | null;
  readonly needBytes: number;
  readonly pool: string;
};

/** A waiter admitted: the room left once its need is counted (null where the machine was not read), and its pool's count with it. */
export type Admit = { readonly for: 'admitted'; readonly roomBytes: number | null; readonly inPool: number };

/** Whether the room the machine has left takes a need: a need of nothing always fits, and with no reading only the ceiling decides. */
const fits = (one: OneWaiter): boolean => {
  const room = one.roomBytes;
  return room === null || one.needBytes === 0 || one.needBytes <= room;
};

/**
 * `admitOne`'s laws: the whole of what a pass decides of one waiter. Each law of a pass is a law of one waiter kept at every waiter in
 * turn: the ceiling is kept because a waiter is admitted only below it and counted at once; what is admitted fits the machine because
 * each need fits the room left, and the room left falls by exactly that need; a wait says the truth of the pool or the room as the
 * waiter met them. The laws each kept over the waiters of a pass, and the sums they make, are held by `test/admission.test.ts`.
 */
const admitOneSpec = spec<(one: OneWaiter) => Admit | AdmissionWait>({
  requires: ({ input: [one] }) => {
    const room = one.roomBytes;
    return (
      bytes(one.ceiling) &&
      one.ceiling >= 1 &&
      bytes(one.inPool) &&
      bytes(one.needBytes) &&
      (room === null || (Number.isInteger(room) && room >= -MOST && room <= MOST))
    );
  },
  ensures: {
    ceilingKept: {
      description: 'A waiter is admitted only while its pool holds fewer tasks than the ceiling, and is counted in its pool at once',
      condition: ({ input: [one], output }) => output.for !== 'admitted' || (one.inPool < one.ceiling && output.inPool === one.inPool + 1),
    },
    needFitsTheRoom: {
      description: 'A waiter admitted on a machine read needs no more than the room the machine has left, or nothing',
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
    slotWaitMeansAFullPool: {
      description: 'A waiter waits for a slot exactly when its pool is at the ceiling, and is told its pool and the ceiling',
      condition: ({ input: [one], output }) =>
        (output.for === 'slot') === one.inPool >= one.ceiling &&
        (output.for !== 'slot' || (output.pool === one.pool && output.ceiling === one.ceiling)),
    },
    memoryWaitMeansItDidNotFit: {
      description:
        'A waiter waits for memory exactly when its pool has a slot and its need is more than the room left on a machine read, and is told its need and that room, at least nothing',
      condition: ({ input: [one], output }) => {
        const room = one.roomBytes;
        return (
          (output.for === 'memory') === (one.inPool < one.ceiling && !fits(one)) &&
          (output.for !== 'memory' ||
            (room !== null &&
              output.needBytes === one.needBytes &&
              output.roomBytes === (room < 0 ? 0 : room) &&
              output.roomBytes < output.needBytes))
        );
      },
    },
    unreadMachineAdmitsByTheCeilingAlone: {
      description: 'With no reading of the machine, no waiter waits for memory: one whose pool has a slot is admitted',
      condition: ({ input: [one], output }) => one.roomBytes !== null || output.for !== 'memory',
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type AdmitOne = Implementation<typeof admitOneSpec>;
