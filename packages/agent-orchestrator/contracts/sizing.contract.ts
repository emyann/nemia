/**
 * How much work a machine takes (packages/agent-orchestrator, src/service/sizing.ts, `sizedFor`): the sessions at once
 * (`WF_MAX_CONCURRENT`), the memory limit each runs under where its step names none (`WF_MEMORY_LIMIT`), the memory each asks of the
 * machine where its step names none (`WF_MEMORY_REQUEST`, the request the runtime admits it by), and the floor kept for the daemon and
 * the machine (`WF_MEMORY_RESERVED`), read off the machine's memory and CPUs when `nemia service install --size auto` writes its unit.
 * The reference machine — 16 GiB and 8 vCPU — runs 5 sessions at once, each asking 2.5 GiB and held under 8 GiB, with 2 GiB kept.
 *
 * Why each: a session with its test suite and its browser holds about 1.4 GiB on average (seven held about 10 GB of 16 on the owner's
 * laptop), so each asks 2.5 GiB of the machine; one CPU is left to the daemon and the machine; a limit is a ceiling, not a reservation,
 * so each session may take half the machine before the kernel stops it, never the whole; and the requests of every session at once fit
 * what the machine allocates — its memory less the floor — as Kubernetes' scheduler admits a Pod only while the requests of what runs on
 * a node fit its capacity (2026-11-13: six sessions under 7.6 GiB each, on 16 GB with no swap, took the machine).
 *
 * And whether the settings a daemon runs under fit its machine (`memoryFit`), which `nemia doctor` says.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The machine as `sizedFor` reads it: its memory in MiB and its CPUs, each a whole number. */
export type Machine = { readonly memoryMiB: number; readonly cpus: number };

/**
 * What the machine takes: the sessions at once, the memory limit and the request of each, and the floor kept, each in MiB.
 */
export type Sized = {
  readonly maxConcurrent: number;
  readonly memoryLimitMiB: number;
  readonly memoryRequestMiB: number;
  readonly memoryReservedMiB: number;
};

/** The machine's memory each session asks on average, in MiB. */
export const MIB_PER_SESSION = 2560;

/** The floor kept for the daemon and the machine, in MiB: an eighth of the machine, and 1 GiB at least. */
const reservedFor = (memoryMiB: number): number => Math.max(1024, Math.floor(memoryMiB / 8));

/**
 * The smallest machine Nemia sizes: 2 GiB and one CPU; the installer refuses a smaller one, naming what it found. And the largest: a
 * pebibyte and 65,536 CPUs, past any machine's, so that no count is so large that a double's arithmetic on it rounds.
 */
const sizable = (m: Machine): boolean =>
  Number.isInteger(m.memoryMiB) &&
  Number.isInteger(m.cpus) &&
  m.memoryMiB >= 2048 &&
  m.cpus >= 1 &&
  m.memoryMiB <= 2 ** 30 &&
  m.cpus <= 2 ** 16;

/** What the machine allocates to sessions, in MiB: its memory less the floor `out` keeps. */
const allocatable = (m: Machine, out: Sized): number => m.memoryMiB - out.memoryReservedMiB;

/** Whether one more session than `out` admits would fit: its request within what the machine allocates, and a CPU left over. */
const roomForMore = (m: Machine, out: Sized): boolean =>
  (out.maxConcurrent + 1) * out.memoryRequestMiB <= allocatable(m, out) && out.maxConcurrent + 1 <= m.cpus - 1;

const sizedForSpec = spec<(machine: Machine) => Sized>({
  requires: ({ input: [m] }) => sizable(m),
  ensures: {
    atLeastOne: {
      description: 'Every machine Nemia sizes runs one session at least',
      condition: ({ output }) => output.maxConcurrent >= 1,
    },
    aCpuIsLeft: {
      description: 'A machine of two CPUs or more keeps one CPU free of sessions',
      condition: ({ input: [m], output }) => m.cpus < 2 || output.maxConcurrent <= m.cpus - 1,
    },
    theFloorIsKept: {
      description: 'An eighth of the machine, and 1 GiB at least, is kept for the daemon and the machine',
      condition: ({ input: [m], output }) => output.memoryReservedMiB === reservedFor(m.memoryMiB),
    },
    requestsFitTheMachine: {
      description: 'The requests of every session at once fit what the machine allocates, its memory less the floor',
      condition: ({ input: [m], output }) => output.maxConcurrent * output.memoryRequestMiB <= allocatable(m, output),
    },
    theMachineIsUsed: {
      description: 'No more session would fit: the machine is not left idle',
      condition: ({ input: [m], output }) => !roomForMore(m, output),
    },
    aRequestIsTheShare: {
      description:
        'Each session asks its share, 2.5 GiB, where its limit and the machine allow it, and never more than its limit or 1 GiB less',
      condition: ({ input: [m], output }) =>
        output.memoryRequestMiB >= 1024 &&
        output.memoryRequestMiB <= MIB_PER_SESSION &&
        output.memoryRequestMiB <= output.memoryLimitMiB &&
        (MIB_PER_SESSION > Math.min(output.memoryLimitMiB, allocatable(m, output)) || output.memoryRequestMiB === MIB_PER_SESSION),
    },
    aLimitIsHalfTheMachine: {
      description: 'Each session is held under half the machine’s memory, and never under 1 GiB',
      condition: ({ input: [m], output }) =>
        output.memoryLimitMiB >= 1024 && output.memoryLimitMiB * 2 <= m.memoryMiB && (output.memoryLimitMiB + 1) * 2 > m.memoryMiB,
    },
    aLimitFitsTheMachine: {
      description: 'No one session may grow past what the machine allocates',
      condition: ({ input: [m], output }) => output.memoryLimitMiB <= allocatable(m, output),
    },
    theReferenceMachine: {
      description: 'The reference machine, 16 GiB and 8 vCPU, runs 5 sessions asking 2.5 GiB under 8 GiB each, 2 GiB kept',
      condition: ({ input: [m], output }) =>
        !(m.memoryMiB === 16384 && m.cpus === 8) ||
        (output.maxConcurrent === 5 &&
          output.memoryLimitMiB === 8192 &&
          output.memoryRequestMiB === 2560 &&
          output.memoryReservedMiB === 2048),
    },
  },
});

/** `sizedFor`'s type, which `src/service/sizing.ts` takes: it then imports nothing of tsverify. */
export type SizedFor = Implementation<typeof sizedForSpec>;

/**
 * The settings a daemon runs under, against its machine, as `nemia doctor` reads them, in bytes: the machine's memory, the floor kept
 * (`WF_MEMORY_RESERVED`, or its default), the sessions at once (`WF_MAX_CONCURRENT`), and the default limit and request of a session
 * (`WF_MEMORY_LIMIT`, `WF_MEMORY_REQUEST`), each null where unset.
 */
export type Configured = {
  readonly totalBytes: number;
  readonly reservedBytes: number;
  readonly maxConcurrent: number;
  readonly limitBytes: number | null;
  readonly requestBytes: number | null;
};

/**
 * Whether the settings fit the machine: they do (`fits`); no session is counted, having neither limit nor request (`uncounted`); the
 * sessions at once ask more than the machine allocates (`over`), with what each asks, how many would fit and what the machine allocates;
 * or they fit, and one session's limit is more than the machine allocates (`limitOver`).
 */
export type MemoryFit =
  | { readonly verdict: 'fits' }
  | { readonly verdict: 'uncounted' }
  | { readonly verdict: 'over'; readonly perSessionBytes: number; readonly sessionsFit: number; readonly allocatableBytes: number }
  | { readonly verdict: 'limitOver'; readonly limitBytes: number; readonly allocatableBytes: number };

/** What a session asks where its step names nothing: its request, else its limit, as Kubernetes defaults a request; null for neither. */
const perSession = (c: Configured): number | null => c.requestBytes ?? c.limitBytes;

/** A whole number of bytes above nothing, up to a pebibyte. */
const someBytes = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 2 ** 50;

const memoryFitSpec = spec<(configured: Configured) => MemoryFit>({
  requires: ({ input: [c] }) =>
    someBytes(c.totalBytes) &&
    Number.isInteger(c.reservedBytes) &&
    c.reservedBytes >= 0 &&
    c.reservedBytes <= c.totalBytes &&
    Number.isInteger(c.maxConcurrent) &&
    c.maxConcurrent >= 1 &&
    c.maxConcurrent <= 2 ** 16 &&
    (c.limitBytes === null || someBytes(c.limitBytes)) &&
    (c.requestBytes === null || someBytes(c.requestBytes)),
  ensures: {
    uncountedExactlyWithNeither: {
      description: 'With neither a default limit nor a default request, no session is counted, and doctor says so',
      condition: ({ input: [c], output }) => (output.verdict === 'uncounted') === (perSession(c) === null),
    },
    overExactlyWhenTheSessionsDoNotFit: {
      description: 'The sessions at once are over exactly when what they ask together is more than the machine allocates',
      condition: ({ input: [c], output }) => {
        const per = perSession(c);
        return (output.verdict === 'over') === (per !== null && c.maxConcurrent * per > c.totalBytes - c.reservedBytes);
      },
    },
    overSaysHowManyFit: {
      description: 'An over verdict names what each session asks, what the machine allocates, and how many sessions would fit in it',
      condition: ({ input: [c], output }) => {
        if (output.verdict !== 'over') return true;
        const per = perSession(c);
        const room = c.totalBytes - c.reservedBytes;
        return per !== null && output.perSessionBytes === per && output.allocatableBytes === room && output.sessionsFit === Math.floor(room / per);
      },
    },
    limitOverWhenOneSessionCouldTakeMore: {
      description: 'Where the sessions fit, a default limit above what the machine allocates is said, naming both',
      condition: ({ input: [c], output }) => {
        const room = c.totalBytes - c.reservedBytes;
        const per = perSession(c);
        const sessionsFit = per !== null && c.maxConcurrent * per <= room;
        const limitOver = c.limitBytes !== null && c.limitBytes > room;
        return (output.verdict === 'limitOver') === (sessionsFit && limitOver) &&
          (output.verdict !== 'limitOver' || (output.limitBytes === c.limitBytes && output.allocatableBytes === room));
      },
    },
  },
});

/** `memoryFit`'s type, which `src/service/sizing.ts` takes. */
export type MemoryFitOf = Implementation<typeof memoryFitSpec>;
