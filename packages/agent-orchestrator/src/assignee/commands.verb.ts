/** `nemia assign`, an entry of the command table: a run put in someone's hand (`assign`), or given back (`unassign`). */
import type { Assignee } from '../record/record.ts';
import { assign, unassign } from './assignee.verb.ts';
import { timeoutOf } from '../pause/pause.ts';
import { Effect, Schema } from 'effect';
import { Actor, ASSIGN_WORDS, RunAssign } from 'objects';
import { checked, type Served } from '../command/entry.verb.ts';
import { saidOf } from '../command/command.ts';

/**
 * What `nemia assign` takes: the run, the assignee as the api is sent it (`objects`' `RunAssign`: `to`, `why`, `for`), and `off`, its
 * giving back — the api's `DELETE …/assignee`, never its `POST`; and who puts it or gives it back (`actor`, objects' `Actor`), which
 * the api hands of its caller — none from the command line.
 */
export const AssignInput = Schema.Struct({
  runId: Schema.String,
  ...RunAssign.fields,
  off: Schema.optionalKey(Schema.Boolean),
  actor: Schema.optionalKey(Actor),
});
export type AssignInput = typeof AssignInput.Type;

/**
 * `nemia assign`: a run put in someone's hand, or with `--off` given back now. The api serves both: it puts one on `POST
 * /api/namespaces/:namespace/runs/:name/assignee`, whose route fixes `off` false so no body gives one back through it, and gives one back
 * on `DELETE` of the same path.
 */
export const ASSIGN: Served<{ id: string; ended: boolean; assignee: Assignee }, AssignInput> = {
  ...ASSIGN_WORDS,
  input: AssignInput,
  handler: Effect.fnUntraced(function* (input: AssignInput) {
    const { actor, runId, ...flags } = input;
    yield* checked(ASSIGN_WORDS.check(flags));
    if (input.off === true) {
      const { run, assignee } = yield* unassign(runId, actor);
      return { id: run.id, ended: true, assignee };
    }
    const forMs = input.for === undefined ? undefined : timeoutOf(input.for);
    const name = saidOf(flags, 'to');
    const why = saidOf(flags, 'why');
    const { run, assignee } = yield* assign(runId, {
      ...(forMs !== undefined ? { forMs } : {}),
      ...(name ? { name } : {}),
      ...(why ? { why } : {}),
      ...(actor ? { actor } : {}),
    });
    return { id: run.id, ended: false, assignee };
  }),
};
