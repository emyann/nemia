/**
 * How much work a machine takes (`sizedFor`): the sessions at once and the memory limit of each, read off its memory and CPUs when
 * `nemia service install --size auto` writes its unit (`WF_MAX_CONCURRENT`, `WF_MEMORY_LIMIT`). Each session is given its share of the
 * memory (`MIB_PER_SESSION`) and one CPU is left to the daemon and the machine; each is held under half the machine. Pure: the verb
 * reads the machine (`os.totalmem()`, `os.availableParallelism()`).
 */
import type { Machine, Sized, SizedFor } from '../../contracts/sizing.contract.ts';

export type { Machine as MachineSize, Sized };

/** The machine's memory each session is given on average, in MiB: the contract's own number, which a law reads. */
export const MIB_PER_SESSION = 2560;

/** The sessions at once and the limit of each, in MiB, on a machine of `memoryMiB` and `cpus`. */
export const sizedFor: SizedFor = (machine) => ({
  maxConcurrent: Math.max(1, Math.min(Math.floor(machine.memoryMiB / MIB_PER_SESSION), machine.cpus - 1)),
  memoryLimitMiB: Math.floor(machine.memoryMiB / 2),
});

/**
 * Why `machine` cannot be sized, or null: under 2 GiB or no CPU, or past a pebibyte or 65,536 CPUs, as the contract's `requires` rules
 * out, said as found.
 */
export const sizeRefusal = (machine: Machine): string | null =>
  Number.isInteger(machine.memoryMiB) &&
  Number.isInteger(machine.cpus) &&
  machine.memoryMiB >= 2048 &&
  machine.cpus >= 1 &&
  machine.memoryMiB <= 2 ** 30 &&
  machine.cpus <= 2 ** 16
    ? null
    : `nemia service install --size auto: this machine reads as ${machine.memoryMiB} MiB and ${machine.cpus} CPU, outside the 2 GiB and one CPU up to a pebibyte Nemia sizes: give WF_MAX_CONCURRENT and WF_MEMORY_LIMIT with --env instead.`;
