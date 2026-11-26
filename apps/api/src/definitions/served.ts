/**
 * What the three definitions' handlers share: the origins a name is looked up in, in the factory's order; the one served of each name
 * (`definitionsServed`, the orchestrator's) with what shadows it; a page of them as `<Kind>List`; and a write's refusal
 * (`definitionWriteRefusal`) as the `Api`'s error.
 */
import { Effect, Result } from 'effect';
import { addedOf, objectsListed, type ObjectQuery } from 'agent-orchestrator';
import { definitionsServed, definitionWriteRefusal, type DefinitionWrite, type WriteAt } from 'agent-orchestrator/workflow';
import { Conflict, DEFAULT_NAMESPACE, DEFINITION_ORIGINS, Invalid, Missing, type DefinitionOrigin } from 'objects';
import { repoNeeded, type Place } from '../factory/place.ts';
export { writtenAt } from '../workflows/builder.ts';

/** An origin a definition is read from: the factory's tree, the repository, the person's library, or Nemia's builtin. */
export type Origin = DefinitionOrigin;

/** A definition read at one origin, before it is served: its name, its origin, and what the object is made from. */
export type Held<T> = { name: string; origin: Origin; item: T };

/** A definition served: what it was read as, and the origin that shadows it, if one does. */
type Served<T> = Held<T> & { shadowedBy: Origin | null };

/**
 * `asked`, the `?origin=` of a read, as an origin, or `Invalid` naming the words it takes.
 * @param asked The read's origin query, or undefined where it names none.
 */
function originAsked(asked: string | undefined) {
  if (asked === undefined) return undefined;
  const origin = DEFINITION_ORIGINS.find((o) => o === asked);
  if (origin === undefined)
    throw new Invalid({
      error: `?origin=${asked} is no origin a definition is read from: send one of ${DEFINITION_ORIGINS.join(', ')}, or leave it out for the one each name resolves to.`,
    });
  return origin;
}

/**
 * `asked`, the `?origin=` of a read in `place`, as an origin (`originAsked`): the repository's own layer asked for where the request is
 * answered on no repository — any request in the default factory with no `?repo=` — is refused as `repoNeeded` refuses it, naming the
 * factory to pick; any other layer needs none.
 * @param place The repository and factory the request is answered in.
 * @param asked The read's origin query, or undefined where it names none.
 */
export function originIn(place: Pick<Place, 'repo' | 'factory'>, asked: string | undefined) {
  const origin = originAsked(asked);
  if (origin === 'repo') repoNeeded(place);
  return origin satisfies Origin | undefined;
}

/**
 * Of every definition `held`, each name once, as the package's `definitionsServed` decides: the origin served of those that hold it, in
 * the lookup order, the first or the one `asked`; a name `asked` does not hold is left out.
 * @param held Every definition held, each with its name and origin.
 * @param asked The origin asked for, or undefined for the one each name resolves to.
 */
export function servedOf<T>(held: readonly Held<T>[], asked: Origin | undefined) {
  return definitionsServed(
    held.map(({ name, origin }) => ({ name, origin })),
    asked,
  ).flatMap((listed) => {
    const one = held.find((h) => h.name === listed.name && h.origin === listed.origin);
    return one ? [{ ...one, shadowedBy: listed.shadowedBy }] : [];
  }) satisfies Served<T>[] as Served<T>[];
}

/**
 * The one of `name` served, or `Missing` naming where to list them.
 * @param held Every definition held, each with its name and origin.
 * @param name The definition's name.
 * @param asked The origin asked for, or undefined for the one the name resolves to.
 * @param list The command that lists the names, as the refusal names it.
 */
export function servedNamed<T>(held: readonly Held<T>[], name: string, asked: Origin | undefined, list: string) {
  const one = servedOf(
    held.filter((h) => h.name === name),
    asked,
  ).at(0);
  if (one === undefined)
    throw new Missing({
      error: `No definition named ${name}${asked ? ` from ${asked}` : ''} here: ${list} lists the names this namespace serves${asked ? ` (add ?origin=${asked} for that origin's)` : ''}.`,
    });
  return one;
}

/**
 * What a write of `name` would change, as `definitionWriteRefusal` asks it: the factory's own where its tree holds the name, the person's
 * where the library does (shadowed or not: a write names the person's), else the origin served there, `none` where nothing is.
 * @param held Every definition held, each with its name and origin.
 * @param name The definition's name the write names.
 */
export function thereOf<T>(held: readonly Held<T>[], name: string) {
  const at = held.filter((h) => h.name === name);
  if (at.some((h) => h.origin === 'factory')) return 'factory';
  if (at.some((h) => h.origin === 'user')) return 'user';
  return servedOf(at, undefined).at(0)?.origin ?? 'none';
}

/**
 * Thrown as the `Api`'s error where `definitionWriteRefusal` refuses `does` sent `at` the library or a namespace on what is `there`;
 * nothing if it goes on. A Conflict carries the factories that use the definition.
 * @param at Where the write is sent: the store's library, or a factory's namespace.
 * @param does What the write does.
 * @param there What the write would change (thereOf), none where nothing is.
 * @param users The factories that use the definition (`libraryUsers`); none for a write in a namespace, which is refused before them.
 */
export function writeGoes(at: WriteAt, does: DefinitionWrite, there: Origin | 'none', users: readonly string[] = []) {
  const refused = definitionWriteRefusal(at, does, there, users);
  if (refused === null) return;
  if (refused.kind === 'Missing') throw new Missing({ error: refused.message });
  if (refused.kind === 'Conflict') throw new Conflict({ error: refused.message, users: [...(refused.users ?? [])] });
  throw new Invalid({ error: refused.message, ...(refused.way !== undefined && { way: refused.way }) });
}

/**
 * A write sent to the namespace `namespace`, refused naming the way it takes: in `default`, which holds no tree of its own, the library's;
 * in a factory's, the factory's for its own definitions and a create, else the library's (`writeGoes` at `factory`).
 * @param namespace The namespace the write was sent to.
 * @param does What the write would do.
 * @param there What the write would change (thereOf), none where nothing is.
 */
export function namespacedWriteRefused(namespace: string, does: DefinitionWrite, there: Origin | 'none'): never {
  writeGoes('factory', namespace === DEFAULT_NAMESPACE ? 'replace' : does, namespace === DEFAULT_NAMESPACE ? 'user' : there);
  throw new Error(`a write sent to ${namespace} was not refused: definitionWriteRefusal refuses every write at a namespace.`);
}

type Named = { metadata: { name: string; labels?: Readonly<Record<string, string>> } };

/**
 * A page of `items` as `<kind>List`: the orchestrator's one list page (`objectsListed`), those its label selectors keep, sorted by name,
 * cut by `limit` after `continue`; its refusal thrown as the `Api`'s `Invalid`.
 * @param kind The kind of the items, which names the list.
 * @param items Every item to page.
 * @param query The list's limit, continue and label selectors.
 */
export const listed = <const K extends string, T extends Named>(kind: K, items: readonly T[], query: ObjectQuery) => {
  const page = Effect.runSync(Effect.result(objectsListed(kind, items, query, kind)));
  if (Result.isFailure(page)) throw new Invalid({ error: page.failure.message });
  return page.success;
};

/**
 * What a namespace serves of `held` once its factory's adds gate the library: a definition of the user library or a builtin only where the
 * factory has added it, as its runs resolve it (`addedOf`); every one while the factory records no adds, its lookup reading the library
 * whole.
 * @param home The store's root.
 * @param namespace The namespace read, `default` among them.
 * @param kind Which of the factory's adds gate `held`: its agents or its skills.
 * @param held What the namespace holds at each origin.
 */
export function addsGated<T>(home: string, namespace: string, kind: 'agents' | 'skills', held: readonly Held<T>[]) {
  const added = addedOf(home, namespace);
  if (added === undefined) return [...held] satisfies Held<T>[];
  return held.filter((h) => (h.origin !== 'user' && h.origin !== 'builtin') || added[kind].has(h.name)) satisfies Held<T>[];
}
