/**
 * A factory's MCP servers on disk, `$WF_ROOT/factories/<name>/servers.json`: a per-factory folder file, as `level.json` is, which
 * `nemia factory rm` removes whole with the folder. Read and written whole, through a hidden file renamed over it.
 *
 * The default factory's *folder* file is legal, so a server may be added to it, while `factories/default.json` stays refused: the
 * default factory is no file, and the special case for it is the controller's (`servers.verb.ts`), never this store's.
 *
 * Beneath the controllers, beside `record.store.ts`, the one store file it imports.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { factoryNameRefusal } from '../factory/factory.ts';
import { firstRefusal, HOME } from '../record/record.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import type { FactoryServers, FactoryServersFile } from './servers.ts';

/**
 * One server a factory records: its wire facts — `type`, `url`, `headers` — and the facts of the OAuth client it signs in through,
 * never a secret. The wire facts are the server's identity to the harness, which files a sign-in under
 * `name|sha256({type,url,headers})[:16]`: changing any of them asks for a new sign-in, and `oauth`, which sits outside that hash, does
 * not.
 */

const FactoryServerSchema = Schema.StructWithRest(
  Schema.Struct({
    type: Schema.Literals(['http', 'sse']),
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

/** The file the factory `name`'s servers are kept in. Refused (`Invalid`): a name that is no factory's. */
export function factoryServersFile(name: string): string {
  const bad = factoryNameRefusal(name);
  if (bad) throw new Invalid({ message: bad });
  return path.join(HOME, 'factories', name, 'servers.json');
}

/**
 * The factory `name`'s servers, or `undefined` where none was written. Refused (`Invalid`), naming the file, its first wrong field and
 * the command that writes it again, where it does not read as a record.
 */
export function readFactoryServers(name: string): FactoryServersFile | undefined {
  const file = factoryServersFile(name);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  const fix = `add the server again with nemia factory server add ${name} <server> --url <address>`;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Invalid({ message: `${file} is not JSON: ${fix}.` });
  }
  const read = Schema.decodeUnknownResult(FactoryServersSchema)(raw);
  if (Result.isFailure(read)) {
    const { path: at, words } = firstRefusal(raw, read.failure);
    throw new Invalid({ message: `${file}: ${at.length ? `its ${at.join('.')} ` : ''}${words}: ${fix}.` });
  }
  return { servers: read.success.servers };
}

/** The factory `name`'s servers, `{}` where none was written: what a caller that only reads them takes. */
export const factoryServers = (name: string): FactoryServers => readFactoryServers(name)?.servers ?? {};

/** Writes the factory `name`'s servers whole; a record with no server is removed, so a re-read finds none rather than an empty map. */
export function writeFactoryServers(name: string, servers: FactoryServers): void {
  const file = factoryServersFile(name);
  if (!Object.keys(servers).length) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const hidden = path.join(path.dirname(file), `.servers.json.${process.pid}`);
  fs.writeFileSync(hidden, `${JSON.stringify({ servers })}\n`);
  fs.renameSync(hidden, file);
}
