/**
 * The words of the moved reads: show, closeout, ls, inbox and watch.
 * Each joins `READ_WORDS` when its words move out of the orchestrator's CLI. A group past a file's bound is cut by concept into files
 * beside this one (`commands-reads-<concept>.ts`), which this file lists. Pure.
 */
import type { CommandWords } from './command.ts';

/** The group's words, in the order the help lists them. */
export const READ_WORDS = [] as const satisfies readonly CommandWords[];
