/** `nemia hold` and `nemia release`, entries of the command table: a run held until other runs succeed or a person lifts it (`hold`), or
 * lifted (`unhold`). */
import { type Hold, type Released } from '../record/record.ts';
import { hold, unhold } from './wait.verb.ts';
import { release } from './release.verb.ts';
import { Effect, Schema } from 'effect';
import { Actor, HOLD_WORDS, holdRefusal, RELEASE_WORDS, RunHold } from 'objects';
import { checked, type Served } from '../command/entry.verb.ts';
import { saidOf } from '../command/command.ts';

/**
 * What `nemia hold` takes: the run, the hold as the api is sent it (`objects`' `RunHold`: `until`, `why`, `by`), and `off`, its lift — the
 * api's `DELETE …/hold`, never its `POST`; and who puts it or lifts it (`actor`, objects' `Actor`), which the api hands of its caller: a
 * put keeps it beside `by`, a lift beside the run (`unheld`) — none from the command line.
 */
export const HoldInput = Schema.Struct({
  runId: Schema.String,
  ...RunHold.fields,
  off: Schema.optionalKey(Schema.Boolean),
  actor: Schema.optionalKey(Actor),
});
export type HoldInput = typeof HoldInput.Type;

/**
 * `nemia hold`: a run held until other runs succeed, or, naming none, until a person lifts it, or with `--off` its hold lifted now. The api
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
      const { run, hold: lifted } = yield* unhold(runId, actor);
      return { id: run.id, lifted: true, hold: lifted };
    }
    const said = { why: saidOf(flags, 'why'), by: saidOf(flags, 'by'), ...(actor ? { actor } : {}) };
    const { run, hold: put } = yield* hold(runId, [...(input.until ?? [])], said);
    return { id: run.id, lifted: false, hold: put };
  }),
};

/** What `nemia release` takes: the run whose waiters are released, which the api reads off its path; and who releases them (`actor`). */
export const ReleaseInput = Schema.Struct({ runId: Schema.String, actor: Schema.optionalKey(Actor) });
export type ReleaseInput = typeof ReleaseInput.Type;

/**
 * `nemia release`: every run that waits on this one let go, as if it had succeeded. The api serves it as the Run's `release`
 * (`POST /api/namespaces/:namespace/runs/:name/release`).
 */
export const RELEASE: Served<{ id: string; released: Released }, ReleaseInput> = {
  ...RELEASE_WORDS,
  input: ReleaseInput,
  handler: Effect.fnUntraced(function* ({ runId, actor }: ReleaseInput) {
    const { run, released } = yield* release(runId, actor);
    return { id: run.id, released };
  }),
};
