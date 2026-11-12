/**
 * The words of the inbox's writes and the labels: inbox add, queue, from and rm; label run and label inbox.
 * Each joins `INBOX_WORDS` when its words move out of the orchestrator's CLI. A group past a file's bound is cut by concept into files
 * beside this one (`commands-inbox-<concept>.ts`), which this file lists. Pure.
 */
import type { CommandWords } from './command.ts';

/** The group's words, in the order the help lists them. */
export const INBOX_WORDS = [] as const satisfies readonly CommandWords[];
