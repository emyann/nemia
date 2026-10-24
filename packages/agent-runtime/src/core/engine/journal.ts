/**
 * The journal: append-only JSONL, one file per task.
 *
 * Append-only is not a storage choice, it is the model — the journal IS the desired state and the
 * history at once, so there is no row to update and therefore no write to get wrong. A task is a
 * file you can `cat`, `tail -f` and diff, which is worth more in a prototype than a query planner.
 *
 * It is a service (not an import) so tests run against memory and spend no filesystem.
 */
import { Context, Effect, Layer, Result, Schema } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import type { Event } from '../domain.ts';
import {
  entryWords,
  HarnessArgsSchema,
  StoredEventSchema,
  StoredEventsSchema,
  StoredFeedEntrySchema,
  type StoredEvent,
} from '../event-schema.ts';
import { FORMER_ARGS, HARNESS_ARGS, TAKEN_ARGS, type HarnessArgs } from '../../harness/args.ts';
import { countRead, countWrite } from './tally.ts';
import { FEED_LOCK_WAIT_MS, feedLinesOf, readFeed, rotateFeed, withFeedLock, type ForgottenFeed } from './feed.ts';
import { BodyRefused, filesBodies, memoryBodies, resolver, split, type BodyOps, type BodyRef, type Resolved } from './bodies.ts';
import { removeBody, sweep } from './sweep.ts';

/**
 * One entry of the store-wide feed: an event, and which task it happened to.
 *
 * This is the engine's API to whatever is built on top of it. A workflow layer that wants
 * "when task A settles, file task B" reads this and never touches a task journal — which is the
 * boundary that keeps sequencing out of the engine.
 */
export type FeedEntry = { taskId: string; event: Event };

/**
 * Where a reader got to. Opaque, monotonic, and it never expires — that is the whole contract.
 *
 * The file-backed journal makes it a byte offset, so resuming is a seek and never a scan. A
 * SQL-backed one would make it a row id. A consumer must not care which, and must only ever pass
 * back a cursor it was given.
 */
export type Cursor = number;

/**
 * A feed entry no runtime wrote, skipped by the read that met it: the task it names, when it names one, and why it is no entry, naming
 * where it is. The cursor the read returns is past it, so it is said once, by the read that met it, and never stops a reader.
 */
export type FeedRefusal = { taskId?: string; why: string };

export class JournalError extends Schema.TaggedError<JournalError>()('JournalError', {
  taskId: Schema.String,
  message: Schema.String,
}) {}

/**
 * The store, as a plain value — four methods, and the extension point for anything else.
 *
 * An application that already has a database implements this and keeps ONE store. Nothing in the
 * engine knows what is behind it: no SQL, no ORM, no migration ever reaches this package, and the
 * dependency runs one way only — the implementor imports the engine, never the reverse.
 *
 * A store keeps whole events (`PlainJournalOps`), or keeps each long text once beside its journals (`BodiedJournalOps`).
 */
export type JournalOps = PlainJournalOps | BodiedJournalOps;

/** A store that keeps each event whole, as it is appended. */
export type PlainJournalOps = {
  /**
   * Write `event` to the task's record, and to the feed: every append, by every writer. An engine's pass skips a settled
   * task it has folded until the feed names it (`core/engine/memo.ts`), so an entry that reaches the record and not the feed is
   * not read by a running engine — only by the next one made.
   */
  readonly append: (taskId: string, event: Event) => Effect.Effect<void, JournalError>;
  readonly read: (taskId: string) => Effect.Effect<Event[], JournalError>;
  readonly list: Effect.Effect<string[], JournalError>;
  /**
   * Everything that has happened in this store since `after`, and where to resume.
   *
   * The cursor never expires: the feed is append-only, so a consumer that was away for a week
   * replays rather than being told to start over. Pass 0 to read the whole history. A cursor at or past the feed's end reads nothing
   * and answers the end, so `Number.MAX_SAFE_INTEGER` asks where the feed ends; a store with no feed written yet answers the cursor
   * it was given, which such a caller reads as 0.
   */
  readonly feed: (
    after: Cursor,
  ) => Effect.Effect<{ entries: FeedEntry[]; cursor: Cursor; refused?: FeedRefusal[]; forgotten?: number }, JournalError>;
  /**
   * Optional: remove the tasks `taskIds`, their journals and every feed line naming them, each cursor keeping its place, so
   * that a read after a cursor says how many lines after it were forgotten (`forgotten`). Answers what the feed lost, where the
   * store keeps it in bytes. The caller asks first that each task is settled (`Engine.forget`): the store asks nothing.
   */
  readonly forget?: (taskIds: readonly string[]) => Effect.Effect<ForgottenFeed | undefined, JournalError>;
  /**
   * Optional: how many of the feed's lines name each task of `taskIds`, read once and resolving no body: each line whose `taskId` is
   * one of them, a line no runtime wrote included, since `forget` removes it too; a line forgotten is not counted, and a task with
   * none counts 0. A store that offers it answers from `forget` the lines it forgot of each task
   * (`ForgottenFeed.linesByTask`), so a count before a removal and the removal read the feed once between them.
   */
  readonly feedLines?: (taskIds: readonly string[]) => Effect.Effect<Readonly<Record<string, number>>, JournalError>;
  /**
   * Optional: call `onChange` when something has been appended, so a watcher can read instead of
   * poll. A store that cannot signal simply omits this and watchers fall back to a timer — the
   * same shape as everything else here, where a change is a HINT and re-reading is the mechanism.
   * Missing a signal costs latency and nothing else.
   */
  readonly subscribe?: (onChange: () => void) => () => void;
  readonly bodies?: undefined;
};

/**
 * A store that keeps each long text once (`core/engine/bodies.ts`): `Journal.layer` puts each body in `bodies` before it appends
 * the entry that names it, so `append` is handed the entry as the store holds it, and `read` and `feed` give back what the store
 * holds, parsed, for the layer to read back.
 */
export type BodiedJournalOps = Omit<PlainJournalOps, 'append' | 'read' | 'feed' | 'bodies'> & {
  readonly bodies: BodyOps;
  /**
   * Write `entry` to the task's record, and to the feed, as `PlainJournalOps.append` does an event: an event with each body it
   * names in a reference's place (`split`), or one that names none.
   */
  readonly append: (taskId: string, entry: Event | StoredEvent) => Effect.Effect<void, JournalError>;
  readonly read: (taskId: string) => Effect.Effect<readonly unknown[], JournalError>;
  readonly feed: (after: Cursor) => Effect.Effect<{ entries: readonly unknown[]; cursor: Cursor; forgotten?: number }, JournalError>;
  /** Optional: where the store keeps a task's journal and the feed, named in the words of an entry no runtime wrote. */
  readonly located?: { readonly journal: (taskId: string) => string; readonly feed: string };
};

/**
 * A store as the runtime reads it: what `read` and `feed` give back is whatever the store holds, parsed, and is an event
 * only once `Journal.layer` has decoded it. A `JournalOps` is one; the files store is one that never says its lines are events.
 */
export type StoreOps = BodiedJournalOps | (Omit<PlainJournalOps, 'read' | 'feed'> & Pick<BodiedJournalOps, 'read' | 'feed' | 'located'>);

/**
 * What `sweep` found: the bodies it may remove and their bytes, the bodies it keeps, and those it removed and their bytes — fewer
 * than it may remove when a body was put again since it was listed.
 */
export type SweepReport = { removable: number; bytes: number; kept: number; removed: number; removedBytes: number };

/** The journal as the engine reads and writes it: whole events, whatever the store keeps (`Journal.layer`). */
export type JournalShape = Omit<PlainJournalOps, 'append' | 'bodies'> & {
  /** Write `event` to the task's record and the feed; a store that keeps bodies keeps a brief's text cut at `briefParts`. */
  readonly append: (taskId: string, event: Event, briefParts?: readonly string[]) => Effect.Effect<void, JournalError>;
  /**
   * The bodies no journal and no feed entry names, put before the grace (`BODY_GRACE_MS`): counted, and removed with `yes`. A
   * store that keeps no bodies has none.
   */
  readonly sweep: (options?: { yes?: boolean }) => Effect.Effect<SweepReport, JournalError>;
  /** Remove one body: refused (`BodyRefused`) while a journal or the feed names it, within the grace, or when there is none. */
  readonly removeBody: (ref: BodyRef) => Effect.Effect<void, JournalError | BodyRefused>;
};

const isEvent = Schema.is(StoredEventSchema);
const isFeedEntry = Schema.is(StoredFeedEntrySchema);
const refusalOf = (schema: typeof StoredEventSchema | typeof StoredFeedEntrySchema, entry: unknown) => {
  const decoded = Schema.decodeUnknownResult(schema)(entry);
  return Result.isFailure(decoded) ? decoded.failure : undefined;
};

/**
 * A store's entries as events, the very objects it gave: a decoded struct comes back with its keys in the schema's order, and
 * the order of `config.claude` is the order of the flags on Claude Code's command line, so the schema is asked whether they
 * are events (`Schema.is`) and decodes only to say why not. One entry no runtime wrote fails the read, naming it: the task cannot
 * be folded without it.
 */
const decodeEvents = (taskId: string, raw: readonly unknown[], located: StoreOps['located']) => {
  if (Schema.is(StoredEventsSchema)(raw)) return Effect.succeed(raw);
  const index = raw.findIndex((entry) => !isEvent(entry));
  const where = `${taskId}'s journal${located ? ` (${located.journal(taskId)})` : ''}, entry ${index + 1}`;
  const error = refusalOf(StoredEventSchema, raw[index]);
  const message = error ? entryWords(where, raw[index], error, false) : `${where} is not what the runtime writes.`;
  return Effect.fail(new JournalError({ taskId, message }));
};

/** Reads a stored entry back (`resolver` in `bodies.ts`), a failure said in the words of where the entry is. */
type Resolve = ReturnType<typeof resolver>;

/** Why the feed entry `entry`, at `where`, is no runtime's, and the task it names when it names one. */
const feedRefusalOf = (where: string, entry: unknown): FeedRefusal => {
  const error = refusalOf(StoredFeedEntrySchema, entry);
  const taskId = typeof entry === 'object' && entry !== null && 'taskId' in entry ? entry.taskId : undefined;
  return {
    ...(typeof taskId === 'string' ? { taskId } : {}),
    why: error ? entryWords(where, entry, error, true) : `${where} is not what the runtime writes.`,
  };
};

/**
 * A store's feed entries, those no runtime wrote left out: each is skipped with why (`FeedRefusal`), and the cursor is past it all the
 * same, so one entry nobody can read stops no reader and no pass. The task it names, when it names one, is still named: its journal is
 * read again, and says for itself whether it reads. An entry naming a body that does not read back is skipped the same way.
 */
const decodeFeed = Effect.fn('decodeFeed')(function* (
  raw: readonly unknown[],
  after: Cursor,
  located: StoreOps['located'],
  bodies: Resolve,
) {
  const entries: FeedEntry[] = [];
  const refused: FeedRefusal[] = [];
  for (const [index, entry] of raw.entries()) {
    const where = `the feed${located ? ` (${located.feed})` : ''}, entry ${index + 1} read from cursor ${after}`;
    if (isFeedEntry(entry)) {
      const read = yield* Effect.result(bodies.resolve(entry.event));
      if (Result.isSuccess(read)) entries.push({ taskId: entry.taskId, event: upgrade(read.success) });
      else refused.push({ taskId: entry.taskId, why: `${where} ${read.failure.message}` });
      continue;
    }
    refused.push(feedRefusalOf(where, entry));
  }
  return { entries, refused };
});

/** A task's stored entries read back, a failure naming the task's journal, the entry and what to do. */
const resolveEvents = (taskId: string, stored: readonly StoredEvent[], located: StoreOps['located'], bodies: Resolve) =>
  bodies.needed(stored)
    ? Effect.forEach(stored, (entry, index) =>
        bodies.resolve(entry).pipe(
          Effect.mapError(
            (error) =>
              new JournalError({
                taskId,
                message: `${taskId}'s journal${located ? ` (${located.journal(taskId)})` : ''}, entry ${index + 1}, ${error.message}`,
              }),
          ),
        ),
      )
    : Effect.succeed(stored as readonly Resolved[]);

/** Harness arguments `upgrade` put together from ones already read as such: the same object, typed. */
const argsOf = (config: Record<string, unknown>): HarnessArgs =>
  Schema.is(HarnessArgsSchema)(config) ? config : Schema.decodeUnknownSync(HarnessArgsSchema)(config);

/** A stored `filed` event with its `priority` kept only when it is a whole number. */
const weighed = (event: Extract<Resolved, { kind: 'filed' }>) => {
  const { priority, ...unweighed } = event;
  return typeof priority === 'number' && Number.isInteger(priority) ? { ...unweighed, priority } : unweighed;
};

/** A stored end in the shape the runtime reads: a former `done` as `succeeded`, a former `budget` reason as the harness's end at it. */
const upgradedEnd = (event: Extract<Resolved, { kind: 'ended' }>): Event => {
  const observed = event.observed === 'done' ? 'succeeded' : event.observed;
  if (event.reason !== 'budget') return { ...event, observed, reason: event.reason };
  return { ...event, observed, reason: 'harness', limit: 'budget' };
};

/**
 * An event in the shape the runtime reads, whatever shape it was written in. Nothing on disk is rewritten: the journal is
 * append-only, and a line is what was said when it was said, so a change to an event's shape is made where it is read.
 *
 * The former shapes a journal an older runtime wrote may carry, and what each is read as:
 *
 * - A `filed` event with any of the harness's arguments (`HARNESS_ARGS`) at its top level, beside the task's own fields:
 *   they are moved under `config` (`harness/args.ts`), where a value already there is kept, since `config` is the newer
 *   word. So `fold` reads one shape, and a store holding tasks filed in both shapes lists them alike.
 * - The spend cap as the runtime's own field, `budgetUsd`: on a `filed` event it is lifted as above, being one of the
 *   harness's arguments; on an `input` it is moved under that turn's `config`.
 * - An end's reason `budget`: read as the harness ending the session at a limit its configuration set, `reason:
 *   'harness'` with `limit: 'budget'`.
 * - An end observed `done`, the word an older runtime recorded an end the harness vouched for with: read as `succeeded`, the
 *   outcome every end is recorded in now.
 * - A former harness argument that a flag of Claude Code's replaces (`FORMER_ARGS`: `remoteControl`, a bridge to
 *   claude.ai), under `config` or at a `filed` event's top level: moved into `config.claude` — `true` as the flag, where a
 *   flag already in `claude` is kept, and `false`, which asked for nothing, dropped. So a task filed bridged is bridged
 *   again on its next attempt.
 * - A harness argument taken away with nothing in its place (`TAKEN_ARGS`: `background`, which ran a session as `claude --bg`),
 *   under `config` or at a `filed` event's top level: dropped, so the task's next attempt runs as this runtime runs it — a job,
 *   or, filed `restartPolicy: 'Always'`, a long-lived session held attached. The schema still reads it (`event-schema.ts`).
 * - A `filed` event's `priority` that is not a whole number — `null`, as JSON writes a `NaN` an older runtime took: left out,
 *   so the task waits at 0.
 */
export const upgrade = (event: Resolved): Event => {
  if (event.kind === 'input') {
    const { budgetUsd, ...rest } = event;
    if (budgetUsd === undefined) return rest;
    return { ...rest, config: { budgetUsd, ...rest.config } };
  }
  if (event.kind === 'ended') return upgradedEnd(event);
  if (event.kind !== 'filed') return event;
  const filed = weighed(event);
  const legacy: Record<string, unknown> = filed;
  const formerKeys = [...Object.keys(FORMER_ARGS), ...Object.keys(TAKEN_ARGS)];
  const moved = [...HARNESS_ARGS, ...formerKeys].filter((key) => Object.hasOwn(legacy, key));
  const given: Record<string, unknown> = filed.config ?? {};
  const former = formerKeys.filter((key) => Object.hasOwn(given, key));
  if (!moved.length && !former.length) return filed;
  const lifted: Record<string, unknown> = {};
  const { config: _, ...rest } = filed;
  const left: Record<string, unknown> = rest;
  for (const key of moved) {
    if (legacy[key] !== undefined) lifted[key] = legacy[key];
    delete left[key];
  }
  const config = formerArgsOut({ ...lifted, ...given }, filed.config?.claude);
  return { ...rest, ...(Object.keys(config).length ? { config: argsOf(config) } : {}) };
};

/**
 * `config` with its former arguments out (`upgrade`): each that a flag of Claude Code's replaces moved into `claude` (`FORMER_ARGS`),
 * where a flag already in `claude` is kept, and each taken away with nothing in its place dropped (`TAKEN_ARGS`).
 */
const formerArgsOut = (config: Record<string, unknown>, claude: object | undefined): Record<string, unknown> => {
  const flags: Record<string, unknown> = {};
  for (const [key, flag] of Object.entries(FORMER_ARGS)) {
    if (config[key] === true) flags[flag] = true;
    delete config[key];
  }
  for (const key of Object.keys(TAKEN_ARGS)) delete config[key];
  if (Object.keys(flags).length) config.claude = { ...flags, ...claude };
  return config;
};

/** A line as its JSON, or as its text where it is none — a write cut short — for the decoder to refuse by place. */
const parsed = (line: string): unknown => {
  try {
    return JSON.parse(line);
  } catch {
    return line;
  }
};

/** The bytes of `file` from `from` to `to`, in one positioned read, counted. */
const span = (file: string, from: number, to: number): Buffer => {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(to - from);
    const read = fs.readSync(fd, buf, 0, buf.length, from);
    countRead(read);
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
};

/** What a journal reader keeps of one file: its identity, the end of its last complete line, its time there, and the entries before it. */
type Kept = { dev: number; ino: number; offset: number; mtimeMs: number; entries: readonly unknown[] };

/**
 * A reader of journal files that reads each only for what was appended since it last read it: it keeps, per file, the file's
 * identity (`dev`, `ino`), the byte offset of the end of its last complete line, its `mtimeMs` there and the entries up to it,
 * for as long as the reader lives. One `stat` per read decides:
 *
 * - the same file, of the size and time kept: the kept entries, nothing read;
 * - the same file grown: only the bytes past the offset;
 * - another file, a shorter one, or one of the same size at another time: the whole file, kept afresh;
 * - no file: `[]`, and nothing kept.
 *
 * A last line with no newline yet — a write cut short — is returned as its text and not kept: the offset never passes it. A journal
 * is appended to, never edited: one edited in place to a longer length is read from the old offset, so a hand edit replaces the file
 * by rename.
 */
const journalReader = () => {
  const kept = new Map<string, Kept>();
  return (file: string): unknown[] => {
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat) {
      kept.delete(file);
      return [];
    }
    const was = kept.get(file);
    const same = was !== undefined && was.dev === stat.dev && was.ino === stat.ino;
    if (same && stat.size === was.offset && stat.mtimeMs === was.mtimeMs) return [...was.entries];
    const from = same && stat.size > was.offset ? was.offset : 0;
    const buf = span(file, from, stat.size);
    const end = buf.lastIndexOf(0x0a) + 1;
    const lines = buf.subarray(0, end).toString('utf8').split('\n').filter(Boolean).map(parsed);
    const entries = from > 0 && was ? [...was.entries, ...lines] : lines;
    kept.set(file, { dev: stat.dev, ino: stat.ino, offset: from + end, mtimeMs: stat.mtimeMs, entries });
    const partial = buf.subarray(end).toString('utf8');
    return partial ? [...entries, parsed(partial)] : [...entries];
  };
};

/** The words of an append to `taskId`, whose journal `file` is not there: forgotten, or never filed. */
const forgottenWords = (taskId: string, file: string) =>
  `${taskId} has no journal (${file}): it was forgotten, or never filed, and is not written to again. File a new task.`;

/** A refusal of a store's bodies as the journal's: a failing store said in its words. */
const asJournal = (error: { _tag: string; message: string }) => new JournalError({ taskId: '*', message: error.message });

/** Puts the bodies `event` names, then appends the entry naming them: a line never names a body not yet kept. */
const appendSplit = (ops: BodiedJournalOps, taskId: string, event: Event, briefParts?: readonly string[]) => {
  const { entry, bodies } = split(event, briefParts);
  return Effect.forEach(bodies, ([ref, text]) => ops.bodies.put(ref, text), { discard: true }).pipe(
    Effect.mapError((error) => new JournalError({ taskId, message: error.message })),
    Effect.andThen(ops.append(taskId, entry)),
  );
};

/** The answer to a store that keeps no bodies, asked to remove one. */
const noBodies = (ref: unknown) =>
  Effect.fail(new BodyRefused({ message: `This store keeps no bodies, so there is no body ${String(ref)} to remove.` }));

/** What an append says of itself, on its span and its log: its `task`, its event's `kind`, and its `attempt` where the event has one. */
export const appendFields = (taskId: string, event: Event): { task: string; kind: Event['kind']; attempt?: number } => ({
  task: taskId,
  kind: event.kind,
  ...('attempt' in event ? { attempt: event.attempt } : {}),
});

/**
 * `append`, in a span of its own, `append`, under the verb that wrote it, annotated with `appendFields`; once written, it is
 * said at `Debug`, the event's kind, annotated the same. The runtime's journal at `Debug` is its log.
 */
const appendSaid = (append: JournalShape['append']) =>
  Effect.fn('append')(function* (taskId: string, event: Event, briefParts?: readonly string[]) {
    const fields = appendFields(taskId, event);
    yield* Effect.annotateCurrentSpan(fields);
    yield* append(taskId, event, briefParts);
    yield* Effect.logDebug(event.kind).pipe(Effect.annotateLogs(fields));
  });

export class Journal extends Context.Service<Journal, JournalShape>()('engine/Journal') {
  /**
   * Any implementation becomes a Layer. This is the only way a store reaches the engine — and so where what a store gives
   * back is decoded (`event-schema.ts`): an entry no runtime wrote in a task's journal fails that task's read with a
   * `JournalError` that names it, and one in the feed is skipped, said on the read's `refused`; where a store that keeps bodies
   * has each named body put before the entry naming it, and each entry read back as the event appended (`bodies.ts`); and
   * where an event in a former shape is read in the one the runtime reads (`upgrade`), whoever's store it is; and where every
   * append is traced and logged (`appendSaid`).
   */
  static layer = (ops: StoreOps) => {
    const bodied = ops.bodies ? ops : undefined;
    const bodies = resolver(bodied?.bodies);
    return Layer.succeed(Journal)(
      Journal.of({
        list: ops.list,
        ...(ops.subscribe ? { subscribe: ops.subscribe } : {}),
        ...(ops.forget ? { forget: ops.forget } : {}),
        ...(ops.feedLines ? { feedLines: ops.feedLines } : {}),
        append: appendSaid((taskId, event, briefParts) =>
          bodied ? appendSplit(bodied, taskId, event, briefParts) : ops.append(taskId, event),
        ),
        read: (taskId) =>
          ops.read(taskId).pipe(
            Effect.flatMap((raw) => decodeEvents(taskId, raw, ops.located)),
            Effect.flatMap((stored) => resolveEvents(taskId, stored, ops.located, bodies)),
            Effect.map((events) => events.map(upgrade)),
          ),
        feed: (after) =>
          ops.feed(after).pipe(
            Effect.flatMap(({ entries, cursor, forgotten }) =>
              Effect.map(decodeFeed(entries, after, ops.located, bodies), ({ entries: read, refused }) => ({
                entries: read,
                cursor,
                ...(refused.length ? { refused } : {}),
                ...(forgotten ? { forgotten } : {}),
              })),
            ),
          ),
        sweep: (options) =>
          bodied
            ? sweep(bodied, options).pipe(Effect.mapError(asJournal))
            : Effect.succeed({ removable: 0, bytes: 0, kept: 0, removed: 0, removedBytes: 0 }),
        removeBody: (ref) =>
          bodied ? removeBody(bodied, ref).pipe(Effect.catchTag('BodyError', (error) => Effect.fail(asJournal(error)))) : noBodies(ref),
      }),
    );
  };

  /** Files under `root`, which is required: with none a journal would be written into the person's own `~/.agent-engine`. */
  static files = (root: string) => Journal.layer(Journal.filesOps(root));

  /**
   * The same implementation as a plain value, for a caller that needs its optional `subscribe`. A line is read as its JSON,
   * or as its text where it is none — a write cut short — for the decoder to refuse by place. A task's journal is read through
   * one `journalReader` for the value's life, so a read costs a `stat` and the bytes appended since this value last read it.
   *
   * `lockWaitMs` is how long a write waits for the feed's lock before it refuses naming its holder, by default the shipped
   * `FEED_LOCK_WAIT_MS`: a parameter so that a test of what a held lock does can shorten it rather than wait the shipped one out.
   */
  static filesOps = (root: string, lockWaitMs = FEED_LOCK_WAIT_MS): BodiedJournalOps => {
    const dir = path.join(root, 'tasks');
    const file = (id: string) => path.join(dir, `${id}.jsonl`);
    const feedFile = path.join(root, 'feed.jsonl');
    const fail = (taskId: string) => (cause: unknown) =>
      new JournalError({ taskId, message: cause instanceof Error ? cause.message : String(cause) });
    const journals = journalReader();

    return {
      bodies: filesBodies(root),
      located: { journal: file, feed: feedFile },
      /**
       * The task's journal, then the feed, in the one call every writer makes, so no writer can forget the feed, holding the
       * feed's lock (`withFeedLock`), so no rotation drops a line written meanwhile. The task file is the source of truth; the
       * feed is its index. Refused for a task with no journal, but by its `filed`: a task forgotten is not written to again.
       */
      append: (taskId, event) =>
        Effect.try({
          try: () =>
            withFeedLock(
              root,
              () => {
                fs.mkdirSync(dir, { recursive: true });
                if (event.kind !== 'filed' && !fs.existsSync(file(taskId))) throw new Error(forgottenWords(taskId, file(taskId)));
                fs.appendFileSync(file(taskId), JSON.stringify(event) + '\n');
                countWrite();
                fs.appendFileSync(feedFile, JSON.stringify({ taskId, event }) + '\n');
                countWrite();
              },
              lockWaitMs,
            ),
          catch: fail(taskId),
        }),
      read: (taskId) => Effect.try({ try: () => journals(file(taskId)), catch: fail(taskId) }),
      list: Effect.try({
        try: () =>
          fs.existsSync(dir)
            ? fs
                .readdirSync(dir)
                .filter((f) => f.endsWith('.jsonl'))
                .map((f) => f.slice(0, -6))
                .sort()
            : [],
        catch: fail('*'),
      }),

      /**
       * The feed after `after` to its last complete line (`readFeed`): a reader never consumes half an entry, the cursor never
       * advances past what was read, and a rotation moves no cursor.
       */
      feed: (after) => Effect.try({ try: () => readFeed(root, after), catch: fail('*') }),
      /** Each task's lines in the feed, counted off one read of it (`feedLinesOf`). */
      feedLines: (taskIds) => Effect.try({ try: () => feedLinesOf(root, taskIds), catch: fail('*') }),
      /** The tasks' lines out of the feed (`rotateFeed`), each task's counted, then, under the feed's lock still, their journals. */
      forget: (taskIds) =>
        Effect.try({
          try: () =>
            rotateFeed(
              root,
              new Set(taskIds),
              () => {
                for (const id of taskIds) fs.rmSync(file(id), { force: true });
              },
              lockWaitMs,
            ),
          catch: fail('*'),
        }),

      /**
       * `fs.watch` on the directory holding the feed, which the OS signals on a write to the file: not the mechanism — `feed`
       * is — only what skips the wait. A directory that cannot be watched gives no signal.
       */
      subscribe: (onChange) => {
        try {
          fs.mkdirSync(root, { recursive: true });
          const watcher = fs.watch(root, (_e, name) => {
            if (!name || name === 'feed.jsonl') onChange();
          });
          return () => watcher.close();
        } catch {
          return () => {};
        }
      },
    };
  };

  /**
   * In memory, for tests: a store that keeps bodies, or, given `bodies: false`, one that keeps each event whole, as an
   * implementor's plain store does.
   */
  static test = ({ bodies = true }: { bodies?: boolean } = {}) => {
    const store = new Map<string, unknown[]>();
    const feed: ({ taskId: string; event: unknown } | undefined)[] = [];
    const kept: BodyOps = memoryBodies();
    const append = (taskId: string, event: unknown) =>
      Effect.sync(() => {
        store.set(taskId, [...(store.get(taskId) ?? []), event]);
        feed.push({ taskId, event });
      });
    const reads = {
      read: (taskId: string) => Effect.sync(() => [...(store.get(taskId) ?? [])]),
      list: Effect.sync(() => [...store.keys()].sort()),
      /** The cursor is an index into the feed rather than a byte offset: the same contract, a forgotten line a hole kept in place. */
      feed: (after: Cursor) =>
        Effect.sync(() => {
          const rest = feed.slice(after);
          const entries = rest.filter((entry) => entry !== undefined);
          const forgotten = rest.length - entries.length;
          return { entries, cursor: feed.length, ...(forgotten ? { forgotten } : {}) };
        }),
      /** The tasks' journals gone, and each of their lines a hole: no bytes to say. */
      forget: (taskIds: readonly string[]) =>
        Effect.sync(() => {
          for (const id of taskIds) store.delete(id);
          feed.forEach((entry, i) => {
            if (entry && taskIds.includes(entry.taskId)) feed[i] = undefined;
          });
          return undefined;
        }),
    };
    return Journal.layer(bodies ? { ...reads, append, bodies: kept } : { ...reads, append });
  };
}
