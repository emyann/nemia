/**
 * The words of the run's verbs that let go of runs that are over: `nemia rm` (each run forgotten, a line each) and `nemia prune` (the
 * space they hold freed, listed first and freed on `--yes` or a person's y). The client walks the many runs a line names, one call each.
 * Pure.
 */
import type { Args, CommandWords } from './command.ts';

/** `nemia rm`'s form, as its refusals end on it. */
const RM_FORM = 'nemia rm <runId> [<runId> ...] [--delete-branches [--force-unmerged]]';

/**
 * Refused of `nemia rm`'s arguments before any run is read: `--force-unmerged` without `--delete-branches` — it forces what that flag
 * deletes, and alone would delete nothing, silently — then a switch with no run to forget.
 */
export function rmRefusal(args: Args): string | null {
  if (args.forceUnmerged === true && args.deleteBranches !== true)
    return "--force-unmerged forces --delete-branches to delete a branch not merged into its run's base branch, and alone deletes nothing: nemia rm <runId> --delete-branches --force-unmerged.";
  const none = args.runId === undefined || (Array.isArray(args.runId) && args.runId.length === 0);
  if (none && args.deleteBranches === true)
    return 'nemia rm takes the runs to forget, by id: nemia rm <runId> [<runId> ...] — nemia ls lists them.';
  return null;
}

/** `nemia rm`: runs that are over forgotten, a line each, their worktrees removed and their branches kept unless asked. */
export const RM_WORDS = {
  name: 'rm',
  served: [{ endpoint: 'runs.delete' }],
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
  only: { side: 'cli', why: "the api serves it as the Run's `delete` of `objects`' Api, calling this handler" },
} as const satisfies CommandWords;

/** `nemia prune`: the space runs that are over hold, listed with its size and freed on `--yes`, or on y at the prompt. */
export const PRUNE_WORDS = {
  name: 'prune',
  served: [{ endpoint: 'runs.prune' }],
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
} as const satisfies CommandWords;
