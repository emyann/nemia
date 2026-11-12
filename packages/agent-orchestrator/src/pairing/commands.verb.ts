/**
 * The commands of pairing and first-visit links, entries of the command table: `nemia pairings ls`, `nemia pairings approve` and
 * `nemia board link`.
 */
import type { Command } from '../command/entry.verb.ts';

/** The pairing commands, in the order `nemia`'s help lists them. */
export const PAIRING_COMMANDS: readonly Command[] = [];
