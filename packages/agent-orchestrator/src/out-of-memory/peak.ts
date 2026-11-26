/**
 * What a step's try's session peaked at in memory (`tryPeakOf`, proved by contracts/try-peak.contract.ts), read off the memory record
 * the runtime carries on each attempt of the session's task: pure and importing no file of the package. The stats' fact of a try reads
 * it (src/stats/stats.verb.ts), and so does a step's filing (src/resource/told.verb.ts).
 */
import { memoryBytesOf } from 'agent-runtime/vocabulary';
import type { AttemptMemory } from '../../contracts/out-of-memory.contract.ts';
import type { TryPeak, TryPeakOf } from '../../contracts/try-peak.contract.ts';

/** What an attempt ran under, a container's `resources`, as the engine records it on the attempt: its limit and its request. */
export type AttemptResources = { limits?: { memory?: string }; requests?: { memory?: string } };

/**
 * What a try's session peaked at (`TryPeak`), and what admission counted it at (`askedBytes`): its last attempt's request, else its limit,
 * as the runtime counts a task that names no request, in bytes; null where that attempt ran under neither, or its record does not say.
 */
export type TryMemory = { peak: TryPeak; askedBytes: number | null };

/**
 * The largest peak the attempts of a try's session measured, with the limit of the attempt that measured it, the first such attempt where
 * two peaked alike; null where none carries a peak, as one run under no limit, by a former runtime or read by nothing carries none. The
 * peak starts as null by a branch no array takes (a length below zero), since the verifier reads the shape of a variable from its first
 * value: a `null` alone would leave it no peak to compare, and a cast is a claim it refuses to trust.
 * @param memories Each attempt's memory record, in the order the attempts ran, undefined for one that carries none.
 * @public
 */
export const tryPeakOf: TryPeakOf = (memories) => {
  let peak = memories.length < 0 ? { peakBytes: 0, limitBytes: 0 } : null;
  for (const m of memories)
    if (m !== undefined && m.peakBytes !== undefined && (peak === null || m.peakBytes > peak.peakBytes))
      peak = { peakBytes: m.peakBytes, limitBytes: m.limitBytes };
  return peak;
};

/**
 * What admission counted an attempt at, in bytes: its request, else its limit, as the runtime counts a task that names no request
 * (`needBytesOf`); null where it ran under neither, or a quantity the runtime does not read.
 * @param resources What the attempt ran under, as the engine recorded it, undefined where it recorded none.
 */
export const askedBytesOf = (resources: AttemptResources | undefined) => {
  const quantity = resources?.requests?.memory ?? resources?.limits?.memory;
  return quantity === undefined ? null : (memoryBytesOf(quantity) ?? null);
};

/**
 * A try's session's memory (`TryMemory`): the largest peak its attempts measured (`tryPeakOf`), and what admission counted its last attempt
 * at (`askedBytesOf`).
 * @param attempts The attempts of the session's task, in the order they ran, each with its memory record and what it ran under.
 */
export const tryMemoryOf = (attempts: ReadonlyArray<{ memory?: AttemptMemory; resources?: AttemptResources }>) =>
  ({ peak: tryPeakOf(attempts.map((a) => a.memory)), askedBytes: askedBytesOf(attempts.at(-1)?.resources) }) satisfies TryMemory;
