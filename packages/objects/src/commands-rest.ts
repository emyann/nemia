/**
 * The words of the rest of the store's verbs: logs, concluded, stats, level, memory, daemon, passes, series, subscribe, unsubscribe, the
 * chat's speakers, the pairings and board link.
 * Each joins `REST_WORDS` when its words move out of the orchestrator's CLI. A group past a file's bound is cut by concept into files
 * beside this one (`commands-rest-<concept>.ts`), which this file lists. Pure.
 */
import type { CommandWords } from './command.ts';

/** The group's words, in the order the help lists them. */
export const REST_WORDS = [] as const satisfies readonly CommandWords[];
