/**
 * The journal: append-only JSONL, one file per task.
 *
 * Append-only is not a storage choice, it is the model — the journal IS the desired state and the
 * history at once, so there is no row to update and therefore no write to get wrong. A task is a
 * file you can `cat`, `tail -f` and diff, which is worth more in a prototype than a query planner.
 *
 * It is a service (not an import) so tests run against memory and spend no filesystem.
 */
import { Context, Effect, Layer, Schema } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Event } from './domain.ts';

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
  readonly append: (taskId: string, event: Event) => Effect.Effect<void, JournalError>;
  readonly read: (taskId: string) => Effect.Effect<Event[], JournalError>;
  readonly list: Effect.Effect<string[], JournalError>;
  /**
   * Everything that has happened on this board since `after`, and where to resume.
   *
   * The cursor never expires: the feed is append-only, so a consumer that was away for a week
   * replays rather than being told to start over. Pass 0 to read the whole history.
   */
  readonly feed: (after: Cursor) => Effect.Effect<{ entries: FeedEntry[]; cursor: Cursor }, JournalError>;
};

export class Journal extends Context.Service<Journal, JournalOps>()('engine/Journal') {
  /** Any implementation becomes a Layer. This is the only way a store reaches the engine. */
  static layer = (ops: JournalOps) => Layer.succeed(Journal)(Journal.of(ops));

  /** Files under `root` (default `~/.agent-engine`). The default, and the standalone one. */
  static files = (root = path.join(os.homedir(), '.agent-engine')) => {
    const dir = path.join(root, 'tasks');
    const file = (id: string) => path.join(dir, `${id}.jsonl`);
    const feedFile = path.join(root, 'feed.jsonl');
    const fail = (taskId: string) => (cause: unknown) =>
      new JournalError({ taskId, message: cause instanceof Error ? cause.message : String(cause) });

    return Journal.layer({
      append: (taskId, event) =>
        Effect.try({
          try: () => {
            fs.mkdirSync(dir, { recursive: true });
            fs.appendFileSync(file(taskId), JSON.stringify(event) + '\n');
            // The feed is written on the same path as the journal, so it cannot be forgotten by
            // a future writer. The task file stays the source of truth; this is its index.
            fs.appendFileSync(feedFile, JSON.stringify({ taskId, event }) + '\n');
          },
          catch: fail(taskId),
        }),
      read: (taskId) =>
        Effect.try({
          try: () => {
            if (!fs.existsSync(file(taskId))) return [];
            return fs.readFileSync(file(taskId), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Event);
          },
          catch: fail(taskId),
        }),
      list: Effect.try({
        try: () => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => f.slice(0, -6)).sort() : []),
        catch: fail('*'),
      }),

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

            // Stop at the last COMPLETE line: a reader must never consume half an entry, and the
            // cursor must never advance past what was actually read.
            const text = buf.toString('utf8');
            const end = text.lastIndexOf('\n');
            if (end < 0) return { entries: [], cursor: after };
            const entries = text.slice(0, end).split('\n').filter(Boolean).map((l) => JSON.parse(l) as FeedEntry);
            return { entries, cursor: after + Buffer.byteLength(text.slice(0, end + 1)) };
          },
          catch: fail('*'),
        }),
    });
  };

  /** In memory, for tests. */
  static test = () => {
    const store = new Map<string, Event[]>();
    const feed: FeedEntry[] = [];
    return Journal.layer({
      append: (taskId, event) => Effect.sync(() => {
        store.set(taskId, [...(store.get(taskId) ?? []), event]);
        feed.push({ taskId, event });
      }),
      read: (taskId) => Effect.sync(() => [...(store.get(taskId) ?? [])]),
      list: Effect.sync(() => [...store.keys()].sort()),
      // In memory the cursor is an index rather than a byte offset — same contract either way.
      feed: (after) => Effect.sync(() => ({ entries: feed.slice(after), cursor: feed.length })),
    });
  };
}
