/** `nemia hold`, an entry of the command table: a run held until other runs land or a person lifts it (`hold`), or lifted (`unhold`). */
import { type Hold } from '../record/record.ts';
import { hold, unhold } from './wait.verb.ts';
import { Effect, Schema } from 'effect';
import { HOLD_WORDS, holdRefusal, RunHold } from 'objects';
import { checked, type Served } from '../command/entry.verb.ts';
import { saidOf } from '../command/command.ts';

/**
 * What `nemia hold` takes: the run, the hold as the api is sent it (`objects`' `RunHold`: `until`, `why`, `by`), and `off`, its lift — the
 * api's `DELETE …/hold`, never its `POST`.
 */
export const HoldInput = Schema.Struct({ runId: Schema.String, ...RunHold.fields, off: Schema.optionalKey(Schema.Boolean) });
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
    yield* checked(holdRefusal(input));
    const { runId } = input;
    if (input.off === true) {
      const { run, hold: lifted } = yield* unhold(runId);
      return { id: run.id, lifted: true, hold: lifted };
    }
    const { run, hold: put } = yield* hold(runId, [...(input.until ?? [])], { why: saidOf(input, 'why'), by: saidOf(input, 'by') });
    return { id: run.id, lifted: false, hold: put };
  }),
};
