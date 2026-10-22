/**
 * A background Claude Code session followed live (`RunnerOps.follow`), at message level: its transcript read from a byte offset as it
 * grows, each whole line once, and its state from `claude agents`, read at most once a pace (`FOLLOW_PACE_MS`, a second shipped) however many
 * sessions are followed (`sharedListing`).
 */
import { Effect, Exit, Queue, Stream } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { isLive, type SessionState } from '../../core/index.ts';
import { countRead } from '../../core/engine/tally.ts';
import { RunnerError } from '../error.ts';
import type { Followed, TranscriptEvent } from '../seam.ts';
import { CURSOR_TAIL_BYTES, cursorOf } from '../transcript.ts';
import { claudeStateOf, registryOf, type RegistryRow } from './registry.ts';
import { claudeTranscriptEvents, transcriptFile } from './transcript.ts';

/**
 * The follow's pace, shipped: how long a listing read is kept for every follower (`sharedListing`), and the longest a follower waits
 * between two passes with no change seen (`bgFollowOf`). A test shortens it on `ClaudeOptions.followPaceMs`.
 */
export const FOLLOW_PACE_MS = 1_000;

const failure = (message: string) => new RunnerError({ verb: 'follow', message: `claude: ${message}` });

/**
 * The rows of ours `read` lists (`registryOf`), read once however many ask at a time, and kept `ttlMs` after a read that decoded:
 * every follower of one runner shares one `claude agents` per `ttlMs`, a second shipped (`FOLLOW_PACE_MS`). A read that failed, or a
 * listing that does not decode, is kept by none: the next ask reads again. Fails with the read's error, or a `RunnerError` of the verb `follow` naming what does not decode.
 */
export const sharedListing = (
  read: Effect.Effect<string, RunnerError>,
  ttlMs: number = FOLLOW_PACE_MS,
): Effect.Effect<readonly RegistryRow[], RunnerError> =>
  Effect.runSync(
    Effect.cachedWithTTL(
      read.pipe(
        Effect.flatMap((out) => {
          const listed = registryOf(out);
          return 'wrong' in listed ? Effect.fail(failure(listed.wrong)) : Effect.succeed(listed.rows);
        }),
      ),
      (exit) => (Exit.isSuccess(exit) ? ttlMs : 0),
    ),
  );

/** What a follower says of a session now: its state, whether it is over, and whether its last turn has ended. */
export type FollowedState = { state: SessionState; over: boolean; turnEnded: boolean };

/**
 * What the row `row` says of a followed session whose last turn has ended or not (`turnEnded`):
 *
 * - `done` with its process held: the turn has ended and the session waits for words, `input-required`.
 * - a live state (`claudeStateOf`), with its process or without — the gap in which Claude Code respawns it: that state, not over; a
 *   `working` one begins a turn.
 * - any other: over, in that state; `stopped` after a turn ended, the session released, is `completed`.
 * - no row, the listing read: over, `completed` after a turn ended, else `canceled`.
 */
export const followedStateOf = (row: RegistryRow | undefined, turnEnded: boolean): FollowedState => {
  if (row === undefined) return { state: turnEnded ? 'completed' : 'canceled', over: true, turnEnded };
  if (row.state === 'done' && row.pid != null) return { state: 'input-required', over: false, turnEnded: true };
  const state = claudeStateOf(row.state, row.waitingFor?.trim() || undefined);
  if (isLive(state)) return { state, over: false, turnEnded: state === 'working' ? false : turnEnded };
  return { state: turnEnded && state === 'canceled' ? 'completed' : state, over: true, turnEnded };
};

/** Where a transcript is read to: the whole lines before `offset`, the last `CURSOR_TAIL_BYTES` of them, and the bytes after them. */
type Read = { offset: number; tail: Buffer; pending: Buffer };

const START: Read = { offset: 0, tail: Buffer.alloc(0), pending: Buffer.alloc(0) };

/** Where a follower is: the state it last said, whether the turn has ended, the session's id and transcript, and how far it is read. */
type At = { said?: SessionState; turnEnded: boolean; sessionId?: string; file?: string; read: Read };

/** The bytes of `fd` from `from` to `to`, each counted read (`countRead`). */
const bytesOf = (fd: number, from: number, to: number): Buffer => {
  const buf = Buffer.alloc(Math.max(0, to - from));
  let got = 0;
  while (got < buf.length) {
    const n = fs.readSync(fd, buf, got, buf.length - got, from + got);
    if (n === 0) break;
    got += n;
  }
  countRead(got);
  return buf.subarray(0, got);
};

/**
 * Where a file of `size` bytes is read to now: after its last whole line, read backwards from its end a window at a time until that
 * line's end and the tail before it are in hand, or the file's start is.
 */
const endOf = (fd: number, size: number): Read => {
  let start = size;
  let buf = Buffer.alloc(0);
  for (;;) {
    const from = Math.max(0, start - CURSOR_TAIL_BYTES);
    buf = Buffer.concat([bytesOf(fd, from, start), buf]);
    start = from;
    const end = buf.lastIndexOf(0x0a) + 1;
    if (start === 0 || (end > 0 && end >= CURSOR_TAIL_BYTES)) {
      return { offset: start + end, tail: buf.subarray(Math.max(0, end - CURSOR_TAIL_BYTES), end), pending: buf.subarray(end) };
    }
  }
};

/** `f` given `file` open, or `undefined` when there is no such file. */
const opened = <T>(file: string, f: (fd: number) => T): T | undefined => {
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
  try {
    return f(fd);
  } finally {
    fs.closeSync(fd);
  }
};

/** The whole lines `file` has grown by since `read`, each with its offset, and where it is read to after them. */
const grownOf = (file: string, read: Read): { read: Read; lines: { text: string; offset: number }[] } | undefined =>
  opened(file, (fd) => {
    const size = fs.fstatSync(fd).size;
    const known = read.offset + read.pending.length;
    if (size < known) return { read: endOf(fd, size), lines: [] };
    const chunk = Buffer.concat([read.pending, bytesOf(fd, known, size)]);
    const lines: { text: string; offset: number }[] = [];
    let at = 0;
    for (let end = chunk.indexOf(0x0a); end !== -1; end = chunk.indexOf(0x0a, at)) {
      lines.push({ text: chunk.toString('utf8', at, end), offset: read.offset + at });
      at = end + 1;
    }
    const tail = Buffer.concat([read.tail, chunk.subarray(0, at)]);
    return {
      read: { offset: read.offset + at, tail: tail.subarray(Math.max(0, tail.length - CURSOR_TAIL_BYTES)), pending: chunk.subarray(at) },
      lines,
    };
  });

/** The events of `lines` of `file`, a line that is not JSON passed over. Throws where a line does not decode, naming it. */
const eventsOf = (lines: readonly { text: string; offset: number }[], file: string): TranscriptEvent[] =>
  lines.flatMap(({ text, offset }) => {
    let entry: unknown;
    try {
      entry = JSON.parse(text);
    } catch {
      return [];
    }
    return claudeTranscriptEvents(entry, offset, file);
  });

/** What the transcript of `at` says since it was read: where it is read to after, and its new events, as a moment when there are any. */
const transcriptPass = (name: string, at: At) =>
  Effect.try({
    try: (): [At, Followed[]] => {
      const file = at.file ?? (at.sessionId === undefined ? undefined : transcriptFile(at.sessionId));
      const grown = file === undefined ? undefined : grownOf(file, at.read);
      if (file === undefined || grown === undefined) return [{ ...at, file }, []];
      const events = eventsOf(grown.lines, file);
      const cursor = cursorOf(grown.read.offset, grown.read.tail);
      return [{ ...at, file, read: grown.read }, events.length ? [{ kind: 'events', events, cursor }] : []];
    },
    catch: (e) => failure(`\`${name}\`'s transcript cannot be followed: ${e instanceof Error ? e.message : String(e)}`),
  });

/** The last row of `rows` named `name`, or of the session `name`: the listing's later row of a name is the one it holds now. */
const rowOf = (rows: readonly RegistryRow[], name: string): RegistryRow | undefined =>
  [...rows].reverse().find((r) => r.name === name || r.sessionId === name);

/**
 * The first pass that reads the listing: the state of `name`, said, and its transcript read to its end, not said: what was written
 * before is read by `transcript`. Fails where the listing does not list it.
 */
const firstPass = (name: string, rows: readonly RegistryRow[]) =>
  Effect.gen(function* () {
    const row = rowOf(rows, name);
    if (row === undefined)
      return yield* Effect.fail(
        failure(`no session \`${name}\` is there to follow: neither a job's run file nor \`claude agents\` lists it.`),
      );
    const now = followedStateOf(row, false);
    const file = transcriptFile(row.sessionId);
    const read = yield* Effect.try({
      try: () => (file === undefined ? START : (opened(file, (fd) => endOf(fd, fs.fstatSync(fd).size)) ?? START)),
      catch: (e) => failure(`\`${name}\`'s transcript cannot be read: ${e instanceof Error ? e.message : String(e)}`),
    });
    const at: At = { said: now.state, turnEnded: now.turnEnded, sessionId: row.sessionId, file, read };
    return [at, [{ kind: 'state', state: now.state }], now.over] as const;
  });

/**
 * One pass of the follower of `name` from `at`: the listing read first (`list`), then the transcript, so a line written before the
 * listing said the session ended is read. Where it is after, the moments it says — the events, then the state where it moved — and
 * whether the session is over. A listing that cannot be read says no state and ends nothing.
 */
const pass = (list: Effect.Effect<readonly RegistryRow[], RunnerError>, name: string, at: At) =>
  Effect.gen(function* () {
    const rows = yield* list.pipe(Effect.orElseSucceed(() => undefined));
    if (at.said === undefined) return rows === undefined ? ([at, [], false] as const) : yield* firstPass(name, rows);
    const [read, said] = yield* transcriptPass(name, at);
    if (rows === undefined) return [read, said, false] as const;
    const now = followedStateOf(rowOf(rows, name), at.turnEnded);
    const moved: Followed[] = now.state === at.said ? [] : [{ kind: 'state', state: now.state }];
    return [{ ...read, said: now.state, turnEnded: now.turnEnded }, [...said, ...moved], now.over] as const;
  });

/**
 * The follower of a runner whose listing is `list` (`sharedListing`): the background session `name` followed live — its state
 * first, then each whole transcript line written after, once and in order, as events, and each move of its state, across its turns
 * and the respawns Claude Code makes of it, until a pass finds it over (`followedStateOf`), whose moments end the stream. The
 * transcript's folder is watched while the stream is open, waking a pass when the transcript changes, and a pass is made at least
 * once every `paceMs`, a second shipped (`FOLLOW_PACE_MS`); the watch is closed with the stream.
 *
 * Fails, as a `RunnerError` of the verb `follow`, where the listing does not list `name`, and where the transcript cannot be read or
 * says a line that does not decode.
 */
export const bgFollowOf =
  (list: Effect.Effect<readonly RegistryRow[], RunnerError>, paceMs: number = FOLLOW_PACE_MS) =>
  (name: string): Stream.Stream<Followed, RunnerError> =>
    Stream.callback<Followed, RunnerError>((queue) =>
      Effect.gen(function* () {
        const wake = yield* Queue.sliding<void>(1);
        let watch: fs.FSWatcher | undefined;
        yield* Effect.addFinalizer(() => Effect.sync(() => watch?.close()));
        let at: At = { turnEnded: false, read: START };
        for (;;) {
          const [after, moments, over] = yield* pass(list, name, at);
          at = after;
          if (at.file && !watch) watch = watched(at.file, () => Queue.offerUnsafe(wake, undefined));
          yield* Queue.offerAll(queue, moments);
          if (over) return yield* Queue.end(queue);
          yield* Queue.take(wake).pipe(Effect.timeoutOption(paceMs));
        }
      }).pipe(Effect.catch((e) => Queue.fail(queue, e))),
    );

/** A watch of the folder of `file` that calls `changed` when `file` changes there; `undefined` where the folder cannot be watched. */
const watched = (file: string, changed: () => void): fs.FSWatcher | undefined => {
  const name = path.basename(file);
  try {
    const w = fs.watch(path.dirname(file), (_, f) => {
      if (!f || f === name) changed();
    });
    w.on('error', () => {});
    return w;
  } catch {
    return undefined;
  }
};
