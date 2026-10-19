/**
 * A detached session followed live (`RunnerOps.follow`): its run file, the stdout its worker keeps whole, and its harness's transcript,
 * read again on each change a watch of their folders hears and at least once a second, each from where the last read stopped.
 */
import { Effect, Queue, Stream } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import type { SessionState } from '../../core/index.ts';
import { countRead } from '../../core/engine/tally.ts';
import { RunnerError } from '../error.ts';
import type { Followed, TranscriptCursor, TranscriptEvent } from '../seam.ts';
import { readTranscript } from '../transcript.ts';

/**
 * What a harness's stdout says of the text it is writing: a message begun, by its id (`begun`); a piece of the text block at
 * `index` in that message; a block written whole (`stopped`, its index).
 */
export type PartialMark = { begun: string } | { index: number; text: string } | { stopped: number };

/**
 * Where a detached session is found, for `followOf`: its run read now (its state and its harness's id; `undefined` when there is no
 * run of it; `unread` while its file cannot be read), the file its stdout is kept in, the folder both are in and the prefix of their
 * names there, how its stdout's lines read (`partials`), and where its transcript is and how its lines read.
 */
export type FollowSource = {
  harness: string;
  run: () => { state: SessionState; nativeId?: string } | { unread: string } | undefined;
  stdout: string;
  dir: string;
  prefix: string;
  partials: (output: string, before: number) => { marks: PartialMark[] } | { wrong: string };
  transcript: {
    file: (nativeId: string) => string | undefined;
    events: (entry: unknown, offset: number, file: string) => TranscriptEvent[];
  };
};

/**
 * Where the partial protocol is for one session: the message whose blocks are being written (`message`), and the text block open in
 * it, by the `key` its pieces are said under and the text said so far. The one bookkeeping `marked` advances, for a detached follow
 * and for an attached one alike.
 */
export type PartialAt = { message?: string; open?: { key: string; text: string } };

/** Where a follower is: the state it last said, the transcript's cursor, the stdout read so far, and the text block open there. */
type At = PartialAt & {
  state?: SessionState;
  cursor?: TranscriptCursor;
  bytes: number;
  lines: number;
};

/** The whole lines of `file` past `from` bytes, and how many bytes they are: none when there is no file or no whole line yet. */
const wholeLinesOf = (file: string, from: number): { text: string; bytes: number } => {
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return { text: '', bytes: 0 };
  }
  try {
    const size = fs.fstatSync(fd).size;
    const buf = Buffer.alloc(Math.max(0, size - from));
    const n = fs.readSync(fd, buf, 0, buf.length, from);
    countRead(n);
    const end = buf.subarray(0, n).lastIndexOf(0x0a) + 1;
    return { text: buf.subarray(0, end).toString('utf8'), bytes: end };
  } finally {
    fs.closeSync(fd);
  }
};

/**
 * `marks` taken from `at`: where it is after them, and the pieces said, each a `partial` moment. A piece is said under the key of
 * its message and block, added to what came before under that key (`append`), and a block written whole ends with a `last` piece.
 */
export const marked = <A extends PartialAt>(at: A, marks: readonly PartialMark[]): [A, Followed[]] => {
  let { message, open } = at;
  const said: Followed[] = [];
  for (const mark of marks) {
    if ('begun' in mark) message = mark.begun;
    else if ('text' in mark) {
      const key = `${message ?? ''}:${mark.index}`;
      const append = open?.key === key;
      open = { key, text: append && open ? open.text + mark.text : mark.text };
      said.push({ kind: 'partial', key, text: mark.text, append, last: false });
    } else if (open?.key === `${message ?? ''}:${mark.stopped}`) {
      said.push({ kind: 'partial', key: open.key, text: '', append: true, last: true });
      open = undefined;
    }
  }
  return [{ ...at, message, open }, said];
};

const refusal = (source: FollowSource, message: string, refused?: true) =>
  new RunnerError({ verb: 'follow', message: `${source.harness}: ${message}`, ...(refused ? { refused } : {}) });

/**
 * One read of the session from `at`: where it is after, the moments it says, and whether the session is over. The first read (no
 * state yet) says its state and the text block open so far, whole, and reads the transcript to its end without saying it: what
 * was written before is read by `transcript`. A run whose file cannot be read yet is read on the next wake.
 */
const pass = (source: FollowSource, name: string, at: At) =>
  Effect.gen(function* () {
    const run = source.run();
    if (run === undefined) return yield* Effect.fail(refusal(source, `no session \`${name}\` is there to follow: there is no run of it.`));
    if ('unread' in run) return [at, [], false, undefined] as const;
    const first = at.state === undefined;
    const out = wholeLinesOf(source.stdout, at.bytes);
    const read = source.partials(out.text, at.lines);
    if ('wrong' in read) return yield* Effect.fail(refusal(source, `\`${name}\`'s output cannot be followed: ${read.wrong}`));
    const [after, said] = marked(
      { ...at, bytes: at.bytes + out.bytes, lines: at.lines + (out.text.match(/\n/g)?.length ?? 0) },
      read.marks,
    );
    const file = run.nativeId ? source.transcript.file(run.nativeId) : undefined;
    const t = yield* Effect.tryPromise({
      try: () => readTranscript(file, at.cursor, source.transcript.events),
      catch: (e) => refusal(source, `\`${name}\`'s transcript cannot be read: ${e instanceof Error ? e.message : String(e)}`),
    });
    const moments: Followed[] = first
      ? [
          { kind: 'state', state: run.state },
          ...(after.open ? [{ ...after.open, kind: 'partial', append: false, last: false } as const] : []),
        ]
      : [
          ...said,
          ...(t.events.length ? [{ kind: 'events', events: t.events, cursor: t.cursor } as const] : []),
          ...(run.state === at.state ? [] : [{ kind: 'state', state: run.state } as const]),
        ];
    return [{ ...after, state: run.state, cursor: t.cursor }, moments, run.state !== 'working', file] as const;
  });

/**
 * The session `name` of `source` followed live: its state first, then each moment once and in order (`Followed`), until a read finds
 * it over, whose moments end the stream. Each folder it is read from is watched while the stream is open, waking a read when a file
 * of the session changes there, and a read is made at least once a second; the watches are closed with the stream.
 *
 * Fails, as a `RunnerError` of the verb `follow`, where there is no run of `name`, and where its stdout says a line that does not
 * decode or its transcript cannot be read.
 */
export const followOf = (source: FollowSource, name: string): Stream.Stream<Followed, RunnerError> =>
  Stream.callback<Followed, RunnerError>((queue) =>
    Effect.gen(function* () {
      const wake = yield* Queue.sliding<void>(1);
      const watches = new Map<string, fs.FSWatcher>();
      yield* Effect.addFinalizer(() => Effect.sync(() => watches.forEach((w) => w.close())));
      const watch = (dir: string, prefix: string) => {
        if (watches.has(dir)) return;
        try {
          const w = fs.watch(dir, (_, file) => {
            if (!file || file.startsWith(prefix)) Queue.offerUnsafe(wake, undefined);
          });
          w.on('error', () => {});
          watches.set(dir, w);
        } catch {}
      };
      watch(source.dir, source.prefix);
      let at: At = { bytes: 0, lines: 0 };
      for (;;) {
        const [after, moments, over, file] = yield* pass(source, name, at);
        at = after;
        if (file) watch(path.dirname(file), path.basename(file));
        yield* Queue.offerAll(queue, moments);
        if (over) return yield* Queue.end(queue);
        yield* Queue.take(wake).pipe(Effect.timeoutOption('1 second'));
      }
    }).pipe(Effect.catch((e) => Queue.fail(queue, e))),
  );
