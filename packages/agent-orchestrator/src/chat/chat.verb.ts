/**
 * A chat with a long-lived task, read and written as the board asks: its history a page at a time with where the task is
 * (`chatHistory`), the same followed from a stream's cursor (`followChat`), the person's words put in the outbox (`chatSay`), their read
 * mark moved (`chatRead`) and the turn it is answering stopped (`chatStop`). A read projects from the task's record, its transcripts and
 * the chat's files (`projectChat`).
 *
 * **A follower lists once, then folds what moves.** `followChat` reads the whole record once from the reader's cursor, as a
 * list-then-watch does, then holds the sources in memory and re-reads only what changed: the task's session through the follow its
 * caller shares between every reader of it (its events appended by id, its view read again when its state or attempt moves), the
 * chat's own files when the folder's sizes or times move, and the runs that wait on the person when a run's line reaches the feed. It
 * stays level-triggered: the files and the runtime are the record and the reader carries only its cursor, so a reader that joins or
 * rejoins lists from it. Where the follow is refused or ends (her session ended, a harness that cannot follow), it reads the record on a
 * beat, the last session's transcript from the runtime's cursor, and asks for the follow again each beat.
 *
 * A controller: it reaches the runtime through the client, and is the one writer of the outbox, of the read mark and of the stops.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Duration, Effect, Exit, Stream } from 'effect';
import { EngineService, asked, tried, type Engine, type TranscriptEvent } from '../runtime-client.ts';
import { isRunLine } from '../feed/index.ts';
import { FeedDoor } from '../feed/feed.store.ts';
import { followFeed } from '../feed/feed.verb.ts';
import type { StepMoment } from '../following/following.ts';
import { verifiesRest } from '../config/config.store.ts';
import { HOME } from '../record/record.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { informerMemo, type InformerMemo } from '../rest/informer.verb.ts';
import { kindOf } from '../run-state/run-state.ts';
import type { Filings } from '../summary/reads.verb.ts';
import { runsSummarized } from '../summary/summary.verb.ts';
import {
  appendAnswer,
  appendOutbox,
  appendStop,
  chatDir,
  readAnswers,
  readAsks,
  readAsksClosed,
  readDelivered,
  readOutbox,
  readSpeakers,
  readReadMark,
  readStops,
  writeReadMark,
} from './chat.store.ts';
import {
  answerFor,
  CHAT_TEXT_MAX,
  changedSince,
  chatCursor,
  chatPage,
  cursorOf,
  presenceOf,
  projectChat,
  readChatCursor,
  sourcesAt,
  speakerRefusal,
  withEvents,
  type ChatEvent,
  type ChatSession,
  type ChatSources,
  type AskAnswer,
  type AskPick,
  type OutboxEntry,
  type Presence,
  type ReadMark,
  type SourceStop,
  type Speaker,
  type Via,
} from './chat.ts';

/** Which chat: the long-lived task it is with (none while none is filed), and the folder its files are kept in. */
export type ChatPlace = { readonly task: string | undefined; readonly dir: string };

/**
 * How the runs that wait on the person are read, as the board's list reads them: the store, the informer and the feed's
 * filing times its caller keeps, and the environment that says whether to verify them. Each defaults as a caller that keeps none.
 */
export type ChatReads = {
  readonly home?: string;
  readonly runs?: InformerMemo;
  readonly filings?: Filings;
  readonly env?: NodeJS.ProcessEnv;
};

/** A page of history: its events, oldest first, the id to ask `before` for the page older, the stream's cursor, and the presence. */
export type ChatHistory = { events: ChatEvent[]; before: string | null; cursor: string; presence: Presence };

/** What changed since a cursor: the events new or changed, the cursor after them, and the presence. */
export type ChatChanges = { events: ChatEvent[]; cursor: string; presence: Presence };

/** One attempt's events, or none where its harness keeps no transcript the engine reads. */
const sessionOf = (task: string, attempt: { n: number; startedAt: string }) =>
  Effect.gen(function* () {
    const e = yield* EngineService;
    const read = yield* asked(
      'transcript',
      e
        .transcript(task, undefined, { attempt: attempt.n })
        .pipe(Effect.catchTag('TranscriptRefused', () => Effect.succeed({ events: [] }))),
    );
    return {
      attempt: attempt.n,
      startedAt: attempt.startedAt,
      events: read.events,
      ...('cursor' in read ? { cursor: read.cursor } : {}),
    } satisfies ChatSession;
  });

/** The chat's own files at `place`, read now. */
const filesOf = (place: ChatPlace) =>
  tried(() => ({
    outbox: readOutbox(place.dir),
    delivered: readDelivered(place.dir),
    stops: readStops(place.dir),
    asks: readAsks(place.dir),
    answers: readAnswers(place.dir),
    closed: readAsksClosed(place.dir),
  }));

/** What the chat at `place` is projected from, read now, and its task's phase, null where no task is filed. */
const sourcesOf = (place: ChatPlace) =>
  Effect.gen(function* () {
    const e = yield* EngineService;
    const files = yield* filesOf(place);
    const view = place.task === undefined ? undefined : yield* asked('view', e.view(place.task));
    if (place.task === undefined || view === undefined || !view.state.filedAt)
      return { sessions: [], said: [], ...files, phase: null } satisfies ChatSources;
    const task = place.task;
    const sessions = yield* Effect.forEach(view.state.attempts, (a) => sessionOf(task, a), { concurrency: 4 });
    return { sessions, said: view.state.said, ...files, phase: view.phase } satisfies ChatSources;
  });

/** How many runs wait on the person across every factory, as the board's list counts them (`kindOf`). */
const waitingNow = (reads: ChatReads) =>
  Effect.gen(function* () {
    const e = yield* EngineService;
    const runs = yield* runsSummarized(e, {
      home: reads.home ?? HOME,
      memo: reads.runs ?? informerMemo(),
      filings: reads.filings ?? { filed: new Map(), cursor: 0 },
      verify: reads.env ? verifiesRest(reads.env) : false,
    });
    return runs.filter((run) => kindOf(run) === 'waiting').length;
  });

/** Where the task is, off its sources and their projection. */
const presenceNow = (place: ChatPlace, sources: ChatSources, events: readonly ChatEvent[], reads: ChatReads) =>
  Effect.gen(function* () {
    const mark = yield* tried(() => readReadMark(place.dir));
    return presenceOf(sources.phase ?? undefined, yield* waitingNow(reads), events, mark);
  });

/**
 * A page of the chat at `place`: the `limit` events before the event `before`, or the last ones, with the cursor a stream resumes from
 * and the presence. Refused (`Invalid`) as `chatPage` refuses.
 */
export const chatHistory = Effect.fn('chatHistory')(function* (
  place: ChatPlace,
  page: { readonly before?: string; readonly limit?: number } = {},
  reads: ChatReads = {},
) {
  const sources = yield* sourcesOf(place);
  const events = projectChat(sources);
  const { events: shown, before } = yield* tried(() => chatPage(events, page.before, page.limit));
  const presence = yield* presenceNow(place, sources, events, reads);
  return { events: shown, before, cursor: chatCursor(cursorOf(sources)), presence } satisfies ChatHistory;
});

/** A moment of a task's session as a follow shared between readers hands it (`followTask`), or `ended` where its upstream failed. */
export type ChatFollowed = StepMoment<TranscriptEvent> | { kind: 'ended'; error: string };

/**
 * The follow of the task `taskId` a reader rides: the caller's, shared between every reader of the task, which runs `caught` — what the
 * reader has not read of the session yet — once it has joined, and hands it before the moments that come after.
 */
export type ChatFollow = (taskId: string, caught: Effect.Effect<ChatFollowed | undefined>) => Stream.Stream<ChatFollowed>;

/** What a follower of the chat is sent once it has listed: what changed, or that the chat could not be read, or that it can again. */
export type ChatSent = { kind: 'changes'; changes: ChatChanges } | { kind: 'unreadable'; error: string } | { kind: 'readable' };

/** How often a follower looks at the sizes and times of the chat's files, to read those that moved (`followChat`). */
export const FILES_CHECK_MS = 1000;

/** How often a follower reads the record again where no follow of the session can be had (`followChat`), unless its caller gives one. */
export const RECORD_BEAT_MS = 2000;

/** The chat folder's files at `place` as their names, sizes and times: what moves when one is written. */
const filesStamp = (place: ChatPlace): string => {
  const dir = chatDir(place.dir);
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  return names
    .map((name) => {
      const st = fs.statSync(path.join(dir, name), { throwIfNoEntry: false });
      return st ? `${name}:${st.size}:${st.mtimeMs}` : name;
    })
    .join('|');
};

/** The words of a failure's cause. */
const wordsOfCause = (cause: Cause.Cause<unknown>): string => {
  const err = Cause.squash(cause);
  return err instanceof Error ? err.message : String(err);
};

/** What moves a follower to read again: a moment of the session, the beat that reads the record, a look at the files, a run's line. */
type Moved = { kind: 'moment'; m: ChatFollowed } | { kind: 'beat' } | { kind: 'files' } | { kind: 'runs' };

/**
 * What one follower of a chat holds between what moves: where the chat is, the stamp of its files, the sources listed and folded since,
 * their projection last sent, the read mark, the runs waiting, the presence last sent, and the words of a read that failed, until one
 * works.
 */
type Held = {
  readonly e: Engine;
  readonly reads: ChatReads;
  place: ChatPlace;
  stamp: string;
  sources: ChatSources;
  events: ChatEvent[];
  mark: ReadMark | undefined;
  waiting: number;
  shown: string;
  unread: string | null;
};

/** The session the follow's events are of: the last one listed, until a read of the view says another. */
const followedOf = (h: Held) => h.sources.sessions.at(-1);

/** What the follower has not read of the session followed, read once it joins the follow: from its cursor, of its own attempt. */
const caughtOf = (h: Held, task: string): Effect.Effect<ChatFollowed | undefined> => {
  const at = followedOf(h);
  if (at?.cursor === undefined) return Effect.succeed(undefined);
  return asked('transcript', h.e.transcript(task, at.cursor, { attempt: at.attempt })).pipe(
    Effect.map((read): ChatFollowed => ({ kind: 'events', events: read.events, cursor: read.cursor })),
    Effect.orElseSucceed(() => undefined),
  );
};

/** The task's view read again into `h`: its phase and saids, and each attempt it names that is not held, read whole. */
const viewed = (h: Held) =>
  Effect.gen(function* () {
    const task = h.place.task;
    if (task === undefined) return;
    const view = yield* asked('view', h.e.view(task));
    if (!view.state.filedAt) return;
    const held = new Set(h.sources.sessions.map((s) => s.attempt));
    const fresh = yield* Effect.forEach(
      view.state.attempts.filter((a) => !held.has(a.n)),
      (a) => sessionOf(task, a),
    );
    h.sources = { ...h.sources, sessions: [...h.sources.sessions, ...fresh], said: view.state.said, phase: view.phase };
  });

/** The last session's transcript read into `h` from its cursor. */
const lastRead = (h: Held) =>
  Effect.gen(function* () {
    const at = followedOf(h);
    if (h.place.task === undefined || at?.cursor === undefined) return;
    const read = yield* asked(
      'transcript',
      h.e
        .transcript(h.place.task, at.cursor, { attempt: at.attempt })
        .pipe(Effect.catchTag('TranscriptRefused', () => Effect.succeed(undefined))),
    );
    if (read) h.sources = withEvents(h.sources, at.attempt, read.events, read.cursor);
  });

/** The chat's files and the read mark read again into `h`. */
const filesRead = (h: Held) =>
  Effect.gen(function* () {
    h.sources = { ...h.sources, ...(yield* filesOf(h.place)) };
    h.mark = yield* tried(() => readReadMark(h.place.dir));
  });

/**
 * A look at the chat's files: its task listed again whole where `placeOf` names another, else the files and the view read where they
 * moved, or while a read fails.
 */
const looked = (h: Held, placeOf: () => ChatPlace) =>
  Effect.gen(function* () {
    const now = placeOf();
    if (now.task !== h.place.task) {
      h.place = now;
      h.stamp = filesStamp(now);
      h.sources = yield* sourcesOf(now);
      h.mark = yield* tried(() => readReadMark(now.dir));
      return;
    }
    const stamp = filesStamp(h.place);
    if (stamp === h.stamp && h.unread === null) return;
    h.stamp = stamp;
    yield* Effect.all([filesRead(h), viewed(h)], { discard: true });
  });

/** What `moved` asks read, folded into what `h` holds. */
const folded = (h: Held, placeOf: () => ChatPlace, moved: Moved) =>
  Effect.gen(function* () {
    if (moved.kind === 'runs') h.waiting = yield* waitingNow(h.reads);
    else if (moved.kind === 'beat') yield* Effect.all([viewed(h), lastRead(h), filesRead(h)], { discard: true });
    else if (moved.kind === 'files') yield* looked(h, placeOf);
    else if (moved.m.kind === 'events') {
      const at = followedOf(h);
      if (at) h.sources = withEvents(h.sources, at.attempt, moved.m.events, moved.m.cursor);
    } else if (moved.m.kind === 'state' || moved.m.kind === 'moved' || moved.m.kind === 'settled') yield* viewed(h);
  });

/** What a fold changed in `h`, as the follower is sent it: the events new or changed and the presence where it moved, or nothing. */
const changesOf = (h: Held): ChatSent[] => {
  const now = projectChat(h.sources);
  const changed = changedSince(h.events, now);
  h.events = now;
  const presence = presenceOf(h.sources.phase ?? undefined, h.waiting, now, h.mark);
  const shown = JSON.stringify(presence);
  if (!changed.length && shown === h.shown) return [];
  h.shown = shown;
  return [{ kind: 'changes', changes: { events: changed, cursor: chatCursor(cursorOf(h.sources)), presence } }];
};

/**
 * What a fold of `moved` that ended `exit` sends: `unreadable` where it failed, once for each new reason; else `readable` first where a
 * read had failed before (a look, a beat or a run's line read it again), then what changed.
 */
const sentAfter = (h: Held, moved: Moved, exit: Exit.Exit<void, unknown>): ChatSent[] => {
  if (Exit.isFailure(exit)) {
    const error = wordsOfCause(exit.cause);
    if (error === h.unread) return [];
    h.unread = error;
    return [{ kind: 'unreadable', error }];
  }
  const back: ChatSent[] = h.unread !== null && moved.kind !== 'moment' ? [{ kind: 'readable' }] : [];
  if (back.length) h.unread = null;
  return [...back, ...changesOf(h)];
};

/** The follow of the task `h` holds, then a beat that reads the record and the follow asked for again, for as long as it is read. */
const following = (h: Held, follow: ChatFollow, beatMs: number): Stream.Stream<Moved> =>
  Stream.suspend(() => {
    const task = h.place.task;
    const moments =
      task === undefined ? Stream.empty : follow(task, caughtOf(h, task)).pipe(Stream.map((m): Moved => ({ kind: 'moment', m })));
    const beat = Stream.fromEffect(Effect.sleep(Duration.millis(beatMs))).pipe(Stream.map((): Moved => ({ kind: 'beat' })));
    return moments.pipe(Stream.concat(beat), Stream.concat(following(h, follow, beatMs)));
  });

/**
 * The chat at `placeOf()` followed from the cursor `after`, or from nothing: `first`, what a reader there has not seen as the chat is now,
 * read once from the whole record (refused `Invalid`, before anything is followed, for a cursor no read gave); then `rest`, each change as
 * it happens, never one a reader was already sent.
 *
 * `rest` holds the sources it listed and folds into them only what moved: each moment of the task's session from `follow` (its events by
 * id into the session followed; its view read again on a state, a move or its end, which brings a new attempt, read whole, the words
 * said to it and its phase), the chat's files read again when the folder's sizes or times move (looked at every `filesMs`), and the runs
 * that wait on the person counted again when a run's line reaches the feed. Where the follow is refused or ends, it reads the record
 * every `beatMs` — the view, the last session's transcript from its cursor, the files — and asks for the follow again. A task other
 * than the one listed (`placeOf` read on each look at the files) is listed again whole. A read that fails is sent as `unreadable` and
 * read again on the next look until it works, then `readable`; `rest` itself never fails.
 */
export const followChat = Effect.fn('followChat')(function* (
  placeOf: () => ChatPlace,
  after: string | undefined,
  reads: ChatReads,
  follow: ChatFollow,
  { filesMs = FILES_CHECK_MS, beatMs = RECORD_BEAT_MS }: { readonly filesMs?: number; readonly beatMs?: number } = {},
) {
  const e = yield* EngineService;
  const feedEnd = (yield* (yield* FeedDoor).lines.end())?.cursor ?? 0;
  const place = placeOf();
  const stamp = filesStamp(place);
  const sources = yield* sourcesOf(place);
  const events = projectChat(sources);
  const then = after === undefined ? [] : projectChat(yield* tried(() => sourcesAt(sources, readChatCursor(after), after)));
  const mark = yield* tried(() => readReadMark(place.dir));
  const waiting = yield* waitingNow(reads);
  const presence = presenceOf(sources.phase ?? undefined, waiting, events, mark);
  const first: ChatChanges = { events: changedSince(then, events), cursor: chatCursor(cursorOf(sources)), presence };
  const h: Held = { e, reads, place, stamp, sources, events, mark, waiting, shown: JSON.stringify(presence), unread: null };
  const looks = Stream.tick(Duration.millis(filesMs)).pipe(
    Stream.drop(1),
    Stream.map((): Moved => ({ kind: 'files' })),
  );
  const runs = followFeed(feedEnd).pipe(
    Stream.filter((f) => f.kind === 'line' && isRunLine(f.line)),
    Stream.map((): Moved => ({ kind: 'runs' })),
    Stream.catchCause(() => Stream.empty),
  );
  const rest = Stream.mergeAll([following(h, follow, beatMs), looks, runs], { concurrency: 'unbounded' }).pipe(
    Stream.mapEffect((moved) =>
      folded(h, placeOf, moved).pipe(
        Effect.exit,
        Effect.map((exit) => sentAfter(h, moved, exit)),
      ),
    ),
    Stream.flatMap((out) => Stream.fromIterable(out)),
  );
  return { first, rest };
});

/** A new outbox entry's id: the time it was written in base 36 and six random hex digits. */
const entryId = (): string => `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;

/**
 * The `text` `speaker` wrote, come `via` the board or from elsewhere, put in the outbox of the chat at `place`, which the keeper says to
 * the task once it is up (`sayOutbox`), in the words that say who wrote it (`framedFor`): the entry, carrying `from` where an agent wrote
 * it. Refused (`Invalid`) for text that is empty or longer than `CHAT_TEXT_MAX`, and as `speakerRefusal` refuses the speaker over the
 * names the person allowed (`readSpeakers`): `Invalid` for the person from anywhere but the board or an agent under a name no agent
 * speaks under, `Conflict` for an agent under a name the person has not allowed.
 */
export const chatSay = Effect.fn('chatSay')(function* (place: ChatPlace, text: string, speaker: Speaker, via: Via) {
  if (typeof text !== 'string' || text.trim() === '')
    return yield* Effect.fail(new Invalid({ message: 'The message is empty: write something to send.' }));
  if (text.length > CHAT_TEXT_MAX)
    return yield* Effect.fail(
      new Invalid({ message: `The message is ${text.length} characters: send at most ${CHAT_TEXT_MAX}, in parts if it is longer.` }),
    );
  const allowed = speaker.kind === 'agent' ? yield* tried(() => readSpeakers(place.dir)) : [];
  const refused = speakerRefusal(speaker, via, allowed);
  if (refused !== null)
    return yield* Effect.fail(
      refused.kind === 'Conflict' ? new Conflict({ message: refused.message }) : new Invalid({ message: refused.message }),
    );
  const at = new Date().toISOString();
  const entry: OutboxEntry = speaker.kind === 'agent' ? { id: entryId(), at, text, from: speaker } : { id: entryId(), at, text };
  yield* tried(() => appendOutbox(place.dir, entry));
  return entry;
});

/**
 * The person's answer to the ask `id` of the chat at `place` recorded, and the answer as its record keeps it: a file of their own, which
 * the keeper carries to her — back through the call she holds open, or said to her as words where no call of it is waiting any more
 * (`answersDue`). The keeper carries it, never this verb: an answer whose delivery depended on a live holder would be lost where the
 * holder is busy, and a restart owes exactly what the files say.
 *
 * Refused (`Missing`) for an ask the chat does not hold, (`Conflict`) for one already answered, and (`Invalid`) as `answerFor` refuses
 * the picks — a question left out, a label that is no choice of it, blank words, several labels for a question that takes one.
 */
export const chatAnswer = Effect.fn('chatAnswer')(function* (place: ChatPlace, given: { id: string; picks: readonly AskPick[] }) {
  const asks = yield* tried(() => readAsks(place.dir));
  const ask = asks.find((one) => one.id === given.id);
  if (ask === undefined)
    return yield* Effect.fail(new Missing({ message: `${given.id} is no question of this chat: answer one its history gave.` }));
  const answered = yield* tried(() => readAnswers(place.dir));
  const already = answered.find((one) => one.id === given.id);
  if (already !== undefined)
    return yield* Effect.fail(
      new Conflict({ message: `${given.id} was answered at ${already.at}: read her chat again, which draws the answer.` }),
    );
  const answers = yield* tried(() => answerFor(ask, given.picks));
  const answer: AskAnswer = { id: given.id, at: new Date().toISOString(), answers };
  yield* tried(() => appendAnswer(place.dir, answer));
  return answer;
});

/**
 * The turn the task of the chat at `place` is answering stopped, and the stop as its record keeps it: the runtime ends the turn through
 * its harness and leaves the session open, and the stop is appended to the chat's own `stops.jsonl`, which the projection draws as the
 * keeper's quiet marker. The turn is ended before the line is written: a stop on the record is a turn the runtime stopped.
 *
 * Refused (`Conflict`) where no task is filed, and in the runtime's own words where it will not end the turn — she is not answering,
 * her session is not running, or her harness cannot end a turn without ending it.
 */
export const chatStop = Effect.fn('chatStop')(function* (place: ChatPlace) {
  const e = yield* EngineService;
  if (place.task === undefined)
    return yield* Effect.fail(new Conflict({ message: 'No session of hers is filed, so there is no turn to stop.' }));
  const ended = yield* e.interrupt(place.task).pipe(
    Effect.catchTags({
      InterruptRefused: (refused) => Effect.fail(new Conflict({ message: refused.message })),
      InterruptUnsent: (unsent) => Effect.fail(new Conflict({ message: unsent.message })),
    }),
  );
  const stop: SourceStop = { at: ended.at, attempt: ended.attempt };
  yield* tried(() => appendStop(place.dir, stop));
  return stop;
});

/**
 * The person's read mark of the chat at `place` moved to the event `through`, and the mark: never back, so a mark behind the one
 * kept answers the one kept. Refused (`Missing`) for an id the chat does not hold.
 */
export const chatRead = Effect.fn('chatRead')(function* (place: ChatPlace, through: string) {
  const events = projectChat(yield* sourcesOf(place));
  const at = events.findIndex((e) => e.id === through);
  if (at < 0)
    return yield* Effect.fail(new Missing({ message: `${through} is no event of this chat: mark one the history gave as read.` }));
  const kept = yield* tried(() => readReadMark(place.dir));
  if (kept !== undefined && events.findIndex((e) => e.id === kept.through) >= at) return kept;
  const mark: ReadMark = { through, at: new Date().toISOString() };
  yield* tried(() => writeReadMark(place.dir, mark));
  return mark;
});
