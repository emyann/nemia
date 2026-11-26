/**
 * The Ledger door: the one way a program reads and appends to the revisions ledger — an Effect service, `LedgerDoor`, whose methods take
 * what a ledger is kept for as a `RevisionOf` (a kind and a name) and answer an Effect failing with a refusal.
 *
 * The ledger is one record of the keyspace per kind and name, `/registry/revisions/<kind>/<name>` (the name escaped by
 * `encodeURIComponent`, since a skill's holds a folder and a colon), holding that content's entries in order. An append reads the record
 * and writes it in one transaction, keyed by the digest — a content already in the ledger keeps the number it was given (`revisionNow`)
 * — so two passes resolving the same edit at once give it one number, and two resolving different edits give them two numbers in turn.
 *
 * The rooted door and the memory stand-in (`ledgerDoorMemory`, `memory.store.ts`, over a keyspace in memory) are both `ledgerRecords`
 * under `ledgerDoorOver`, so an append is checked the one way on both: its kind and name, its digest and its time, as the model's
 * `Revision` holds them (`RevisionAppended`), or `Invalid` and nothing is written. A stored entry is read nominally (`RevisionOnRead`),
 * so a ledger written before the check still reads. The walks of `test/ledger-walks.ts` hold both to one table. A store's ledger files of
 * before the keyspace (`<root>/revisions/<kind>/<name>.json`) are imported once by the kind's import (`LEDGER_FILES`,
 * `src/keyspace/import.store.ts`) and moved aside under `<root>/imported/`.
 *
 * The door's default is rooted (`rootedDoor`). `ledgerOf` is its synchronous read at the root `home` it is handed, a test's; no file of
 * `src` calls it (`src/revisions/revisions.store.test.ts`).
 */
import path from 'node:path';
import { Context, Effect, Option, Schema } from 'effect';
import { revisionNow, REVISION_KINDS, type Revision, type RevisionKind } from './revisions.ts';
import { RevisionAppended, RevisionOnRead, type RevisionOf } from './revisions.model.ts';
import { checked, rootedDoor } from '../door/door.store.ts';
import { asideOf, kindKeyspace, kindKeyspaceHeld, namesIn, type ImportKind } from '../keyspace/import.store.ts';
import type { Keyspace } from '../keyspace/keyspace.store.ts';
import { Conflict, Invalid, type Refusal } from '../refusal/refusal.ts';

export type { RevisionOf } from './revisions.model.ts';

/**
 * What a run or one of its steps resolved of one kind and name (`Pin`), as a record keeps it: absent where nothing was resolved, and each
 * entry kept whole, so a pin a newer tick writes more of comes back as it was written.
 */
export const Pins = Schema.optional(
  Schema.mutable(
    Schema.Array(
      Schema.StructWithRest(
        Schema.Struct({ kind: Schema.Literals([...REVISION_KINDS]), name: Schema.String, n: Schema.Number, hash: Schema.String }),
        [Schema.Record(Schema.String, Schema.Unknown)],
      ),
    ),
  ),
);

/** The Ledger door's shape: a ledger's entries, read and appended to. */
export type LedgerDoorShape = {
  readonly entries: {
    /**
     * The entries kept for `of`, in the order they were given: `[]` for a ledger that is not there, does not read as JSON, or holds no
     * list, so a record nobody can read gives the next resolve revision 1 again rather than stopping the pass. An entry that does not
     * read as one is left out; one that does is kept whole.
     */
    readonly of: (of: RevisionOf) => Effect.Effect<Revision[], Refusal>;
    /**
     * The revision `hash` stands at for `of`, appended when the content is new, and answered either way (`revisionNow`). Appends nothing
     * for a content the ledger already holds: an edit gets its number the first time anyone resolves it, and resolving again writes
     * nothing.
     */
    readonly append: (of: RevisionOf, hash: string, at: string) => Effect.Effect<Revision, Refusal>;
  };
};

/** An append's kind, name, digest and time, as the model's `Revision` holds them. */
const appendChecked = checked(
  RevisionAppended,
  (a: { kind: string; name: string }) => `a revision of the ${String(a.kind)} ${JSON.stringify(a.name)}`,
);

/**
 * The door over `door`: an append checked before it is written.
 * @param door The ledger as the door's shape, read and appended to through.
 */
export function ledgerDoorOver(door: LedgerDoorShape) {
  return {
    ...door,
    entries: {
      ...door.entries,
      append: (of, hash, at) =>
        Effect.andThen(appendChecked({ kind: of.kind, name: of.name, hash, at }), door.entries.append(of, hash, at)),
    },
  } satisfies LedgerDoorShape;
}

/** Whether `value` reads as one entry of a ledger, nominally. */
const isRevision = Schema.is(RevisionOnRead);

/** The keyspace's prefix of every ledger. */
const PREFIX = '/registry/revisions/';

/** The key a kind and name's entries are kept at, its name escaped (`encodeURIComponent`). */
const keyOf = ({ kind, name }: RevisionOf) => `${PREFIX}${kind}/${encodeURIComponent(name)}`;

/** The entries the text of a ledger's record holds, or none where it does not read as a list. */
const listIn = (text: string) =>
  Option.map(Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Schema.Unknown)))(text), (list) => list.filter(isRevision));

/**
 * The entries the ledger at `key` holds, as an append reads them: refused `Invalid` where its record holds no list, which `entries.of`
 * reads as an empty ledger, so a ledger that does not read is never numbered again from 1.
 */
const entriesIn = (key: string, text: string) => {
  const read = listIn(text);
  return Option.isSome(read)
    ? Effect.succeed(read.value)
    : Effect.fail(
        new Invalid({
          message: `the ledger at ${key} does not read as a list of revisions: nothing was numbered. Say so to whoever keeps this nemia.`,
        }),
      );
};

/**
 * The ledger of the keyspace `open` opens when a method runs, as the door's shape. A read asks `held`, and answers none where it answers
 * no keyspace, so a store read is not a store made.
 * @param open Opens the keyspace the ledger is held in, refused as opening it is.
 * @param held The keyspace a read reads, or undefined where the store holds none yet; `open` where every read may make it.
 */
export function ledgerRecords(open: Effect.Effect<Keyspace, Refusal>, held: Effect.Effect<Keyspace | undefined, Refusal> = open) {
  return {
    entries: {
      of: (of) =>
        Effect.gen(function* () {
          const keyspace = yield* held;
          const record = keyspace === undefined ? undefined : yield* keyspace.get(keyOf(of));
          return record === undefined ? [] : Option.getOrElse(listIn(record.value), () => []);
        }),
      append: (of, hash, at) =>
        Effect.gen(function* () {
          const keyspace = yield* open;
          const key = keyOf(of);
          return yield* keyspace
            .within((tx) =>
              Effect.gen(function* () {
                const there = yield* tx.get(key);
                const stored = there === undefined ? [] : yield* entriesIn(key, there.value);
                const now = revisionNow(stored, hash, at);
                if (stored.includes(now)) return now;
                yield* tx.write(key, {
                  verb: there === undefined ? 'create' : 'update',
                  expected: null,
                  value: JSON.stringify([...stored, now]),
                });
                return now;
              }),
            )
            .pipe(
              Effect.mapError((err) =>
                err._tag === 'Invalid'
                  ? err
                  : err.refusal === 'too-large'
                    ? new Invalid({
                        message: `the ledger of the ${of.kind} ${of.name} is larger than a record holds: say so to whoever keeps this nemia.`,
                      })
                    : new Conflict({ message: `${err.key} was written by another while it was appended to: run again.` }),
              ),
            );
        }),
    },
  } satisfies LedgerDoorShape;
}

/**
 * The ledger files of a store from before the keyspace, `revisions/<kind>/<name>.json` (the name escaped as the key's is): what the kind's
 * import takes up, as they were, at `/registry/revisions/<kind>/<name>`. A file that holds no list stays where it is.
 */
export const LEDGER_FILES: ImportKind = {
  name: 'revisions',
  folders: (home) => [path.join(home, 'revisions'), ...REVISION_KINDS.map((kind) => path.join(home, 'revisions', kind))],
  files: (home) =>
    REVISION_KINDS.flatMap((kind) =>
      namesIn(path.join(home, 'revisions', kind), '.json').map((escaped) => {
        const file = path.join(home, 'revisions', kind, `${escaped}.json`);
        return {
          file,
          key: `${PREFIX}${kind}/${escaped}`,
          aside: asideOf(home, file),
          read: (text: string) => {
            const read = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Schema.Unknown)))(text);
            return Option.isSome(read) ? { value: JSON.stringify(read.value) } : { unreadable: 'it holds no list of entries' };
          },
        };
      }),
    ),
};

/** The Ledger door over the keyspace at the store `root`. */
const ledgerAt = (root: string) => ledgerDoorOver(ledgerRecords(kindKeyspace(root, LEDGER_FILES), kindKeyspaceHeld(root, LEDGER_FILES)));

/**
 * The Ledger door, as the service a program yields: a reference whose default is rooted (`rootedDoor`) — the door over the keyspace at
 * the store's root the program is given, refused `Invalid` where it was given none — and a test gives `ledgerDoorMemory()` with no root.
 */
export const LedgerDoor = Context.Reference<LedgerDoorShape>('agent-orchestrator/LedgerDoor', {
  defaultValue: () => rootedDoor(ledgerAt, 'Ledger door'),
});

/**
 * The entries kept for `kind` and `name` at the root `home` (`entries.of`), read at once: a test's synchronous read.
 * @param home The store's folder.
 * @param kind The kind of definition.
 * @param name The definition's name.
 */
export const ledgerOf = (home: string, kind: RevisionKind, name: string) => Effect.runSync(ledgerAt(home).entries.of({ kind, name }));

/**
 * The ledger's number for what a definition holds now, by its digest (`version`), read through the Ledger door and never appended: the
 * number a run resolving that content was or would be given (`revisionNow`), so a read of a Workflow, an Agent or a Skill writes nothing.
 */
export const definitionRevision = Effect.fn('definitionRevision')(function* (kind: RevisionKind, name: string, version: string) {
  const entries = yield* (yield* LedgerDoor).entries.of({ kind, name });
  return revisionNow(entries, version, '').n;
});
