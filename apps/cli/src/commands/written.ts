/**
 * What the three writers (`workflows write`, `agents write`, `skills write`) share: the place they write, read off the words parsed
 * against their `COMMAND_WORDS` (`placeOf`), a text argument (`textArg`) and a required path flag (`pathArg`), each refused, exit 2,
 * naming the command's usage; and the line a write prints (`writtenLine`).
 *
 * The place is `user`, the store's library in no namespace, written through `createLibrary` or `replaceLibrary`; or `factory`, the tree of
 * a templated factory, which is the factory's own: the same object is proposed to it, through the call `nemia propose` makes
 * (`proposalMade`).
 */
import { type Args, DEFAULT_NAMESPACE } from 'objects';
import { Refused } from '../refused.ts';
import { textArg } from './requests.ts';

export { textArg };

/** Where a writer writes: the user library, or a proposal to the factory `factory`. */
export type Place = { readonly kind: 'user' } | { readonly kind: 'factory'; readonly factory: string };

/**
 * The path `args` holds under `key`; refused, naming the command's usage, where none was given.
 * @param args The words parsed against the command's words.
 * @param key The name of the flag that takes the path.
 * @param command The command's name, said in the refusal.
 * @param usage The command's usage, said in the refusal.
 * @param what What the path is, said in the refusal.
 */
export function pathArg(args: Args, key: string, command: string, usage: string, what: string) {
  const given = textArg(args, key);
  if (given !== undefined && given !== '') return given;
  throw new Refused(`nemia ${command} takes --${key}, ${what}: nemia ${command} ${usage}`);
}

/**
 * The place `args` name (`<from>`, and `--factory` on `factory`); refused, naming the usage, for a place neither `user` nor `factory`,
 * for `factory` without `--factory`, and for `--factory` on `user`.
 * @param args The words parsed against the command's words, whose `from` and `factory` are read.
 * @param command The command's name, said in a refusal.
 * @param usage The command's usage, said in a refusal.
 */
export function placeOf(args: Args, command: string, usage: string) {
  const from = textArg(args, 'from');
  const factory = textArg(args, 'factory');
  if (from === 'user') {
    if (factory === undefined) return { kind: 'user' } satisfies Place;
    throw new Refused(
      `nemia ${command} user writes the user library, and --factory names a factory's tree: drop --factory, or propose it to the factory, \`nemia ${command} factory … --factory ${factory}\``,
    );
  }
  if (from === 'factory') {
    if (factory !== undefined && factory !== '') return { kind: 'factory', factory } satisfies Place;
    throw new Refused(
      `nemia ${command} factory proposes the write to a templated factory: name it, \`nemia ${command} factory … --factory <name>\``,
    );
  }
  throw new Refused(
    `nemia ${command} writes the user library or a templated factory's tree, not ${from ?? 'nothing'}: nemia ${command} ${usage}`,
  );
}

/**
 * The namespace a write in `place` reads the object served now from: `default` for the user library, the factory's for a proposal.
 * @param place Where the writer writes: the user library, or a factory's tree.
 */
export const namespaceOf = (place: Place) => (place.kind === 'user' ? DEFAULT_NAMESPACE : place.factory);

/**
 * The line a write prints: the object, whether it was made or written, and the version it is at now.
 * @param resource The kind's plural, as the api's path says it (`workflows`, `agents`, `skills`).
 * @param name The object's name.
 * @param made Whether it was made (`create`) rather than written over (`replace`).
 * @param version The object's version after the write.
 */
export const writtenLine = (resource: string, name: string, made: boolean, version: string) =>
  `${resource}/${name} ${made ? 'created' : 'written'}, at version ${version}\n`;
