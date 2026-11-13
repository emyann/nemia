/**
 * What the three writers (`workflows write`, `agents write`, `skills write`) share: the place they write, read off the words parsed
 * against their `COMMAND_WORDS` (`placeOf`), a text argument (`textArg`) and a required path flag (`pathArg`), each refused, exit 2,
 * naming the command's usage; and the line a write prints (`writtenLine`).
 *
 * The place is `yours`, the namespace `default`, written through `create` or `replace`; or `factory`, the tree of a templated factory,
 * which is the factory's own: the same object is proposed to it, through the call `nemia propose` makes (`proposalMade`).
 */
import { type Args, DEFAULT_NAMESPACE } from 'objects';
import { Refused } from '../refused.ts';
import { textArg } from './requests.ts';

export { textArg };

/** Where a writer writes: yours, or a proposal to the factory `factory`. */
export type Place = { readonly kind: 'yours' } | { readonly kind: 'factory'; readonly factory: string };

/** The path `args` holds under `key`; refused, naming the command's usage, where none was given. */
export function pathArg(args: Args, key: string, command: string, usage: string, what: string): string {
  const given = textArg(args, key);
  if (given !== undefined && given !== '') return given;
  throw new Refused(`nemia ${command} takes --${key}, ${what}: nemia ${command} ${usage}`);
}

/**
 * The place `args` name (`<from>`, and `--factory` on `factory`); refused, naming the usage, for a place neither `yours` nor `factory`,
 * for `factory` without `--factory`, and for `--factory` on `yours`.
 */
export function placeOf(args: Args, command: string, usage: string): Place {
  const from = textArg(args, 'from');
  const factory = textArg(args, 'factory');
  if (from === 'yours') {
    if (factory === undefined) return { kind: 'yours' };
    throw new Refused(
      `nemia ${command} yours writes your own library, and --factory names a factory's tree: drop --factory, or propose it to the factory, \`nemia ${command} factory … --factory ${factory}\``,
    );
  }
  if (from === 'factory') {
    if (factory !== undefined && factory !== '') return { kind: 'factory', factory };
    throw new Refused(
      `nemia ${command} factory proposes the write to a templated factory: name it, \`nemia ${command} factory … --factory <name>\``,
    );
  }
  throw new Refused(`nemia ${command} writes yours or a templated factory's tree, not ${from ?? 'nothing'}: nemia ${command} ${usage}`);
}

/** The namespace a write in `place` reads the object served now from: `default` for yours, the factory's for a proposal. */
export const namespaceOf = (place: Place): string => (place.kind === 'yours' ? DEFAULT_NAMESPACE : place.factory);

/** The line a write prints: the object, whether it was made or written, and the version it is at now. */
export const writtenLine = (resource: string, name: string, made: boolean, version: string): string =>
  `${resource}/${name} ${made ? 'created' : 'written'}, at version ${version}\n`;
