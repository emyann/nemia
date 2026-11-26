/**
 * The one printer of a read that prints the api's answer as it is (`objects`' `answerSpec`): as YAML, or as JSON with `--json`, and
 * the runner that asks such a read and prints it (`answered`). A read whose lines a person reads at a terminal keeps a printer of its own.
 */
import type { Effect } from 'effect';
import type { Args } from 'objects';
import { stringify } from 'yaml';
import { asked, type ObjectsClient } from '../objects.ts';
import { said, switchArg } from './requests.ts';

/**
 * The lines of `answer`, the api's decoded answer: YAML, or JSON indented by two where `json` is set.
 * @param answer The api's answer, decoded by its Schema.
 * @param json Whether `--json` was given.
 */
const answerLines = (answer: unknown, json: boolean) => (json ? JSON.stringify(answer, null, 2) : stringify(answer).trimEnd()).split('\n');

/**
 * Asks the read `verb` names through `call`, prints its answer by `answerLines`, as `args` asks, and answers exit 0.
 * @param verb The command's name, as a refusal of the read names it.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 * @param call What is asked of the typed client.
 */
export async function answered<A, E>(verb: string, args: Args, call: (c: ObjectsClient) => Effect.Effect<A, E>) {
  said(answerLines(await asked(verb, call), switchArg(args, 'json')));
  return 0;
}
