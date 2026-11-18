/**
 * The board's words for Nemia, the store's own agent, off what the api answers of her (`NemiaLevel`). Pure. Her session's state is judged
 * from the orchestrator's facts alone — her level, her task, whether it is filed, the lines that reach it, whether it was stopped — and
 * never from the runtime's phase, which is shown as it came.
 */
import type { Level } from 'objects';
import type { FactoryLevel, NemiaLevel, Spend } from './api/nemia.ts';
import { dollars } from './money.ts';
import type { Presence } from './presence.ts';
import { clockWord } from './quota.ts';

/**
 * Her session's state, as the board says it: stopped from outside, filed again on the person's next word; not filed since the keeper
 * could not trust her folder; resting, no session of hers open, which a message in her chat starts; filed and starting, not yet
 * reachable; and up, reached.
 */
type SessionKind = 'stopped' | 'untrusted' | 'resting' | 'starting' | 'up';

/** What each state is said as, a sentence each. */
const SESSION_WORDS: Record<SessionKind, string> = {
  stopped: 'Stopped from outside: your next message or level set starts her again.',
  untrusted: 'Not filed: the keeper could not trust her folder.',
  resting: 'Resting: a message in her chat starts her session.',
  starting: 'Filed: her session is starting.',
  up: 'Up: her session runs.',
};

/**
 * Her session's state (`SessionKind`) and its sentence. A stop from outside is said first, whatever still reaches her session.
 * @param nemia What the api answers of her: the lines that reach her session, whether it was stopped, whether she rests, why her folder
 * could not be trusted.
 */
export function sessionOf(nemia: NemiaLevel): { kind: SessionKind; words: string } {
  const kind = kindOf(nemia);
  return { kind, words: SESSION_WORDS[kind] };
}

/** The state alone, in the order `sessionOf` judges it. */
function kindOf(nemia: NemiaLevel): SessionKind {
  if (nemia.stopped) return 'stopped';
  if (nemia.reach.length) return 'up';
  if (nemia.untrusted !== null) return 'untrusted';
  return nemia.rests && !anyAbove(nemia) ? 'resting' : 'starting';
}

/** Whether she is kept: the store's level, or any factory's in force, above Manual. */
export const anyAbove = ({ level, factories }: Pick<NemiaLevel, 'level' | 'factories'>): boolean =>
  level !== 'manual' || factories.some((row) => row.level !== 'manual');

/** The stretches a person raises a factory for, as the api takes them, the first offered first. */
export const RAISE_STRETCHES = ['2h', '8h', '1d', '7d'] as const;

/** Each level as the board says it. */
const LEVEL_WORDS: Record<Level, string> = { manual: 'Manual', 'semi-auto': 'Semi-auto', auto: 'Auto' };

/**
 * A level as the board says it.
 * @param level The level to say.
 */
export const levelWord = (level: Level): string => LEVEL_WORDS[level];

/**
 * A factory's level in words at `now`, named the store's own when it is the default factory (`byDefault`): a raise with its end, said as
 * `clockWord` says a time, and the default after it; else whose default it is.
 * @param row The factory's row: its own level, its default and its raise, if any.
 * @param byDefault Whether the factory is the default one, whose level is the store's.
 * @param now The instant it is now, against which the raise's end is said.
 */
export function factoryWords(row: FactoryLevel, byDefault: boolean, now: Date): string {
  const whose = byDefault ? "the store's level, for runs in no factory" : row.own === null ? "the store's" : 'its own';
  if (row.raise !== null) return `Raised until ${clockWord(new Date(row.raise.until), now)}, then ${levelWord(row.default)} (${whose}).`;
  return `${levelWord(row.default)} by default (${whose}).`;
}

/** The levels a person picks among, lowest first. */
export { LEVELS } from 'objects';

/**
 * The level a fresh session is asked at, from `level`, hers: that level where above Manual, else Semi-auto.
 * @param level Her level now.
 */
export const freshLevel = (level: Level): Level => (level === 'manual' ? 'semi-auto' : level);

/**
 * The levels a factory is raised to over its default `level`, lowest first: none over Auto.
 * @param level The factory's default level.
 */
export const raisesOver = (level: Level): readonly Level[] =>
  level === 'manual' ? ['semi-auto', 'auto'] : level === 'semi-auto' ? ['auto'] : [];

/**
 * What her sessions cost, as her level's own line says it (`status.ts` in the orchestrator): each counted as it ends, her open one not yet.
 * A copy that stays: `GET /api/level` answers the spend's facts (`objects`' `NemiaLevel.spend`), not the line, and the board says the
 * dollars in its own money words (`dollars`).
 */
export const spendWords = ({ usd, measured, unmeasured }: Spend): string =>
  `Spent ${dollars(usd)} over ${measured} session${measured === 1 ? '' : 's'} ended${unmeasured ? `, ${unmeasured} not measured` : ''}; her open one counts once it ends.`;

/** How a fact she keeps is pruned: by asking her, since her session alone writes her memory. */
export const PRUNE_WORDS =
  'She keeps these facts herself, and the board only reads them. To have her forget one, or correct it, ask her to in her session.';

/**
 * The one line under her name in her chat's header, off what the api answers of her and where she is (`presence`): `Down since 6:10 PM`
 * while her session is not up and no message would start it, `Resting` where one would, `Answering` while a turn is in progress, else
 * `Up: her session runs`, each followed by what her sessions cost where the api counted it. The cost is what her ended sessions cost, whole
 * (`spendWords`, which the header carries as its title), never a day's: nothing the board reads counts a day of hers.
 * @param nemia What the api answers of her, or undefined while it is unread.
 * @param presence Where she is: down, answering, or with a message not sent.
 * @param now The instant it is now, against which the time she went down is said.
 */
export function chatHeaderLine(nemia: NemiaLevel | undefined, presence: Presence, now: Date): string {
  const spent = nemia?.spend ? ` · ${dollars(nemia.spend.usd)}` : '';
  if (presence.down) {
    const since = nemia?.since === null || nemia?.since === undefined ? null : new Date(nemia.since);
    return `Down${since === null ? '' : ` since ${clockWord(since, now)}`}${spent}`;
  }
  if (presence.resting) return `Resting${spent}`;
  if (presence.answering) return `Answering${spent}`;
  return `Up: her session runs${spent}`;
}

/**
 * What her chat's composer invites, by where she is: while this browser keeps a message the api did not take, the message above acted
 * on where the api answered and refused it (`refused`), and the daemon waited on where nothing answered; her
 * reading it later while she is down, their message waking her while she rests, their own words while one question of hers waits on them,
 * drawn as the form and answered by what they write (`asking`, `askInWords`, the canvas's board 7), the
 * next one or her turn stopped while she answers, else what she is for.
 * @param presence Where she is: down, answering, or with a message not sent.
 * @param asking Whether one question of hers waits on the person; false by default.
 * @param refused Whether the api answered and refused the message this browser keeps; false by default.
 */
export function composerWords(presence: Presence, asking = false, refused = false): string {
  if (presence.notSent) return refused ? 'Send again, edit or discard the message above' : 'Waiting for the daemon';
  if (presence.down) return 'Write now; she reads it when she is up';
  if (presence.resting) return 'Write to her; your message wakes her';
  if (asking) return 'Or answer in your own words';
  if (presence.answering) return 'She is answering. Write the next one, or stop her';
  return 'Tell Nemia what to do, or ask';
}

/** What the composer's one button does: send what is written, or end the turn she is answering. */
type ComposerButton = 'send' | 'stop';

/**
 * What the composer's button is, by where she is: the stop while she answers, since a turn of hers can be ended without ending her
 * session; the send otherwise, and while this browser keeps a message the api would not take, where nothing of hers can be reached at
 * all.
 * @param presence Where she is: answering, or with a message not sent.
 */
export const composerButton = (presence: Presence): ComposerButton => (presence.answering && !presence.notSent ? 'stop' : 'send');
