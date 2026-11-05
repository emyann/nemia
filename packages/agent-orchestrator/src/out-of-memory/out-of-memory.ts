/**
 * Whether a session or a check was killed at its memory limit (`outOfMemory`, proved by contracts/out-of-memory.contract.ts) and the words
 * a step's note says it in (`outOfMemoryWords`), pure and importing no file of the package: the listing reads them (src/list/list.ts), and
 * which attempt's record they are read off is `killedMemoryOf`'s (src/views/views-words.ts).
 */
import type { KilledAtLimit, OutOfMemory } from '../../contracts/out-of-memory.contract.ts';

/**
 * Whether an attempt's memory record says the kernel killed a process at its limit, and which knob raises it: the step's own `memory:`
 * (`own`) where it names one, else the daemon's default (`WF_MEMORY_LIMIT`). Undefined for no record, or one whose limit no process passed.
 */
export const outOfMemory: OutOfMemory = (memory, own) =>
  memory === undefined || memory.oomKills < 1
    ? undefined
    : {
        kills: memory.oomKills,
        limitBytes: memory.limitBytes,
        peakBytes: memory.peakBytes ?? null,
        raise: own === undefined ? 'default' : 'step',
      };

const KI = 1024;
const MI = KI * KI;
const GI = MI * KI;

/**
 * A number of bytes as a Kubernetes binary quantity a person can type back into `memory:`: a whole number of `Gi` as `4Gi`, one decimal at
 * or past 1Gi (`3.7Gi`), whole `Mi` below that, rounded, and whole `Ki` below 1Mi, rounded up.
 */
export const memoryBytesWord = (n: number): string => {
  if (n >= GI) return Number.isInteger(n / GI) ? `${n / GI}Gi` : `${(Math.round((n / GI) * 10) / 10).toString()}Gi`;
  if (n >= MI) return `${Math.round(n / MI)}Mi`;
  return `${Math.ceil(n / KI)}Ki`;
};

/**
 * What a session or a check killed at its memory limit says beside its step's word, in the orchestrator's words, with the limit, the peak
 * where the kernel kept one, and what to do next: raise the step's own `memory:` (`own`), else give the step one or raise
 * `WF_MEMORY_LIMIT`, the daemon's default. A check runs under the default alone, so its words name `WF_MEMORY_LIMIT` only.
 */
export const outOfMemoryWords = (k: KilledAtLimit, own: string | undefined, of: 'session' | 'check' = 'session'): string => {
  const killed = `the kernel killed ${k.kills} process${k.kills === 1 ? '' : 'es'} at the ${memoryBytesWord(k.limitBytes)} limit`;
  const peak = k.peakBytes === null ? '' : ` (peak ${memoryBytesWord(k.peakBytes)})`;
  const next =
    of === 'check'
      ? "raise WF_MEMORY_LIMIT, the daemon's default, which every check runs under"
      : k.raise === 'step' && own !== undefined
        ? `raise the step's memory: (${own})`
        : "give the step a memory:, or raise WF_MEMORY_LIMIT, the daemon's default";
  return `${of === 'check' ? 'check out of memory' : 'out of memory'}: ${killed}${peak} — ${next}`;
};
