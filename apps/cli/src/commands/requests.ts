/**
 * What the moved commands' runners share in making a request of what was typed: an argument read off the parsed words by its kind, the
 * namespace a run or a card is in, which the command line does not say and the api's path takes, the namespace a place names, the one
 * label selector a query takes, a path sent to the daemon, and the repository a command is about, typed or the one it is typed in. A
 * request is the client's concern: the api decodes it by the endpoint's Schema.
 */
import path from 'node:path';
import { type Args, DEFAULT_NAMESPACE } from 'objects';
import { chosenOf } from '../context.ts';
import { asked } from '../objects.ts';

/**
 * The text `args` holds under `key`, or undefined where none was given.
 * @param args The words parsed against the command's words.
 * @param key The name of the flag or positional to read.
 */
export const textArg = (args: Args, key: string) => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Whether the switch under `key` was given.
 * @param args The words parsed against the command's words.
 * @param key The name of the switch to read.
 */
export const switchArg = (args: Args, key: string) => args[key] === true;

/**
 * The dollars under `key`, or undefined where none were given.
 * @param args The words parsed against the command's words.
 * @param key The name of the flag that takes the amount.
 */
export const amountArg = (args: Args, key: string) => {
  const value = args[key];
  return typeof value === 'number' ? value : undefined;
};

/**
 * Every value given under `key`, in the order given: a flag given once for each, or a positional that takes many; none where unset.
 * @param args The words parsed against the command's words.
 * @param key The name of the flag or positional to read.
 */
export const listArg = (args: Args, key: string) => {
  const value = args[key];
  return (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []) satisfies readonly string[] as readonly string[];
};

/**
 * The namespace the run `name` is in, read of the api across namespaces (`runs.show`): a run is in the namespace of its factory, which a
 * command line that names the run does not say. A run that is not there is the api's `Missing`, in its words.
 * @param command The command's name, said in the api's refusal.
 * @param name The run's id.
 */
export const namespaceOfRun = async (command: string, name: string) =>
  (await asked(command, (c) => c.runs.show({ params: { name } }))).metadata.namespace ?? DEFAULT_NAMESPACE;

/**
 * The namespace the inbox's card `name` is in, read of the api across namespaces (`cards.getAll`), as a run's is (`namespaceOfRun`).
 * @param command The command's name, said in the api's refusal.
 * @param name The card's name.
 */
export const namespaceOfCard = async (command: string, name: string) =>
  (await asked(command, (c) => c.cards.getAll({ params: { name } }))).metadata.namespace ?? DEFAULT_NAMESPACE;

/**
 * The `-l` selectors a command line took one by one, as the one label selector a query takes: joined by commas; none where none given.
 * @param args The words parsed against the command's words, whose `selector` holds each `-l` typed.
 */
export const selectorQuery = (args: Args) => {
  const texts = listArg(args, 'selector');
  return texts.length ? { labelSelector: texts.join(',') } : {};
};

/**
 * A path a command line names for the daemon to read or keep (a repository, a tree), as it is sent: resolved from where it is typed under
 * this machine's context, whose daemon reads this machine's disk; as typed under a remote one, where it names the daemon's machine.
 * @param typed The path as typed.
 * @param env The environment whose chosen context says whether the daemon is this machine's; this process's by default.
 */
export const pathSent = (typed: string, env: NodeJS.ProcessEnv = process.env) =>
  chosenOf(env).kind === 'remote' ? typed : path.resolve(typed);

/**
 * The `repo` query of a command about a repository: the one `--repo` names (`typed`), sent as `pathSent` sends a path; none where
 * `--factory` names the factory (`factory`), which places it, or under a remote context, whose daemon's folders are not this one's;
 * else, under this machine's context, the folder the command is typed in (`here`), which the api places on the repository of a filed
 * factory that holds it, and refuses where no factory's does, naming how to file a factory on it. With no `repo`, the default factory
 * reads no repository: yours and the builtins alone, never the api's own folder.
 * @param typed The repository `--repo` names, or undefined where none is typed.
 * @param factory The factory `--factory` names, or undefined where none is named.
 * @param env The environment whose chosen context says whether the daemon is this machine's; this process's by default.
 * @param here The folder the command is typed in; this process's working folder by default.
 */
export function repoQueryOf(
  typed: string | undefined,
  factory: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  here: string = process.cwd(),
) {
  if (typed !== undefined) return { repo: pathSent(typed, env) };
  return factory !== undefined || chosenOf(env).kind !== 'local' ? {} : { repo: path.resolve(here) };
}

/**
 * `lines` printed on stdout, one each; nothing for none.
 * @param lines The lines to print, each without its newline.
 */
export const said = (lines: readonly string[]) => {
  if (lines.length) process.stdout.write(`${lines.join('\n')}\n`);
};
