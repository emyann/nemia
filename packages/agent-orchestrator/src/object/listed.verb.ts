/**
 * Every kind of object is listed the one way (`objectsListed`): selected by its labels first — no kind of a factory's parts stores a label,
 * so only a negative selector (`key!=value`, `key notin (…)`) keeps any — sorted by name, then cut into a page (`pageOf`), so
 * `remainingItemCount` counts what the selector keeps. That page is the one list page (`pageListed`, its envelope `listOf`), which the
 * cards, the runs and the definitions the api serves page by too, each by its own key and labels; the events, read from a cursor in the
 * feed's order, share its selector's refusal (`selectorsRefused`) and its envelope. Beside it what each object is stamped with: its
 * `resourceVersion` (`versionOf`) and its `creationTimestamp` off a file (`bornAt`). A factory's parts, a template and a subscription are
 * listed through it.
 */
import fs from 'node:fs';
import { Effect } from 'effect';
import { API_VERSION } from 'objects';
import { Invalid } from '../refusal/refusal.ts';
import { parseSelectors, selectorsRefusal, selectsLabels } from '../watch/selector.ts';
import { valueVersion } from '../digest/digest.ts';
import { pageOf, type Paged } from './page.ts';

/** What a list of objects is asked: its namespace (none for every namespace's), `?limit=`, `?continue=`, its selectors, OR'd. */
export type ObjectQuery = {
  readonly namespace?: string | undefined;
  readonly limit?: number | null | undefined;
  readonly continue?: string | undefined;
  readonly labelSelector?: readonly string[] | undefined;
};

/** An object of any kind here: what a list reads of it, its name and labels. */
type Named = { readonly metadata: { readonly name: string; readonly labels?: Readonly<Record<string, string>> } };

/**
 * The `resourceVersion` of an object: a digest of its spec and status as they encode, and of the sub-resources read beside them, `parts`,
 * where it has any (a Factory's rules and instruction). Without `parts` the digest is the spec's and the status's alone.
 */
export const versionOf = (spec: unknown, status: unknown, parts?: unknown): string =>
  valueVersion(parts === undefined ? { spec, status } : { spec, status, parts });

/** When a file was made, or the epoch where it cannot be read: a part's `creationTimestamp`. */
export const bornAt = (file: string): string => {
  try {
    const stat = fs.statSync(file);
    return (stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
};

/** The refusal of a list's label selectors, naming the clause that is not one and `what` the list holds; none where each reads. */
export const selectorsRefused = (selectors: readonly string[], what: string): Invalid | undefined => {
  const refusal = selectorsRefusal(selectors);
  return refusal === undefined
    ? undefined
    : new Invalid({ message: `labelSelector: ${refusal}. Correct it, or leave labelSelector out to list every ${what}` });
};

/** How a list reads an item it pages: the key it is sorted and paged by, and the labels its selectors read. */
export type ListedBy<T> = { readonly key: (item: T) => string; readonly labels: (item: T) => Readonly<Record<string, string>> };

/**
 * The page of `items` a list's query asks — the list page every list of objects cuts: those its label selectors keep, sorted by `by.key`
 * as `<` compares, cut by its `limit` after its `continue` (`pageOf`), so `remainingItemCount` counts what the selectors keep. `Invalid`
 * for a selector, a limit or a token that is not one; `what` names what the list holds in the selector's refusal.
 */
export const pageListed = <T>(
  items: readonly T[],
  query: Omit<ObjectQuery, 'namespace'>,
  what: string,
  by: ListedBy<T>,
): Effect.Effect<Paged<T>, Invalid> => {
  const selectors = query.labelSelector ?? [];
  const refused = selectorsRefused(selectors, what);
  if (refused !== undefined) return Effect.fail(refused);
  const parsed = parseSelectors(selectors);
  const kept = items
    .filter((o) => selectsLabels(parsed, by.labels(o)))
    .sort((a, b) => (by.key(a) < by.key(b) ? -1 : by.key(a) > by.key(b) ? 1 : 0));
  const page = pageOf(kept, by.key, { limit: query.limit ?? null, continue: query.continue });
  return page instanceof Invalid ? Effect.fail(page) : Effect.succeed(page);
};

/** A list's metadata: how many objects are after the page, and the token of the next one. */
export type ListedMeta = { remainingItemCount: number; continue?: string };

/** The `<kind>List` of a page: its envelope, the page's count and token, and `items`, the page's objects. */
export const listOf = <const K extends string, T>(
  kind: K,
  page: Omit<Paged<unknown>, 'items'>,
  items: T[],
): { apiVersion: typeof API_VERSION; kind: `${K}List`; metadata: ListedMeta; items: T[] } => ({
  apiVersion: API_VERSION,
  kind: `${kind}List`,
  metadata: { remainingItemCount: page.remainingItemCount, ...(page.continue !== undefined ? { continue: page.continue } : {}) },
  items,
});

/** An object's name and labels, as a list of objects reads them. */
const byMetadata: ListedBy<Named> = { key: (o) => o.metadata.name, labels: (o) => o.metadata.labels ?? {} };

/**
 * A page of `items`, as `<kind>List`: the list page (`pageListed`) by name. `Invalid` for a selector, a limit or a token that is not one;
 * `what` names the kind in the selector's refusal.
 */
export const objectsListed = <const K extends string, T extends Named>(
  kind: K,
  items: readonly T[],
  query: ObjectQuery,
  what: string,
): Effect.Effect<{ apiVersion: typeof API_VERSION; kind: `${K}List`; metadata: ListedMeta; items: T[] }, Invalid> =>
  Effect.map(pageListed(items, query, what, byMetadata), (page) => listOf(kind, page, [...page.items]));
