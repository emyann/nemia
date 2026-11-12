/**
 * `nemia rm` and `nemia prune`, entries of the command table: one run forgotten (`forgetRun`), or what it left on disk pruned (`prune`);
 * the CLI's runners walk the many runs each takes.
 */
import { StoreRoot } from '../config/root.store.ts';
import { forgetLine, type Forgot } from './forget.ts';
import { forgetRun } from './forget.verb.ts';
import type { EngineForgetting } from './forgetting/forgetting.ts';
import { pruneLines, type Pruning } from './prune/prune.ts';
import { prune } from './prune/prune.verb.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';
import { Effect, Schema } from 'effect';
import { PRUNE_WORDS, RM_WORDS, rmRefusal, RunPrune } from 'objects';
import { tryOf } from '../summary/reads.verb.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { checked, type Served } from '../command/entry.verb.ts';

/**
 * What `nemia rm` takes of one run: the run, its two switches, and the two the api sets: `onlyTry`, removing a try alone — a run started
 * from an agent's page (`tryOf`) — and `refuses`, failing with what removed nothing (`forgetRefusal`) where the command line says it as
 * a line.
 */
export const RmInput = Schema.Struct({
  runId: Schema.String,
  deleteBranches: Schema.optionalKey(Schema.Boolean),
  forceUnmerged: Schema.optionalKey(Schema.Boolean),
  onlyTry: Schema.optionalKey(Schema.Boolean),
  refuses: Schema.optionalKey(Schema.Boolean),
});
export type RmInput = typeof RmInput.Type;

/**
 * Refused of a removal of a try alone (`onlyTry`) for any other run: a repository run's worktrees and branches are a person's to read
 * before they go, and `nemia rm` says what it hands off and what it leaves.
 */
const tryAlone = Effect.fnUntraced(function* (runId: string, home: string) {
  const run = yield* (yield* RunDoor).runs.find(RunId.read(runId), () => {});
  if (run === undefined) return;
  if (tryOf(run, home)) return;
  return yield* Effect.fail(
    new Conflict({
      message: `${run.id} is a run of ${run.workflowDir}, and only a try — a run started from an agent's page — is removed here. Remove it with \`nemia rm ${run.id}\`, which says what it hands off and what it leaves.`,
    }),
  );
});

/** What removed nothing, as a refusal: refused or held, a `Conflict` in `forget`'s words; a record gone since, `Missing`; else none. */
export const forgetRefusal = (forgot: Forgot): Conflict | Missing | null => {
  if (forgot.kind === 'refused') return new Conflict({ message: forgot.refusal ?? forgetLine(forgot) });
  if (forgot.kind === 'held') return new Conflict({ message: forgetLine(forgot) });
  return forgot.kind === 'missing' ? new Missing({ message: forgetLine(forgot) }) : null;
};

/**
 * `nemia rm`: one run forgotten, judged on its own (`forget`), and what was done with it (`forgot`), a refusal included, and with its
 * tasks on the engine (`engine`, null where nothing was removed). The api removes a try alone (`onlyTry`), and a run only once it is gone
 * (`refuses`): what `forget` refused, or held, is a `Conflict` in its words, and a run gone since a `Missing`.
 */
export const RM: Served<{ id: string; removed: boolean; engine: EngineForgetting | null; forgot: Forgot }, RmInput> = {
  ...RM_WORDS,
  input: RmInput,
  handler: Effect.fnUntraced(function* (input: RmInput) {
    const home = yield* StoreRoot;
    yield* checked(rmRefusal(input));
    const { runId } = input;
    if (input.onlyTry === true) yield* tryAlone(runId, home);
    const forgot = yield* forgetRun(runId, {
      deleteBranches: input.deleteBranches === true,
      forceUnmerged: input.forceUnmerged === true,
    });
    const refused = input.refuses === true ? forgetRefusal(forgot) : null;
    if (refused) return yield* Effect.fail(refused);
    return { id: forgot.id, removed: forgot.kind === 'forgotten', engine: forgot.engine ?? null, forgot };
  }),
};

/**
 * What `nemia prune` takes of one run: the run, the prune as the api is sent it (`objects`' `RunPrune`: `unmerged`, `artifacts`), `yes`,
 * which removes, and `refuses`, the api's, failing with what pruned nothing (`pruneRefusal`) where the command line says it as lines.
 */
export const PruneInput = Schema.Struct({
  runId: Schema.String,
  ...RunPrune.fields,
  yes: Schema.optionalKey(Schema.Boolean),
  refuses: Schema.optionalKey(Schema.Boolean),
});
export type PruneInput = typeof PruneInput.Type;

/** What pruned nothing, as a refusal: refused, or nothing to prune, a `Conflict` in `nemia prune`'s words; else none. */
export const pruneRefusal = (pruning: Pruning): Conflict | null => {
  if (pruning.kind === 'refused') return new Conflict({ message: pruning.refusal ?? pruneLines(pruning).join('\n') });
  return pruning.kind === 'nothing' ? new Conflict({ message: `Nothing to prune: ${pruning.nothing}.` }) : null;
};

/**
 * `nemia prune`: one run judged for what it holds that a prune frees (`prune`), and removed on `yes`; the api always prunes as `--yes`
 * does, with `refuses`: what `prune` refused, or found nothing to prune of, is a `Conflict` there, in its words.
 */
export const PRUNE: Served<
  {
    id: string;
    pruned: boolean;
    lines: readonly string[];
    worktrees: Pruning['worktrees'];
    artifacts: NonNullable<Pruning['artifacts']> | null;
    left: Pruning['left'];
    pruning: Pruning;
  },
  PruneInput
> = {
  ...PRUNE_WORDS,
  input: PruneInput,
  handler: Effect.fnUntraced(function* (input: PruneInput) {
    const p: Pruning = yield* prune(input.runId, {
      unmerged: input.unmerged === true,
      artifacts: input.artifacts === true,
      yes: input.yes === true,
    });
    const refused = input.refuses === true ? pruneRefusal(p) : null;
    if (refused) return yield* Effect.fail(refused);
    const { id, worktrees, left } = p;
    return { id, pruned: p.kind === 'pruned', lines: pruneLines(p), worktrees, artifacts: p.artifacts ?? null, left, pruning: p };
  }),
};
