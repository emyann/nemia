/**
 * Which queued tasks a pass admits, and why each other one waits (agent-runtime, src/core/admission.ts, `admitting`): the per-pool
 * ceiling (`maxConcurrent`) as today, and beside it the machine's memory, as Kubernetes' scheduler admits a Pod on a node only while
 * the requests of what runs there fit the node's allocatable memory. A task's need is its memory request, `resources.requests.memory`,
 * else its limit (Kubernetes gives a container that names a limit and no request a request equal to its limit), else nothing.
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
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * The machine as one pass read it: its total memory and the memory the kernel says is available (`MemTotal`, `MemAvailable`), and the
 * floor the engine keeps for the daemon and the machine (`reservedBytes`, kubelet's `system-reserved`), each in bytes.
 */
export type MachineMemory = { readonly totalBytes: number; readonly availableBytes: number; readonly reservedBytes: number };

/** A task holding a slot (`holdsSlot`): its pool, its need in bytes, and whether its process is there to be counted in what is available. */
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
export type Admitted = { readonly admit: readonly string[]; readonly waits: readonly { readonly id: string; readonly wait: AdmissionWait }[] };

/** The most bytes the laws speak of: a pebibyte, so that no sum of a few of them rounds. */
const MOST = 2 ** 50;

/** A whole number of bytes from nothing to `MOST`. */
const bytes = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= MOST;

/** The sum of some byte counts. */
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** What the waiters this pass admits need together. */
const admittedNeed = (pass: AdmissionPass, out: Admitted): number =>
  sum(pass.waiting.filter((w) => out.admit.includes(w.id)).map((w) => w.needBytes));

/** What the tasks holding a slot need together: what the machine has promised. */
const promised = (pass: AdmissionPass): number => sum(pass.holders.map((h) => h.needBytes));

/** What the holders with no process yet need together: what the available memory does not show yet. */
const unseen = (pass: AdmissionPass): number => sum(pass.holders.filter((h) => !h.running).map((h) => h.needBytes));

/** The room the machine has for newcomers before the pass admits any: the lesser of the two readings, each less the floor. */
const roomBefore = (pass: AdmissionPass, m: MachineMemory): number =>
  Math.min(m.totalBytes - m.reservedBytes - promised(pass), m.availableBytes - m.reservedBytes - unseen(pass));

/** The room the machine has left once the pass has admitted what it admits. */
const roomAfter = (pass: AdmissionPass, m: MachineMemory, out: Admitted): number => roomBefore(pass, m) - admittedNeed(pass, out);

/** How many tasks of `pool` hold a slot once the pass has admitted what it admits. */
const inPool = (pass: AdmissionPass, out: Admitted, pool: string): number =>
  pass.holders.filter((h) => h.pool === pool).length + pass.waiting.filter((w) => w.pool === pool && out.admit.includes(w.id)).length;

/** How many tasks of `pool` held a slot before the pass. */
const heldInPool = (pass: AdmissionPass, pool: string): number => pass.holders.filter((h) => h.pool === pool).length;

/** The wait the pass gave the waiter `id`, or undefined where it was admitted. */
const waitOf = (out: Admitted, id: string): AdmissionWait | undefined => out.waits.find((x) => x.id === id)?.wait;

/** Ids each once: a task is one waiter. */
const distinctIds = (waiting: readonly Waiter[]): boolean => waiting.every((w, i) => waiting.findIndex((x) => x.id === w.id) === i);

const admittingSpec = spec<(pass: AdmissionPass) => Admitted>({
  requires: ({ input: [pass] }) =>
    Number.isInteger(pass.ceiling) &&
    pass.ceiling >= 1 &&
    distinctIds(pass.waiting) &&
    pass.holders.every((h) => bytes(h.needBytes)) &&
    pass.waiting.every((w) => bytes(w.needBytes)) &&
    (pass.machine === null ||
      (bytes(pass.machine.totalBytes) && bytes(pass.machine.availableBytes) && bytes(pass.machine.reservedBytes))),
  ensures: {
    eachWaiterAnsweredOnce: {
      description: 'Every queued task is either admitted or told why it waits, never both, and nothing else is named',
      condition: ({ input: [pass], output }) =>
        output.admit.length + output.waits.length === pass.waiting.length &&
        pass.waiting.every((w) => output.admit.includes(w.id) !== output.waits.some((x) => x.id === w.id)),
    },
    ceilingKept: {
      description: 'A pool is never given more slots than its ceiling leaves free',
      condition: ({ input: [pass], output }) =>
        pass.waiting.every(
          (w) => inPool(pass, output, w.pool) - heldInPool(pass, w.pool) <= Math.max(0, pass.ceiling - heldInPool(pass, w.pool)),
        ),
    },
    requestsFitTheMachine: {
      description:
        'What is admitted needs no more than the machine’s total, less its floor, leaves once every task holding a slot has its request',
      condition: ({ input: [pass], output }) =>
        pass.machine === null ||
        admittedNeed(pass, output) <= Math.max(0, pass.machine.totalBytes - pass.machine.reservedBytes - promised(pass)),
    },
    availableCoversTheNewcomers: {
      description:
        'What is admitted needs no more than the memory available now, less its floor and what holders with no process yet need',
      condition: ({ input: [pass], output }) =>
        pass.machine === null ||
        admittedNeed(pass, output) <= Math.max(0, pass.machine.availableBytes - pass.machine.reservedBytes - unseen(pass)),
    },
    slotWaitMeansAFullPool: {
      description: 'A task told it waits for a slot is in a pool at its ceiling once the pass is done, and is told its pool and ceiling',
      condition: ({ input: [pass], output }) =>
        pass.waiting.every((w) => {
          const wait = waitOf(output, w.id);
          return wait?.for !== 'slot' || (wait.pool === w.pool && wait.ceiling === pass.ceiling && inPool(pass, output, w.pool) >= pass.ceiling);
        }),
    },
    memoryWaitMeansItDidNotFit: {
      description:
        'A task told it waits for memory was read on a machine, needs more than the room left once the pass is done, and is told its need and a room below it',
      condition: ({ input: [pass], output }) =>
        pass.waiting.every((w) => {
          const wait = waitOf(output, w.id);
          if (wait?.for !== 'memory') return true;
          if (pass.machine === null) return false;
          const left = roomAfter(pass, pass.machine, output);
          return (
            wait.needBytes === w.needBytes &&
            w.needBytes > left &&
            wait.roomBytes >= Math.max(0, left) &&
            wait.roomBytes < wait.needBytes &&
            Number.isInteger(wait.roomBytes)
          );
        }),
    },
    unreadMachineAdmitsByTheCeilingAlone: {
      description: 'With no reading of the machine, no task waits for memory: the ceiling alone admits, as before',
      condition: ({ input: [pass], output }) => pass.machine !== null || output.waits.every((x) => x.wait.for === 'slot'),
    },
    stopsAtTheFloorOfAvailableOverTheLimit: {
      description:
        'On a machine with N bytes available above its floor and nothing at work, tasks of one pool each needing L are admitted floor(N / L) at most, and as many as wait up to that',
      condition: ({ input: [pass], output }) => {
        const m = pass.machine;
        const first = pass.waiting[0];
        if (m === null || first === undefined || pass.holders.length > 0) return true;
        const need = first.needBytes;
        const alike = pass.waiting.every((w) => w.needBytes === need && w.pool === first.pool);
        if (!alike || need <= 0 || pass.ceiling < pass.waiting.length || m.totalBytes < m.availableBytes) return true;
        return output.admit.length === Math.min(pass.waiting.length, Math.floor(Math.max(0, m.availableBytes - m.reservedBytes) / need));
      },
    },
  },
  // Which of the two a waiter is told where both are true of it — its pool filled during the pass and the room ran out — is the order's
  // (`byTurn`): the laws hold either word to what it says, and neither is wrong.
  open: ['output.waits'],
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type Admitting = Implementation<typeof admittingSpec>;
