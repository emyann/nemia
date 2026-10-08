/**
 * A schedule's cron, read by Effect's `Cron`, and the tick's kept try of each schedule (`ScheduleTry`): `$WF_ROOT/schedules/<factory>/
 * <workflow>.json`, beside `factories/`, whose files are a person's. The tick is the try's one writer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Cron, Result, Schema } from 'effect';
import { HOME } from '../record/record.store.ts';
import type { Schedule } from '../factory/factory.ts';
import type { ScheduleTry } from './schedule.ts';

/** Where the tick keeps its tries of the factories' schedules: `$WF_ROOT/schedules`, a folder per factory. */
export const schedulesDir = (): string => path.join(HOME, 'schedules');

/** The try file of the schedule of `workflow` in `factory`. */
const tryFile = (factory: string, workflow: string): string => path.join(schedulesDir(), factory, `${workflow}.json`);

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

/** The tick's kept try of the schedule of `workflow` in `factory`; none when there is no file, or it does not read as one. */
export function readScheduleTry(factory: string, workflow: string): ScheduleTry | undefined {
  try {
    const decoded = Schema.decodeUnknownResult(ScheduleTrySchema)(JSON.parse(fs.readFileSync(tryFile(factory, workflow), 'utf8')));
    return Result.isSuccess(decoded) ? decoded.success : undefined;
  } catch {
    return undefined;
  }
}

/** The tick's try of the schedule of `workflow` in `factory`, written whole: a hidden file renamed over it. */
export function putScheduleTry(factory: string, workflow: string, tried: ScheduleTry): void {
  const file = tryFile(factory, workflow);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const hidden = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}`);
  try {
    fs.writeFileSync(hidden, `${JSON.stringify(tried, null, 2)}\n`);
    fs.renameSync(hidden, file);
  } finally {
    fs.rmSync(hidden, { force: true });
  }
}

/** The cron `cron` read in the zone `tz`, the machine's when none, or why it does not read: `Cron.parse`'s own words. */
export function cronOf(cron: string, tz: string | undefined): Cron.Cron | { error: string } {
  const parsed = Cron.parse(cron, tz);
  return Result.isSuccess(parsed) ? parsed.success : { error: parsed.failure.message };
}

/**
 * The fires of `schedule` around `now`, in milliseconds: the latest at or before it, to the second (`Cron.prev` alone is strict, and would
 * see a pass landing on a fire one fire late), and the next after it; or why there are none: a cron that does not read, or one that reads
 * and never fires, such as the 30th of February, which `Cron` says by throwing.
 */
export function firesOf(schedule: Pick<Schedule, 'cron' | 'tz'>, now: number): { latest: number; next: number } | { error: string } {
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
