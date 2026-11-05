/**
 * A memory limit, a container's `resources.limits.memory`: a Kubernetes quantity (`8Gi`, `512Mi`, `4G`, `1073741824`) read as the
 * whole bytes a cgroup's `memory.max` and systemd's `MemoryMax=` take. Pure; proved by `contracts/memory.contract.ts`.
 */
import type { MemoryUnit, QuantityBytes } from '../../contracts/memory.contract.ts';

export type { MemoryUnit };

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

/** The most bytes a limit may be: the largest whole number a number holds exactly (`Number.MAX_SAFE_INTEGER`). */
const MOST = 9_007_199_254_740_991;

/** The most of `unit` a limit may be: the whole part of `MOST` over its bytes, so that no product past it is computed. */
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
 * The whole bytes `amount` of `unit` is, a whole amount; `undefined` for an amount not above nothing, or past what a
 * number holds exactly.
 */
export const quantityBytes: QuantityBytes = (amount, unit) => {
  if (!(amount > 0) || amount > mostOf(unit)) return undefined;
  return amount * unitBytes(unit);
};

/** A quantity as the runtime reads one: whole digits, an optional fraction, then a unit or none. */
const QUANTITY = /^(\d+)(\.\d+)?(Ki|Mi|Gi|Ti|k|M|G|T)?$/;

/** Every unit, as the pattern names them. */
const UNITS: readonly MemoryUnit[] = ['', 'k', 'M', 'G', 'T', 'Ki', 'Mi', 'Gi', 'Ti'];

/** The unit one below each: what a fraction of it is written in as a whole. */
const BELOW: Partial<Record<MemoryUnit, MemoryUnit>> = { k: '', M: 'k', G: 'M', T: 'G', Ki: '', Mi: 'Ki', Gi: 'Mi', Ti: 'Gi' };

/** The amount and unit a quantity is written as, or `undefined` where it is no quantity of this form. */
const split = (quantity: string): { amount: number; unit: MemoryUnit; fraction: boolean } | undefined => {
  const m = QUANTITY.exec(quantity);
  if (!m) return undefined;
  const unit = UNITS.find((u) => u === (m[3] ?? ''));
  if (unit === undefined) return undefined;
  return { amount: Number(`${m[1] ?? ''}${m[2] ?? ''}`), unit, fraction: m[2] !== undefined };
};

/**
 * The bytes a memory limit names, as a container's `resources.limits.memory` writes it: whole digits and a unit of `MemoryUnit`
 * (`8Gi`, `512Mi`, `4G`, `1073741824`). `undefined` for anything else: words for it are `memoryQuantityRefusal`'s.
 */
export const memoryBytesOf = (quantity: string): number | undefined => {
  const q = split(quantity);
  return q === undefined || q.fraction ? undefined : quantityBytes(q.amount, q.unit);
};

/** Why `quantity` is no memory limit the runtime reads, naming the form to write; `undefined` for one it reads. */
export const memoryQuantityRefusal = (quantity: string): string | undefined => {
  if (memoryBytesOf(quantity) !== undefined) return undefined;
  const form =
    'a whole number and one of the units Ki, Mi, Gi, Ti (powers of 1024) or k, M, G, T (powers of 1000), or none for bytes, like `8Gi` or `512Mi`';
  const shown = JSON.stringify(quantity);
  if (/^\d+(\.\d+)?[eE]/.test(quantity)) return `${shown} is written with an exponent, which a memory limit is not: write ${form}.`;
  if (/^\d+(\.\d+)?m$/.test(quantity)) return `${shown} is in thousandths of a byte, which limit nothing: write ${form}.`;
  const q = split(quantity);
  if (q?.fraction) {
    const below = BELOW[q.unit];
    const whole = below === undefined ? undefined : q.amount * (q.unit.endsWith('i') ? 1024 : 1000);
    const as = below !== undefined && whole !== undefined && Number.isInteger(whole) ? `, like \`${whole}${below}\`` : '';
    return `${shown} is a fraction: write the limit as a whole amount of a smaller unit${as}.`;
  }
  if (q !== undefined) return `${shown} is no limit, or more bytes than a number holds exactly: write ${form}, above 0.`;
  return `${shown} is no memory limit: write ${form}.`;
};
