/**
 * A schedule's cron, read by Effect's `Cron`, and the tick's kept try of each schedule (`ScheduleTry`): `$WF_ROOT/schedules/<factory>/
 * <workflow>.json`, beside `factories/`, whose files are a person's. The tick is the try's one writer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cron, Option, Result, Schema } from 'effect';
import type { Schedule } from '../factory.ts';
import type { ScheduleTry } from './schedule.ts';
import { writeWhole } from '../../whole-file/whole-file.store.ts';

/**
 * Where the tick keeps its tries of the factories' schedules: `$WF_ROOT/schedules`, a folder per factory.
 * @param home The store's root.
 */
const schedulesDir = (home: string) => path.join(home, 'schedules');

/** The try file of the schedule of `workflow` in `factory`. */
const tryFile = (home: string, factory: string, workflow: string) => path.join(schedulesDir(home), factory, `${workflow}.json`);

/** A try as the tick writes it, every key it holds kept. */
const ScheduleTrySchema = Schema.StructWithRest(
  Schema.Struct({
    due: Schema.String,
    at: Schema.String,
    run: Schema.optionalKey(Schema.String),
    why: Schema.optionalKey(Schema.String),
    refused: Schema.optionalKey(Schema.Boolean),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/**
 * The tick's kept try of the schedule of `workflow` in `factory`; none when there is no file, or it does not read as one.
 * @param home The store's root.
 * @param factory The factory's name.
 * @param workflow The name of the workflow the schedule starts.
 */
export function readScheduleTry(home: string, factory: string, workflow: string) {
  try {
    const text = fs.readFileSync(tryFile(home, factory, workflow), 'utf8');
    return Option.getOrUndefined(Schema.decodeUnknownOption(Schema.fromJsonString(ScheduleTrySchema))(text));
  } catch {
    return undefined;
  }
}

/**
 * The tick's try of the schedule of `workflow` in `factory`, written whole: a hidden file renamed over it.
 * @param home The store's root.
 * @param factory The factory's name.
 * @param workflow The name of the workflow the schedule starts.
 * @param tried The try to keep: the fire it was for, when, and the run it started or why it did not.
 */
export function putScheduleTry(home: string, factory: string, workflow: string, tried: ScheduleTry) {
  const file = tryFile(home, factory, workflow);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeWhole(file, `${JSON.stringify(tried, null, 2)}\n`);
}

/**
 * The cron `cron` read in the zone `tz`, the machine's when none, or why it does not read: `Cron.parse`'s own words.
 * @param cron The cron expression.
 * @param tz The time zone it is read in, or undefined for the machine's.
 */
function cronOf(cron: string, tz: string | undefined) {
  const parsed = Cron.parse(cron, tz);
  return Result.isSuccess(parsed) ? parsed.success : { error: parsed.failure.message };
}

/**
 * The fires of `schedule` around `now`, in milliseconds: the latest at or before it, to the second (`Cron.prev` alone is strict, and would
 * see a pass landing on a fire one fire late), and the next after it; or why there are none: a cron that does not read, or one that reads
 * and never fires, such as the 30th of February, which `Cron` says by throwing.
 * @param schedule The schedule: its cron and its time zone, the machine's where it names none.
 * @param now The time the fires are read around, in milliseconds since the epoch.
 */
export function firesOf(schedule: Pick<Schedule, 'cron' | 'tz'>, now: number) {
  const cron = cronOf(schedule.cron, schedule.tz);
  if ('error' in cron) return cron;
  const second = new Date(now - (now % 1000));
  try {
    const latest = Cron.match(cron, second) ? second.getTime() : Cron.prev(cron, second).getTime();
    return { latest, next: Cron.next(cron, new Date(now)).getTime() };
  } catch (err) {
    return { error: `${(err as Error).message}: the cron ${schedule.cron} never fires` };
  }
}
