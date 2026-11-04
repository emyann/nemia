/**
 * How `nemia watch` prints, ported from the in-process watch so the two print the same: a feed line (`watchedLine`, over `feedLineWords`),
 * the bookmark of where it has read to (`bookmarkLine`), the pause standing (`pausedWords`), and the liveness of the api it follows
 * (`livenessWords`), said when its stream drops or cannot connect and when it opens again. Pure.
 */
import type { FeedLine, Paused } from '../../../api/src/client/client.ts';

/** How the watch prints: as JSON (`--json`), else in words. */
export type Watched = { json?: boolean };

/** What one line of the feed says, without its time: a run's, the store's, or a daemon's. */
export const feedSaidWords = (l: FeedLine): string => {
  const store = 'store' in l ? l : undefined;
  const who = store?.by ? ` by ${store.by}` : '';
  const notes = [store?.why, l.note].filter((n) => n);
  const head = 'run' in l ? `${l.run}  ${l.step ?? '—'}` : 'store' in l ? `${l.store}  —` : `pid ${l.daemon}`;
  return `${head}  ${l.word}${who}${notes.map((n) => `  · ${n}`).join('')}`;
};

/** One line of the feed, for a person: `10:02:13  r-1  plan  awaiting approval  · approve it: …`. */
export const feedLineWords = (l: FeedLine): string => `${l.at.slice(11, 19)}  ${feedSaidWords(l)}`;

/** A line as the watch prints it, `cursor` the byte just after it: in words, or the line whole with its cursor as one JSON object. */
export const watchedLine = (line: FeedLine, cursor: number, how: Watched): string =>
  how.json === true ? JSON.stringify({ ...line, cursor }) : feedLineWords(line);

/** The bookmark at `cursor`: under `--json` a line carrying the cursor alone; in words, nothing. */
export const bookmarkLine = (cursor: number, how: Watched): string | undefined =>
  how.json === true ? JSON.stringify({ cursor }) : undefined;

/** The verb that resumes a paused store. */
const RESUME_LINE = 'nemia resume';

/** Since when, by whom and why. */
const sinceWords = ({ at, by, why }: NonNullable<Paused['pause']>): string =>
  `since ${at || 'a time its file no longer says'} by ${by || 'someone its file no longer names'}${why ? `: ${why}` : ''}`;

/** How many checks the pause holds back: `, 2 checks held`, or nothing. */
const heldCount = ({ staged, held }: Pick<Paused, 'staged' | 'held'>): string => {
  const n = staged.length + held.length;
  return n ? `, ${n} check${n === 1 ? '' : 's'} held` : '';
};

/** The sessions still in a tool call under a timed pause and when they are cut, as the orchestrator's `pausingWords` says it. */
const pausingWords = (sessions: number, leftMs: number): string =>
  `Pausing: ${sessions} session${sessions === 1 ? '' : 's'} finishing a tool call, cut ${leftMs > 0 ? `in ${Math.ceil(leftMs / 60_000)} min` : 'now'}`;

/** What the pause does, as the orchestrator's `pauseDoes` says it: a timed pause parks each session at its call's end; none runs on. */
const pauseDoes = ({ timeoutMs }: NonNullable<Paused['pause']>): string =>
  timeoutMs !== undefined
    ? 'nothing new starts, and each working session stops when its current tool call ends, cut once the timeout passes'
    : 'nothing new starts, and each working session runs on to its end';

/** The pause as it stands, in one line, or null when none stands. */
export const pausedWords = (paused: Paused, now: Date = new Date()): string | null => {
  const { pause, finishing } = paused;
  if (!pause) return null;
  const sessions = finishing.filter((f) => f.kind === 'session').length;
  const head =
    pause.timeoutMs !== undefined && sessions
      ? pausingWords(sessions, Math.min(pause.timeoutMs, Date.parse(pause.at) + pause.timeoutMs - now.getTime()))
      : `Pausing: ${finishing.length} finishing`;
  return finishing.length
    ? `${head}${heldCount(paused)} — the store is paused ${sinceWords(pause)}; ${pauseDoes(pause)}; ${RESUME_LINE} resumes it`
    : `Paused ${sinceWords(pause)} — nothing runs and nothing new starts${heldCount(paused)}; ${RESUME_LINE} resumes it`;
};

/** Whether the api the watch follows answers, when it was read, and the sentence beside it. */
export type Liveness = { state: 'up' | 'down'; at: string; text: string };

/** The watch's liveness at `now`: `down` with why the stream dropped and what starts the api, `up` once it opens again at `cursor`. */
export const livenessOf = (state: Liveness['state'], base: string, cursor: number, now: number, why = ''): Liveness => ({
  state,
  at: new Date(now).toISOString(),
  text:
    state === 'down'
      ? `daemon: none answers at ${base}${why ? ` (${why})` : ''} — the watch reads on from ${cursor} once one does; start it with nemia service restart, or npm start in apps/api`
      : `daemon: answering at ${base} — reading on from ${cursor}`,
});

/** A liveness line as the watch prints it: `12:00:00  daemon down  · <text>`, or one JSON object, which no cursor has. */
export const livenessWords = (l: Liveness, json = false): string =>
  json ? JSON.stringify({ liveness: l.state, at: l.at, note: l.text }) : `${l.at.slice(11, 19)}  daemon ${l.state}  · ${l.text}`;
