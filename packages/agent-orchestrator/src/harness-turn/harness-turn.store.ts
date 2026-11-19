/**
 * A check turn's record, `<home>/turns/<id>.json`: which harness it runs through, the runtime's task that runs it, and when it was
 * started — what `turnOf` reads the turn back by, and the readiness read the harness's latest by (`latestTurnRecord`). The folder is the
 * turn's working folder too. Written whole by a temporary file and a rename.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';

/** A check turn as its record holds it. */
export const TurnRecord = Schema.StructWithRest(
  Schema.Struct({ id: Schema.String, harness: Schema.String, taskId: Schema.String, startedAt: Schema.String }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);
export type TurnRecord = typeof TurnRecord.Type;

/**
 * The folder of the check turns' records of the store at `home`, which each turn runs in.
 * @param home The store's root folder.
 */
export const turnsDir = (home: string): string => path.join(home, 'turns');

/**
 * Writes `record` whole, by a temporary file and a rename, so no reader meets half of one.
 * @param home The store's root folder.
 * @param record The turn's record, written to its id's file.
 */
export function writeTurnRecord(home: string, record: TurnRecord): void {
  fs.mkdirSync(turnsDir(home), { recursive: true });
  const hidden = path.join(turnsDir(home), `.${record.id}-${process.pid}`);
  fs.writeFileSync(hidden, `${JSON.stringify(record, null, 2)}\n`);
  fs.renameSync(hidden, path.join(turnsDir(home), `${record.id}.json`));
}

/**
 * The record of the turn `id`, or undefined where the store has none that reads.
 * @param home The store's root folder.
 * @param id The turn's id, as a caller gave it.
 */
export function readTurnRecord(home: string, id: string): TurnRecord | undefined {
  if (id === '' || id.includes('/') || id.startsWith('.')) return undefined;
  try {
    return Schema.decodeUnknownSync(Schema.fromJsonString(TurnRecord))(fs.readFileSync(path.join(turnsDir(home), `${id}.json`), 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * The record of the turn last started through `harness`, by its start, or undefined where none was.
 * @param home The store's root folder.
 * @param harness The harness's name.
 */
export function latestTurnRecord(home: string, harness: string): TurnRecord | undefined {
  let names: string[];
  try {
    names = fs.readdirSync(turnsDir(home));
  } catch {
    return undefined;
  }
  const records = names.flatMap((name) => {
    if (!name.endsWith('.json')) return [];
    const record = readTurnRecord(home, name.slice(0, -'.json'.length));
    return record !== undefined && record.harness === harness ? [record] : [];
  });
  return records.reduce<TurnRecord | undefined>((last, r) => (last === undefined || r.startedAt > last.startedAt ? r : last), undefined);
}
