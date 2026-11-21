/**
 * The tools of the MCP port, generated, never listed by hand: one for each endpoint a verb of the command table links, their words read
 * once in `objects` for both of Nemia's seats (`toolWordsOf`: the name, the input, the endpoint's method and path, which keys fill the path
 * and the query, whether it answers a `Table`, the defaults its link sends, what the endpoint and each key say) and described as
 * `toolDescriptionOf` joins them, which Nemia's verbs skill says to her shell seat too. What is the port's own is added here: the hints of
 * its verb's class and its endpoint's method (`toolHints`), and a card's files given inline (`inlineInput`, files.ts). What `toolWordsOf` throws is thrown as the tools are built.
 */
import { type CommandSpec } from 'agent-orchestrator';
import { type DescribedApi, toolDescriptionOf, toolWordsOf, type ToolWords } from 'objects';
import type { ToolHints } from '../../contracts/tool-hints.contract.ts';
import { fileKeysOf, inlineInput } from './files.ts';
import { classWordOf, toolHints } from './hints.ts';

/** A verb of a table as the port reads it: its name, its usage and help, its class, and the endpoints it links. */
export type PortVerb = Pick<CommandSpec, 'name' | 'usage' | 'help' | 'class' | 'served'>;

/**
 * A tool of the port: what `tools/list` says of it, and what a call of it asks of the api; `fileKeys`, the keys of its input that name a
 * card's files, each of which may be given inline (files.ts).
 */
export type PortTool = Omit<ToolWords, 'said' | 'keys'> & {
  readonly description: string;
  readonly annotations: ToolHints;
  readonly fileKeys: readonly string[];
};

/**
 * The port's tools: one per link of `table`'s verbs then of `verbs`' (the verbs the CLI runs by hand, `CLI_VERBS`), in their order, each
 * its endpoint of `api` read by reflection (`toolWordsOf`). Thrown where a link names no endpoint of `api`, one that streams, or one that
 * says nothing of what it does.
 * @param table The command table's verbs, each with its links.
 * @param verbs The verbs the CLI runs by hand, listed after the table's.
 * @param api The Api whose endpoints the links name.
 */
export function portTools(table: readonly PortVerb[], verbs: readonly PortVerb[], api: DescribedApi) {
  return toolWordsOf(table, verbs, api).map(({ verb, words }) => {
    const { said: _said, keys: _keys, ...tool } = words;
    return {
      ...tool,
      inputSchema: inlineInput(tool.inputSchema),
      fileKeys: fileKeysOf(tool.inputSchema),
      description: toolDescriptionOf(verb, words),
      annotations: toolHints(classWordOf(verb.class), words.method),
    } satisfies PortTool;
  }) satisfies PortTool[];
}
