/**
 * How much work a machine takes (`sizedFor`): the sessions at once, the memory limit and the request of each, and the floor kept for the
 * daemon and the machine, read off its memory and CPUs when `nemia service install --size auto` writes its unit (`WF_MAX_CONCURRENT`,
 * `WF_MEMORY_LIMIT`, `WF_MEMORY_REQUEST`; the floor, `WF_MEMORY_RESERVED`, is its default and not written). Each session asks its share
 * of the memory (`MIB_PER_SESSION`), the requests of all of them fit the machine less the floor (`reservedFor`), one CPU is left to the
 * daemon and the machine, and each is held under half the machine. And whether the settings a daemon runs under fit its machine
 * (`memoryFit`), and whether the slice its sessions run under holds them to what the machine allocates (`ceilingFit`), each of which
 * `nemia doctor` says. Pure: the verbs read the machine (`os.totalmem()`, `os.availableParallelism()`).
 */
import type {
  CeilingFit,
  CeilingFitOf,
  Configured,
  Machine,
  MemoryFit,
  MemoryFitOf,
  Sized,
  SizedFor,
  SliceCeiling,
} from '../../contracts/sizing.contract.ts';

export type { CeilingFit, Configured, Machine as MachineSize, MemoryFit, Sized, SliceCeiling };

/** The machine's memory each session asks on average, in MiB: the contract's own number, which a law reads. */
export const MIB_PER_SESSION = 2560;

/** The floor kept for the daemon and the machine on a machine of `memoryMiB`, in MiB: an eighth of it, and 1 GiB at least. */
export const reservedFor = (memoryMiB: number): number => Math.max(1024, Math.floor(memoryMiB / 8));

/** The sessions at once, the limit and the request of each and the floor kept, in MiB, on a machine of `memoryMiB` and `cpus`. */
export const sizedFor: SizedFor = (machine) => {
  const memoryLimitMiB = Math.floor(machine.memoryMiB / 2);
  const memoryReservedMiB = reservedFor(machine.memoryMiB);
  const allocatable = machine.memoryMiB - memoryReservedMiB;
  const memoryRequestMiB = Math.min(MIB_PER_SESSION, memoryLimitMiB, allocatable);
  return {
    maxConcurrent: Math.max(1, Math.min(Math.floor(allocatable / memoryRequestMiB), machine.cpus - 1)),
    memoryLimitMiB,
    memoryRequestMiB,
    memoryReservedMiB,
  };
};

/**
 * Whether `configured` fits its machine: each session counted at its request, else its limit, as Kubernetes defaults a request, and
 * none where it has neither (`uncounted`); the sessions at once over what the machine allocates (its memory less the floor), with how
 * many would fit — fewer than are set; or, where they fit, one session's limit over it. `asked * 1` is `asked`: tsverify divides no
 * value read off `number | null`, even narrowed, and reads the product as a number.
 */
export const memoryFit: MemoryFitOf = (configured) => {
  const asked = configured.requestBytes ?? configured.limitBytes;
  if (asked === null) return { verdict: 'uncounted' };
  const per = asked * 1;
  const room = configured.totalBytes - configured.reservedBytes;
  if (per > Math.floor(room / configured.maxConcurrent))
    return { verdict: 'over', perSessionBytes: per, sessionsFit: Math.floor(room / per), allocatableBytes: room };
  if (configured.limitBytes !== null && configured.limitBytes > room)
    return { verdict: 'limitOver', limitBytes: configured.limitBytes, allocatableBytes: room };
  return { verdict: 'fits' };
};

/**
 * Whether the sessions' slice holds them to what the machine allocates: no ceiling (`infinity`, read as null) is `none`; a ceiling more
 * than the machine allocates (its memory less the floor) is `over`, naming both; any other is `held`, naming the ceiling. `ceiling * 1`
 * is `ceiling`, read as a number, as `memoryFit` reads `asked`.
 */
export const ceilingFit: CeilingFitOf = (slice) => {
  const ceiling = slice.ceilingBytes;
  if (ceiling === null) return { verdict: 'none' };
  const bytes = ceiling * 1;
  if (bytes > slice.allocatableBytes) return { verdict: 'over', ceilingBytes: bytes, allocatableBytes: slice.allocatableBytes };
  return { verdict: 'held', ceilingBytes: bytes };
};

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
