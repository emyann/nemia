/**
 * `nemia refresh`, an entry of the command table: a run's definitions pinned again (`refreshRun`), or, with `--base`, its base merged
 * into its looping step (`mergeRun`).
 */
import { Effect, Schema } from 'effect';
import { RunRefresh } from 'objects';
import { stepsOf } from '../steps/steps.verb.ts';
import { rooted } from '../factory/wiring/wire.verb.ts';
import { checked, type Command } from '../command/entry.verb.ts';
import { mergeRun } from '../merge/merge.verb.ts';
import { mergeAskedLine } from '../merge/merge.ts';
import { refreshRun } from './pin.verb.ts';
import { driftWords, type Drift } from './revisions.ts';

/** The run's id and the step, as `nemia retry`, `nemia approve` and `nemia refresh` take them: no step for a run's only loop. */
const RUN_LOOP = [
  { key: 'runId', takes: 'required', kind: 'name' },
  { key: 'step', takes: 'optional', kind: 'name' },
] as const;

/** What `nemia refresh` takes: the run, and the ask as the api is sent it (`objects`' `RunRefresh`): `base`, and its looping step. */
export const RefreshInput = Schema.Struct({ runId: Schema.String, ...RunRefresh.fields });
export type RefreshInput = typeof RefreshInput.Type;

/** The refusal of a step named without `--base`, which alone takes one. */
function refreshRefusal({
  runId,
  step,
  base,
}: {
  readonly runId?: unknown;
  readonly step?: unknown;
  readonly base?: unknown;
}): string | null {
  const id = typeof runId === 'string' ? runId : '<runId>';
  return base !== true && typeof step === 'string'
    ? `nemia refresh takes a step only with --base, which merges the base into the work of the loop it closes: nemia refresh ${id} ${step} --base. The new revisions are the whole run's: nemia refresh ${id}.`
    : null;
}

/**
 * `nemia refresh`: a run asked to take the new revisions of the kinds it resolved, and the drift it was asked on; or, with `--base`, a
 * loop's work sent back to merge its base branch, on the round it is on (what `nemia merge` was, decision 7).
 *
 * It takes, it does not reload: the next pass re-pins the run and renders its steps' agent files again, so every filing after it — a new
 * step, a retry, a round — is filed on the revisions the world holds now. Nothing already filed is re-run.
 */
export const REFRESH: Command<
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
  name: 'refresh',
  usage: '<runId> [<step>] [--base]',
  help: [
    'take the new revisions: a run keeps the workflow, agents, skills and',
    'factory rules it resolved when it started, and this pins it to the',
    'ones they hold now, so every filing after it — a new step, a retry,',
    'a round — is filed on them. What has already been filed is not re-run,',
    'and the steps the run has are neither added to nor removed. Refused of',
    'a run that has filed nothing, which resolves afresh at its first filing',
    'anyway, of one already on the newest revision of every kind, and of one',
    'whose factory follows revisions (nemia factory revisions), whose every',
    'filing takes them with no refresh;',
    "--base: take the base instead — a loop's work that no longer merges",
    'cleanly goes back to merge it, once, on the next tick, on the round it',
    'is on, which the merge does not spend; the step is the one that closes',
    'the loop, left out where the run has one loop',
  ],
  spec: {
    positionals: RUN_LOOP,
    flags: [{ flag: '--base', kind: 'switch', key: 'base' }],
    unknown: (arg) =>
      `nemia refresh takes one run's id, and with --base the step that closes the loop whose work merges: not ${arg}. nemia refresh <runId>, or nemia refresh <runId> [<step>] --base.`,
    missing: 'nemia refresh takes the run to pin to the new revisions: nemia refresh <runId>.',
  },
  check: (args) => refreshRefusal(args),
  writes: true,
  ticks: true,
  class: 'act',
  only: { side: 'cli', why: "the api serves it as the Run's `refresh` of `objects`' Api, calling this handler" },
  input: RefreshInput,
  handler: Effect.fnUntraced(function* (input: RefreshInput, _env?: NodeJS.ProcessEnv, home?: string) {
    yield* checked(refreshRefusal(input));
    const { runId } = input;
    if (input.base !== true) return { drift: yield* rooted(home, 'refresh', refreshRun(runId)) };
    const { run, ask, file } = yield* mergeRun(runId, input.step);
    const looping = (yield* stepsOf(run)).find((s) => s.name === ask.step);
    if (looping === undefined)
      throw new Error(`run ${run.id} has no step ${ask.step}, which its merge asks: report it as a defect of nemia refresh --base`);
    const { target, onto, sha } = ask.merge;
    return { step: ask.step, target, onto, sha, round: ask.round, file, said: mergeAskedLine(ask, looping) };
  }),
  print: ({ drift, said, file }, { runId, base }) =>
    base === true
      ? [`${runId}  ${said ?? ''}`, `   ${file ?? ''}`]
      : [
          `${runId}  asked: the new revisions — the next tick takes them, and every filing after it is on them`,
          ...(drift ?? []).map((d) => `   ${driftWords(d)}`),
        ],
};
