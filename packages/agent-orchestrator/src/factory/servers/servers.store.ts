/**
 * A factory's MCP servers as a record, `/registry/servers/<name>` (`serversKey`), whose value is the text of what
 * `$WF_ROOT/factories/<name>/servers.json` was: read as a record's text (`serversOf`) and written whole, every other key of it kept
 * (`serversTextOf`); the Factory door's records layer holds the record. The person's library of servers, `mcpservers.json`, is still a
 * file, read and written here (`readServersAt`, `writeServersAt`).
 *
 * The default factory's servers are a record too, so a server may be added to it, while the default factory has no record of its own:
 * the special case for it is the controller's (`servers.verb.ts`), never this store's.
 *
 * Beneath the controllers, beside `record.store.ts`, the one store file it imports — for `firstRefusal` alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Option, Result, Schema } from 'effect';
import { MCP_TRANSPORTS } from 'objects';
import { serversKey } from '../door/factory-keys.ts';
import { firstRefusal } from '../../record/record.store.ts';
import { Invalid } from '../../refusal/refusal.ts';
import { factoryServerRefusal, serverNameRefusal } from './servers.ts';
import type { FactoryServers } from './servers.ts';
import { writeWhole } from '../../whole-file/whole-file.store.ts';

/**
 * One server a factory records: its wire facts — `type`, `url`, `headers` — and the facts of the OAuth client it signs in through,
 * never a secret. The wire facts are the server's identity to the harness, which files a sign-in under
 * `name|sha256({type,url,headers})[:16]`: changing any of them asks for a new sign-in, and `oauth`, which sits outside that hash, does
 * not.
 */

const FactoryServerSchema = Schema.StructWithRest(
  Schema.Struct({
    type: Schema.Literals(MCP_TRANSPORTS),
    url: Schema.String,
    headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    oauth: Schema.optionalKey(Schema.Struct({ clientId: Schema.String, callbackPort: Schema.optionalKey(Schema.Number) })),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/** A factory's server record as the file holds it: its servers by name, and the keys a newer tick wrote, kept. */
const FactoryServersSchema = Schema.StructWithRest(Schema.Struct({ servers: Schema.Record(Schema.String, FactoryServerSchema) }), [
  Schema.Record(Schema.String, Schema.Unknown),
]);

/**
 * The servers a text holds, `text` being what a record or a file kept, or `undefined` where there is none. Refused (`Invalid`), naming
 * `where` it was read from, its first wrong field and `fix`, where it does not read as a record.
 * @param text What the record or file holds, or undefined where there is none.
 * @param where The record's key or the file's path, named in a refusal.
 * @param fix The command that writes it again, as a refusal names it.
 */
export function serversIn(text: string | undefined, where: string, fix: string) {
  if (text === undefined) return undefined;
  const json = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(text);
  if (Option.isNone(json)) throw new Invalid({ message: `${where} is not JSON: ${fix}.` });
  const raw = json.value;
  const read = Schema.decodeUnknownResult(FactoryServersSchema)(raw);
  if (Result.isFailure(read)) {
    const { path: at, words } = firstRefusal(FactoryServersSchema, raw);
    throw new Invalid({ message: `${where}: ${at.length ? `its ${at.join('.')} ` : ''}${words}: ${fix}.` });
  }
  return read.success;
}

/**
 * The servers recorded in `file`, the library's, or `undefined` where none was written. Refused (`Invalid`), naming the file, its first
 * wrong field and `fix`, where it does not read as a record.
 * @param file The servers file.
 * @param fix The command that writes it again, as a refusal names it.
 */
export function readServersAt(file: string, fix: string) {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  return serversIn(text, file, fix);
}

/**
 * The factory `name`'s servers as its record `text` holds them: the record is `undefined` where none was written, and no server then.
 * Refused (`Invalid`) as `serversIn` refuses, naming the record and the command that writes it again.
 * @param text What the factory's servers record holds, or undefined where there is none.
 * @param name The factory's name.
 */
export const serversOf = (text: string | undefined, name: string) =>
  (serversIn(text, serversKey(name), `add the server again with nemia factory server add ${name} <server> --url <address>`)?.servers ??
    {}) satisfies FactoryServers;

/**
 * The text of a servers record that keeps every other key `was` held — a key a newer tick wrote, which this one does not name: the text
 * is decoded by a `StructWithRest` so that a downgrade takes nothing away, and a write that spelled `{ servers }` alone would throw those
 * keys away on the next `server add`. Text that does not read is written over: the verbs read the record before they write it and
 * refuse a broken one themselves, loudly and with the record named.
 * @param was What the record held, or undefined where there was none.
 * @param servers Every server, by name.
 */
export function serversTextOf(was: string | undefined, servers: FactoryServers) {
  let kept: Record<string, unknown> = {};
  try {
    const { servers: _gone, ...rest } = serversIn(was, '', '') ?? {};
    kept = rest;
  } catch {
    kept = {};
  }
  return `${JSON.stringify({ ...kept, servers })}\n`;
}

/**
 * Writes the servers file `file`, the library's, whole, keeping every other key the file held (`serversTextOf`); a file with no server
 * is removed, with whatever else it held: the file is the servers, and a stamp of a file that no longer exists is no fact.
 * @param file The servers file.
 * @param servers Every server, by name; none removes the file.
 */
export function writeServersAt(file: string, servers: FactoryServers) {
  if (!Object.keys(servers).length) {
    fs.rmSync(file, { force: true });
    return;
  }
  let was: string | undefined;
  try {
    was = fs.readFileSync(file, 'utf8');
  } catch {
    was = undefined;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeWhole(file, serversTextOf(was, servers));
}

/**
 * The folder of Nemia's builtin MCP servers, built into the package (`servers/`, its README saying what a file holds): each a
 * `<name>.json` a person may add to a factory of theirs without typing its address or its client id, GitHub's (`github.json`) first.
 */
export const BUILTIN_SERVERS = path.join(import.meta.dirname, '..', '..', '..', 'servers');

/**
 * Nemia's builtin servers, by name: each `<name>.json` of `dir` that reads as one, in the folder's order. The builtin folder is the
 * package's own (`BUILTIN_SERVERS`), not the store, and `dir` is the caller's to name, so no root is read here.
 *
 * An absent folder is an empty list, never a throw, since git commits no empty directory; and a file that does not read is left out
 * rather than failing the read, since one bad builtin file must not blank the add form.
 * @param dir The folder the builtin servers' files are read from, the package's `BUILTIN_SERVERS` in use.
 */
export const builtinServers = (dir: string) => {
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return files.flatMap((file) => {
    const name = file.slice(0, -'.json'.length);
    if (serverNameRefusal(name) !== undefined) return [];
    let text: string;
    try {
      text = fs.readFileSync(path.join(dir, file), 'utf8');
    } catch {
      return [];
    }
    const read = Schema.decodeUnknownOption(Schema.fromJsonString(FactoryServerSchema))(text);
    if (Option.isNone(read) || factoryServerRefusal(read.value) !== undefined) return [];
    return [{ name, ...read.value }];
  });
};
