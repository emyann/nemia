/**
 * What a factory has added from the store's library, and what each add is: three pure deciders, read afresh on every call and carrying
 * nothing between passes. Their laws are `contracts/library-add.contract.ts`'s.
 *
 * `libraryAddsOf`: a factory's adds are its record's where it has one, and else those its workflows resolve from the library today.
 * `libraryAddState`: an add is resolved, shadowed by the factory's own, or missing from the library. `libraryAddRefusal`: an add of a name
 * the library does not hold, or a removal of one not added, is Missing.
 */
import type { LibraryAddRefusal, LibraryAddStateOf, LibraryAddsOf, LibraryRef, Origin } from '../../contracts/library-add.contract.ts';

export type { LibraryKind, LibraryRef } from '../../contracts/library-add.contract.ts';

/**
 * A factory's adds: its record's, where it has one, else those its workflows resolve from the library today.
 * @param recorded The factory's record of its adds, or undefined where none was written.
 * @param derived The library items the factory's workflows resolve today.
 */
export const libraryAddsOf: LibraryAddsOf = (recorded, derived) => recorded ?? derived;

/** Whether `held` holds an origin of `of`. */
const holdsAny = (held: readonly Origin[], of: readonly Origin[]) => held.some((origin) => of.includes(origin));

/**
 * What an add is in its factory, from the origins that hold its name.
 * @param held The origins that hold the add's name where the factory looks it up.
 */
export const libraryAddState: LibraryAddStateOf = (held) => {
  if (!holdsAny(held, ['user', 'builtin'])) return 'missing';
  return holdsAny(held, ['factory', 'repo']) ? 'shadowed' : 'resolved';
};

/** Nothing of that name in the library to add. */
const NOT_HELD = 'The library holds no item of that name: list it (`nemia library`) for the names it holds, or make it there first.';

/** Nothing of that name added to take off. */
const NOT_ADDED = 'The factory has not added that item: list its adds (`nemia library --factory <factory>`) for the names it has.';

/**
 * Why an add or a removal of an add is refused, or null where it goes on.
 * @param does Whether the write adds the item or removes the add.
 * @param held Whether the library holds the item's name.
 * @param added Whether the factory has added it.
 */
export const libraryAddRefusal: LibraryAddRefusal = (does, held, added) => {
  if (does === 'add') return held ? null : { kind: 'Missing', message: NOT_HELD };
  return added ? null : { kind: 'Missing', message: NOT_ADDED };
};

/**
 * The add `ref` as its object's name, `<kind>.<name>`, as a Hire is named `<workflow>.<step>`.
 * @param ref The add.
 */
export const addName = (ref: LibraryRef) => `${ref.kind}.${ref.name}`;

/**
 * Whether two adds name one item.
 * @param a An add.
 * @param b The add it is compared with.
 */
export const sameAdd = (a: LibraryRef, b: LibraryRef) => a.kind === b.kind && a.name === b.name;
