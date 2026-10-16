/**
 * The fan-out of an attached Claude Code session, in the process that holds it: every message the session's `query()` gives passes
 * through `took` (`attached-session.ts`) and is pushed here, and each follower of that session is handed what it says from the moment
 * it joined (`RunnerOps.follow`).
 *
 * - **What a follower is said.** Its state first, with the text block open then, whole; after that, each piece of text as the session
 *   writes it (`partial`, the protocol `marked` writes for the detached follow too), the whole events of Claude Code's own transcript
 *   as they are written, with the cursor `transcript` takes back, and the state again at each change.
 * - **Where the whole events come from.** The transcript file of the session's Claude Code (`claudeTranscriptFile`), read from the
 *   last cursor on each wake: the cursor a follow speaks is of the very file `opsOf.transcript` reads, and is the only cursor
 *   `readTranscript` takes back.
 * - **When it ends.** A wake is a push or one second, and each reads the run file: the follow ends once the session is no longer one
 *   this process runs — ended, held by another process, or parked with no session of that name left in this process's hands (a
 *   let-go). A session parked and taken up again here keeps its followers, the fan-out being made per name rather than per `query()`.
 * - **What it does not do.** Nothing reaches another process: a follower of a session this holder let go of ends, and a second
 *   process reads the session through `transcript`.
 */
import { Effect, Queue, Stream } from 'effect';
import type { SessionState } from '../../core/index.ts';
import { RunnerError } from '../error.ts';
import type { Followed, TranscriptCursor, TranscriptEvent } from '../seam.ts';
import { readTranscript } from '../transcript.ts';
import { marked, type PartialAt } from '../detached/follow.ts';
import { partialMarksOf } from './print.ts';
import { attachedStateOf, filesOf, heldHere, isOpen, readRun, type AttachedRun } from './attached-file.ts';
import { claudeTranscriptEvents, claudeTranscriptFile } from './transcript.ts';

/** One follower of a session: what wakes it, and the moments pushed for it since its last wake, in the order they were said. */
type Follower = { wake: Queue.Queue<void>; pending: Followed[] };

/** The fan-out of one session: where its partial protocol is (`PartialAt`), and who follows it now. */
type Fanned = { at: PartialAt; followers: Set<Follower> };

/**
 * Where the attached sessions under `root` are found, for `pushesOf`: `holds` says whether this process still runs a session of that
 * name, which tells a session parked on its way to being taken up again here from one its holder has let go of.
 */
export type PushSource = { root: string; holds: (name: string) => boolean };

/** The fan-out of the attached sessions: the push from the message loop, a follow, and how many follow a session now. */
export type Pushes = {
  readonly push: (name: string, m: unknown) => void;
  readonly follow: (name: string) => Stream.Stream<Followed, RunnerError>;
  readonly following: (name: string) => number;
};

const refusal = (message: string) => new RunnerError({ verb: 'follow', message: `claude: ${message}`, refused: true });

/** The moment a text block open under `key` is said with, whole, to a follower that has just joined. */
const openWhole = (open: { key: string; text: string }): Followed => ({ ...open, kind: 'partial', append: false, last: false });

/**
 * Whether the follow of `name` is over: there is no run of it, it has ended, another process holds it, or it is parked with no
 * session of that name in this process's hands — a holder's let-go, after which only another process can say anything of it.
 */
const over = (source: PushSource, name: string, run: AttachedRun | undefined): boolean =>
  run === undefined || !isOpen(run.state) || !heldHere(run) || (run.state === 'parked' && !source.holds(name));

/** The transcript of the session `name`'s Claude Code, read from `cursor`: the file `opsOf.transcript` reads, and its cursor. */
const events = (name: string, run: AttachedRun, cursor: TranscriptCursor | undefined) =>
  Effect.tryPromise({
    try: () => readTranscript(run.sessionId ? claudeTranscriptFile(run.sessionId) : undefined, cursor, claudeTranscriptEvents),
    catch: (e) => refusal(`\`${name}\`'s transcript cannot be read: ${e instanceof Error ? e.message : String(e)}`),
  });

/** What one wake says, in order: the pieces pushed since the last, the whole events read with their cursor, then a state changed. */
const momentsOf = (
  said: readonly Followed[],
  read: { events: TranscriptEvent[]; cursor: TranscriptCursor } | undefined,
  state: SessionState,
  next: SessionState,
): Followed[] => [
  ...said,
  ...(read?.events.length ? [{ kind: 'events', events: read.events, cursor: read.cursor } as const] : []),
  ...(next === state ? [] : [{ kind: 'state', state: next } as const]),
];

/**
 * The fan-out of the attached sessions of `source`: `push` is called with every message of a held session, in the order the SDK gives
 * them, and `follow` is the runner's verb over it. `following(name)` is how many follow that session now — what a test reads to see a
 * follower that left free its place.
 *
 * A follow takes its place behind the finalizer that frees it (`left` is installed before `joined` runs), so a follow interrupted as
 * it joins leaves no follower behind to be pushed to for the life of the holder. `joined` takes the place and reads the block open
 * then in one go, with nothing between: a piece pushed while a follower joins is either in the block it is handed, whole, or in its
 * `pending`, never dropped between the two.
 */
export const pushesOf = (source: PushSource): Pushes => {
  const sessions = new Map<string, Fanned>();
  const runOf = (name: string) => readRun(filesOf(source.root, name).run);

  const fannedOf = (name: string): Fanned => {
    const there = sessions.get(name);
    if (there) return there;
    const made: Fanned = { at: {}, followers: new Set() };
    sessions.set(name, made);
    return made;
  };

  const woke = (fanned: Fanned, said: readonly Followed[]): void => {
    for (const f of fanned.followers) {
      f.pending.push(...said);
      Queue.offerUnsafe(f.wake, undefined);
    }
  };

  const forget = (name: string, fanned: Fanned): void => {
    if (fanned.followers.size === 0 && fanned.at.open === undefined) sessions.delete(name);
  };

  const push = (name: string, m: unknown): void => {
    const line = (m ?? {}) as { type?: unknown; event?: unknown };
    if (line.type === 'stream_event') {
      const fanned = fannedOf(name);
      const [at, said] = marked(fanned.at, partialMarksOf(line.event));
      fanned.at = at;
      return woke(fanned, said);
    }
    const fanned = sessions.get(name);
    if (fanned === undefined) return;
    const open = line.type === 'result' ? fanned.at.open : undefined;
    if (line.type === 'result') fanned.at = {};
    woke(fanned, open ? [{ kind: 'partial', key: open.key, text: '', append: true, last: true }] : []);
    forget(name, fanned);
  };

  const left = (name: string, me: Follower): void => {
    const fanned = sessions.get(name);
    if (fanned === undefined) return;
    fanned.followers.delete(me);
    forget(name, fanned);
  };

  const joined = (name: string, me: Follower): [Followed[], SessionState] | undefined => {
    const run = runOf(name);
    if (run === undefined) return undefined;
    const fanned = fannedOf(name);
    fanned.followers.add(me);
    const state = attachedStateOf(run);
    return [[{ kind: 'state', state }, ...(fanned.at.open ? [openWhole(fanned.at.open)] : [])], state];
  };

  const follow = (name: string): Stream.Stream<Followed, RunnerError> =>
    Stream.callback<Followed, RunnerError>((queue) =>
      Effect.gen(function* () {
        const wake = yield* Queue.sliding<void>(1);
        const me: Follower = { wake, pending: [] };
        yield* Effect.addFinalizer(() => Effect.sync(() => left(name, me)));
        const start = joined(name, me);
        if (start === undefined)
          return yield* Queue.fail(queue, refusal(`no session \`${name}\` is there to follow: there is no run of it.`));
        const [first, from] = start;
        let state = from;
        let cursor: TranscriptCursor | undefined = undefined;
        yield* Queue.offerAll(queue, first);
        const run = runOf(name);
        if (run) cursor = (yield* events(name, run, undefined)).cursor;
        for (;;) {
          yield* Queue.take(wake).pipe(Effect.timeoutOption('1 second'));
          const now = runOf(name);
          const said = me.pending.splice(0);
          const read = now ? yield* events(name, now, cursor) : undefined;
          const next = now ? attachedStateOf(now) : state;
          cursor = read?.cursor ?? cursor;
          yield* Queue.offerAll(queue, momentsOf(said, read, state, next));
          state = next;
          if (over(source, name, now)) return yield* Queue.end(queue);
        }
      }).pipe(Effect.catch((e) => Queue.fail(queue, e))),
    );

  return { push, follow, following: (name) => sessions.get(name)?.followers.size ?? 0 };
};
