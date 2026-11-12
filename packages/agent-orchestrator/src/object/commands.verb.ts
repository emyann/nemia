/**
 * The run object's reads at the command line, entries of the command table: `nemia show` (the run as one object, or its record), a
 * step's tries, one try, its closeout and what it was told, and `nemia logs` (a step's session output).
 */
import { Effect, Schema } from 'effect';
import { CLOSEOUT_WORDS, Run as RunObject, SHOW_WORDS } from 'objects';
import { EngineService, asked, tried } from '../runtime-client.ts';
import type { PlaceService } from '../place/place.store.ts';
import { StoreRoot } from '../config/root.store.ts';
import type { StoreConfig } from '../config/config.store.ts';
import type { Refusal } from '../refusal/refusal.ts';
import type { StepTry } from '../resource/tries.verb.ts';
import { runObject, stepCloseout, stepTold, stepTries, stepTry, type TryCloseout } from './run.verb.ts';
import { runsAtOnce } from '../runs/runs.store.ts';
import type { Run } from '../record/record.ts';
import type { Command, Served } from '../command/entry.verb.ts';

/** The refusal of a word or a flag a read of a step does not take. */
const takesNo = (verb: string, form: string) => (arg: string) => `nemia ${verb} takes ${form}: not ${arg}.`;

/** The record as `nemia show --raw` prints it: its brief cut at 120 characters and each frozen step's body at 60. */
const rawOf = (run: Run) => {
  const workflow = run.workflow?.map(({ body, ...keys }) => ({ ...keys, body: `${body.slice(0, 60)}…` }));
  return { ...run, brief: `${run.brief.slice(0, 120)}…`, workflow };
};

/** What `nemia show` takes, and the api's record read calls it with: the run, by its id, and `raw` for its record. */
const ShowInput = Schema.Struct({ runId: Schema.String, raw: Schema.optionalKey(Schema.Boolean) });

/**
 * `nemia show`, whose words the client holds (`objects`' `SHOW_WORDS`): the run as one object, `nemia/v1`'s `Run` (`runObject`), encoded
 * by the objects' `Run` as the api encodes it; `raw`, the run's record, its brief cut at 120 characters and each frozen step's body at 60.
 * The api serves the object on `GET /api/runs/:name`, by hand, handed the app's memo, and the record on `GET /api/runs/:name/record`,
 * calling this handler.
 */
export const SHOW: Served<Readonly<Record<string, unknown>>, typeof ShowInput.Type> = {
  ...SHOW_WORDS,
  input: ShowInput,
  handler: (args) =>
    Effect.flatMap(
      Effect.flatMap(StoreRoot, (home) => tried(() => runsAtOnce(home).runs.read(args.runId))),
      (run): Effect.Effect<Readonly<Record<string, unknown>>, Refusal, EngineService | PlaceService | StoreRoot | StoreConfig> =>
        args.raw === true
          ? Effect.succeed(rawOf(run))
          : Effect.map(runObject(run, { memo: { said: new Map() } }), (object) =>
              'unjudged' in object ? object : Schema.encodeSync(RunObject)(object),
            ),
    ),
};

/** What a read of a run's step takes: the run's id and the step's name, as the CLI's positionals and the api's path name them. */
export const StepInput = Schema.Struct({ runId: Schema.String, step: Schema.String });
export type StepInput = typeof StepInput.Type;

/** What a read of one try of a step takes: the step's, and the try's number as the path or the command line says it. */
export const TryInput = Schema.Struct({ ...StepInput.fields, try: Schema.String });
export type TryInput = typeof TryInput.Type;

/** What `nemia closeout` takes: the step's, and the try's number, none for its latest. */
export const CloseoutInput = Schema.Struct({ ...StepInput.fields, try: Schema.optionalKey(Schema.String) });
export type CloseoutInput = typeof CloseoutInput.Type;

/** The positionals of a step's sub-resource: the run's id and the step's name. */
const RUN_STEP = [
  { key: 'runId', takes: 'required', kind: 'name' },
  { key: 'step', takes: 'required', kind: 'name' },
] as const;

/** What the sub-resources the api alone serves say of the command line. */
const API_ONLY = 'a sub-resource of the run object, for a client; at the command line `nemia show <run>` prints the run whole';

/** A step's tries, earliest first, the current one last (`StepTry`): the api's `steps` group serves it (`tries`). */
export const TRIES: Command<{ tries: StepTry[] }, StepInput> = {
  name: 'tries',
  served: [{ endpoint: 'steps.tries' }],
  usage: '<runId> <step>',
  help: ["a step's tries"],
  spec: { positionals: [...RUN_STEP], flags: [], unknown: takesNo('tries', "one run's id and one step's name") },
  writes: false,
  class: 'read',
  only: { side: 'api', why: API_ONLY },
  input: StepInput,
  handler: ({ runId, step }) => stepTries(runId, step),
  print: (data) => [JSON.stringify(data, null, 2)],
};

/** One try of a step (`StepTry`): the api's `steps` group serves it (`try`). */
export const TRY: Command<StepTry, TryInput> = {
  name: 'try',
  served: [{ endpoint: 'steps.try', query: { fields: '' } }],
  usage: '<runId> <step> <try>',
  help: ['one try of a step'],
  spec: {
    positionals: [...RUN_STEP, { key: 'try', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: takesNo('try', "one run's id, one step's name and one try's number"),
  },
  writes: false,
  class: 'read',
  only: { side: 'api', why: API_ONLY },
  input: TryInput,
  handler: ({ runId, step, try: n }) => stepTry(runId, step, n),
  print: (data) => [JSON.stringify(data, null, 2)],
};

/**
 * `nemia closeout <run> <step> [--try n]`, whose words the client holds (`objects`' `CLOSEOUT_WORDS`): what a try of a step signed off
 * with, its latest by default (`TryCloseout`); the api's `steps` group serves it (`closeout`), calling this handler.
 */
export const CLOSEOUT: Served<TryCloseout, CloseoutInput> = {
  ...CLOSEOUT_WORDS,
  input: CloseoutInput,
  handler: ({ runId, step, try: n }) => stepCloseout(runId, step, n),
};

/** What a step was told, its brief by layer and its task by part (`toldOf`): the api's `steps` group serves it (`told`). */
export const TOLD: Command<Effect.Success<ReturnType<typeof stepTold>>, StepInput> = {
  name: 'told',
  served: [{ endpoint: 'steps.told' }],
  usage: '<runId> <step>',
  help: ['what a step was told'],
  spec: { positionals: [...RUN_STEP], flags: [], unknown: takesNo('told', "one run's id and one step's name") },
  writes: false,
  class: 'read',
  only: { side: 'api', why: API_ONLY },
  input: StepInput,
  handler: ({ runId, step }) => stepTold(runId, step),
  print: (data) => [JSON.stringify(data, null, 2)],
};

/**
 * `nemia logs`: the session output of a step's current task, read from the engine whole, or nothing for a step with no task filed — one not
 * run yet, or one the run does not have. The api's `steps` group serves its end (`log`), calling this handler.
 */
export const LOGS: Command<{ taskId?: string; output?: string }, StepInput> = {
  name: 'logs',
  served: [{ endpoint: 'steps.log' }],
  usage: '<runId> <step>',
  help: ["that step's session output"],
  spec: {
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'step', takes: 'required', kind: 'name' },
    ],
    flags: [],
    unknown: takesNo('logs', "one run's id and one step's name"),
  },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: "the api serves its end as the `log` of `objects`' steps group, calling this handler" },
  input: StepInput,
  handler: Effect.fnUntraced(function* ({ runId, step }: StepInput) {
    const e = yield* EngineService;
    const home = yield* StoreRoot;
    const taskId = runsAtOnce(home).runs.read(runId).steps[step]?.taskId;
    return taskId ? { taskId, output: yield* asked('logs', e.logs(taskId)) } : {};
  }),
  print: ({ output }, { step }) => [output ?? `${step} has not run yet`],
};
