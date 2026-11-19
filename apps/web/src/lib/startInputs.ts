/**
 * The files a start's form lists, as files are dropped on it or picked (`inputsAdded`, each file by `inputAdded`): a name once, since a
 * run finds each input by its name. Written generic, so the form keeps its files' type (a browser's `File`); proved at `ListedInput` as
 * `inputAddedOf` (`apps/web/contracts/start-inputs.contract.ts`), since the verifier reads no generic function.
 */
import type { InputAdded, ListedInput } from '../../contracts/start-inputs.contract.ts';

/**
 * `listed` with `added` added: in the place of the file listed under its name, or after them all under a new name.
 * @param listed The files the form lists, each name once.
 * @param added The file dropped or picked.
 */
function inputAdded<T extends ListedInput>(listed: readonly T[], added: T) {
  return listed.some((f) => f.name === added.name) ? listed.map((f) => (f.name === added.name ? added : f)) : [...listed, added];
}

/**
 * `inputAdded` at `ListedInput`, the function the contract proves.
 * @param listed The files the form lists, each name once.
 * @param added The file dropped or picked.
 */
export const inputAddedOf: InputAdded = (listed, added) => inputAdded(listed, added);

/**
 * `listed` with each of `added` added in turn (`inputAdded`), so the last added under one name wins.
 * @param listed The files the form lists, each name once.
 * @param added The files dropped or picked, in order.
 */
export const inputsAdded = <T extends ListedInput>(listed: readonly T[], added: readonly T[]) =>
  added.reduce<T[]>((list, file) => inputAdded(list, file), [...listed]);
