/**
 * A memory limit's bytes (agent-runtime, src/core/memory.ts, `quantityBytes`): the amount and the unit of a Kubernetes quantity as a
 * container's `resources.limits.memory` writes it (`8Gi`, `512Mi`, `4G`, `1073741824`), already split by the string's reader
 * (`memoryBytesOf`), turned into the whole bytes a cgroup's `memory.max` and systemd's `MemoryMax=` take. Refused (`undefined`) for
 * an amount that is not above nothing and for one past what a number holds exactly. The laws speak of bytes, never of how the
 * product is computed.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * The units a memory limit is written in: none (bytes), the decimal ones (`k` 1000, `M`, `G`, `T`) and the binary ones (`Ki` 1024,
 * `Mi`, `Gi`, `Ti`), as Kubernetes' quantity names them. Its `m` (a thousandth) and its exponent form (`129e6`) are no unit here: a
 * thousandth of a byte limits nothing, and the reader refuses an exponent naming the form to write instead.
 */
export type MemoryUnit = '' | 'k' | 'M' | 'G' | 'T' | 'Ki' | 'Mi' | 'Gi' | 'Ti';

/** The bytes one of each unit is: a power of 1000 for a decimal unit, of 1024 for a binary one, 1 for none. */
const UNIT_BYTES: Readonly<Record<MemoryUnit, number>> = {
  '': 1,
  k: 1000,
  M: 1_000_000,
  G: 1_000_000_000,
  T: 1_000_000_000_000,
  Ki: 1024,
  Mi: 1_048_576,
  Gi: 1_073_741_824,
  Ti: 1_099_511_627_776,
};

/** The bytes one of `unit` is. */
const unitBytes = (unit: MemoryUnit): number => UNIT_BYTES[unit];

/** The most bytes a limit may be: the largest whole number a JavaScript number holds exactly. */
const MOST = 9_007_199_254_740_991;

/**
 * The most of `unit` a limit may be: the largest whole amount of it whose bytes `MOST` holds, `MOST` over the unit's bytes rounded
 * down, written out so that no law multiplies past what a number holds (a law binds only where its arithmetic is exact).
 */
const MOST_OF: Readonly<Record<MemoryUnit, number>> = {
  '': MOST,
  k: 9_007_199_254_740,
  M: 9_007_199_254,
  G: 9_007_199,
  T: 9_007,
  Ki: 8_796_093_022_207,
  Mi: 8_589_934_591,
  Gi: 8_388_607,
  Ti: 8_191,
};
const mostOf = (unit: MemoryUnit): number => MOST_OF[unit];

/**
 * A whole amount is what is asked for: a fraction (`1.5Gi`) is refused by the reader, naming the same limit as a whole of the next
 * unit (`1536Mi`), as Kubernetes writes it back; over a fraction the product of a double rounds, and no law of it could be proved.
 */
const quantityBytesSpec = spec<(amount: number, unit: MemoryUnit) => number | undefined>({
  requires: ({ input: [amount] }) => Number.isInteger(amount),
  ensures: {
    refusedForNothing: {
      description: 'An amount of nothing or less is no limit, and is refused',
      condition: ({ input: [amount], output }) => (amount <= 0 ? output === undefined : true),
    },
    refusedPastWhatANumberHolds: {
      description: 'A limit of more bytes than a number holds exactly is refused, never rounded to a neighbour',
      condition: ({ input: [amount, unit], output }) => (amount > mostOf(unit) ? output === undefined : true),
    },
    acceptedOtherwise: {
      description: 'An amount above nothing whose bytes a number holds is a limit',
      condition: ({ input: [amount, unit], output }) => (amount > 0 && amount <= mostOf(unit) ? output !== undefined : true),
    },
    wholeBytes: {
      description: 'A limit is a whole number of bytes, at least one, that a number holds exactly',
      condition: ({ output }) => output === undefined || (Number.isInteger(output) && output >= 1 && output <= MOST),
    },
    neverBelowWhatWasWritten: {
      description: 'A limit is never below what was written: a fraction of a byte is rounded up',
      condition: ({ input: [amount, unit], output }) => output === undefined || output >= amount * unitBytes(unit),
    },
    lessThanAByteMore: {
      description: 'A limit is less than one byte above what was written',
      condition: ({ input: [amount, unit], output }) => output === undefined || output < amount * unitBytes(unit) + 1,
    },
    wholeAmountsExact: {
      description: 'A whole amount is exactly that many of its unit: 8Gi is 8 times 1024 cubed bytes',
      condition: ({ input: [amount, unit], output }) => (amount > 0 && amount <= mostOf(unit) ? output === amount * unitBytes(unit) : true),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type QuantityBytes = Implementation<typeof quantityBytesSpec>;
