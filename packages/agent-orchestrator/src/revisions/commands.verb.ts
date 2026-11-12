/**
 * `nemia refresh`, an entry of the command table: a run's definitions pinned again (`refreshRun`), or, with `--base`, its base merged
 * into its looping step (`mergeRun`).
 */
import { Effect, Schema } from 'effect';
import { REFRESH_WORDS, refreshRefusal, RunRefresh } from 'objects';
import { stepsOf } from '../steps/steps.verb.ts';
import { checked, type Served } from '../command/entry.verb.ts';
import { mergeRun } from '../merge/merge.verb.ts';
import { mergeAskedLine } from '../merge/merge.ts';
import { refreshRun } from './pin.verb.ts';
import { type Drift } from './revisions.ts';

/** What `nemia refresh` takes: the run, and the ask as the api is sent it (`objects`' `RunRefresh`): `base`, and its looping step. */
export const RefreshInput = Schema.Struct({ runId: Schema.String, ...RunRefresh.fields });
export type RefreshInput = typeof RefreshInput.Type;

/**
 * `nemia refresh`: a run asked to take the new revisions of the kinds it resolved, and the drift it was asked on; or, with `--base`, a
 * loop's work sent back to merge its base branch, on the round it is on (what `nemia merge` was, decision 7).
 *
 * It takes, it does not reload: the next pass re-pins the run and renders its steps' agent files again, so every filing after it — a new
 * step, a retry, a round — is filed on the revisions the world holds now. Nothing already filed is re-run.
 */
export const REFRESH: Served<
  {
    drift?: readonly Drift[];
    step?: string;
    target?: string;
    onto?: string;
    sha?: string;
    round?: number;
    file?: string;
    said?: string;
  },
  RefreshInput
> = {
  ...REFRESH_WORDS,
  input: RefreshInput,
  handler: Effect.fnUntraced(function* (input: RefreshInput) {
    yield* checked(refreshRefusal(input));
    const { runId } = input;
    if (input.base !== true) return { drift: yield* refreshRun(runId) };
    const { run, ask, file } = yield* mergeRun(runId, input.step);
    const looping = (yield* stepsOf(run)).find((s) => s.name === ask.step);
    if (looping === undefined)
      throw new Error(`run ${run.id} has no step ${ask.step}, which its merge asks: report it as a defect of nemia refresh --base`);
    const { target, onto, sha } = ask.merge;
    return { step: ask.step, target, onto, sha, round: ask.round, file, said: mergeAskedLine(ask, looping) };
  }),
};
