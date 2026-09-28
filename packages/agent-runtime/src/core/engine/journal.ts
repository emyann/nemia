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
import os from 'node:os';
import type { Event } from '../domain.ts';
import {
  entryWords,
  HarnessArgsSchema,
  StoredEventSchema,
  StoredEventsSchema,
  StoredFeedEntrySchema,
  type StoredEvent,
} from '../event-schema.ts';
import { FORMER_ARGS, HARNESS_ARGS, type HarnessArgs } from '../../harness/args.ts';
import { countRead, readText } from './tally.ts';

/**
 * One entry of the board-wide feed: an event, and which task it happened to.
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
 */
export type JournalOps = {
  /**
   * Write `event` to the task's record, and to the feed: every append, by every writer. An engine's pass skips a settled
   * task it has folded until the feed names it (`core/engine/memo.ts`), so an entry that reaches the record and not the feed is
   * not read by a running engine — only by the next one made.
   */
  readonly append: (taskId: string, event: Event) => Effect.Effect<void, JournalError>;
  readonly read: (taskId: string) => Effect.Effect<Event[], JournalError>;
  readonly list: Effect.Effect<string[], JournalError>;
  /**
   * Everything that has happened on this board since `after`, and where to resume.
   *
   * The cursor never expires: the feed is append-only, so a consumer that was away for a week
   * replays rather than being told to start over. Pass 0 to read the whole history.
   */
  readonly feed: (after: Cursor) => Effect.Effect<{ entries: FeedEntry[]; cursor: Cursor; refused?: FeedRefusal[] }, JournalError>;
  /**
   * Optional: call `onChange` when something has been appended, so a watcher can read instead of
   * poll. A store that cannot signal simply omits this and watchers fall back to a timer — the
   * same shape as everything else here, where a change is a HINT and re-reading is the mechanism.
   * Missing a signal costs latency and nothing else.
   */
  readonly subscribe?: (onChange: () => void) => () => void;
};

/**
 * A store as the runtime reads it: what `read` and `feed` give back is whatever the store holds, parsed, and is an event
 * only once `Journal.layer` has decoded it. A `JournalOps` is one; the files store is one that never says its lines are events.
 */
export type StoreOps = Omit<JournalOps, 'read' | 'feed'> & {
  readonly read: (taskId: string) => Effect.Effect<readonly unknown[], JournalError>;
  readonly feed: (after: Cursor) => Effect.Effect<{ entries: readonly unknown[]; cursor: Cursor }, JournalError>;
  /** Optional: where the store keeps a task's journal and the feed, named in the words of an entry no runtime wrote. */
  readonly located?: { readonly journal: (taskId: string) => string; readonly feed: string };
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

/**
 * A store's feed entries, those no runtime wrote left out: each is skipped with why (`FeedRefusal`), and the cursor is past it all the
 * same, so one entry nobody can read stops no reader and no pass. The task it names, when it names one, is still named: its journal is
 * read again, and says for itself whether it reads.
 */
const decodeFeed = (raw: readonly unknown[], after: Cursor, located: StoreOps['located']) => {
  const entries: FeedEntry[] = [];
  const refused: FeedRefusal[] = [];
  raw.forEach((entry, index) => {
    if (isFeedEntry(entry)) {
      entries.push({ taskId: entry.taskId, event: upgrade(entry.event) });
      return;
    }
    const where = `the feed${located ? ` (${located.feed})` : ''}, entry ${index + 1} read from cursor ${after}`;
    const error = refusalOf(StoredFeedEntrySchema, entry);
    const taskId = typeof entry === 'object' && entry !== null && 'taskId' in entry ? entry.taskId : undefined;
    refused.push({
      ...(typeof taskId === 'string' ? { taskId } : {}),
      why: error ? entryWords(where, entry, error, true) : `${where} is not what the runtime writes.`,
    });
  });
  return { entries, refused };
};

/** Harness arguments `upgrade` put together from ones already read as such: the same object, typed. */
const argsOf = (config: Record<string, unknown>): HarnessArgs =>
  Schema.is(HarnessArgsSchema)(config) ? config : Schema.decodeUnknownSync(HarnessArgsSchema)(config);

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
 * - A former harness argument that a flag of Claude Code's replaces (`FORMER_ARGS`: `remoteControl`, a bridge to
 *   claude.ai), under `config` or at a `filed` event's top level: moved into `config.claude` — `true` as the flag, where a
 *   flag already in `claude` is kept, and `false`, which asked for nothing, dropped. So a task filed bridged is bridged
 *   again on its next attempt.
 */
export const upgrade = (event: StoredEvent): Event => {
  if (event.kind === 'input') {
    const { budgetUsd, ...rest } = event;
    if (budgetUsd === undefined) return rest;
    return { ...rest, config: { budgetUsd, ...rest.config } };
  }
  if (event.kind === 'ended') {
    if (event.reason !== 'budget') return { ...event, reason: event.reason };
    return { ...event, reason: 'harness', limit: 'budget' };
  }
  if (event.kind !== 'filed') return event;
  const legacy: Record<string, unknown> = event;
  const moved = [...HARNESS_ARGS, ...Object.keys(FORMER_ARGS)].filter((key) => Object.hasOwn(legacy, key));
  const given: Record<string, unknown> = event.config ?? {};
  const former = Object.keys(FORMER_ARGS).filter((key) => Object.hasOwn(given, key));
  if (!moved.length && !former.length) return event;
  const lifted: Record<string, unknown> = {};
  const { config: _, ...rest } = event;
  const left: Record<string, unknown> = rest;
  for (const key of moved) {
    if (legacy[key] !== undefined) lifted[key] = legacy[key];
    delete left[key];
  }
  const config: Record<string, unknown> = { ...lifted, ...given };
  const flags: Record<string, unknown> = {};
  for (const key of Object.keys(FORMER_ARGS)) {
    if (config[key] === true) flags[FORMER_ARGS[key]] = true;
    delete config[key];
  }
  if (Object.keys(flags).length) config.claude = { ...flags, ...event.config?.claude };
  return { ...rest, ...(Object.keys(config).length ? { config: argsOf(config) } : {}) };
};

export class Journal extends Context.Service<Journal, JournalOps>()('engine/Journal') {
  /**
   * Any implementation becomes a Layer. This is the only way a store reaches the engine — and so where what a store gives
   * back is decoded (`event-schema.ts`): an entry no runtime wrote in a task's journal fails that task's read with a
   * `JournalError` that names it, and one in the feed is skipped, said on the read's `refused`; and
   * where an event in a former shape is read in the one the runtime reads (`upgrade`), whoever's store it is.
   */
  static layer = (ops: StoreOps) =>
    Layer.succeed(Journal)(
      Journal.of({
        ...ops,
        read: (taskId) =>
          ops.read(taskId).pipe(
            Effect.flatMap((raw) => decodeEvents(taskId, raw, ops.located)),
            Effect.map((events) => events.map(upgrade)),
          ),
        feed: (after) =>
          ops.feed(after).pipe(
            Effect.map(({ entries, cursor }) => {
              const { entries: read, refused } = decodeFeed(entries, after, ops.located);
              return { entries: read, cursor, ...(refused.length ? { refused } : {}) };
            }),
          ),
      }),
    );

  /** Files under `root` (default `~/.agent-engine`). The default, and the standalone one. */
  static files = (root?: string) => Journal.layer(Journal.filesOps(root));

  /**
   * The same implementation as a plain value, for a caller that needs its optional `subscribe`. A line is read as its JSON,
   * or as its text where it is none — a write cut short — for the decoder to refuse by place.
   */
  static filesOps = (root = path.join(os.homedir(), '.agent-engine')): StoreOps => {
    const dir = path.join(root, 'tasks');
    const file = (id: string) => path.join(dir, `${id}.jsonl`);
    const feedFile = path.join(root, 'feed.jsonl');
    const fail = (taskId: string) => (cause: unknown) =>
      new JournalError({ taskId, message: cause instanceof Error ? cause.message : String(cause) });
    const parsed = (line: string): unknown => {
      try {
        return JSON.parse(line);
      } catch {
        return line;
      }
    };

    return {
      located: { journal: file, feed: feedFile },
      /**
       * The task's journal, then the feed, in the one call every writer makes, so no writer can forget the feed. The task
       * file is the source of truth; the feed is its index.
       */
      append: (taskId, event) =>
        Effect.try({
          try: () => {
            fs.mkdirSync(dir, { recursive: true });
            fs.appendFileSync(file(taskId), JSON.stringify(event) + '\n');
            fs.appendFileSync(feedFile, JSON.stringify({ taskId, event }) + '\n');
          },
          catch: fail(taskId),
        }),
      read: (taskId) =>
        Effect.try({
          try: () => {
            if (!fs.existsSync(file(taskId))) return [];
            return readText(file(taskId)).split('\n').filter(Boolean).map(parsed);
          },
          catch: fail(taskId),
        }),
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
       * The feed from byte `after` to its last complete line: a reader never consumes half an entry, and the cursor never
       * advances past what was read.
       */
      feed: (after) =>
        Effect.try({
          try: () => {
            if (!fs.existsSync(feedFile)) return { entries: [], cursor: after };
            const size = fs.statSync(feedFile).size;
            if (after >= size) return { entries: [], cursor: size };

            const fd = fs.openSync(feedFile, 'r');
            const buf = Buffer.alloc(size - after);
            fs.readSync(fd, buf, 0, buf.length, after);
            fs.closeSync(fd);
            countRead(buf.length);

            const text = buf.toString('utf8');
            const end = text.lastIndexOf('\n');
            if (end < 0) return { entries: [], cursor: after };
            const entries = text.slice(0, end).split('\n').filter(Boolean).map(parsed);
            return { entries, cursor: after + Buffer.byteLength(text.slice(0, end + 1)) };
          },
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

  /** In memory, for tests. */
  static test = () => {
    const store = new Map<string, Event[]>();
    const feed: FeedEntry[] = [];
    return Journal.layer({
      append: (taskId, event) =>
        Effect.sync(() => {
          store.set(taskId, [...(store.get(taskId) ?? []), event]);
          feed.push({ taskId, event });
        }),
      read: (taskId) => Effect.sync(() => [...(store.get(taskId) ?? [])]),
      list: Effect.sync(() => [...store.keys()].sort()),
      /** The cursor is an index into the feed rather than a byte offset: the same contract. */
      feed: (after) => Effect.sync(() => ({ entries: feed.slice(after), cursor: feed.length })),
    });
  };
}
