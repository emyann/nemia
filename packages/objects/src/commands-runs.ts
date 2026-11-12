/**
 * The words of the run's verbs: start, retry, approve, route, refresh, say, cancel, hold, wait, rm, prune and the store's pause.
 * Each joins `RUN_WORDS` when its words move out of the orchestrator's CLI. A group past a file's bound is cut by concept into files
 * beside this one (`commands-runs-<concept>.ts`), which this file lists. Pure.
 */
import type { CommandWords } from './command.ts';

/** The group's words, in the order the help lists them. */
export const RUN_WORDS = [] as const satisfies readonly CommandWords[];
