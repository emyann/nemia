/**
 * The Schedule: a factory's schedule of one of its workflows, served as an object in the factory's namespace and named by its workflow.
 * Its `spec` is what the person set — the cron its runs start at, what each is asked and the time zone — and its
 * `status` what Nemia read of it: since when it holds, its next fire, its last scheduled run, and the refusal kept of its latest fire.
 *
 * Beside it, the body a write is sent (`ScheduleWrite`). Plain Schemas of JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { FactoryWritten } from './written.ts';

/**
 * What a person set: the cron, five or six fields; the brief each run is asked; the zone. A scheduled run works on the repository the
 * factory's wiring names for its workflow. `repo` is retired, kept in the schema as `nemia/v1` only adds: an old schedule's is read and
 * ignored, sent back as it is, and a write that sets or changes it is refused, naming `nemia factory attach`.
 */
export const ScheduleSpec = Schema.Struct({
  cron: Schema.String.annotate({ description: 'The cron, five or six fields, its runs start at.' }),
  brief: Schema.String.annotate({ description: 'The brief each run is asked.' }),
  repo: Schema.optionalKey(
    Schema.String.annotate({ description: "Retired: read and ignored, since the factory's wiring places a scheduled run." }),
  ),
  tz: Schema.optionalKey(Schema.String.annotate({ description: 'The time zone the cron is read in.' })),
}).annotate({ description: 'What the person set (nemia factory schedule): the cron, the brief each run is asked, and the time zone.' });
export type ScheduleSpec = typeof ScheduleSpec.Type;

/** A scheduled run: its id, and when it was started. */
export const ScheduleFired = Schema.Struct({
  run: Schema.String.annotate({ description: "The scheduled run's id." }),
  at: Schema.String.annotate({ description: 'When it was started, as an ISO 8601 time.' }),
});
export type ScheduleFired = typeof ScheduleFired.Type;

/**
 * What Nemia read of the schedule: when it was set (`since`), its next fire (absent where it never fires), its last scheduled run, and
 * why its latest fire was refused, where it was.
 */
export const ScheduleStatus = Schema.Struct({
  since: Schema.String.annotate({ description: 'When the schedule was set, as an ISO 8601 time.' }),
  next: Schema.optionalKey(Schema.String.annotate({ description: 'Its next fire; absent where it never fires.' })),
  last: Schema.optionalKey(ScheduleFired.annotate({ description: 'Its last scheduled run; absent where none has run.' })),
  refused: Schema.optionalKey(Schema.String.annotate({ description: 'Why its latest fire was refused; absent where it was not.' })),
}).annotate({
  description:
    'What Nemia read of the schedule: since when it holds, its next fire, its last scheduled run, and why its latest fire was refused.',
});
export type ScheduleStatus = typeof ScheduleStatus.Type;

/** A schedule, as an object; a write's answer says what it wrote (`written`). */
export const Schedule = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('Schedule').annotate({
    description: "What the object is: a Schedule, the cron one of a factory's workflows starts runs at.",
  }),
  metadata: ObjectMeta,
  spec: ScheduleSpec,
  status: ScheduleStatus,
  written: Schema.optionalKey(FactoryWritten),
});
export type Schedule = typeof Schedule.Type;

/** A page of a factory's schedules. */
export const ScheduleList = listOf('Schedule', Schedule);
export type ScheduleList = typeof ScheduleList.Type;

/** A workflow scheduled (`PUT …/schedules/<workflow>`): its cron and brief, and the time zone where given; `repo` is retired. */
export const ScheduleWrite = ScheduleSpec;
export type ScheduleWrite = typeof ScheduleWrite.Type;
