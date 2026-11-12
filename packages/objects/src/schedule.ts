/**
 * The Schedule: a factory's schedule of one of its workflows, served as an object in the factory's namespace and named by its workflow.
 * Its `spec` is what the person set — the cron its runs start at, what each is asked and the time zone — and its
 * `status` what Nemia read of it: since when it holds, its next fire, its last scheduled run, and the refusal kept of its latest fire.
 *
 * Beside it, the body a write is sent (`ScheduleWrite`). Plain Schemas of JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';

/**
 * What a person set: the cron, five or six fields; the brief each run is asked; the zone. A scheduled run works on the repository the
 * factory's wiring names for its workflow. `repo` is retired, kept in the schema as `nemia/v1` only adds: an old schedule's is read and
 * ignored, sent back as it is, and a write that sets or changes it is refused, naming `nemia factory attach`.
 */
export const ScheduleSpec = Schema.Struct({
  cron: Schema.String,
  brief: Schema.String,
  /** Retired: read and ignored; the factory's wiring places a scheduled run. */
  repo: Schema.optionalKey(Schema.String),
  tz: Schema.optionalKey(Schema.String),
});
export type ScheduleSpec = typeof ScheduleSpec.Type;

/** A scheduled run: its id, and when it was started. */
export const ScheduleFired = Schema.Struct({ run: Schema.String, at: Schema.String });
export type ScheduleFired = typeof ScheduleFired.Type;

/**
 * What Nemia read of the schedule: when it was set (`since`), its next fire (absent where it never fires), its last scheduled run, and
 * why its latest fire was refused, where it was.
 */
export const ScheduleStatus = Schema.Struct({
  since: Schema.String,
  next: Schema.optionalKey(Schema.String),
  last: Schema.optionalKey(ScheduleFired),
  refused: Schema.optionalKey(Schema.String),
});
export type ScheduleStatus = typeof ScheduleStatus.Type;

/** A schedule, as an object. */
export const Schedule = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('Schedule'),
  metadata: ObjectMeta,
  spec: ScheduleSpec,
  status: ScheduleStatus,
});
export type Schedule = typeof Schedule.Type;

/** A page of a factory's schedules. */
export const ScheduleList = listOf('Schedule', Schedule);
export type ScheduleList = typeof ScheduleList.Type;

/** A workflow scheduled (`PUT …/schedules/<workflow>`): its cron and brief, and the time zone where given; `repo` is retired. */
export const ScheduleWrite = ScheduleSpec;
export type ScheduleWrite = typeof ScheduleWrite.Type;
