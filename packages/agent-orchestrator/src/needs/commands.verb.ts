/**
 * The commands of a machine's needs and its readiness, entries of the command table: `nemia readiness` and `nemia readiness fix`.
 */
import type { Command } from '../command/entry.verb.ts';

/** The needs' and the readiness read's commands, in the order `nemia`'s help lists them. */
export const NEEDS_COMMANDS: readonly Command[] = [];
