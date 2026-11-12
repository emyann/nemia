/**
 * The words of the policies and the rest of the agents', skills' and workflows' verbs.
 * Each joins `DEFINITION_WORDS` when its words move out of the orchestrator's CLI. A group past a file's bound is cut by concept into files
 * beside this one (`commands-definitions-<concept>.ts`), which this file lists. Pure.
 */
import type { CommandWords } from './command.ts';

/** The group's words, in the order the help lists them. */
export const DEFINITION_WORDS = [] as const satisfies readonly CommandWords[];
