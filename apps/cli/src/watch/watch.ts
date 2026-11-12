/**
 * `nemia watch`, the feed followed over the api's stream (`GET /api/feed/stream`), as the board follows it: `-l` selectors sent as
 * `selector`, the start `after=<cursor>` from the cursor file, the cursor typed or 0, each event's id and each bookmark written to
 * `--cursor-file`, `--once` read to the feed's end as the stream opened (`until=end`), and the lines printed as the in-process watch prints
 * them (`lines.ts`). Followed, its liveness is the stream's own: `daemon down` when it drops or cannot connect, a reconnect from the last
 * cursor every `RECONNECT_EVERY`, `daemon up` when it opens again; it runs until a signal, which exits 128 and its number. It reads no
 * file of the store.
 *
 * What it does not read itself goes to the old path (`handedOn`), which refuses it in its own words, exactly as before: a flag or form it
 * does not know, a cursor beside a cursor file, a cursor file in no directory or holding no number, a selector the grammar refuses.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Cause, Effect, Exit, Fiber, Schedule } from 'effect';
import { sessionHeaders, urlOf } from '../client.ts';
import { served } from '../daemon.ts';
import { asked as objectsAsked } from '../objects.ts';
import { handedOn } from '../local.ts';
import { Refused } from '../refused.ts';
import { servedAt } from '../where.ts';
import { bookmarkLine, livenessOf, livenessWords, pausedWords, watchedLine, type Watched } from './lines.ts';

/** How long a followed watch waits between tries to reopen a stream that dropped. */
export const RECONNECT_EVERY = '1 second';

/** What `nemia watch` was asked: `--once`, `--json`, the selectors, the cursor file, the cursor typed. */
type Asked = { once: boolean; how: Watched; selectors: string[]; cursorFile?: string; cursor?: number };

/**
 * Takes the word at `i` (and the value after it) into `asked`: answers how many words it took, or 0 for one this client leaves to the
 * old path.
 */
function took(asked: Asked, word: string, next: string | undefined): number {
  if (word === '--once') return ((asked.once = true), 1);
  if (word === '--json') return ((asked.how = { json: true }), 1);
  if (next === undefined) return /^\d+$/.test(word) && asked.cursor === undefined ? ((asked.cursor = Number(word)), 1) : 0;
  if (word === '-l') return (asked.selectors.push(next), 2);
  if (word === '--cursor-file' && asked.cursorFile === undefined) return ((asked.cursorFile = next), 2);
  return /^\d+$/.test(word) && asked.cursor === undefined ? ((asked.cursor = Number(word)), 1) : 0;
}

/** The words read as this client reads them, or undefined for any it leaves to the old path. */
function askedOf(args: readonly string[]): Asked | undefined {
  const asked: Asked = { once: false, how: { json: false }, selectors: [] };
  for (let i = 0; i < args.length;) {
    const n = took(asked, args[i] ?? '', args[i + 1]);
    if (n === 0) return undefined;
    i += n;
  }
  if (asked.cursor !== undefined && asked.cursorFile !== undefined) return undefined;
  const dir = asked.cursorFile === undefined ? undefined : path.dirname(asked.cursorFile);
  if (dir !== undefined && fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() !== true) return undefined;
  return asked;
}

/** The cursor a cursor file holds, none where there is no file, or `'refused'` for one holding no number. */
export function savedIn(file: string | undefined): number | undefined | 'refused' {
  if (file === undefined || fs.statSync(file, { throwIfNoEntry: false }) === undefined) return undefined;
  const text = fs.readFileSync(file, 'utf8').trim();
  return /^\d+$/.test(text) ? Number(text) : 'refused';
}

/** Writes `cursor` to the cursor file, whole: to a temp name beside it, then renamed over it, as the in-process watch writes it. */
export const kept = (file: string | undefined, cursor: number): void => {
  if (file === undefined) return;
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${cursor}\n`);
  fs.renameSync(temp, file);
};

/** One event of the stream: its name, its data and its id, as an EventSource reads a block. */
export type Sent = { event: string; data: string; id?: string };

/** The whole blocks of `text`, and what is left after them. A comment line is nothing. A fix's output stream is read with it too. */
export function blocksOf(text: string): { sent: Sent[]; rest: string } {
  const parts = text.split('\n\n');
  const rest = parts.pop() ?? '';
  const sent = parts.flatMap((block): Sent[] => {
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
async function opened(base: string, asked: Asked, from: number, signal?: AbortSignal): Promise<Opened> {
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
    return { kind: 'none', why: cause?.code ?? (err as Error).message };
  }
  if (response.ok && response.body !== null) return { kind: 'open', body: response.body };
  const text = await response.text();
  let said: string | undefined;
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') said = body.error;
  } catch {
    said = undefined;
  }
  return {
    kind: 'refused',
    status: response.status,
    said: said ?? `the api answered ${response.status}: ${text.slice(0, 200)}`,
    bare: said === undefined,
  };
}

/** Where the watch is: the cursor it has read to, and whether the hints were said, which are said once whatever the reconnects. */
type At = { cursor: number; hinted: boolean };

/**
 * One event of the stream, printed as the in-process watch prints it and its cursor kept: the `opened` event the stream opens with,
 * skipped; a line, its id the cursor; a bookmark, which a
 * `--once` read leaves to its end; a hint, said once on stderr; a failed read said on stderr. Answers `cut`
 * for a feed cut under the cursor.
 */
function onSent(s: Sent, asked: Asked, at: At): 'cut' | undefined {
  if (s.event === 'opened') return undefined;
  if (s.event === 'hint') {
    if (!at.hinted) console.error(`nemia watch: ${(JSON.parse(s.data) as { message: string }).message}`);
    return undefined;
  }
  at.hinted = true;
  if (s.event === 'bookmark') {
    at.cursor = Number(s.id ?? at.cursor);
    if (asked.once) return undefined;
    const printed = bookmarkLine(at.cursor, asked.how);
    if (printed !== undefined) console.log(printed);
    kept(asked.cursorFile, at.cursor);
  } else if (s.event === 'unreadable') {
    const { error, retrying } = JSON.parse(s.data) as { error: string; retrying: boolean };
    console.error(`nemia watch: ${error}`);
    if (!retrying) return 'cut';
  } else if (s.event !== 'readable' && s.id !== undefined) {
    at.cursor = Number(s.id);
    kept(asked.cursorFile, at.cursor);
    console.log(watchedLine(s.data, at.cursor, asked.how));
  }
  return undefined;
}

/**
 * Reads an open stream's events to its end (`onSent`). Answers how it ended: `end` when a `--once` read's stream closed on its last
 * bookmark, `cut` when the feed was cut under the cursor, `dropped` when the stream ended otherwise.
 */
async function readOn(body: ReadableStream<Uint8Array>, asked: Asked, at: At): Promise<'end' | 'cut' | 'dropped'> {
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
const startedOver = (file: string, saved: number, refusal: string): string =>
  `nemia watch: ${file} held cursor ${saved}, which the feed cannot be read from (${refusal}) — reading the feed there is ` +
  'now from its start, and keeping 0 there: a line said before may be said again.';

/** No api answers a `--once`: refused, naming the restart. */
const noneAnswers = (base: string, why: string): Refused =>
  new Refused(
    `no daemon answers at ${base} (${why}). Start the daemon, \`nemia service restart\` (or \`nemia up\` where no service is installed), then type \`nemia watch\` again`,
  );

/**
 * Opens the stream for the first time, from the saved cursor, the typed one or 0: a saved cursor the api refuses (400) starts over at 0,
 * said once; a typed one is refused in the api's words; a selector the api refuses (422) is the old path's to refuse. Answers the open
 * (or none, where no api answers), or `old`.
 */
async function firstOpen(asked: Asked, at: At, base: string): Promise<Opened | 'old'> {
  const saved = savedIn(asked.cursorFile);
  if (saved === 'refused') return 'old';
  at.cursor = saved ?? asked.cursor ?? 0;
  let got = await opened(base, asked, at.cursor);
  if (got.kind === 'refused' && got.status === 400 && saved !== undefined && asked.cursorFile !== undefined) {
    console.error(startedOver(asked.cursorFile, saved, got.said));
    at.cursor = 0;
    got = await opened(base, asked, 0);
  }
  if (got.kind === 'refused' && got.status === 422) return 'old';
  if (got.kind === 'refused')
    throw new Refused(
      got.status === 404 && got.bare
        ? `the daemon at ${base} does not serve /api/feed/stream: it is older than this nemia. Restart it, \`nemia service restart\`, then type \`nemia watch\` again`
        : got.said,
    );
  if (got.kind === 'open') kept(asked.cursorFile, at.cursor);
  return got;
}

/** `nemia watch --once`: the pause in words, the lines to the feed's end as the stream opened, and where that is. */
async function once(asked: Asked, args: readonly string[]): Promise<number> {
  const at: At = { cursor: 0, hinted: false };
  const base = await served('watch');
  const got = await firstOpen(asked, at, base);
  if (got === 'old') return handedOn(['watch', ...args]);
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
function runMain<E>(program: Effect.Effect<never, E>): Promise<number> {
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
async function followed(asked: Asked, args: readonly string[]): Promise<number> {
  const at: At = { cursor: 0, hinted: false };
  const base = await served('watch');
  const got = await firstOpen(asked, at, base);
  if (got === 'old') return handedOn(['watch', ...args]);
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

/** `nemia watch <args>`: over the api where it reads the words, else on the old path; answers its exit code. */
export const watch = (args: readonly string[]): Promise<number> => {
  const asked = askedOf(args);
  if (asked === undefined) return handedOn(['watch', ...args]);
  return asked.once ? once(asked, args) : followed(asked, args);
};
