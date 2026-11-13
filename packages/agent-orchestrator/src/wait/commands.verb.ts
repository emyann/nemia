/** `nemia hold`, an entry of the command table: a run held until other runs land or a person lifts it (`hold`), or lifted (`unhold`). */
import { type Hold } from '../record/record.ts';
import { hold, unhold } from './wait.verb.ts';
import { Effect, Schema } from 'effect';
import { Actor, HOLD_WORDS, holdRefusal, RunHold } from 'objects';
import { checked, type Served } from '../command/entry.verb.ts';
import { saidOf } from '../command/command.ts';

/**
 * What `nemia hold` takes: the run, the hold as the api is sent it (`objects`' `RunHold`: `until`, `why`, `by`), and `off`, its lift — the
 * api's `DELETE …/hold`, never its `POST`; and who puts it (`actor`, objects' `Actor`), which the api hands of its caller and the hold
 * keeps beside `by` — none from the command line.
 */
export const HoldInput = Schema.Struct({
  runId: Schema.String,
  ...RunHold.fields,
  off: Schema.optionalKey(Schema.Boolean),
  actor: Schema.optionalKey(Actor),
});
export type HoldInput = typeof HoldInput.Type;

/**
 * `nemia hold`: a run held until other runs land, or, naming none, until a person lifts it, or with `--off` its hold lifted now. The api
 * serves both: it puts a hold on `POST /api/runs/:runId/hold`, whose route fixes `off` false so no body lifts through it, and lifts one on
 * `DELETE /api/runs/:runId/hold`.
 */
export const HOLD: Served<{ id: string; lifted: boolean; hold: Hold }, HoldInput> = {
  ...HOLD_WORDS,
  input: HoldInput,
  handler: Effect.fnUntraced(function* (input: HoldInput) {
    const { actor, ...flags } = input;
    yield* checked(holdRefusal(flags));
    const { runId } = input;
    if (input.off === true) {
      const { run, hold: lifted } = yield* unhold(runId);
      return { id: run.id, lifted: true, hold: lifted };
    }
    const said = { why: saidOf(flags, 'why'), by: saidOf(flags, 'by'), ...(actor ? { actor } : {}) };
    const { run, hold: put } = yield* hold(runId, [...(input.until ?? [])], said);
    return { id: run.id, lifted: false, hold: put };
  }),
};
