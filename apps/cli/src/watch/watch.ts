/**
 * `nemia watch`, the feed followed over the api's stream (`GET /api/feed/stream`), as the board follows it: `-l` selectors sent as
 * `selector`, the start `after=<cursor>` from the cursor file, the cursor typed or 0, each event's id and each bookmark written to
 * `--cursor-file`, `--once` read to the feed's end as the stream opened (`until=end`), and the lines printed as the in-process watch prints
 * them (`lines.ts`). Followed, its liveness is the stream's own: `daemon down` when it drops or cannot connect, a reconnect from the last
 * cursor every `RECONNECT_EVERY`, `daemon up` when it opens again; it runs until a signal, which exits 128 and its number. It reads no
 * file of the store.
 *
 * Its words are parsed against `objects`' `WATCH_WORDS`, whose refusals and check say a flag or form it does not take and a cursor beside a
 * cursor file; it refuses a cursor file in no directory or holding no number itself, and a label query the api's grammar refuses in the
 * api's words.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Cause, Effect, Exit, Fiber, Option, Schedule, Schema } from 'effect';
import { type Args, FEED_STREAM_EVENTS, FeedStreamEvent } from 'objects';
import { sessionHeaders, urlOf } from '../client.ts';
import { served } from '../daemon.ts';
import { asked as objectsAsked } from '../objects.ts';
import { listArg, switchArg, textArg } from '../commands/requests.ts';
import { Refused } from '../refused.ts';
import { servedAt } from '../where.ts';
import { bookmarkLine, livenessOf, livenessWords, pausedWords, watchedLine, type Watched } from './lines.ts';

/** How long a followed watch waits between tries to reopen a stream that dropped. */
export const RECONNECT_EVERY = '1 second';

/** What `nemia watch` was asked: `--once`, `--json`, the selectors, the cursor file, the cursor typed. */
export type Asked = { once: boolean; how: Watched; selectors: string[]; cursorFile?: string; cursor?: number };

/**
 * What the parsed words ask (`objects`' `WATCH_WORDS`, its cursor checked by their `check`): refused, exit 2, where a cursor file is named
 * in no directory, which the watch could not keep its place in, naming what to make.
 */
function askedOf(args: Args) {
  const cursorFile = textArg(args, 'cursorFile');
  const cursor = textArg(args, 'cursor');
  const dir = cursorFile === undefined ? undefined : path.dirname(cursorFile);
  if (dir !== undefined && fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() !== true)
    throw new Refused(
      `nemia watch --cursor-file ${cursorFile ?? ''}: ${dir} is no directory, so the watch could not keep its cursor there — make it, ` +
        'or name a file in a directory that is: nemia watch --cursor-file <path>',
    );
  return {
    once: switchArg(args, 'once'),
    how: { json: switchArg(args, 'json') },
    selectors: [...listArg(args, 'selector')],
    ...(cursorFile === undefined ? {} : { cursorFile }),
    ...(cursor === undefined ? {} : { cursor: Number(cursor) }),
  } satisfies Asked as Asked;
}

/**
 * The cursor a cursor file holds, none where there is no file, or `'refused'` for one holding no whole number.
 * @param file The cursor file's path, undefined where none was named.
 */
export function savedIn(file: string | undefined) {
  if (file === undefined || fs.statSync(file, { throwIfNoEntry: false }) === undefined) return undefined;
  const text = fs.readFileSync(file, 'utf8').trim();
  return /^\d+$/.test(text) ? Number(text) : 'refused';
}

/**
 * The cursor `nemia watch`'s cursor file holds, none where there is none; refused, exit 2, naming the file, where it holds no whole
 * number.
 */
function watchSaved(file: string | undefined) {
  const saved = savedIn(file);
  if (saved !== 'refused') return saved;
  const text = fs.readFileSync(file ?? '', 'utf8').trim();
  throw new Refused(
    `${file ?? ''} is no cursor file: it holds ${JSON.stringify(text.slice(0, 40))}, where a watch keeps a whole number of bytes. Delete it to ` +
      `read the feed from its start, or name another: nemia watch --cursor-file <path>`,
  );
}

/**
 * Writes `cursor` to the cursor file, whole: to a temp name beside it, then renamed over it, as the in-process watch writes it.
 * @param file The cursor file's path; undefined where none was named, and nothing is written.
 * @param cursor The feed's offset read to, in bytes.
 */
export const kept = (file: string | undefined, cursor: number) => {
  if (file === undefined) return;
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${cursor}\n`);
  fs.renameSync(temp, file);
};

/** One event of the stream: its name, its data and its id, as an EventSource reads a block. */
export type Sent = { event: string; data: string; id?: string };

/**
 * The whole blocks of `text`, and what is left after them. A comment line is nothing. A fix's output stream is read with it too.
 * @param text The stream's text read so far, blocks parted by a blank line.
 */
export function blocksOf(text: string) {
  const parts = text.split('\n\n');
  const rest = parts.pop() ?? '';
  const sent = parts.flatMap((block) => {
    const fields = new Map<string, string>();
    for (const line of block.split('\n')) {
      if (line === '' || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const key = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
      const before = fields.get(key);
      fields.set(key, key === 'data' && before !== undefined ? `${before}\n${value}` : value);
    }
    const event = fields.get('event');
    if (event === undefined) return [];
    const id = fields.get('id');
    return [{ event, data: fields.get('data') ?? '', ...(id !== undefined ? { id } : {}) }];
  });
  return { sent, rest };
}

/** What a stream's open came to: open, its body to read; refused by the api with a status and its words; or no answer at all. */
type Opened =
  | { kind: 'open'; body: ReadableStream<Uint8Array> }
  | { kind: 'refused'; status: number; said: string; bare: boolean }
  | { kind: 'none'; why: string };

/** Opens the stream at `base` from `from`, aborted with `signal`. */
async function opened(base: string, asked: Asked, from: number, signal?: AbortSignal) {
  const query = { after: String(from), selector: asked.selectors, until: asked.once ? 'end' : undefined };
  let response: Response;
  try {
    response = await fetch(urlOf(base, '/api/feed/stream', query), {
      headers: { accept: 'text/event-stream', ...sessionHeaders() },
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (signal?.aborted === true) throw err;
    const cause = (err as { cause?: { code?: string } }).cause;
    return { kind: 'none', why: cause?.code ?? (err as Error).message } satisfies Opened;
  }
  if (response.ok && response.body !== null) return { kind: 'open', body: response.body } satisfies Opened as Opened;
  const text = await response.text();
  const said = Option.getOrUndefined(
    Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ error: Schema.String })))(text),
  )?.error;
  return {
    kind: 'refused',
    status: response.status,
    said: said ?? `the api answered ${response.status}: ${text.slice(0, 200)}`,
    bare: said === undefined,
  } satisfies Opened;
}

/** Where the watch is: the cursor it has read to, and whether the hints were said, which are said once whatever the reconnects. */
export type At = { cursor: number; hinted: boolean };

/** Decodes an event of the stream by `objects`' `FeedStreamEvent`, none where it does not. */
const decodeSent = Schema.decodeUnknownOption(FeedStreamEvent);

/**
 * One event of the stream as `objects`' `FeedStreamEvent` decodes it: none for an event of a name the feed does not send, and the name
 * with no event for one whose data does not decode.
 */
function decodedOf(s: Sent) {
  if (!FEED_STREAM_EVENTS.some((name) => name === s.event)) return Option.none();
  const decoded = decodeSent({ event: s.event, data: s.data, ...(s.id !== undefined ? { id: s.id } : {}) });
  return Option.isSome(decoded) ? decoded : 'undecoded';
}

/**
 * One event of the stream, decoded (`decodedOf`), printed as the in-process watch prints it and its cursor kept: the `opened` event the
 * stream opens with, skipped; a line, its id the cursor; a bookmark, which a `--once` read leaves to its end; a hint, said once on stderr;
 * a failed read said on stderr. An event of a name the feed does not send is skipped; one whose data does not decode is said on stderr,
 * by its name, and the watch goes on. Answers `cut` for a feed cut under the cursor.
 *
 * @param s the event as the stream sent it: its name, its data and its id
 * @param asked what `nemia watch` was asked: `--once`, how it prints, and the cursor file it keeps
 * @param at where the watch is: the cursor it has read to, which a line and a bookmark move, and whether the hints were said
 */
export function onSent(s: Sent, asked: Asked, at: At) {
  const decoded = decodedOf(s);
  if (decoded === 'undecoded') {
    console.error(`nemia watch: a \`${s.event}\` event's data could not be read, and is left out; the watch goes on.`);
    return undefined;
  }
  if (Option.isNone(decoded)) return undefined;
  const e = decoded.value;
  if (e.event === 'opened') return undefined;
  if (e.event === 'hint') {
    if (!at.hinted) console.error(`nemia watch: ${e.data.message}`);
    return undefined;
  }
  at.hinted = true;
  if (e.event === 'bookmark') {
    at.cursor = Number(e.id);
    if (asked.once) return undefined;
    const printed = bookmarkLine(at.cursor, asked.how);
    if (printed !== undefined) console.log(printed);
    kept(asked.cursorFile, at.cursor);
  } else if (e.event === 'unreadable') {
    console.error(`nemia watch: ${e.data.error}`);
    if (!e.data.retrying) return 'cut';
  } else if (e.event !== 'readable') {
    at.cursor = Number(e.id);
    kept(asked.cursorFile, at.cursor);
    console.log(watchedLine(e.data, at.cursor, asked.how));
  }
  return undefined;
}

/**
 * Reads an open stream's events to its end (`onSent`). Answers how it ended: `end` when a `--once` read's stream closed on its last
 * bookmark, `cut` when the feed was cut under the cursor, `dropped` when the stream ended otherwise.
 */
async function readOn(body: ReadableStream<Uint8Array>, asked: Asked, at: At) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let last: string | undefined;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return asked.once && last === 'bookmark' ? 'end' : 'dropped';
      const { sent, rest } = blocksOf(text + decoder.decode(value, { stream: true }));
      text = rest;
      for (const s of sent) {
        if (onSent(s, asked, at) === 'cut') return 'cut';
        last = s.event;
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    return 'dropped';
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** The words of a saved cursor the feed cannot be read from, said once: the watch starts over at 0. */
const startedOver = (file: string, saved: number, refusal: string) =>
  `nemia watch: ${file} held cursor ${saved}, which the feed cannot be read from (${refusal}) — reading the feed there is ` +
  'now from its start, and keeping 0 there: a line said before may be said again.';

/** No api answers a `--once`: refused, naming the restart. */
const noneAnswers = (base: string, why: string) =>
  new Refused(
    `no daemon answers at ${base} (${why}). Start the daemon, \`nemia service restart\` (or \`nemia up\` where no service is installed), then type \`nemia watch\` again`,
  ) satisfies Refused;

/**
 * Opens the stream for the first time, from the saved cursor, the typed one or 0: a saved cursor the api refuses (400) starts over at 0,
 * said once; a typed one, and a label query the api refuses (422), are refused in the api's words. Answers the open, or none where no
 * api answers.
 */
async function firstOpen(asked: Asked, at: At, base: string) {
  const saved = watchSaved(asked.cursorFile);
  at.cursor = saved ?? asked.cursor ?? 0;
  let got = await opened(base, asked, at.cursor);
  if (got.kind === 'refused' && got.status === 400 && saved !== undefined && asked.cursorFile !== undefined) {
    console.error(startedOver(asked.cursorFile, saved, got.said));
    at.cursor = 0;
    got = await opened(base, asked, 0);
  }
  if (got.kind === 'refused')
    throw new Refused(
      got.status === 404 && got.bare
        ? `the daemon at ${base} does not serve /api/feed/stream: it is older than this nemia. Restart it, \`nemia service restart\`, then type \`nemia watch\` again`
        : got.said,
    );
  if (got.kind === 'open') kept(asked.cursorFile, at.cursor);
  return got satisfies Opened as Opened;
}

/** `nemia watch --once`: the pause in words, the lines to the feed's end as the stream opened, and where that is. */
async function once(asked: Asked) {
  const at: At = { cursor: 0, hinted: false };
  const base = await served('watch');
  const got = await firstOpen(asked, at, base);
  if (got.kind !== 'open') throw noneAnswers(base, got.kind === 'none' ? got.why : got.said);
  if (asked.how.json !== true) {
    const paused = pausedWords(await objectsAsked('watch', (client) => client.server.paused()));
    if (paused) console.log(paused);
  }
  const ended = await readOn(got.body, asked, at);
  if (ended === 'cut') throw new Refused('the feed was cut under the watch. Read it again from its start: `nemia watch --once 0`');
  if (ended === 'dropped') throw noneAnswers(base, 'the stream ended before the feed did');
  if (asked.how.json === true) console.log(bookmarkLine(at.cursor, asked.how));
  else console.log(`cursor: ${at.cursor}`);
  kept(asked.cursorFile, at.cursor);
  return 0;
}

/**
 * One stretch of a followed watch: the stream opened from where it is, read until it drops, its liveness said as it changes — `down`
 * when it cannot open or drops, `up` when it opens after a `down`. A feed cut under the cursor reads on from 0, the cursor file with it.
 */
const stretch = (asked: Asked, at: At, live: { state: 'up' | 'down'; base: string }) =>
  Effect.tryPromise({
    try: async (signal) => {
      const base = servedAt() ?? live.base;
      const got = await opened(base, asked, at.cursor, signal);
      if (got.kind === 'refused' && got.status === 400) {
        console.error(`nemia watch: ${got.said}`);
        at.cursor = 0;
        kept(asked.cursorFile, 0);
        return;
      }
      if (got.kind !== 'open') {
        if (live.state === 'up')
          console.log(
            livenessWords(livenessOf('down', base, at.cursor, Date.now(), got.kind === 'none' ? got.why : got.said), asked.how.json),
          );
        live.state = 'down';
        return;
      }
      if (live.state === 'down') console.log(livenessWords(livenessOf('up', base, at.cursor, Date.now()), asked.how.json));
      live.state = 'up';
      live.base = base;
      const ended = await readOn(got.body, asked, at);
      if (ended === 'cut') {
        at.cursor = 0;
        kept(asked.cursorFile, 0);
        return;
      }
      if (signal.aborted) return;
      console.log(livenessWords(livenessOf('down', base, at.cursor, Date.now(), 'the stream dropped'), asked.how.json));
      live.state = 'down';
    },
    catch: (err) => err,
  });

/** The signals that stop a followed watch, each with the code it exits with: 128 and the signal's number. */
export const SIGNALS = (['SIGINT', 'SIGTERM', 'SIGHUP'] as const).map((s) => [s, 128 + os.constants.signals[s]] as const);

/**
 * Runs `program`, which never ends of itself, until a signal interrupts it; resolves 128 and the signal's number once its finalizers
 * ran, as the orchestrator's `runMain` exits, and leaves the exit to the bin, which waits for what was printed to drain; rejects with
 * its failure.
 */
function runMain<E>(program: Effect.Effect<never, E>) {
  return new Promise<number>((resolve, reject) => {
    let stoppedWith: number | undefined;
    const fiber = Effect.runFork(program);
    const stops = SIGNALS.map(([signal, code]) => {
      const stop = () => {
        stoppedWith = code;
        Effect.runFork(Fiber.interrupt(fiber));
      };
      process.once(signal, stop);
      return [signal, stop] as const;
    });
    fiber.addObserver((exit) => {
      for (const [signal, stop] of stops) process.off(signal, stop);
      if (stoppedWith !== undefined) resolve(stoppedWith);
      else if (Exit.isFailure(exit)) reject(Cause.squash(exit.cause));
    });
  });
}

/** `nemia watch`, followed: the first open as `--once` opens, the banner, then the stream reopened every `RECONNECT_EVERY` it drops. */
async function followed(asked: Asked) {
  const at: At = { cursor: 0, hinted: false };
  const base = await served('watch');
  const got = await firstOpen(asked, at, base);
  (asked.how.json === true ? console.error : console.log)(`watching from ${at.cursor}, ^C to stop`);
  const live: { state: 'up' | 'down'; base: string } = { state: 'up', base };
  const first =
    got.kind === 'open'
      ? Effect.tryPromise({
          try: async () => {
            const ended = await readOn(got.body, asked, at);
            if (ended === 'cut') {
              at.cursor = 0;
              kept(asked.cursorFile, 0);
            } else {
              console.log(livenessWords(livenessOf('down', base, at.cursor, Date.now(), 'the stream dropped'), asked.how.json));
              live.state = 'down';
            }
          },
          catch: (err) => err,
        })
      : Effect.sync(() => {
          console.log(
            livenessWords(livenessOf('down', base, at.cursor, Date.now(), got.kind === 'none' ? got.why : got.said), asked.how.json),
          );
          live.state = 'down';
        });
  const program = first.pipe(
    Effect.andThen(Effect.sleep(RECONNECT_EVERY)),
    Effect.andThen(Effect.repeat(stretch(asked, at, live), Schedule.spaced(RECONNECT_EVERY))),
    Effect.andThen(Effect.never),
  );
  return runMain(program);
}

/**
 * `nemia watch`, its words parsed against `objects`' `WATCH_WORDS`, over the api's stream; answers its exit code.
 * @param args The command's words as parsed against `WATCH_WORDS`.
 */
export const watch = (args: Args) => {
  const asked = askedOf(args);
  return asked.once ? once(asked) : followed(asked);
};
