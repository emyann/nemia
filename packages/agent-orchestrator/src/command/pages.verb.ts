/**
 * The board's reads of one run, each an entry of the command table served on the api alone: the run for its page (`RUN`). The api finds
 * nothing by a path joined from what was sent, words the answer for a run the store does not have, and judges the run it is handed.
 */
import type { Args } from './command.ts';
import type { Command } from './entry.verb.ts';
import { runStore } from '../record/files.store.ts';
import type { Run } from '../record/record.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** The run `id`, found among the runs the store lists, never read by a path made of the id; null for one the store does not have. */
export const RUN: Command<{ run: Run | null }> = {
  name: 'run',
  usage: '<id>',
  help: ['one run, read for its page'],
  spec: {
    positionals: [{ key: 'id', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `the board's run page reads one run, and ${arg} is a second.`,
  },
  writes: false,
  route: { method: 'GET', path: '/api/runs/:id', status: 200 },
  only: {
    side: 'api',
    why: "the board's run page is a run judged, with its steps and their files; at the command line, wf show reads its record",
  },
  handler: async (_e, args) => ({ run: runStore.runs.list().find((r) => r.id === textOf(args, 'id')) ?? null }),
  print: () => [],
};

/** The board's reads of one run, in the order the table lists them. */
export const PAGES: readonly Command[] = [RUN] as readonly Command[];
