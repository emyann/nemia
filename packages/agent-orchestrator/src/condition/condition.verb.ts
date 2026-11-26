/**
 * `nemia condition`, an entry of the command table: a condition a check of a step waits on, written for the try the step is on, by a
 * person or by a program of the template (`conditionStanding` reads it on every pass). A controller, served on both sides: the api's
 * Run `condition` (`PUT /api/namespaces/:namespace/runs/:name/steps/:step/conditions/:condition`) calls it with its typed input.
 * Refused before anything is written, each refusal naming the fix: a run or step not there (`Missing`), a condition the step waits on
 * no check of (`Invalid`), a try the step is not on (`Conflict`), and a session of the step itself (`Forbidden`, `own-step`).
 */
import { CONDITION_WORDS, WRITTEN_CONDITION_STATUSES } from 'objects';
import { Effect, Schema } from 'effect';
import type { Served } from '../command/entry.verb.ts';
import { Conflict, Forbidden, Invalid, Missing } from '../refusal/refusal.ts';
import { stepChecks } from '../step/step.ts';
import { tryOf } from '../record/record.ts';
import { RunId } from '../record/record.model.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import { conditionWriteRefusal } from './condition.ts';

/** Who writes: the person, or an agent, by a session's token (its run and step) or a standing one (neither). */
const ConditionCaller = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('person') }),
  Schema.Struct({
    kind: Schema.Literal('agent'),
    agent: Schema.String,
    factory: Schema.NullOr(Schema.String),
    run: Schema.optionalKey(Schema.NullOr(Schema.String)),
    step: Schema.optionalKey(Schema.NullOr(Schema.String)),
  }),
]);

/**
 * What `nemia condition` takes: the run, the step, the condition's name, its status, the try it speaks of and the writer's words, and the
 * caller the request is, which the api reads off the request's token: required, so no path takes the person by default.
 */
export const ConditionInput = Schema.Struct({
  runId: Schema.String,
  step: Schema.String,
  condition: Schema.String,
  status: Schema.Literals(WRITTEN_CONDITION_STATUSES),
  try: Schema.Finite,
  message: Schema.String,
  caller: ConditionCaller,
});
export type ConditionInput = typeof ConditionInput.Type;

/** `nemia condition`: the condition as it is kept for the step's try, with when it was written and when its status last changed. */
export const CONDITION: Served<
  {
    step: string;
    name: string;
    try: number;
    status: 'True' | 'False' | 'Unknown';
    message: string;
    at: string;
    transitionedAt: string;
    by: string | null;
  },
  ConditionInput
> = {
  ...CONDITION_WORDS,
  input: ConditionInput,
  handler: Effect.fnUntraced(function* ({ runId, step, condition, status, try: n, message, caller }: ConditionInput) {
    const door = yield* RunDoor;
    if (!(yield* door.runs.exists(RunId.read(runId))))
      return yield* Effect.fail(
        new Missing({
          message: `no such run: ${runId}. nemia condition takes a run by its id, as nemia ls lists it: nemia condition <runId> <step> <name>.`,
        }),
      );
    const run = yield* door.runs.read(RunId.read(runId));
    const spec = (yield* stepsOf(run)).find((s) => s.name === step);
    if (!spec)
      return yield* Effect.fail(
        new Missing({ message: `${runId} has no step ${step}. Name one of its steps: nemia condition ${runId} <step> ${condition}.` }),
      );
    const waitsOn = stepChecks(spec).flatMap((c) => (c.condition === undefined ? [] : [c.condition]));
    const currentTry = tryOf(run, step);
    const refused = conditionWriteRefusal(
      caller.kind === 'agent' ? { run: caller.run ?? null, step: caller.step ?? null } : { run: null, step: null },
      { run: runId, step, condition, try: n },
      { waitsOn, currentTry },
    );
    if (refused === 'own-step')
      return yield* Effect.fail(
        new Forbidden({
          reason: 'own-step',
          message: `${step}'s own session, and its checks, cannot write ${step}'s conditions: a step never vouches for its own work. The template's program or a person writes ${condition}: nemia condition ${runId} ${step} ${condition} --status True|False|Unknown.`,
        }),
      );
    if (refused === 'undeclared')
      return yield* Effect.fail(
        new Invalid({
          message: `${step} waits on no condition named ${condition}${waitsOn.length ? `: it waits on ${waitsOn.join(', ')}` : ' (none of its checks has a condition:)'}. Write one of those, or name ${condition} in a check of ${step}: checks: [{ name: wait, condition: ${condition} }].`,
        }),
      );
    if (refused === 'other-try')
      return yield* Effect.fail(
        new Conflict({
          message: `${step} is on try ${currentTry}, and this speaks of try ${n}: a status is written for the try the step is on. Write it again for try ${currentTry}: nemia condition ${runId} ${step} ${condition} --status ${status} --try ${currentTry}.`,
        }),
      );
    return yield* door.asks.condition(RunId.read(runId), {
      step,
      name: condition,
      try: n,
      status,
      message,
      at: new Date().toISOString(),
      by: caller.kind === 'agent' ? caller.agent : null,
    });
  }),
};
