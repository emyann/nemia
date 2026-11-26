/**
 * A kind's import: the one way a door whose records moved into the keyspace (`keyspace.store.ts`) takes up the files a store kept of them
 * before, and names no aggregate. A kind (`ImportKind`) says the folders its files are in, how to list them, how one file reads (the key
 * it goes to, its record's value and the keys it points to) and where it is moved aside; `kindKeyspace` opens the store's keyspace with
 * its files imported, every file asked of `importAct` (`import.ts`, proved by `contracts/kind-import.contract.ts`) before anything is
 * written or moved, then each record whose key is not held made in one transaction, then each file read moved aside under
 * `<store>/imported/`, never over a file there and never deleted. A file over the keyspace's ceiling stops the import whole, refused
 * `Invalid` naming it; a file that does not read as its kind stays where it is, said in the log.
 *
 * Level-triggered, as the runs' import is (`src/runs/records.store.ts`, `runKeyspace`): the import is due whenever the kind's folders
 * moved since this process last imported them (their change times, the mark), so a file a person or an older process drops beside the
 * keyspace is imported at the next open. A failed import is not kept, so the next open imports again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Semaphore } from 'effect';
import { fromThrow } from '../door/door.store.ts';
import { Conflict, Invalid, type Refusal } from '../refusal/refusal.ts';
import { importAct, type FileRead } from './import.ts';
import { keyspaceAt, keyspaceFile, RECORD_CEILING, type Keyspace } from './keyspace.store.ts';

/** How one file of a kind reads: its record's value and the keys it points to, or why it is no record of its kind. */
export type KindRead = { readonly value: string; readonly points?: readonly string[] } | { readonly unreadable: string };

/** One file of a kind: where it is, the key its record goes to, where it is moved once imported, and how its text reads. */
export type KindFile = {
  readonly file: string;
  readonly key: string;
  readonly aside: string;
  readonly read: (text: string) => KindRead;
};

/**
 * A kind of record whose files a store kept before the keyspace: its name (one import per kind and store), the folders its files are in
 * (whose change times are the import's mark), its files as they are now, and the entries of its folders it never takes up, each with
 * why, which an import says in the log and leaves where they are.
 */
export type ImportKind = {
  readonly name: string;
  readonly folders: (home: string) => readonly string[];
  readonly files: (home: string) => readonly KindFile[];
  readonly strays?: (home: string) => readonly { readonly entry: string; readonly why: string }[];
};

/**
 * The names of the entries of `dir`, sorted; none where it cannot be listed.
 * @param dir The folder listed.
 */
export const entriesIn = (dir: string) => {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
};

/**
 * The names of the files of `dir` that end with `end`, without it, sorted; none where it cannot be listed.
 * @param dir The folder listed.
 * @param end The ending each name has, cut off.
 */
export const namesIn = (dir: string, end: string) => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith(end) && !d.name.startsWith('.'))
      .map((d) => d.name.slice(0, -end.length))
      .sort();
  } catch {
    return [];
  }
};

/**
 * Where the import moves a file of the store `home`: under `<home>/imported/`, at its path from the store's root.
 * @param home The store's root folder.
 * @param file The file moved.
 */
export const asideOf = (home: string, file: string) => path.join(home, 'imported', path.relative(home, file));

/** The text of `file`, or undefined where it is gone. */
const textOf = (file: string) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' || (err as NodeJS.ErrnoException).code === 'EISDIR') return undefined;
    throw err;
  }
};

/** Move `file` to `aside`, never over a file there: the first of `aside`, `aside.2`, … no file holds. One gone already is passed over. */
const moveAside = (file: string, aside: string) => {
  fs.mkdirSync(path.dirname(aside), { recursive: true });
  let to = aside;
  for (let k = 2; fs.existsSync(to) && k < 1000; k++) to = `${aside}.${k}`;
  try {
    fs.renameSync(file, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
};

/** A file as the import read it: its text, how it read, and its record where it reads. */
type Looked = { readonly one: KindFile; readonly read: FileRead; readonly size: number; readonly record?: KindRead };

/** How `one` reads now. */
const looked = (one: KindFile) => {
  const text = textOf(one.file);
  if (text === undefined) return { one, read: 'gone', size: 0 } satisfies Looked;
  const record = one.read(text);
  return { one, read: 'value' in record ? 'reads' : 'unreadable', size: Buffer.byteLength(text, 'utf8'), record } satisfies Looked;
};

/**
 * Import the store `home`'s files of `kind` into `keyspace`, once: every file asked first, the import stopped `Invalid` naming one over
 * the ceiling, then each record whose key is not held made in one transaction (its pointers kept where they name a live key), then each
 * file read moved aside; one that does not read stays, said in the log, as each of the kind's strays is. Answers how many records it made.
 * @param home The store's root folder.
 * @param kind The kind imported.
 * @param keyspace The store's keyspace.
 */
export const kindImported = Effect.fnUntraced(function* (home: string, kind: ImportKind, keyspace: Keyspace) {
  for (const stray of yield* fromThrow(() => kind.strays?.(home) ?? []))
    yield* Effect.logWarning(`${stray.entry} was not imported: ${stray.why}; move it aside, or remove it`);
  const files = yield* fromThrow(() => kind.files(home).map(looked));
  if (files.length === 0) return 0;
  const over = files.find((f) => importAct({ read: f.read, size: f.size, held: false }, RECORD_CEILING) === 'stop');
  if (over !== undefined)
    return yield* new Invalid({
      message: `${over.one.file} is larger than a record of the keyspace holds (${RECORD_CEILING} bytes): nothing was imported or moved; move it aside and run again.`,
    });
  const made = yield* keyspace
    .within((tx) =>
      Effect.gen(function* () {
        const moved: KindFile[] = [];
        let wrote = 0;
        for (const f of files) {
          const held = f.read === 'reads' && (yield* tx.get(f.one.key)) !== undefined;
          const doing = importAct({ read: f.read, size: f.size, held }, RECORD_CEILING);
          if (doing === 'leave' && f.record !== undefined && 'unreadable' in f.record)
            yield* Effect.logWarning(`${f.one.file} was not imported: ${f.record.unreadable}; move it aside, or remove it`);
          if (doing === 'aside') moved.push(f.one);
          if (doing !== 'write' || f.record === undefined || !('value' in f.record)) continue;
          const points: string[] = [];
          for (const target of f.record.points ?? []) if ((yield* tx.get(target)) !== undefined) points.push(target);
          yield* tx.write(f.one.key, { verb: 'create', expected: null, value: f.record.value, points });
          moved.push(f.one);
          wrote++;
        }
        return { moved, wrote };
      }),
    )
    .pipe(
      Effect.catchTag('KeyRefused', (err) =>
        Effect.fail(new Conflict({ message: `${err.key} was written while it was imported: run again.` }) satisfies Refusal as Refusal),
      ),
    );
  yield* fromThrow(() => {
    for (const one of made.moved) moveAside(one.file, one.aside);
  });
  return made.wrote;
});

/**
 * Where the store `home` keeps `kind`'s files stands, as its folders say: each one's change time and the names in it, so a file made
 * within the clock's tick of the last import still moves the mark.
 */
const markOf = (home: string, kind: ImportKind) =>
  kind
    .folders(home)
    .map((dir) => `${fs.statSync(dir, { bigint: true, throwIfNoEntry: false })?.mtimeNs ?? 0}/${entriesIn(dir).join('/')}`)
    .join(':');

/** The mark of each kind's folders of each store as this process last imported them, by kind and root. */
const IMPORTED = new Map<string, string>();

/** One import at a time, so two fibers opening one store import it once. */
const IMPORTING = Semaphore.makeUnsafe(1);

/**
 * The keyspace of the store `home`, `kind`'s files imported whenever their folders moved since this process last imported them
 * (`kindImported`). The mark is read before the import, so a file planted while it runs is imported by the next open.
 * @param home The store's root folder.
 * @param kind The kind whose files are imported.
 */
export const kindKeyspace = (home: string, kind: ImportKind) =>
  Effect.flatMap(keyspaceAt(keyspaceFile(home)), (keyspace) => {
    const at = `${kind.name}\0${home}`;
    const due = () => IMPORTED.get(at) !== markOf(home, kind);
    return Effect.flatMap(fromThrow(due), (stale) =>
      !stale
        ? Effect.succeed(keyspace)
        : IMPORTING.withPermits(1)(
            Effect.flatMap(fromThrow(due), (still) =>
              !still
                ? Effect.succeed(keyspace)
                : Effect.flatMap(
                    fromThrow(() => markOf(home, kind)),
                    (mark) =>
                      Effect.map(kindImported(home, kind, keyspace), () => {
                        IMPORTED.set(at, mark);
                        return keyspace;
                      }),
                  ),
            ),
          ),
    );
  });

/**
 * The keyspace of the store `home` a read of `kind` reads: undefined where the store has no keyspace file and no file of the kind to
 * import, so a read makes no file; else `kindKeyspace`'s.
 * @param home The store's root folder.
 * @param kind The kind whose files are imported.
 */
export const kindKeyspaceHeld = (home: string, kind: ImportKind) =>
  Effect.suspend(() =>
    !fs.existsSync(keyspaceFile(home)) && kind.files(home).length === 0 ? Effect.succeed(undefined) : kindKeyspace(home, kind),
  ) satisfies Effect.Effect<Keyspace | undefined, Refusal>;
