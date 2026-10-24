/**
 * A chat with a long-lived task, read and written as the board asks: its history a page at a time with where the task is
 * (`chatHistory`), what changed since a stream's cursor (`chatSince`), the person's words put in the outbox (`chatSay`), their read
 * mark moved (`chatRead`) and the turn it is answering stopped (`chatStop`). Every read projects again from the task's record, its
 * transcripts and the chat's files (`projectChat`).
 *
 * **Every read costs the whole projection, and that is accepted here.** A read is the task's view, every one of the task's attempts'
 * transcripts from the start, the chat's four files and the open runs for `waitsOnYou`; a followed chat pays it again on every beat, per
 * reader. So one read costs what the task has said all its life, and a session that talks all day costs more each beat than it did an
 * hour before: the pace (`CHAT_BEAT_MS` at the api) and the readers open bound how often it is paid, not how much. It buys being
 * level-triggered: nothing is kept between reads, so a restart owes exactly what the files and the runtime say, and the cursor a reader
 * carries counts what each source held rather than where a transcript was read to, so no read resumes one. What pays it back is the move
 * of the session to the SDK, where the projection reads the session's own events instead of a harness's transcript file; a cursor
 * carrying the runtime's transcript cursor, and the earlier attempts' events held between beats, belong with that move.
 *
 * A controller: it reaches the runtime through the client, and is the one writer of the outbox, of the read mark and of the stops.
 */
import { randomBytes } from 'node:crypto';
import { Effect } from 'effect';
import { EngineService, asked, tried } from '../runtime-client.ts';
import { verifiesRest } from '../config/config.store.ts';
import { HOME } from '../record/record.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { restingMemo, type RestingMemo } from '../rest/resting.verb.ts';
import { kindOf } from '../runlist/runlist.ts';
import type { Filings } from '../summary/reads.verb.ts';
import { runsSummarized, type RunSummary } from '../summary/summary.verb.ts';
import {
  appendAnswer,
  appendOutbox,
  appendStop,
  readAnswers,
  readAsks,
  readAsksClosed,
  readDelivered,
  readOutbox,
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
  type ChatEvent,
  type ChatSession,
  type ChatSources,
  type AskAnswer,
  type AskPick,
  type OutboxEntry,
  type Presence,
  type ReadMark,
  type SourceStop,
} from './chat.ts';

/** Which chat: the long-lived task it is with (none while none is filed), and the folder its files are kept in. */
export type ChatPlace = { readonly task: string | undefined; readonly dir: string };

/**
 * How the runs that wait on the person are read, as the board's list reads them: the store, the memo of runs at rest and the feed's
 * filing times its caller keeps, and the environment that says whether to verify them. Each defaults as a caller that keeps none.
 */
export type ChatReads = {
  readonly home?: string;
  readonly runs?: RestingMemo<Omit<RunSummary, 'startedAt'>>;
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
    return { attempt: attempt.n, startedAt: attempt.startedAt, events: read.events } satisfies ChatSession;
  });

/** What the chat at `place` is projected from, read now, and its task's phase, null where no task is filed. */
const sourcesOf = (place: ChatPlace) =>
  Effect.gen(function* () {
    const e = yield* EngineService;
    const files = yield* tried(() => ({
      outbox: readOutbox(place.dir),
      delivered: readDelivered(place.dir),
      stops: readStops(place.dir),
      asks: readAsks(place.dir),
      answers: readAnswers(place.dir),
      closed: readAsksClosed(place.dir),
    }));
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
      memo: reads.runs ?? restingMemo(),
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

/**
 * What the chat at `place` holds that a reader at the cursor `after` has not seen as it is now, every event where none is given, with
 * the cursor after them and the presence. Refused (`Invalid`) for a cursor no read gave.
 */
export const chatSince = Effect.fn('chatSince')(function* (place: ChatPlace, after: string | undefined, reads: ChatReads = {}) {
  const sources = yield* sourcesOf(place);
  const events = projectChat(sources);
  const then = after === undefined ? [] : projectChat(yield* tried(() => sourcesAt(sources, readChatCursor(after), after)));
  const presence = yield* presenceNow(place, sources, events, reads);
  return { events: changedSince(then, events), cursor: chatCursor(cursorOf(sources)), presence } satisfies ChatChanges;
});

/** A new outbox entry's id: the time it was written in base 36 and six random hex digits. */
const entryId = (): string => `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;

/**
 * The person's `text` put in the outbox of the chat at `place`, which the keeper says to the task once it is up (`sayOutbox`): the
 * entry. Refused (`Invalid`) for text that is empty or longer than `CHAT_TEXT_MAX`.
 */
export const chatSay = Effect.fn('chatSay')(function* (place: ChatPlace, text: string) {
  if (typeof text !== 'string' || text.trim() === '')
    return yield* Effect.fail(new Invalid({ message: 'The message is empty: write something to send.' }));
  if (text.length > CHAT_TEXT_MAX)
    return yield* Effect.fail(
      new Invalid({ message: `The message is ${text.length} characters: send at most ${CHAT_TEXT_MAX}, in parts if it is longer.` }),
    );
  const entry: OutboxEntry = { id: entryId(), at: new Date().toISOString(), text };
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
