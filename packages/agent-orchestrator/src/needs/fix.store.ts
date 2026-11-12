/**
 * A fix's record, `<home>/fixes/<id>.json`: which need of which factory's workflow it fixes, which of the need's fixes it is, the
 * pattern of the code its output shows, and the runtime's task that runs it — what `fixOf` reads the fix back by. Written whole by a
 * temporary file and a rename; never its answers, which go to the task's environment alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';

/** A fix as its record holds it. */
export const FixRecord = Schema.StructWithRest(
  Schema.Struct({
    id: Schema.String,
    need: Schema.String,
    factory: Schema.optionalKey(Schema.String),
    workflow: Schema.optionalKey(Schema.String),
    index: Schema.Number,
    code: Schema.optionalKey(Schema.String),
    taskId: Schema.String,
    startedAt: Schema.String,
    swept: Schema.optionalKey(Schema.Boolean),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);
export type FixRecord = typeof FixRecord.Type;

/** The folder of the fixes' records of the store at `home`. */
export const fixesDir = (home: string): string => path.join(home, 'fixes');

/** The record of the fix `id` of the store at `home`. */
export const fixFile = (home: string, id: string): string => path.join(fixesDir(home), `${id}.json`);

/** Writes `record` whole, by a temporary file and a rename, so no reader meets half of one. */
export function writeFixRecord(home: string, record: FixRecord): void {
  fs.mkdirSync(fixesDir(home), { recursive: true });
  const file = fixFile(home, record.id);
  const hidden = path.join(fixesDir(home), `.${record.id}-${process.pid}`);
  fs.writeFileSync(hidden, `${JSON.stringify(record, null, 2)}\n`);
  fs.renameSync(hidden, file);
}

/** The record of the fix `id`, or undefined where the store has none that reads: an id no fix was started under is no fix. */
export function readFixRecord(home: string, id: string): FixRecord | undefined {
  if (id === '' || id.includes('/') || id.startsWith('.')) return undefined;
  try {
    return Schema.decodeUnknownSync(FixRecord)(JSON.parse(fs.readFileSync(fixFile(home, id), 'utf8')));
  } catch {
    return undefined;
  }
}
