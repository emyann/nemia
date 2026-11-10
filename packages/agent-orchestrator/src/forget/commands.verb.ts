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
import { RunPrune } from 'objects';
import { tryOf } from '../summary/reads.verb.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import type { Args } from '../command/command.ts';
import { checked, type Command } from '../command/entry.verb.ts';

/** `nemia rm`'s form, as its refusals end on it. */
const RM_FORM = 'nemia rm <runId> [<runId> ...] [--delete-branches [--force-unmerged]]';

/**
 * Refused of `nemia rm`'s arguments before any run is read: `--force-unmerged` without `--delete-branches` — it forces what that flag
 * deletes, and alone would delete nothing, silently — then a switch with no run to forget.
 */
function rmRefusal(args: Args): string | null {
  if (args.forceUnmerged === true && args.deleteBranches !== true)
    return "--force-unmerged forces --delete-branches to delete a branch not merged into its run's base branch, and alone deletes nothing: nemia rm <runId> --delete-branches --force-unmerged.";
  if (args.runId === undefined && args.deleteBranches === true)
    return 'nemia rm takes the runs to forget, by id: nemia rm <runId> [<runId> ...] — nemia ls lists them.';
  return null;
}

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
export const RM: Command<{ id: string; removed: boolean; engine: EngineForgetting | null; forgot: Forgot }, RmInput> = {
  name: 'rm',
  usage: '<runId> [<runId> ...] [--delete-branches [--force-unmerged]]',
  help: [
    "forget runs that are over, a line each: a run's worktrees removed",
    'through git, what one held uncommitted committed first, then its',
    'record and every file under WF_ROOT keyed by its id. Refused while',
    'a task of it is in flight, anything is due to be filed or asked',
    'for, or a run waiting on it has not started. Its branches are kept:',
    "--delete-branches deletes those merged into the run's base branch,",
    'and --force-unmerged beside it the others, with their work. Then',
    "the engine forgets the run's tasks: their journals and session",
    'files; one not settled yet is forgotten by the next passes',
  ],
  spec: {
    positionals: [{ key: 'runId', takes: 'many', kind: 'name' }],
    flags: [
      { flag: '--delete-branches', kind: 'switch', key: 'deleteBranches' },
      { flag: '--force-unmerged', kind: 'switch', key: 'forceUnmerged' },
    ],
    unknown: (arg) =>
      `nemia rm does not take ${arg}. It takes the runs to forget, then --delete-branches, and --force-unmerged beside it: ${RM_FORM}.`,
  },
  check: rmRefusal,
  writes: true,
  class: 'ask',
  only: { side: 'cli', why: "the api serves it as the Run's `delete` of `objects`' Api, calling this handler, a try alone" },
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
  print: ({ forgot }) => [forgetLine(forgot)],
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
export const PRUNE: Command<
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
  name: 'prune',
  usage: '[<runId> ...] [--unmerged] [--artifacts] [--yes]',
  help: [
    'free the space runs that are over hold: their worktrees, removed',
    "through git, and nothing else — each run's record, branches and",
    'files are kept, and it stays on nemia ls, nemia decide and the board,',
    'marked pruned. --artifacts removes its files too (runs/<id>/',
    'artifacts/: screenshots, logs), of a run whose worktrees are',
    'already gone as well; its record and branches are still kept.',
    'Lists what it would remove, with its size, and removes it on',
    '--yes, or on y at the prompt. With no run, every run. Refused',
    'while a run is not over, owes a hand-off, is a folder run, or has',
    'a worktree held, on no branch, or with changes no commit has;',
    'and a finished run not merged unless --unmerged, with --artifacts',
    'as without: its files are what a person reads to decide it',
  ],
  spec: {
    positionals: [{ key: 'runId', takes: 'many', kind: 'name' }],
    flags: [
      { flag: '--unmerged', kind: 'switch', key: 'unmerged' },
      { flag: '--artifacts', kind: 'switch', key: 'artifacts' },
      { flag: '--yes', kind: 'switch', key: 'yes' },
    ],
    unknown: (arg) =>
      `nemia prune does not take ${arg}. It takes the runs to prune — none is every run — then --unmerged, --artifacts and --yes: nemia prune [<runId> ...] [--unmerged] [--artifacts] [--yes].`,
  },
  writes: true,
  class: 'ask',
  only: { side: 'cli', why: "the api serves it as the Run's `prune` of `objects`' Api, calling this handler" },
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
  print: ({ pruning }) => pruneLines(pruning),
};
