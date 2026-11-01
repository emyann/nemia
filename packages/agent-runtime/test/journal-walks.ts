/**
 * The Task door's contract, as walks: `JOURNAL_WALKS` holds, for every method of the door (`JournalShape`,
 * `src/core/engine/journal.ts`), the sequences it is asked and the one answer each must give, written once and run on the files layer
 * and on both memory layers (`journal-walks.test.ts`) through `walksOn`, so no layer drifts from another. A task's invariants, which
 * the door refuses before any store is written (`appendRefusal`), are each a walk of `append`.
 *
 * The runtime's own runner, as `engine-walks.ts` is: the orchestrator's (`test/door-walks.ts`) is a layer above, which the runtime does
 * not reach. Hoisting one runner below both is the candidate move `docs/architecture.md` names.
 *
 * What a walk answers is compared as `told` tells it: a refusal as its tag and its reason (`asked`), never its words, and a feed's
 * cursor never by its value, which is a byte offset on files and an index in memory: a walk reads after a cursor it was given, and
 * says what it read. `LAYER_ONLY` names the methods no walk can ask the same of every layer; `unwalked` names a method in neither.
 */
import assert from 'node:assert/strict';
import { Cause, Effect, Exit } from 'effect';
import type { Event } from '../src/core/domain.ts';
import type { JournalShape } from '../src/core/engine/journal.ts';
import { TaskId } from '../src/core/model.ts';

/** One side of the contract: a door over a store nothing has written to. */
export type Side = { readonly journal: JournalShape };

/** One walk: what it shows, the sequence it asks of a side, and the one answer every side gives, as `told` tells it. */
export type Walk = { readonly name: string; readonly walk: (side: Side) => Promise<unknown>; readonly says: unknown };

/** What a method answers: its answer, `null` for none, or `{ refused, reason }` naming the tag it failed with and its reason. */
export async function asked<A, E>(verb: Effect.Effect<A, E>): Promise<A | null | { refused: string; reason?: string }> {
  const exit = await Effect.runPromiseExit(verb);
  if (Exit.isSuccess(exit)) return exit.value ?? null;
  const failed = Cause.squash(exit.cause) as { _tag?: string; message?: string; reason?: string };
  if (failed._tag === undefined) throw new Error(`a method died: ${failed.message}`);
  return { refused: failed._tag, ...(failed.reason === undefined ? {} : { reason: failed.reason }) };
}

/** What a walk answered, as every side says it: its JSON. */
export const told = (value: unknown): unknown => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

const AT = '2026-10-01T00:00:00.000Z';
const id = (name: string) => TaskId.read(name);
/** A task's filing, its brief long enough that a store keeping bodies keeps it apart. */
const filing = (name: string): Event => ({ kind: 'filed', at: AT, brief: `do ${name} `.repeat(40), cwd: '/r', queued: false });
const start = (attempt: number): Event => ({ kind: 'starting', at: AT, attempt });
const spawned = (attempt: number): Event => ({ kind: 'spawned', at: AT, attempt });

/** `name` filed, through the door, its brief cut in two. */
const file = ({ journal }: Side, name: string) => {
  const event = filing(name);
  const brief = event.kind === 'filed' ? event.brief : '';
  return asked(journal.append(id(name), event, [brief.slice(0, 10), brief.slice(10)]));
};
/** What the door reads of `name`: each entry's kind, and its attempt where it has one. */
const kinds = async ({ journal }: Side, name: string) =>
  (await Effect.runPromise(journal.read(id(name)))).map((e) => ('attempt' in e ? `${e.kind} ${e.attempt}` : e.kind));
/** The feed after `after`, as `<task> <kind>` lines. */
const fed = async ({ journal }: Side, after: number) => {
  const read = await Effect.runPromise(journal.feed(after));
  return { lines: read.entries.map((e) => `${e.taskId} ${e.event.kind}`), cursor: read.cursor, forgotten: read.forgotten ?? 0 };
};
const listed = ({ journal }: Side) => Effect.runPromise(journal.list);
const forgetOf = (side: Side) => {
  const { forget } = side.journal;
  if (!forget) throw new Error('this layer has no forget');
  return forget;
};
const feedLinesOf = (side: Side) => {
  const { feedLines } = side.journal;
  if (!feedLines) throw new Error('this layer has no feedLines');
  return feedLines;
};

const APPEND: readonly Walk[] = [
  {
    name: 'a filing opens a task: it reads back, is listed, and is fed',
    walk: async (side) => [await file(side, 'a'), await kinds(side, 'a'), await listed(side), (await fed(side, 0)).lines],
    says: [null, ['filed'], ['a'], ['a filed']],
  },
  {
    name: 'filed-twice: a second filing of a task is refused, and its first stands alone',
    walk: async (side) => [await file(side, 'a'), await file(side, 'a'), await kinds(side, 'a'), (await fed(side, 0)).lines],
    says: [null, { refused: 'JournalError', reason: 'filed-twice' }, ['filed'], ['a filed']],
  },
  {
    name: 'not-filed: an entry to a task never filed is refused, and nothing is written',
    walk: async (side) => [await asked(side.journal.append(id('b'), start(1))), await listed(side), (await fed(side, 0)).lines],
    says: [{ refused: 'JournalError', reason: 'not-filed' }, [], []],
  },
  {
    name: 'malformed-id: a filing under an id no file can be named by is refused, and nothing is written',
    walk: async (side) => [await file(side, 'a/b'), await file(side, '..'), await file(side, ''), await listed(side)],
    says: [
      { refused: 'JournalError', reason: 'malformed-id' },
      { refused: 'JournalError', reason: 'malformed-id' },
      { refused: 'JournalError', reason: 'malformed-id' },
      [],
    ],
  },
  {
    name: 'attempt-out-of-order: a start is taken only as the count of starts plus one',
    walk: async (side) => {
      const at = (n: number) => asked(side.journal.append(id('a'), start(n)));
      return [await file(side, 'a'), await at(2), await at(1), await at(1), await at(2), await kinds(side, 'a')];
    },
    says: [
      null,
      { refused: 'JournalError', reason: 'attempt-out-of-order' },
      null,
      { refused: 'JournalError', reason: 'attempt-out-of-order' },
      null,
      ['filed', 'starting 1', 'starting 2'],
    ],
  },
  {
    name: 'not-filed: a forgotten task is not written to again',
    walk: async (side) => {
      await file(side, 'a');
      await Effect.runPromise(forgetOf(side)([id('a')]));
      return [await asked(side.journal.append(id('a'), spawned(1))), await listed(side)];
    },
    says: [{ refused: 'JournalError', reason: 'not-filed' }, []],
  },
];

const READ: readonly Walk[] = [
  {
    name: 'a task never filed reads as no entries, not an error',
    walk: (side) => kinds(side, 'nope'),
    says: [],
  },
  {
    name: 'entries read back in the order they were appended, the brief whole',
    walk: async (side) => {
      await file(side, 'a');
      for (const event of [start(1), spawned(1), start(2)]) await Effect.runPromise(side.journal.append(id('a'), event));
      const events = await Effect.runPromise(side.journal.read(id('a')));
      const first = events[0];
      return [await kinds(side, 'a'), first?.kind === 'filed' && first.brief === (filing('a') as { brief: string }).brief];
    },
    says: [['filed', 'starting 1', 'spawned 1', 'starting 2'], true],
  },
];

const LIST: readonly Walk[] = [
  {
    name: 'a store never written to lists no task',
    walk: (side) => listed(side),
    says: [],
  },
  {
    name: 'the tasks filed are listed by id, in order',
    walk: async (side) => {
      for (const name of ['c', 'a', 'b']) await file(side, name);
      return listed(side);
    },
    says: ['a', 'b', 'c'],
  },
];

const FEED: readonly Walk[] = [
  {
    name: 'a store never written to feeds nothing',
    walk: async (side) => (await fed(side, 0)).lines,
    says: [],
  },
  {
    name: 'the feed spans tasks, and a reader resumes exactly where its cursor stopped, each entry delivered once',
    walk: async (side) => {
      await file(side, 'u1');
      await file(side, 'u2');
      const first = await fed(side, 0);
      const caughtUp = await fed(side, first.cursor);
      await Effect.runPromise(side.journal.append(id('u1'), start(1)));
      const next = await fed(side, first.cursor);
      const again = await fed(side, next.cursor);
      return [first.lines, caughtUp.lines, caughtUp.cursor === first.cursor, next.lines, again.lines];
    },
    says: [['u1 filed', 'u2 filed'], [], true, ['u1 starting'], []],
  },
  {
    name: 'a cursor past the end reads nothing and answers the end',
    walk: async (side) => {
      await file(side, 'a');
      const end = (await fed(side, 0)).cursor;
      const past = await fed(side, Number.MAX_SAFE_INTEGER);
      return [past.lines, past.cursor === end];
    },
    says: [[], true],
  },
];

const FORGET: readonly Walk[] = [
  {
    name: "a forgotten task reads as none, is not listed, and its lines leave the feed, counted as forgotten after a cursor before them",
    walk: async (side) => {
      await file(side, 'a');
      await file(side, 'b');
      await Effect.runPromise(side.journal.append(id('a'), start(1)));
      await Effect.runPromise(forgetOf(side)([id('a')]));
      const after = await fed(side, 0);
      return [await kinds(side, 'a'), await listed(side), after.lines, after.forgotten];
    },
    says: [[], ['b'], ['b filed'], 2],
  },
];

const FEED_LINES: readonly Walk[] = [
  {
    name: "each task's lines in the feed are counted, a task with none 0, and a forgotten one's no more",
    walk: async (side) => {
      await file(side, 'a');
      await file(side, 'b');
      await Effect.runPromise(side.journal.append(id('a'), start(1)));
      const before = await Effect.runPromise(feedLinesOf(side)([id('a'), id('b'), id('c')]));
      await Effect.runPromise(forgetOf(side)([id('a')]));
      const after = await Effect.runPromise(feedLinesOf(side)([id('a'), id('b')]));
      return [before, after];
    },
    says: [
      { a: 2, b: 1, c: 0 },
      { a: 0, b: 1 },
    ],
  },
];

const SWEEP: readonly Walk[] = [
  {
    name: 'a sweep removes no body a journal names',
    walk: async (side) => {
      await file(side, 'a');
      const report = await Effect.runPromise(side.journal.sweep({ yes: true }));
      return [report.removable, report.removed, await kinds(side, 'a')];
    },
    says: [0, 0, ['filed']],
  },
];

const REMOVE_BODY: readonly Walk[] = [
  {
    name: 'a body that is not there is refused',
    walk: (side) => asked(side.journal.removeBody('0'.repeat(64) as never)),
    says: { refused: 'BodyRefused' },
  },
];

/** The contract: every walked method's walks. */
export const JOURNAL_WALKS = {
  append: APPEND,
  read: READ,
  list: LIST,
  feed: FEED,
  forget: FORGET,
  feedLines: FEED_LINES,
  sweep: SWEEP,
  removeBody: REMOVE_BODY,
} as const;

/**
 * The door's methods no walk asks the same of every layer: `subscribe` is a hint with no answer of its own (`fs.watch` on files, none in
 * memory), and a watcher reads the feed whatever it is told.
 */
export const LAYER_ONLY = ['subscribe'] as const;

/** The methods of `methods` that are neither walked in `walks` nor named in `layerOnly`. */
export const unwalked = (
  methods: readonly string[],
  walks: Readonly<Record<string, readonly Walk[] | undefined>> = JOURNAL_WALKS,
  layerOnly: readonly string[] = LAYER_ONLY,
): string[] => methods.filter((method) => !walks[method]?.length && !layerOnly.includes(method));

/** What `walk` answers on `side`, as every side says it. */
export const walked = async (walk: Walk, side: Side): Promise<unknown> => told(await walk.walk(side));

/** The walks a side `sideOf` makes, a new one for each, does not answer as the contract says, by `<method>: <walk>`. */
export async function failing(sideOf: () => Side): Promise<string[]> {
  const failed: string[] = [];
  for (const [method, walks] of Object.entries(JOURNAL_WALKS)) {
    for (const walk of walks) {
      try {
        assert.deepStrictEqual(await walked(walk, sideOf()), walk.says);
      } catch {
        failed.push(`${method}: ${walk.name}`);
      }
    }
  }
  return failed;
}

/** Every walk of the contract as a test of the side `sideOf` makes, a new one for each: its name, `<method>: <walk>`, and its body. */
export const walksOn = (sideOf: () => Side): (readonly [name: string, body: () => Promise<void>])[] =>
  Object.entries(JOURNAL_WALKS).flatMap(([method, walks]) =>
    walks.map((walk) => [`${method}: ${walk.name}`, async () => assert.deepStrictEqual(await walked(walk, sideOf()), walk.says)] as const),
  );
