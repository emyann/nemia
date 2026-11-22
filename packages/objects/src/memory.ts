/**
 * A number of bytes as a person reads and writes a memory quantity, in the one spelling the orchestrator's notes, `nemia stats` and the
 * board share, so a peak read off one can be typed back into a step's `memory:` or `memoryRequest:`.
 */

const KI = 1024;
const MI = KI * KI;
const GI = MI * KI;

/**
 * A number of bytes as a Kubernetes binary quantity a person can type back into `memory:`: a whole number of `Gi` as `4Gi`, one decimal at
 * or past 1Gi (`3.7Gi`), whole `Mi` below that, rounded, and whole `Ki` below 1Mi, rounded up.
 * @param n The number of bytes.
 */
export const memoryBytesWord = (n: number) => {
  if (n >= GI) return Number.isInteger(n / GI) ? `${n / GI}Gi` : `${(Math.round((n / GI) * 10) / 10).toString()}Gi`;
  if (n >= MI) return `${Math.round(n / MI)}Mi`;
  return `${Math.ceil(n / KI)}Ki`;
};
