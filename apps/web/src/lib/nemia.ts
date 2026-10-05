/**
 * The board's words for Nemia, the store's own agent, off what the api answers of her (`NemiaLevel`). Pure. Her session's state is judged
 * from the orchestrator's facts alone — her level, her task, whether it is filed, the lines that reach it, whether it was stopped — and
 * never from the runtime's phase, which is shown as it came.
 */
import type { Level, NemiaLevel, Spend } from './api/nemia.ts';
import { dollars } from './stats.ts';

/**
 * Her session's state, as the board says it: off, none kept; leaving, Manual asked of a session still reached, which the keeper stops;
 * not filed yet; filed and starting, not yet reachable; up, reached; and stopped from outside, not filed again.
 */
export type SessionKind = 'off' | 'leaving' | 'not-filed' | 'starting' | 'up' | 'stopped';

/** What each state is said as, a sentence each. */
const SESSION_WORDS: Record<SessionKind, string> = {
  off: 'Off: no session of hers runs.',
  leaving: "Stopping: the keeper ends her session at its next beat.",
  'not-filed': 'Not filed yet: the keeper files her session at its next beat.',
  starting: 'Filed: her session is starting.',
  up: 'Up: her session runs.',
  stopped: 'Stopped from outside, and not filed again.',
};

/** Her session's state (`SessionKind`) and its sentence. A stop from outside is said first, whatever still reaches her session. */
export function sessionOf(nemia: NemiaLevel): { kind: SessionKind; words: string } {
  const kind = kindOf(nemia);
  return { kind, words: SESSION_WORDS[kind] };
}

/** The state alone, in the order `sessionOf` judges it. */
function kindOf({ level, task, phase, reach, stopped }: NemiaLevel): SessionKind {
  if (stopped) return 'stopped';
  if (task === null) return 'off';
  if (level === 'manual') return reach.length ? 'leaving' : 'off';
  if (phase === null) return 'not-filed';
  return reach.length ? 'up' : 'starting';
}

/** The level a person's switch writes, from where she is: Manual from Semi-auto, Semi-auto from Manual. */
export const offeredLevel = ({ level }: Pick<NemiaLevel, 'level'>): Level => (level === 'semi-auto' ? 'manual' : 'semi-auto');

/** What her sessions cost, as her level's own line says it: each counted as it ends, her open one not yet. */
export const spendWords = ({ usd, measured, unmeasured }: Spend): string =>
  `Spent ${dollars(usd)} over ${measured} session${measured === 1 ? '' : 's'} ended${unmeasured ? `, ${unmeasured} not measured` : ''}; her open one counts once it ends.`;

/** How a fact she keeps is pruned: by asking her, since her session alone writes her memory. */
export const PRUNE_WORDS =
  'She keeps these facts herself, and the board only reads them. To have her forget one, or correct it, ask her to in her session.';
