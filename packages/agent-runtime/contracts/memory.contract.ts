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

/** The bytes one of `unit` is: a power of 1000 for a decimal unit, of 1024 for a binary one, 1 for none. */
const unitBytes = (unit: MemoryUnit): number =>
  unit === 'k'
    ? 1000
    : unit === 'M'
      ? 1_000_000
      : unit === 'G'
        ? 1_000_000_000
        : unit === 'T'
          ? 1_000_000_000_000
          : unit === 'Ki'
            ? 1024
            : unit === 'Mi'
              ? 1_048_576
              : unit === 'Gi'
                ? 1_073_741_824
                : unit === 'Ti'
                  ? 1_099_511_627_776
                  : 1;

/** The most bytes a limit may be: the largest whole number a JavaScript number holds exactly. */
const MOST = Number.MAX_SAFE_INTEGER;

const quantityBytesSpec = spec<(amount: number, unit: MemoryUnit) => number | undefined>({
  requires: ({ input: [amount] }) => Number.isFinite(amount),
  ensures: {
    refusedForNothing: {
      description: 'An amount of nothing or less is no limit, and is refused',
      condition: ({ input: [amount], output }) => (amount <= 0 ? output === undefined : true),
    },
    refusedPastWhatANumberHolds: {
      description: 'A limit of more bytes than a number holds exactly is refused, never rounded to a neighbour',
      condition: ({ input: [amount, unit], output }) => (amount * unitBytes(unit) > MOST ? output === undefined : true),
    },
    acceptedOtherwise: {
      description: 'An amount above nothing whose bytes a number holds is a limit',
      condition: ({ input: [amount, unit], output }) =>
        amount > 0 && amount * unitBytes(unit) <= MOST ? output !== undefined : true,
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
      condition: ({ input: [amount, unit], output }) =>
        Number.isInteger(amount) && amount > 0 && amount * unitBytes(unit) <= MOST ? output === amount * unitBytes(unit) : true,
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type QuantityBytes = Implementation<typeof quantityBytesSpec>;
