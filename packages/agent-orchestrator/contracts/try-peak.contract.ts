/**
 * What a step's try's session peaked at in memory (agent-orchestrator, src/out-of-memory/peak.ts, `tryPeakOf`), read off the memory
 * record the runtime carries on each attempt of the session's task (`Attempt.memory`: the limit its cgroup held it to and, where the
 * kernel kept one, the cgroup's `memory.peak`), in the order the attempts ran.
 *
 * A peak is a measure, never a guess: the kernel keeps one only for a task run under a memory limit (`resources.limits.memory`, the
 * step's `memory:` or the daemon's `WF_MEMORY_LIMIT`), on a kernel from 5.19, so an attempt run under none, one a former runtime ran, and
 * one whose runner read nothing carry none. A try none of whose attempts carries one has no peak, said as null and never as 0, so that the
 * stats and the board can say "not measured" and why; a try one of whose attempts does has the largest of them, with the limit that
 * attempt ran under beside it.
 *
 * The runtime carries the record and judges nothing of it; Nemia reads it, shows it, and sets no request from it (the owner's decision:
 * the numbers are picked by a person from these measures). `TryPeak` is what the stats' fact of a try carries (`TryFact`, src/stats/stats.ts)
 * and what the step's filing says to the board (`StepFiled.memory`, src/resource/told.verb.ts); both import it from here.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { AttemptMemory } from './out-of-memory.contract.ts';

/** The largest peak a try's session measured, in bytes, and the limit in bytes of the attempt that measured it; null where none did. */
export type TryPeak = { peakBytes: number; limitBytes: number } | null;

/** Whether an attempt's record carries a peak the kernel kept. */
const measured = (m: AttemptMemory | undefined): m is AttemptMemory & { peakBytes: number } => m !== undefined && m.peakBytes !== undefined;

/** A whole number of bytes, none below zero: what the runtime reads off a cgroup's files. */
const bytes = (n: number) => Number.isInteger(n) && n >= 0;

const tryPeakSpec = spec<(memories: ReadonlyArray<AttemptMemory | undefined>) => TryPeak>({
  /**
   * What the runtime records (`cgroupMemoryOf`, agent-runtime src/harness/cgroup.ts): a limit and a peak that are whole numbers of bytes,
   * read off `memory.max` and `memory.peak`, and counts of kills that are whole numbers; undefined for an attempt that carries no record.
   */
  requires: ({ input: [memories] }) =>
    memories.every(
      (m) =>
        m === undefined ||
        (bytes(m.limitBytes) &&
          (m.peakBytes === undefined || bytes(m.peakBytes)) &&
          Number.isInteger(m.oomKills) &&
          m.oomKills >= 0 &&
          (m.oom === undefined || (Number.isInteger(m.oom) && m.oom >= 0))),
    ),
  ensures: {
    nothingMeasuredSaysNone: {
      description: 'A try none of whose attempts carries a peak — run under no limit, by a former runtime, or read by nothing — has none',
      condition: ({ input: [memories], output }) => (memories.some(measured) ? true : output === null),
    },
    aMeasureIsSaid: {
      description: 'A try one of whose attempts carries a peak has one',
      condition: ({ input: [memories], output }) => (memories.some(measured) ? output !== null : true),
    },
    noneAboveIt: {
      description: 'No attempt of the try peaked above the peak it says',
      condition: ({ input: [memories], output }) =>
        output === null || memories.every((m) => !measured(m) || m.peakBytes <= output.peakBytes),
    },
    oneAttemptMeasuredIt: {
      description: 'The peak it says, and the limit beside it, are those one attempt of the try recorded',
      condition: ({ input: [memories], output }) =>
        output === null || memories.some((m) => measured(m) && m.peakBytes === output.peakBytes && m.limitBytes === output.limitBytes),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type TryPeakOf = Implementation<typeof tryPeakSpec>;
