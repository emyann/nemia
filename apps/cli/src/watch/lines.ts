/**
 * How `nemia watch` prints, ported from the in-process watch so the two print the same: a feed line (`watchedLine`, over `feedLineWords`),
 * the bookmark of where it has read to (`bookmarkLine`), the pause standing (`pausedWords`), and the liveness of the api it follows
 * (`livenessWords`), said when its stream drops or cannot connect and when it opens again. Pure.
 */
import { Schema } from 'effect';
import type { Paused } from 'objects';

/**
 * What the watch prints of a line of the feed, which the stream sends as its JSON (`FeedStreamEvent`'s `data`): a run's (`run`, its
 * `step`), the store's (`store`, `by`, `why`), a factory's (`factory`) or a daemon's (`daemon`, its pid), each with its time and its word. Read by this Schema
 * where it is printed in words; printed whole, every key it carries, under `--json`.
 */
export const FeedLineSaid = Schema.Struct({
  at: Schema.String,
  word: Schema.String,
  note: Schema.optionalKey(Schema.String),
  run: Schema.optionalKey(Schema.String),
  step: Schema.optionalKey(Schema.String),
  store: Schema.optionalKey(Schema.String),
  by: Schema.optionalKey(Schema.String),
  why: Schema.optionalKey(Schema.String),
  daemon: Schema.optionalKey(Schema.Number),
  factory: Schema.optionalKey(Schema.String),
});
type FeedLine = typeof FeedLineSaid.Type;

/** How the watch prints: as JSON (`--json`), else in words. */
export type Watched = { json?: boolean };

/** What one line of the feed says, without its time: a run's, the store's, a factory's, or a daemon's. */
export const feedSaidWords = (l: FeedLine): string => {
  const store = l.store !== undefined ? l : undefined;
  const who = store?.by ? ` by ${store.by}` : '';
  const notes = [store?.why, l.note].filter((n) => n);
  const head =
    l.run !== undefined
      ? `${l.run}  ${l.step ?? '—'}`
      : l.store !== undefined
        ? `${l.store}  —`
        : l.factory !== undefined
          ? `${l.factory}  —`
          : `pid ${l.daemon}`;
  return `${head}  ${l.word}${who}${notes.map((n) => `  · ${n}`).join('')}`;
};

/** One line of the feed, for a person: `10:02:13  r-1  plan  awaiting approval  · approve it: …`. */
export const feedLineWords = (l: FeedLine): string => `${l.at.slice(11, 19)}  ${feedSaidWords(l)}`;

/**
 * A line as the watch prints it, `data` its JSON and `cursor` the byte just after it: in words, or the line whole with its cursor as one
 * JSON object.
 */
export const watchedLine = (data: string, cursor: number, how: Watched): string => {
  const line: unknown = JSON.parse(data);
  return how.json === true
    ? JSON.stringify({ ...(typeof line === 'object' && line !== null ? line : {}), cursor })
    : feedLineWords(Schema.decodeUnknownSync(FeedLineSaid)(line));
};

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

/**
 * What the pause does, as the orchestrator's `pauseDoes` says it: a pause at once cuts each session and parks it; a timed one parks it at
 * its call's end; none runs on.
 */
const pauseDoes = ({ timeoutMs }: NonNullable<Paused['pause']>): string =>
  timeoutMs === 0
    ? 'nothing new starts, and each working session is cut at once and parks'
    : timeoutMs !== undefined
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
