/**
 * An upgrade's record, `<home>/upgrades/<id>.json`: the tag it upgrades to, the release the server ran when it started (`from`), the
 * runtime's task that runs `nemia upgrade <tag>`, and when it started — what `upgradeOf` reads the upgrade back by, and what the store's
 * last upgrade is found by (`lastUpgradeRecord`). Written whole by a temporary file and a rename.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';

/** An upgrade as its record holds it. */
export const UpgradeRecord = Schema.StructWithRest(
  Schema.Struct({
    id: Schema.String,
    tag: Schema.String,
    from: Schema.optionalKey(Schema.String),
    taskId: Schema.String,
    startedAt: Schema.String,
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);
export type UpgradeRecord = typeof UpgradeRecord.Type;

/** The folder of the upgrades' records of the store at `home`. */
export const upgradesDir = (home: string): string => path.join(home, 'upgrades');

/** The record of the upgrade `id` of the store at `home`. */
export const upgradeFile = (home: string, id: string): string => path.join(upgradesDir(home), `${id}.json`);

/** Writes `record` whole, by a temporary file and a rename, so no reader meets half of one. */
export function writeUpgradeRecord(home: string, record: UpgradeRecord): void {
  fs.mkdirSync(upgradesDir(home), { recursive: true });
  const hidden = path.join(upgradesDir(home), `.${record.id}-${process.pid}`);
  fs.writeFileSync(hidden, `${JSON.stringify(record, null, 2)}\n`);
  fs.renameSync(hidden, upgradeFile(home, record.id));
}

/** The record of the upgrade `id`, or undefined where the store has none that reads: an id no upgrade was started under is no upgrade. */
export function readUpgradeRecord(home: string, id: string): UpgradeRecord | undefined {
  if (id === '' || id.includes('/') || id.includes('\\') || id.startsWith('.')) return undefined;
  try {
    return Schema.decodeUnknownSync(UpgradeRecord)(JSON.parse(fs.readFileSync(upgradeFile(home, id), 'utf8')));
  } catch {
    return undefined;
  }
}

/**
 * The store's last upgrade: the record of the newest start by `startedAt` (its id breaking a tie), among those that read; undefined where
 * none was started, or none reads.
 */
export function lastUpgradeRecord(home: string): UpgradeRecord | undefined {
  let names: string[];
  try {
    names = fs.readdirSync(upgradesDir(home));
  } catch {
    return undefined;
  }
  let last: UpgradeRecord | undefined;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const record = readUpgradeRecord(home, name.slice(0, -'.json'.length));
    if (record === undefined) continue;
    if (last === undefined || record.startedAt > last.startedAt || (record.startedAt === last.startedAt && record.id > last.id))
      last = record;
  }
  return last;
}
