/**
 * The Ledger door: the one way a program reads and appends to the revisions ledger — an Effect service, `LedgerDoor`, whose methods take
 * what a ledger is kept for as a `RevisionOf` (a kind and a name) and answer an Effect failing with a refusal. Its pattern is the Card
 * door's (`src/door/door.store.ts`).
 *
 * The ledger is one file per kind and name, `<root>/revisions/<kind>/<name>.json`, holding that content's entries in order. One file per
 * kind and name on purpose: a hand edit of one agent touches one file, and two passes resolving different kinds never contend. An append
 * is keyed by the digest — a content already in the ledger keeps the number it was given (`revisionNow`) — so two passes resolving the
 * same edit at once give it one number, not two.
 *
 * Two layers: the files (`ledgerFiles`) and the memory stand-in (`ledgerDoorMemory`, `memory.store.ts`), both built by `ledgerDoorOver`,
 * so an append is checked the one way on both: its kind and name, its digest and its time, as the model's `Revision` holds them
 * (`RevisionAppended`), or `Invalid` and nothing is written. A stored entry is read nominally (`RevisionOnRead`), so a ledger written
 * before the check still reads. The walks of `test/ledger-walks.ts` hold both layers to one table.
 *
 * The door's default is rooted (`rootedDoor`). `ledgerOf` and `appendRevision` are its synchronous spellings for the callers that are
 * not programs yet, over the files at the module's root (`test/ledger-door.baseline.ts` counts them, and only shrinks).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Context, Effect, Layer, Schema } from 'effect';
import { revisionNow, REVISION_KINDS, type Revision, type RevisionKind } from './revisions.ts';
import { RevisionAppended, RevisionOnRead, type RevisionOf } from './revisions.model.ts';
import { checked, doorOf, rootedDoor, type DoorOf } from '../door/door.store.ts';
import { wfRoot } from '../config/config.store.ts';

export type { RevisionOf } from './revisions.model.ts';

/** The store whose ledger this is, read once as the package loads, as `record.store.ts` reads its `HOME`. */
const ROOT = wfRoot();

/** Where the ledger lives: `$WF_ROOT/revisions`, beside `runs/`. */
export const revisionsDir = (): string => path.join(ROOT, 'revisions');

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

/** A layer of the Ledger door, as plain synchronous methods: a ledger's entries, read and appended to. */
export type LedgerLayer = {
  readonly entries: {
    /**
     * The entries kept for `of`, in the order they were given: `[]` for a ledger that is not there, does not read as JSON, or holds no
     * list — a hand edit of one kind leaves every other readable, and a file nobody can read gives the next resolve revision 1 again
     * rather than stopping the pass. An entry that does not read as one is left out; one that does is kept whole.
     */
    readonly of: (of: RevisionOf) => Revision[];
    /**
     * The revision `hash` stands at for `of`, appended when the content is new, and answered either way (`revisionNow`). Appends nothing
     * for a content the ledger already holds: an edit gets its number the first time anyone resolves it, and resolving again writes
     * nothing.
     */
    readonly append: (of: RevisionOf, hash: string, at: string) => Revision;
  };
};

/** The Ledger door's shape: each method of `LedgerLayer` answering an Effect. Its key is a struct, which `doorOf` leaves as it is. */
export type LedgerDoorShape = DoorOf<LedgerLayer, string>;

/** An append's kind, name, digest and time, as the model's `Revision` holds them. */
const appendChecked = checked(
  RevisionAppended,
  (a: { kind: string; name: string }) => `a revision of the ${String(a.kind)} ${JSON.stringify(a.name)}`,
);

/** The door over `layer`: each method as `doorOf` makes it, an append checked before the layer writes. */
export function ledgerDoorOver(layer: LedgerLayer): LedgerDoorShape {
  const door = doorOf<LedgerLayer, string>(layer);
  return {
    ...door,
    entries: {
      ...door.entries,
      append: (of, hash, at) =>
        Effect.andThen(appendChecked({ kind: of.kind, name: of.name, hash, at }), door.entries.append(of, hash, at)),
    },
  };
}

/** Whether `value` reads as one entry of a ledger, nominally. */
const isRevision = Schema.is(RevisionOnRead);

/** How many times an append reads the ledger again to find its own entry, before it answers with the entry it computed. */
const APPEND_TRIES = 5;

/**
 * The file in `dir` a kind and name's entries are kept in. The name is escaped (`encodeURIComponent`), since a skill's name holds a
 * folder and a colon (`apps/web:ds-build`) and would otherwise name a path of its own.
 */
const ledgerFile = (dir: string, { kind, name }: RevisionOf): string => path.join(dir, kind, `${encodeURIComponent(name)}.json`);

/** The entries written to `file`, whole, through a temporary file beside it so a reader never sees half of one. */
function writeLedger(file: string, entries: readonly Revision[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(entries, null, 2)}\n`);
  fs.renameSync(temp, file);
}

/** The entries `file` holds, as `LedgerLayer['entries']['of']` reads them. */
function entriesIn(file: string): Revision[] {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  try {
    const raw: unknown = JSON.parse(text);
    return Array.isArray(raw) ? raw.filter(isRevision) : [];
  } catch {
    return [];
  }
}

/** The ledger's files in the folder `dir` (`<root>/revisions`), as a layer of the door. */
function ledgerIn(dir: string): LedgerLayer {
  const of = (at: RevisionOf): Revision[] => entriesIn(ledgerFile(dir, at));
  return {
    entries: {
      of,
      /**
       * A pass that loses a race with another appending to the same file reads it again and keeps the entry that landed, so one content
       * is one number. After `APPEND_TRIES` reads that still do not hold it, the entry it computed is answered without being written: a
       * number said once is better than a pass that spins.
       */
      append: (at, hash, when) => {
        for (let tried = 0; tried < APPEND_TRIES; tried += 1) {
          const entries = of(at);
          const now = revisionNow(entries, hash, when);
          if (entries.includes(now)) return now;
          writeLedger(ledgerFile(dir, at), [...entries, now]);
        }
        return revisionNow(of(at), hash, when);
      },
    },
  };
}

/** The ledger's files of the store `root`, as a layer of the door. */
export const ledgerFiles = (root: string): LedgerLayer => ledgerIn(path.join(root, 'revisions'));

/**
 * The Ledger door, as the service a program yields: a reference whose default is rooted (`rootedDoor`) — the door over the files at the
 * store's root the program is given, refused `Invalid` where it was given none — and a test gives `ledgerDoorMemory()` with no root.
 */
export const LedgerDoor = Context.Reference<LedgerDoorShape>('agent-orchestrator/LedgerDoor', {
  defaultValue: () => rootedDoor((root) => ledgerDoorOver(ledgerFiles(root)), 'Ledger door'),
});

/** The Ledger door over the files of the store `root`, as a layer: for a program that names its root by the door, not by `StoreRoot`. */
export const ledgerDoorFiles = (root: string): Layer.Layer<never> => Layer.succeed(LedgerDoor)(ledgerDoorOver(ledgerFiles(root)));

/** An act of the door over the ledger at the module's root, run now: what it answers, or the refusal thrown. */
const atModuleRoot = <A>(act: (door: LedgerDoorShape) => Effect.Effect<A, unknown>): A =>
  Effect.runSync(act(ledgerDoorOver(ledgerIn(revisionsDir()))));

/** The entries kept for `kind` and `name` at the module's root (`LedgerLayer['entries']['of']`): the door's synchronous spelling. */
export const ledgerOf = (kind: RevisionKind, name: string): Revision[] => atModuleRoot((door) => door.entries.of({ kind, name }));

/**
 * The revision `hash` stands at for `kind` and `name` at the module's root, appended when new (`LedgerLayer['entries']['append']`): the
 * door's synchronous spelling, refused as the door refuses.
 */
export const appendRevision = (kind: RevisionKind, name: string, hash: string, at: string): Revision =>
  atModuleRoot((door) => door.entries.append({ kind, name }, hash, at));
