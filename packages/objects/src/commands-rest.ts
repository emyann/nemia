/**
 * The words of the rest of the store's verbs: logs, concluded, stats, level, memory, passes, series, subscribe, unsubscribe, the chat's
 * speakers, the pairings and board link, and the person's
 * tokens. Cut by concept into the files beside this one (`commands-rest-<concept>.ts`), which this file
 * lists. Pure.
 */
import type { CommandWords } from './command.ts';
import { REST_NEMIA_WORDS } from './commands-rest-nemia.ts';
import { REST_PAIRING_WORDS } from './commands-rest-pairing.ts';
import { CONCLUDED_WORDS, LOGS_WORDS, MEMORY_WORDS, PASSES_WORDS, SERIES_WORDS } from './commands-rest-reads.ts';
import { STATS_WORDS } from './commands-rest-stats.ts';
import { REST_TOKEN_WORDS } from './commands-rest-tokens.ts';

/** The group's words, in the order the help lists them. */
export const REST_WORDS = [
  CONCLUDED_WORDS,
  LOGS_WORDS,
  STATS_WORDS,
  PASSES_WORDS,
  SERIES_WORDS,
  ...REST_NEMIA_WORDS,
  MEMORY_WORDS,
  ...REST_PAIRING_WORDS,
  ...REST_TOKEN_WORDS,
] as const satisfies readonly CommandWords[];
