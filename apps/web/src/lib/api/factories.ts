/**
 * The factories (`GET /api/factories`, apps/api/src/factories/factories.ts), a factory's instruction (`GET`, `PUT` and `DELETE` on
 * `/api/factories/<name>/instruction`, apps/api/src/factories/instruction.ts and the routes the api generates beside it), and its hires
 * (`PUT` and `DELETE` on `/api/factories/<name>/hires/<workflow>%2F<step>`, routes the api generates), and its schedules, read-only.
 */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { get, send } from './read.ts';

/** A condition of a factory made from a template, as the daemon wrote it: `Applied` or `ConflictsPending`, its state and why. */
export type FactoryCondition = { type: string; status: 'True' | 'False'; reason: string; message: string };

/**
 * The template a factory is made from: where it is, the version wanted and the parameters given; the version its tree was last applied
 * at, null before the daemon renders it; and the conditions the daemon wrote, none before then.
 */
export type FactoryTemplate = {
  source: string;
  version: string;
  params: Record<string, string | number | boolean>;
  applied: string | null;
  conditions: FactoryCondition[];
};

/**
 * Mirrors `ScheduleAnswer` in apps/api/src/factories/factories.ts: the workflow a factory schedules, its cron and the time zone it is read
 * in (null: the daemon's), what each run is asked, the repository its runs work on (null: the factory's), its next fire (null: its cron
 * gives none), its last scheduled run and when it was made, why its latest fire was refused (null: it was not), and the line that takes
 * it back.
 */
export type FactorySchedule = {
  workflow: string;
  cron: string;
  tz: string | null;
  brief: string;
  repo: string | null;
  next: string | null;
  last: { run: string; at: string } | null;
  refused: string | null;
  commands: { unschedule: string };
};

/** Decodes a `FactorySchedule`. */
const FactoryScheduleSchema = Schema.Struct({
  workflow: Schema.String,
  cron: Schema.String,
  tz: Schema.NullOr(Schema.String),
  brief: Schema.String,
  repo: Schema.NullOr(Schema.String),
  next: Schema.NullOr(Schema.String),
  last: Schema.NullOr(Schema.Struct({ run: Schema.String, at: Schema.String })),
  refused: Schema.NullOr(Schema.String),
  commands: Schema.Struct({ unschedule: Schema.String }),
}) satisfies Schema.Schema<FactorySchedule>;

/**
 * Mirrors `FactoryAnswer` in apps/api/src/factories/factories.ts: a factory's name, whether it is the default factory, the repositories it
 * works on, the workflows it offers — null for the default factory, which offers every workflow found — its hires, `<workflow>/<step>`
 * to an agent's name, and its schedules, none for the default factory. A factory whose file does not read has none of them, and `error`
 * says why, naming the file; null for every other. `template` is the template it is made from, null for one that is not.
 */
export type Factory = {
  name: string;
  default: boolean;
  repos: string[];
  workflows: string[] | null;
  hires: Record<string, string>;
  error: string | null;
  schedules: FactorySchedule[];
  /** The lines a person types for it: a workflow attached to it, its file removed, filed again, and a workflow scheduled. */
  commands: { attach: string; rm: string; add: string; schedule: string };
  template: FactoryTemplate | null;
};

/** Decodes a `Factory`. */
const FactorySchema = Schema.Struct({
  name: Schema.String,
  default: Schema.Boolean,
  repos: Schema.mutable(Schema.Array(Schema.String)),
  workflows: Schema.NullOr(Schema.mutable(Schema.Array(Schema.String))),
  hires: Schema.Record(Schema.String, Schema.String),
  error: Schema.NullOr(Schema.String),
  schedules: Schema.mutable(Schema.Array(FactoryScheduleSchema)),
  commands: Schema.Struct({ attach: Schema.String, rm: Schema.String, add: Schema.String, schedule: Schema.String }),
  template: Schema.NullOr(
    Schema.Struct({
      source: Schema.String,
      version: Schema.String,
      params: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
      applied: Schema.NullOr(Schema.String),
      conditions: Schema.mutable(
        Schema.Array(
          Schema.Struct({
            type: Schema.String,
            status: Schema.Literals(['True', 'False']),
            reason: Schema.String,
            message: Schema.String,
          }),
        ),
      ),
    }),
  ),
}) satisfies Schema.Schema<Factory>;

/**
 * The factories: the default factory first, then each in the store. Not polled: a factory changes when a person runs the CLI's `factory`.
 * Read again on each visit.
 */
export const factoriesQuery = queryOptions({
  queryKey: ['factories'],
  queryFn: () => get('/api/factories', Schema.mutable(Schema.Array(FactorySchema))),
});

/**
 * Mirrors `FactoryInstruction` in the orchestrator, as apps/api/src/factories/instruction.ts answers it: the factory's `name`; `path`, the
 * path in its first folder its file names, null where it names none or keeps the instruction in the store; `store`, whether the store
 * keeps it; `file`, the file it is read from; `words`, null where there is no file; `error`, why a file there does not read, else null; and
 * `stored`, whether the store holds text for it, read or not.
 */
export type FactoryInstruction = {
  name: string;
  path: string | null;
  store: boolean;
  file: string;
  words: string | null;
  error: string | null;
  stored: boolean;
};

/** Decodes a `FactoryInstruction`. */
const FactoryInstructionSchema = Schema.Struct({
  name: Schema.String,
  path: Schema.NullOr(Schema.String),
  store: Schema.Boolean,
  file: Schema.String,
  words: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  stored: Schema.Boolean,
}) satisfies Schema.Schema<FactoryInstruction>;

/** The route of the instruction of the factory `name`. */
const instructionRoute = (name: string): string => `/api/factories/${encodeURIComponent(name)}/instruction`;

/** The instruction of the factory `name`, read where its file says it is kept, on each request. */
export const factoryInstructionQuery = (name: string) =>
  queryOptions({
    queryKey: ['factory-instruction', name],
    queryFn: () => get(instructionRoute(name), FactoryInstructionSchema),
  });

/** What a write of a factory's instruction may have done, and what to look at before writing it again. */
const INSTRUCTION_WRITTEN = "The instruction may be changed: read the factory's settings again before changing it again.";

/** Where an instruction is to be kept: a file in the factory's first folder, by its path from it, or the store. */
export type InstructionPlace = { path: string } | { store: true };

/**
 * Keep the instruction of the factory `name` at `place`: the instruction as it then reads. Rejects with a `WriteRefusal` in the package's
 * words: no such factory (404), the default factory (409), a path that is not a file inside the folder (422).
 */
export const placeInstruction = (name: string, place: InstructionPlace): Promise<FactoryInstruction> =>
  send('PUT', instructionRoute(name), FactoryInstructionSchema, { body: place, may: INSTRUCTION_WRITTEN });

/** Read the instruction of the factory `name` from `NEMIA.md` in its first folder again: the instruction as it then reads. */
export const resetInstructionPlace = (name: string): Promise<FactoryInstruction> =>
  send('DELETE', instructionRoute(name), FactoryInstructionSchema, { body: {}, may: INSTRUCTION_WRITTEN });

/**
 * Write `words` as the instruction the store keeps for the factory `name`: the instruction as it then reads. Rejects with a `WriteRefusal`
 * in the package's words: an instruction read from the factory's folder (409), blank words (422).
 */
export const writeInstruction = (name: string, words: string): Promise<FactoryInstruction> =>
  send('PUT', `${instructionRoute(name)}/words`, FactoryInstructionSchema, { body: { words }, may: INSTRUCTION_WRITTEN });

/** Remove the instruction the store keeps for the factory `name`: the instruction as it then reads. */
export const clearInstruction = (name: string): Promise<FactoryInstruction> =>
  send('DELETE', `${instructionRoute(name)}/words`, FactoryInstructionSchema, { body: {}, may: INSTRUCTION_WRITTEN });

/** The route of the hire of the factory `name` into `step`, `<workflow>/<step>`: the step one segment, its slash encoded. */
const hireRoute = (name: string, step: string): string => `/api/factories/${encodeURIComponent(name)}/hires/${encodeURIComponent(step)}`;

/** What a hire or a fire may have done, and what to look at before sending it again. */
const HIRE_WRITTEN = "The factory's hires may be changed: read the step's page again before hiring or firing again.";

/** A hire written: the factory's file, and the agent it replaced in the step, null where none was hired. */
export type Hired = { file: string; replaced: string | null };

/** A fire written: the factory's file, and the agent fired. */
export type Fired = { file: string; fired: string };

/**
 * Hire the agent `agent` into `step`, `<workflow>/<step>`, in the factory `name`: replacing the one hired there, if any. Rejects with a
 * `WriteRefusal` in the package's words: no such factory (404), the default factory (409), a workflow the factory does not offer (422).
 */
export const hireAgent = (name: string, step: string, agent: string): Promise<Hired> =>
  send('PUT', hireRoute(name, step), Schema.Struct({ file: Schema.String, replaced: Schema.NullOr(Schema.String) }), {
    body: { agent },
    may: HIRE_WRITTEN,
  });

/** Fire the agent the factory `name` hires into `step`, `<workflow>/<step>`. Rejects with a `WriteRefusal` where it hires none (404). */
export const fireAgent = (name: string, step: string): Promise<Fired> =>
  send('DELETE', hireRoute(name, step), Schema.Struct({ file: Schema.String, fired: Schema.String }), { body: {}, may: HIRE_WRITTEN });
