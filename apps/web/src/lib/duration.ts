/** How long something took, in words: the board's one writer of a duration, every page's. Pure. */

/** How fine a duration is said: to the second for a try, a turn or a run's clock, to the minute where a row or a wait has less room. */
type DurationGrain = 'second' | 'minute';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A duration in its two largest units. To the second: `45s`, `12m 04s`, `1h 05m`, `1d 2h`. To the minute: `under 1m`, `12m`, `1h 05m`,
 * `1d 2h`. One below zero, where this clock is behind the one that wrote the instant, is read as none.
 * @param ms The duration, in ms.
 * @param grain How fine it is said: to the second or to the minute.
 */
export function durationWords(ms: number, grain: DurationGrain) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return (grain === 'second' ? `${s}s` : 'under 1m') satisfies string as string;
  const m = Math.floor(s / 60);
  if (m < 60) return (grain === 'second' ? `${m}m ${pad(s % 60)}s` : `${m}m`) satisfies string as string;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${pad(m % 60)}m` satisfies string as string;
  return `${Math.floor(h / 24)}d ${h % 24}h` satisfies string as string;
}
