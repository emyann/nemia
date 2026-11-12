/**
 * How much work a machine takes (packages/agent-orchestrator, src/service/sizing.ts, `sizedFor`): the sessions at once
 * (`WF_MAX_CONCURRENT`) and the memory limit each runs under where its step names none (`WF_MEMORY_LIMIT`), read off the machine's
 * memory and CPUs when `nemia service install` writes its unit (the distribution intent's R2-2). The reference machine — 16 GiB and
 * 8 vCPU — runs 6 sessions at once, each held under 8 GiB (Q2: 5 to 7 sessions, an implement step capped at 8 GiB).
 *
 * Why each: a session with its test suite and its browser holds about 1.4 GiB on average (seven held about 10 GB of 16 on the owner's
 * laptop), so each is given 2.5 GiB of the machine's memory on average; one CPU is left to the daemon and the machine; and a limit is
 * a ceiling, not a reservation, so each session may take half the machine before the kernel stops it, never the whole.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The machine as `sizedFor` reads it: its memory in MiB and its CPUs, each a whole number. */
export type Machine = { readonly memoryMiB: number; readonly cpus: number };

/** What the machine takes: the sessions at once, and the memory limit of each in MiB. */
export type Sized = { readonly maxConcurrent: number; readonly memoryLimitMiB: number };

/** The machine's memory each session is given on average, in MiB. */
export const MIB_PER_SESSION = 2560;

/** The smallest machine Nemia sizes: 2 GiB and one CPU; the installer refuses a smaller one, naming what it found. */
const sizable = (m: Machine): boolean => Number.isInteger(m.memoryMiB) && Number.isInteger(m.cpus) && m.memoryMiB >= 2048 && m.cpus >= 1;

/** Whether one more session than `n` would fit: its share of the memory, and a CPU left over. */
const roomForMore = (m: Machine, n: number): boolean => (n + 1) * MIB_PER_SESSION <= m.memoryMiB && n + 1 <= m.cpus - 1;

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
    eachHasItsShare: {
      description: 'More than one session runs only where each has its share of the memory',
      condition: ({ input: [m], output }) => output.maxConcurrent === 1 || output.maxConcurrent * MIB_PER_SESSION <= m.memoryMiB,
    },
    theMachineIsUsed: {
      description: 'No more session would fit: the machine is not left idle',
      condition: ({ input: [m], output }) => !roomForMore(m, output.maxConcurrent),
    },
    aLimitIsHalfTheMachine: {
      description: 'Each session is held under half the machine’s memory, and never under 1 GiB',
      condition: ({ input: [m], output }) =>
        output.memoryLimitMiB >= 1024 && output.memoryLimitMiB * 2 <= m.memoryMiB && (output.memoryLimitMiB + 1) * 2 > m.memoryMiB,
    },
    theReferenceMachine: {
      description: 'The reference machine, 16 GiB and 8 vCPU, runs 6 sessions under 8 GiB each',
      condition: ({ input: [m], output }) =>
        !(m.memoryMiB === 16384 && m.cpus === 8) || (output.maxConcurrent === 6 && output.memoryLimitMiB === 8192),
    },
  },
});

/** `sizedFor`'s type, which `src/service/sizing.ts` takes: it then imports nothing of tsverify. */
export type SizedFor = Implementation<typeof sizedForSpec>;
