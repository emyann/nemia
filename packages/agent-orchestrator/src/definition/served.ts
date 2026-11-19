/**
 * What a namespace serves of the definitions — the Workflows, Agents and Skills a factory resolves — and where a write of one goes: two
 * pure deciders the api's handlers read, so which definition a factory resolves stays the orchestrator's meaning.
 *
 * `definitionServed`: of the origins that hold one name, in the order the factory looks a name up (its tree, the repository, the person's
 * library, the builtin), the one served — the first, or, with an origin asked, that origin where it holds the name — and what shadows it.
 * Its laws are `contracts/definition-served.contract.ts`'s.
 *
 * `definitionsServed`: a namespace's list, every name found served once, `definitionServed` of the origins that hold it in the lookup
 * order (`heldOrigins`, whose laws are the same file's). Its list laws are held by `served.test.ts`, over every list up to a size: tsverify
 * decides none of them today (Z3 runs out of memory at its default work; a loop needs an invariant `src` may not import; `flatMap` over
 * the two proved helpers is unknown).
 *
 * `definitionWriteRefusal`: the api writes the person's library alone, at the store's level alone (`/api/skills`, `/api/agents`,
 * `/api/workflows`), and never removes what a factory uses; a factory's own definitions change the factory's way. Its laws are
 * `contracts/definition-write.contract.ts`'s.
 */
import type { DefinitionOrigin, DefinitionServedOf, DefinitionFound, HeldOriginsOf } from '../../contracts/definition-served.contract.ts';
import type { DefinitionWriteRefusal } from '../../contracts/definition-write.contract.ts';

export type { DefinitionFound, DefinitionListed, DefinitionOrigin, DefinitionServed } from '../../contracts/definition-served.contract.ts';
export type { DefinitionWrite, WriteAt, WriteRefused, WriteThere, WriteWay } from '../../contracts/definition-write.contract.ts';

/**
 * Of the origins that hold one name, the one served — the first, or, with an origin asked, that origin where it holds the name — and the
 * first that shadows it; null where none is served.
 * @param held The origins that hold the name, in the lookup order (`LOOKUP`).
 * @param asked The origin asked for, or undefined for the first that holds the name.
 */
export const definitionServed: DefinitionServedOf = (held, asked) => {
  const first = held.at(0);
  if (first === undefined) return null;
  if (asked === undefined) return { origin: first, shadowedBy: null };
  return held.includes(asked) ? { origin: asked, shadowedBy: first === asked ? null : first } : null;
};

/**
 * The order a factory looks a name up in: its own tree, the repository, the person's library, then Nemia's builtin. `objects`'
 * `DEFINITION_ORIGINS` word for word (`packages/objects/src/words.ts`), held equal by `wordsHeld` (`object/run.model.ts`).
 */
export const LOOKUP = ['factory', 'repo', 'user', 'builtin'] as const satisfies readonly DefinitionOrigin[];

/**
 * The origins that hold `name` among `found`, in the lookup order.
 * @param found Every definition found, by name and origin.
 * @param name The definition's name.
 */
export const heldOrigins: HeldOriginsOf = (found, name) => LOOKUP.filter((o) => found.some((f) => f.name === name && f.origin === o));

/**
 * A namespace's list: every name among `found` served once, in the order first found, each with its origin served and what shadows it.
 * @param found Every definition found, by name and origin.
 * @param asked The origin asked for, or undefined for the first that holds each name; a name that origin does not hold is left out.
 */
export const definitionsServed = (found: readonly DefinitionFound[], asked: DefinitionOrigin | undefined) =>
  found
    .filter((f, i) => found.slice(0, i).every((g) => g.name !== f.name))
    .flatMap((f) => {
      const one = definitionServed(heldOrigins(found, f.name), asked);
      return one === null ? [] : [{ name: f.name, origin: one.origin, shadowedBy: one.shadowedBy }];
    });

/** A factory's own definitions are its tree, changed by a proposal the person, or an agent within its delegation, approves. */
const FACTORYS_WAY =
  "A factory's own definitions are its tree, and change the factory's way, never through this path: propose the objects with `nemia propose -f <file> -n <factory>`.";

/** The person's definitions are written at the store's library, in no namespace. */
const LIBRARYS_WAY =
  "The person's definitions are written at the store's library, in no namespace: send the write to `/api/skills`, `/api/agents` or `/api/workflows`, and add the item to a factory with `nemia library add <kind> <name> --factory <factory>`.";

/** Nothing of that name to change. */
const NONE = 'Nothing is at that name in the library: list it (`GET /api/<kind>`) for the names it holds, or make it with a POST there.';

/** A builtin is never removed. */
const BUILTIN_KEPT =
  "A builtin is never removed from the library: write the person's copy of it instead (`PUT /api/<kind>/<name>`), which shadows it.";

/**
 * A library definition a factory uses is not removed.
 * @param users The factories that use it.
 */
const inUse = (users: readonly string[]) =>
  `${users.join(', ')} use${users.length === 1 ? 's' : ''} it: take it off each first (\`nemia library rm <kind> <name> --factory <factory>\`), then remove it.`;

/**
 * Why the api refuses a write of a definition, with the way to make it instead, or null where it writes it.
 * @param at Where the write is sent: the store's library, or a factory's namespace.
 * @param does What the write does: create, replace, remove or act.
 * @param there The origin that holds the name served now, or `none` where nothing does.
 * @param users The factories that use the definition: each that has added it or fills a step with it.
 */
export const definitionWriteRefusal: DefinitionWriteRefusal = (at, does, there, users) => {
  if (at === 'factory') {
    if (does === 'create' || there === 'factory') return { kind: 'Invalid', way: 'factory', message: FACTORYS_WAY };
    return { kind: 'Invalid', way: 'library', message: LIBRARYS_WAY };
  }
  if (does === 'create') return null;
  if (there === 'none') return { kind: 'Missing', message: NONE };
  if (does !== 'remove') return null;
  if (there === 'builtin') return { kind: 'Invalid', message: BUILTIN_KEPT };
  return users.length === 0 ? null : { kind: 'Conflict', users: [...users], message: inUse(users) };
};
