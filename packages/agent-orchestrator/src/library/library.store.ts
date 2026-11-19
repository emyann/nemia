/**
 * The store's library on disk, beside what a factory added from it. Three files, each read and written whole through a hidden file
 * renamed over it:
 *
 * - `$WF_ROOT/factories/<name>/library.json`, a factory's adds: a per-factory folder file, as `servers.json` is, legal for `default` too,
 *   whose record is no file. Absent, the factory is *unrecorded*: its adds are those its workflows resolve today, and nothing is migrated.
 * - `$WF_ROOT/workflows/mcpservers.json`, the person's library servers, in the shape of a factory's `servers.json`.
 * - `$WF_ROOT/workflows/copies.json`, the digest of each builtin the person copied, at the copy, by `<kind>/<name>`.
 *
 * Every function takes the store's root first, as a required `home: string`, as `servers.store.ts` does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { LIBRARY_KINDS } from 'objects';
import { factoryNameRefusal } from '../factory/factory.ts';
import { firstRefusal } from '../record/record.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { writeWhole } from '../whole-file/whole-file.store.ts';
import { readServersAt, writeServersAt } from '../factory/servers/servers.store.ts';
import type { FactoryServers } from '../factory/servers/index.ts';
import type { LibraryKind, LibraryRef } from './library.ts';
import type { LibraryAdded } from '../skills/read.store.ts';

/** The rest a newer tick may write beside the keys this one names, kept on a write. */
const REST = [Schema.Record(Schema.String, Schema.Unknown)] as const;

/** One add as the file holds it. */
const AddSchema = Schema.StructWithRest(Schema.Struct({ kind: Schema.Literals(LIBRARY_KINDS), name: Schema.String }), [...REST]);

/** A factory's adds as the file holds them. */
const AddsSchema = Schema.StructWithRest(Schema.Struct({ adds: Schema.Array(AddSchema) }), [...REST]);

/** The builtin copies' digests as the file holds them. */
const CopiesSchema = Schema.StructWithRest(Schema.Struct({ copies: Schema.Record(Schema.String, Schema.String) }), [...REST]);

/**
 * The file the factory `name`'s adds are kept in, under the store `home`. Refused (`Invalid`): a name that is no factory's.
 * @param home The store's root.
 * @param name The factory's name, `default` among them.
 */
export function libraryAddsFile(home: string, name: string): string {
  const bad = factoryNameRefusal(name);
  if (bad) throw new Invalid({ message: bad });
  return path.join(home, 'factories', name, 'library.json');
}

/**
 * The JSON of `file` decoded by `schema`, or undefined where the file is not there. Refused (`Invalid`), naming the file, its first wrong
 * field and `fix`, where it does not read.
 */
function readJson<S extends Schema.ConstraintDecoder<unknown>>(file: string, schema: S, fix: string): S['Type'] | undefined {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Invalid({ message: `${file} is not JSON: ${fix}.` });
  }
  const read = Schema.decodeUnknownResult(schema)(raw);
  if (Result.isFailure(read)) {
    const { path: at, words } = firstRefusal(schema, raw);
    throw new Invalid({ message: `${file}: ${at.length ? `its ${at.join('.')} ` : ''}${words}: ${fix}.` });
  }
  return read.success;
}

/**
 * The factory `name`'s recorded adds, or undefined where it is unrecorded. Refused (`Invalid`), naming the file and the fix, where the
 * file does not read.
 * @param home The store's root.
 * @param name The factory's name.
 */
export function readLibraryAdds(home: string, name: string): readonly LibraryRef[] | undefined {
  const file = libraryAddsFile(home, name);
  const read = readJson(
    file,
    AddsSchema,
    `remove it to read the factory's adds from its workflows again, or write it with nemia library add`,
  );
  return read?.adds.map(({ kind, name: item }) => ({ kind, name: item }));
}

/**
 * Writes the factory `name`'s adds whole, keeping every other key the file held. An empty list is written, not removed: a recorded
 * factory with no adds is not an unrecorded one.
 * @param home The store's root.
 * @param name The factory's name.
 * @param adds Every add of the factory.
 */
export function writeLibraryAdds(home: string, name: string, adds: readonly LibraryRef[]): void {
  const file = libraryAddsFile(home, name);
  let kept: Record<string, unknown> = {};
  try {
    const { adds: _gone, ...rest } = readJson(file, AddsSchema, '') ?? { adds: [] };
    kept = rest;
  } catch {
    kept = {};
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeWhole(file, `${JSON.stringify({ ...kept, adds: adds.map(({ kind, name: item }) => ({ kind, name: item })) })}\n`);
}

/**
 * The store's library folder, `<home>/workflows`, which holds the person's `agents/`, `skills/`, workflows and library servers.
 * @param home The store's root.
 */
export const libraryDir = (home: string): string => path.join(home, 'workflows');

/**
 * The person's library servers, by name, `{}` where none was recorded.
 * @param home The store's root.
 */
export const libraryServers = (home: string): FactoryServers =>
  readServersAt(
    path.join(libraryDir(home), 'mcpservers.json'),
    'write the server again at the library (PUT /api/mcpservers/<server> with its type and url), or remove the file to start over',
  )?.servers ?? {};

/**
 * Writes the person's library servers whole; none removes the record.
 * @param home The store's root.
 * @param servers Every library server, by name.
 */
export const writeLibraryServers = (home: string, servers: FactoryServers): void =>
  writeServersAt(path.join(libraryDir(home), 'mcpservers.json'), servers);

/**
 * The digest of each builtin the person copied, at the copy, by `<kind>/<name>`; `{}` where none was recorded.
 * @param home The store's root.
 */
export const builtinCopies = (home: string): Readonly<Record<string, string>> =>
  readJson(path.join(libraryDir(home), 'copies.json'), CopiesSchema, 'remove it: a copy is then no longer compared with its builtin')
    ?.copies ?? {};

/**
 * Records the digest of the builtin `key` copied now, keeping every other copy.
 * @param home The store's root.
 * @param key The copy, `<kind>/<name>`.
 * @param digest The builtin's digest at the copy.
 */
export function recordBuiltinCopy(home: string, key: string, digest: string): void {
  const file = path.join(libraryDir(home), 'copies.json');
  const copies = { ...builtinCopies(home), [key]: digest };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeWhole(file, `${JSON.stringify({ copies })}\n`);
}

/**
 * The names the factory `name`'s lookup reads the library for, by kind; undefined where it has no record, so its lookup reads the library
 * for every name its workflows give, which resolves what its derived adds hold (`LibraryAdded`). A record that does not read gives no adds:
 * the lookup fails closed, resolving nothing of the library, while the factory's adds (`factoryAdds`) refuse the file naming its fix.
 * @param home The store's root.
 * @param name The factory's name, `default` among them; undefined for a read in no factory.
 */
export function addedOf(home: string, name: string | undefined): LibraryAdded | undefined {
  if (name === undefined) return undefined;
  let recorded: readonly LibraryRef[] | undefined;
  try {
    recorded = readLibraryAdds(home, name);
  } catch {
    recorded = [];
  }
  if (recorded === undefined) return undefined;
  const of = (kind: LibraryKind) => new Set(recorded.filter((a) => a.kind === kind).map((a) => a.name));
  return { agents: of('Agent'), skills: of('Skill') };
}
