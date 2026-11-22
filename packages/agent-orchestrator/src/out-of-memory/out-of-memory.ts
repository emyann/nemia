/**
 * Whether the kernel's OOM killer ended a process of a session or a check, and whose memory ran out, its own limit's or the machine's
 * (`outOfMemory`, proved by contracts/out-of-memory.contract.ts) and the words
 * a step's note says it in (`outOfMemoryWords`), pure and importing no file of the package: the listing reads them (src/list/list.ts), and
 * which attempt's record they are read off is `killedMemoryOf`'s (src/views/views-words.ts).
 */
import { memoryBytesWord } from 'objects';
import type { OutOfMemoryKill, OutOfMemory } from '../../contracts/out-of-memory.contract.ts';

/**
 * Whether an attempt's memory record says the kernel's OOM killer ended a process of it, and whose memory ran out: its own limit's where
 * the cgroup's limit was reached (`oom` of 1 or more, or a record written before the runtime carried `oom`), with the knob that raises
 * it — the step's own `memory:` (`own`) where it names one, else the daemon's default (`WF_MEMORY_LIMIT`); else the machine's, which no
 * limit knob raises. Undefined for no record, or one in which no process was killed.
 * @param memory The attempt's memory record, or undefined where it has none.
 * @param own The step's own `memory:`, or undefined where it names none.
 */
export const outOfMemory: OutOfMemory = (memory, own) => {
  if (memory === undefined || memory.oomKills < 1) return undefined;
  const said = { kills: memory.oomKills, limitBytes: memory.limitBytes, peakBytes: memory.peakBytes ?? null };
  return memory.oom === undefined || memory.oom >= 1
    ? { by: 'limit', ...said, raise: own === undefined ? 'default' : 'step' }
    : { by: 'machine', ...said };
};

/**
 * What a session or a check the kernel's OOM killer ended a process of says beside its step's word, in the orchestrator's words, with the
 * limit, the peak where the kernel kept one, and what to do next. Killed at its own limit: raise the step's own `memory:` (`own`), else
 * give the step one or raise `WF_MEMORY_LIMIT`, the daemon's default; a check runs under the default alone, so its words name
 * `WF_MEMORY_LIMIT` only. Killed because the machine ran out: no limit knob, since raising one squeezes the machine further, but fewer
 * sessions at once (`WF_MAX_CONCURRENT`) or more memory for the machine.
 * @param k The kill, as `outOfMemory` read it: whose memory ran out, how many processes, the limit and the peak in bytes.
 * @param own The step's own `memory:`, or undefined where it names none.
 * @param of Whether a session or a check was killed, a session where none is said.
 */
export const outOfMemoryWords = (k: OutOfMemoryKill, own: string | undefined, of: 'session' | 'check' = 'session') => {
  const head = of === 'check' ? 'check out of memory' : 'out of memory';
  const processes = `${k.kills} process${k.kills === 1 ? '' : 'es'}`;
  if (k.by === 'machine') {
    const peak = k.peakBytes === null ? '' : `peak ${memoryBytesWord(k.peakBytes)}, `;
    return (
      `${head}: the machine ran out of memory and the kernel killed ${processes} of this ${of} ` +
      `(${peak}under its own limit of ${memoryBytesWord(k.limitBytes)}) — run fewer sessions at once (WF_MAX_CONCURRENT), ` +
      'or give the machine more memory'
    );
  }
  const killed = `the kernel killed ${processes} at the ${memoryBytesWord(k.limitBytes)} limit`;
  const peak = k.peakBytes === null ? '' : ` (peak ${memoryBytesWord(k.peakBytes)})`;
  const next =
    of === 'check'
      ? "raise WF_MEMORY_LIMIT, the daemon's default, which every check runs under"
      : k.raise === 'step' && own !== undefined
        ? `raise the step's memory: (${own})`
        : "give the step a memory:, or raise WF_MEMORY_LIMIT, the daemon's default";
  return `${head}: ${killed}${peak} — ${next}`;
};
