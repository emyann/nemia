/**
 * What the moved commands' runners share in making a request of what was typed: an argument read off the parsed words by its kind, the
 * namespace a run or a card is in, which the command line does not say and the api's path takes, the namespace a place names, and the
 * one label selector a query takes. A request is the client's concern: the api decodes it by the endpoint's Schema.
 */
import { type Args, DEFAULT_NAMESPACE } from 'objects';
import { asked } from '../objects.ts';

/** The text `args` holds under `key`, or undefined where none was given. */
export const textArg = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** Whether the switch under `key` was given. */
export const switchArg = (args: Args, key: string): boolean => args[key] === true;

/** The dollars under `key`, or undefined where none were given. */
export const amountArg = (args: Args, key: string): number | undefined => {
  const value = args[key];
  return typeof value === 'number' ? value : undefined;
};

/** Every value given under `key`, in the order given: a flag given once for each, or a positional that takes many; none where unset. */
export const listArg = (args: Args, key: string): readonly string[] => {
  const value = args[key];
  return Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
};

/**
 * The namespace the run `name` is in, read of the api across namespaces (`runs.show`): a run is in the namespace of its factory, which a
 * command line that names the run does not say. A run that is not there is the api's `Missing`, in its words.
 */
export const namespaceOfRun = async (command: string, name: string): Promise<string> =>
  (await asked(command, (c) => c.runs.show({ params: { name } }))).metadata.namespace ?? DEFAULT_NAMESPACE;

/** The namespace the inbox's card `name` is in, read of the api across namespaces (`cards.getAll`), as a run's is (`namespaceOfRun`). */
export const namespaceOfCard = async (command: string, name: string): Promise<string> =>
  (await asked(command, (c) => c.cards.getAll({ params: { name } }))).metadata.namespace ?? DEFAULT_NAMESPACE;

/**
 * The namespace a command reads or writes in, of the place it names under `from` and the factory `--factory` names: `yours` or `repo`,
 * the default namespace's unless a factory is named; any other word, that factory's.
 */
export const namespaceOfPlace = (from: string | undefined, factory: string | undefined): string =>
  from !== undefined && from !== 'yours' && from !== 'repo' ? from : factory !== undefined && factory !== '' ? factory : DEFAULT_NAMESPACE;

/** The `-l` selectors a command line took one by one, as the one label selector a query takes: joined by commas; none where none given. */
export const selectorQuery = (args: Args): { readonly labelSelector?: string } => {
  const texts = listArg(args, 'selector');
  return texts.length ? { labelSelector: texts.join(',') } : {};
};

/** `lines` printed on stdout, one each; nothing for none. */
export const said = (lines: readonly string[]): void => {
  if (lines.length) process.stdout.write(`${lines.join('\n')}\n`);
};
