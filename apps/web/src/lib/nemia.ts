/**
 * The board's words for Nemia, the store's own agent, off what the api answers of her (`NemiaLevel`). Pure. Her session's state is judged
 * from the orchestrator's facts alone — her level, her task, whether it is filed, the lines that reach it, whether it was stopped — and
 * never from the runtime's phase, which is shown as it came.
 */
import type { FactoryLevel, Level, NemiaLevel, Spend } from './api/nemia.ts';
import type { Presence } from './presence.ts';
import { clockWord } from './quota.ts';

/**
 * Her session's state, as the board says it: off, none kept; leaving, no factory left above Manual with a session still reached, which
 * the keeper stops; waiting on the person to trust her folder, not filed until they do; not filed yet; filed and starting, not yet
 * reachable; up, reached; and stopped from outside, not filed again.
 */
export type SessionKind = 'off' | 'leaving' | 'untrusted' | 'not-filed' | 'starting' | 'up' | 'stopped';

/** What each state is said as, a sentence each. */
const SESSION_WORDS: Record<SessionKind, string> = {
  off: 'Off: no session of hers runs.',
  leaving: 'Stopping: the keeper ends her session at its next beat.',
  untrusted: 'Waiting on your trust: the keeper files her session at its next beat once her folder is trusted.',
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
function kindOf(nemia: NemiaLevel): SessionKind {
  const { task, phase, reach, stopped, trust } = nemia;
  if (stopped) return 'stopped';
  if (task === null) return 'off';
  if (!anyAbove(nemia)) return reach.length ? 'leaving' : 'off';
  if (phase === null) return trust === null ? 'not-filed' : 'untrusted';
  return reach.length ? 'up' : 'starting';
}

/** Whether she is kept: the store's level, or any factory's in force, above Manual. */
export const anyAbove = ({ level, factories }: Pick<NemiaLevel, 'level' | 'factories'>): boolean =>
  level !== 'manual' || factories.some((row) => row.level !== 'manual');

/** The stretches a person raises a factory for, as the api takes them, the first offered first. */
export const RAISE_STRETCHES = ['2h', '8h', '1d', '7d'] as const;

/** Each level as the board says it. */
const LEVEL_WORDS: Record<Level, string> = { manual: 'Manual', 'semi-auto': 'Semi-auto', auto: 'Auto' };

/** A level as the board says it. */
export const levelWord = (level: Level): string => LEVEL_WORDS[level];

/**
 * A factory's level in words at `now`, named the store's own when it is the default factory (`byDefault`): a raise with its end, said as
 * `clockWord` says a time, and the default after it; else whose default it is.
 */
export function factoryWords(row: FactoryLevel, byDefault: boolean, now: Date): string {
  const whose = byDefault ? "the store's level, for runs in no factory" : row.own === null ? "the store's" : 'its own';
  if (row.raise !== null) return `Raised until ${clockWord(new Date(row.raise.until), now)}, then ${levelWord(row.default)} (${whose}).`;
  return `${levelWord(row.default)} by default (${whose}).`;
}

/** The levels a person picks among, lowest first. */
export const LEVELS: readonly Level[] = ['manual', 'semi-auto', 'auto'];

/** The level a fresh session is asked at, from `level`, hers: that level where above Manual, else Semi-auto. */
export const freshLevel = (level: Level): Level => (level === 'manual' ? 'semi-auto' : level);

/** The levels a factory is raised to over its default `level`, lowest first: none over Auto. */
export const raisesOver = (level: Level): readonly Level[] =>
  level === 'manual' ? ['semi-auto', 'auto'] : level === 'semi-auto' ? ['auto'] : [];

/** A cost in dollars, as the package's `dollars` says it: three figures under a cent, cents above. */
const dollars = (usd: number): string => `$${usd > 0 && usd < 0.01 ? Number(usd.toPrecision(3)) : usd.toFixed(2)}`;

/** What her sessions cost, as her level's own line says it: each counted as it ends, her open one not yet. */
export const spendWords = ({ usd, measured, unmeasured }: Spend): string =>
  `Spent ${dollars(usd)} over ${measured} session${measured === 1 ? '' : 's'} ended${unmeasured ? `, ${unmeasured} not measured` : ''}; her open one counts once it ends.`;

/** How a fact she keeps is pruned: by asking her, since her session alone writes her memory. */
export const PRUNE_WORDS =
  'She keeps these facts herself, and the board only reads them. To have her forget one, or correct it, ask her to in her session.';

/**
 * The one line under her name in her chat's header, off what the api answers of her and where she is (`presence`): `Down since 6:10 PM`
 * while her session is not up, `Answering` while a turn is in progress, else `Up: her session runs`, each followed by what her sessions
 * cost where the api counted it. The cost is what her ended sessions cost, whole (`spendWords`, which the header carries as its title),
 * never a day's: nothing the board reads counts a day of hers.
 */
export function chatHeaderLine(nemia: NemiaLevel | undefined, presence: Presence, now: Date): string {
  const spent = nemia?.spend ? ` · ${dollars(nemia.spend.usd)}` : '';
  if (presence.down) {
    const since = nemia?.since === null || nemia?.since === undefined ? null : new Date(nemia.since);
    return `Down${since === null ? '' : ` since ${clockWord(since, now)}`}${spent}`;
  }
  if (presence.answering) return `Answering${spent}`;
  return `Up: her session runs${spent}`;
}

/**
 * What her chat's composer invites, by where she is: the daemon waited on while this browser keeps a message it would not take, her
 * reading it later while she is down, their own words while one question of hers waits on them,
 * drawn as the form and answered by what they write (`asking`, `askInWords`, the canvas's board 7), the
 * next one or her turn stopped while she answers, else what she is for.
 */
export function composerWords(presence: Presence, asking = false): string {
  if (presence.notSent) return 'Waiting for the daemon';
  if (presence.down) return 'Write now; she reads it when she is up';
  if (asking) return 'Or answer in your own words';
  if (presence.answering) return 'She is answering. Write the next one, or stop her';
  return 'Tell Nemia what to do, or ask';
}

/** What the composer's one button does: send what is written, or end the turn she is answering. */
export type ComposerButton = 'send' | 'stop';

/**
 * What the composer's button is, by where she is: the stop while she answers, since a turn of hers can be ended without ending her
 * session; the send otherwise, and while this browser keeps a message the api would not take, where nothing of hers can be reached at
 * all.
 */
export const composerButton = (presence: Presence): ComposerButton => (presence.answering && !presence.notSent ? 'stop' : 'send');
