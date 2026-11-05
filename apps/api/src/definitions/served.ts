/**
 * What the three definitions' handlers share: the origins a name is looked up in, in the factory's order; the one served of each name
 * (`definitionServed`, the orchestrator's) with what shadows it; a page of them as `<Kind>List`; and a write's refusal
 * (`definitionWriteRefusal`) as the `Api`'s error.
 */
import { Invalid as Refused, pageOf, parseSelectors, selectorsRefusal, selectsLabels, type ObjectQuery } from 'agent-orchestrator';
import { definitionServed, definitionWriteRefusal, type DefinitionWrite } from 'agent-orchestrator/workflow';
import { API_VERSION, DEFINITION_ORIGINS, Invalid, Missing } from 'objects';
export { writtenAt } from '../workflows/builder.ts';

/** An origin a definition is read from: the factory's tree, the repository, yours, or Nemia's builtin. */
export type Origin = (typeof DEFINITION_ORIGINS)[number];

/** A definition read at one origin, before it is served: its name, its origin, and what the object is made from. */
export type Held<T> = { name: string; origin: Origin; item: T };

/** A definition served: what it was read as, and the origin that shadows it, if one does. */
export type Served<T> = Held<T> & { shadowedBy: Origin | null };

/** `asked`, the `?origin=` of a read, as an origin, or `Invalid` naming the words it takes. */
export function originAsked(asked: string | undefined): Origin | undefined {
  if (asked === undefined) return undefined;
  const origin = DEFINITION_ORIGINS.find((o) => o === asked);
  if (origin === undefined)
    throw new Invalid({
      error: `?origin=${asked} is no origin a definition is read from: send one of ${DEFINITION_ORIGINS.join(', ')}, or leave it out for the one each name resolves to.`,
    });
  return origin;
}

/**
 * Of every definition `held`, each name once: the origin `definitionServed` serves of those that hold it, in the lookup order
 * (`DEFINITION_ORIGINS`), the first or the one `asked`; a name `asked` does not hold is left out.
 */
export function servedOf<T>(held: readonly Held<T>[], asked: Origin | undefined): Served<T>[] {
  const names = [...new Set(held.map((h) => h.name))];
  return names.flatMap((name) => {
    const at = held
      .filter((h) => h.name === name)
      .sort((a, b) => DEFINITION_ORIGINS.indexOf(a.origin) - DEFINITION_ORIGINS.indexOf(b.origin));
    const served = definitionServed(
      at.map((h) => h.origin),
      asked,
    );
    const one = served && at.find((h) => h.origin === served.origin);
    return one ? [{ ...one, shadowedBy: served?.shadowedBy ?? null }] : [];
  });
}

/** The one of `name` served, or `Missing` naming where to list them. */
export function servedNamed<T>(held: readonly Held<T>[], name: string, asked: Origin | undefined, list: string): Served<T> {
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
 * What a write of `name` would change, as `definitionWriteRefusal` asks it: the factory's own where its tree holds the name, yours where
 * your library does (shadowed or not: a write names yours), else the origin served there, `none` where nothing is.
 */
export function thereOf<T>(held: readonly Held<T>[], name: string): Origin | 'none' {
  const at = held.filter((h) => h.name === name);
  if (at.some((h) => h.origin === 'factory')) return 'factory';
  if (at.some((h) => h.origin === 'yours')) return 'yours';
  return servedOf(at, undefined).at(0)?.origin ?? 'none';
}

/** Thrown as the `Api`'s error where `definitionWriteRefusal` refuses `does` in `namespace` on what is `there`; nothing if it goes on. */
export function writeGoes(namespace: string, does: DefinitionWrite, there: Origin | 'none'): void {
  const refused = definitionWriteRefusal(namespace, does, there);
  if (refused === null) return;
  if (refused.kind === 'Missing') throw new Missing({ error: refused.message });
  throw new Invalid({ error: refused.message, ...(refused.way !== undefined && { way: refused.way }) });
}

type Named = { metadata: { name: string; labels?: Readonly<Record<string, string>> } };

/** A page of `items` as `<kind>List`: those its label selectors keep, sorted by name, cut by `limit` after `continue`. */
export const listed = <const K extends string, T extends Named>(kind: K, items: readonly T[], query: ObjectQuery) => {
  const selectors = query.labelSelector ?? [];
  const refusal = selectorsRefusal(selectors);
  if (refusal !== undefined)
    throw new Invalid({ error: `labelSelector: ${refusal}. Correct it, or leave labelSelector out to list every ${kind}.` });
  const parsed = parseSelectors(selectors);
  const kept = items
    .filter((o) => selectsLabels(parsed, o.metadata.labels ?? {}))
    .sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : a.metadata.name > b.metadata.name ? 1 : 0));
  const page = pageOf(kept, (o) => o.metadata.name, { limit: query.limit ?? null, continue: query.continue });
  if (page instanceof Refused) throw new Invalid({ error: page.message });
  return {
    apiVersion: API_VERSION as typeof API_VERSION,
    kind: `${kind}List` as const,
    metadata: { remainingItemCount: page.remainingItemCount, ...(page.continue !== undefined ? { continue: page.continue } : {}) },
    items: [...page.items],
  };
};
