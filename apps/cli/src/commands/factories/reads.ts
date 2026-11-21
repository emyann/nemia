/**
 * The runners of a factory's reads that print the api's answer as it is: `factory commands` (`factories.commands`) and `factory server
 * sign-in` (`mcpservers.signInState`), each as YAML, or JSON with `--json` (`answered`).
 */
import type { Args } from 'objects';
import { answered } from '../answer.ts';
import { textArg } from '../requests.ts';

/**
 * `nemia factory commands <factory>`' runner: the commands the factory's steps run.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export const factoryCommands = (args: Args) =>
  answered('factory commands', args, (c) => c.factories.commands({ params: { name: textArg(args, 'factory') ?? '' } }));

/**
 * `nemia factory server sign-in <factory> <server>`'s runner: where the sign-in of the factory's MCP server stands.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export const factoryServerSignIn = (args: Args) =>
  answered('factory server sign-in', args, (c) =>
    c.mcpservers.signInState({ params: { namespace: textArg(args, 'factory') ?? '', name: textArg(args, 'server') ?? '' } }),
  );
