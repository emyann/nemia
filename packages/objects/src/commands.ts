/**
 * The words of the commands the client holds (`COMMAND_WORDS`): each parsed, helped, refused and printed by `apps/cli` from these words,
 * and run through the `Api`, under every context. The orchestrator's table spreads each under the handler the api calls, so the verbs
 * skill, the MCP port's tools and admission read the same words. A command joins its group's list when its words move out of the
 * orchestrator's CLI, and its old path's words and runner are deleted with the move. Pure.
 */
import type { CommandWords } from './command.ts';
import { DEFINITION_WORDS } from './commands-definitions.ts';
import { FACTORY_WORDS } from './commands-factories.ts';
import { INBOX_WORDS } from './commands-inbox.ts';
import { READ_WORDS } from './commands-reads.ts';
import { REST_WORDS } from './commands-rest.ts';
import { RUN_WORDS } from './commands-runs.ts';
import { WRITER_WORDS } from './commands-writers.ts';

/** The words of every command the client holds, group by group. */
const WORDS = [...RUN_WORDS, ...INBOX_WORDS, ...FACTORY_WORDS, ...WRITER_WORDS, ...DEFINITION_WORDS, ...READ_WORDS, ...REST_WORDS] as const;

/** The name of a command the client holds. */
export type MovedCommand = (typeof WORDS)[number]['name'];

/** The words of every command the client holds, in the order its help lists them. */
export const COMMAND_WORDS: readonly CommandWords[] = WORDS;

/** The names of the commands the client holds, in that order. */
export const MOVED_COMMANDS: readonly MovedCommand[] = WORDS.map((words) => words.name);

/** Each group's names: what a client's table of runners for the group is total over. */
export type RunCommand = (typeof RUN_WORDS)[number]['name'];
export type InboxCommand = (typeof INBOX_WORDS)[number]['name'];
export type FactoryCommand = (typeof FACTORY_WORDS)[number]['name'];
export type WriterCommand = (typeof WRITER_WORDS)[number]['name'];
export type DefinitionCommand = (typeof DEFINITION_WORDS)[number]['name'];
export type ReadCommand = (typeof READ_WORDS)[number]['name'];
export type RestCommand = (typeof REST_WORDS)[number]['name'];
