/** The merge check as an entry of the command table (`MERGES`), served on the api alone. */
import type { Command } from '../command/entry.verb.ts';
import { mergesOf, type StandingMerge } from './merge.store.ts';

/**
 * Whether each branch named still merges onto the base branch of the run named (`mergesOf`), keyed by branch: what the board's decision
 * says under each branch ahead of the base.
 */
export const MERGES: Command<Record<string, StandingMerge>> = {
  name: 'merges',
  usage: '<runId> [<branches> ...]',
  help: ["whether each of a run's branches still merges onto its base branch"],
  spec: {
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'branches', takes: 'many', kind: 'name' },
    ],
    flags: [],
    unknown: (arg) => `the merge check does not take ${arg}.`,
  },
  writes: false,
  only: {
    side: 'api',
    why: "the board's decision says whether each branch ahead still merges onto its base; wf decide leaves a trial merge to the person",
  },
  handler: async (_e, args) => mergesOf(String(args.runId ?? ''), Array.isArray(args.branches) ? args.branches : []),
  print: () => [],
};
