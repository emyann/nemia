/**
 * What a step's try's session peaked at in memory (`tryPeakOf`, proved by contracts/try-peak.contract.ts), read off the memory record
 * the runtime carries on each attempt of the session's task: pure and importing no file of the package. The stats' fact of a try reads
 * it (src/stats/stats.verb.ts), and so does a step's filing (src/resource/told.verb.ts).
 */
import type { TryPeak, TryPeakOf } from '../../contracts/try-peak.contract.ts';

export type { TryPeak };

/**
 * The largest peak the attempts of a try's session measured, with the limit of the attempt that measured it, the first such attempt where
 * two peaked alike; null where none carries a peak, as one run under no limit, by a former runtime or read by nothing carries none. The
 * peak starts as null by a branch no array takes (a length below zero), since the verifier reads the shape of a variable from its first
 * value: a `null` alone would leave it no peak to compare, and a cast is a claim it refuses to trust.
 * @param memories Each attempt's memory record, in the order the attempts ran, undefined for one that carries none.
 */
export const tryPeakOf: TryPeakOf = (memories) => {
  let peak = memories.length < 0 ? { peakBytes: 0, limitBytes: 0 } : null;
  for (const m of memories)
    if (m !== undefined && m.peakBytes !== undefined && (peak === null || m.peakBytes > peak.peakBytes))
      peak = { peakBytes: m.peakBytes, limitBytes: m.limitBytes };
  return peak;
};
