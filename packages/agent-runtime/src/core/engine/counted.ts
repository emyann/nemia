/**
 * What a long-lived attempt in flight has consumed so far, journalled as it grows (`counted`): a session that runs for days writes
 * no cost until a process of it exits, so its counts are the record of what it has spent while it runs. Pure, and apart from
 * `domain.ts`, whose `decide` reads no usage.
 */
import type { Event, Sighting, State, Usage } from '../domain.ts';

/**
 * The counts a `counted` entry carries, read off a runner's usage: never a cost, an API or a tool time, nor whether a model went
 * unpriced, which Claude Code writes only as a process exits and an attempt's end records (`measured`).
 */
const COUNTED_KEYS = [
  'responses',
  'toolCalls',
  'inputTokens',
  'uncachedTokens',
  'cacheWriteTokens',
  'cacheReadTokens',
  'outputTokens',
  'peakContextTokens',
  'firstContextTokens',
  'firstCacheWriteTokens',
  'compactions',
] as const satisfies ReadonlyArray<keyof Usage>;

/** The counts of `usage` (`COUNTED_KEYS`), each one it has a value for. */
const countsOf = (usage: Usage): Usage => {
  const counts: Usage = {};
  for (const key of COUNTED_KEYS) if (usage[key] !== undefined) counts[key] = usage[key];
  return counts;
};

/**
 * What the engine journals of a long-lived attempt's spend off its sighting, before it decides: one `counted` entry when the
 * sighting's counts differ by value from the record's, and none when they are the same — the same reading seen on any number of
 * passes is written once — or when the reading has fewer responses than the record: a count from a later start, not the attempt's.
 * Nothing for a job, whose spend is written at its end, a settled task, an ended attempt, a session the pass did not see, or a
 * sighting that carries no usage, as a busy session's does not.
 */
export function countedFacts(state: State, sighting: Sighting | undefined, at: string): Event[] {
  const last = state.attempts.at(-1);
  if (state.restartPolicy !== 'Always' || state.settled || !last || last.ended !== null || !sighting?.usage) return [];
  const counts = countsOf(sighting.usage);
  const record = last.usage ?? {};
  if ((counts.responses ?? 0) < (record.responses ?? 0)) return [];
  if (COUNTED_KEYS.every((key) => counts[key] === record[key])) return [];
  return [{ kind: 'counted', at, attempt: last.n, usage: counts }];
}
