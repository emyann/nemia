/**
 * Every kind of object is listed the one way (`objectsListed`): selected by its labels first — no kind of a factory's parts stores a label,
 * so only a negative selector (`key!=value`, `key notin (…)`) keeps any — sorted by name, then cut into a page (`pageOf`), so
 * `remainingItemCount` counts what the selector keeps. That page is the one list page (`pageListed`, its envelope `listOf`), which the
 * cards, the runs and the definitions the api serves page by too, each by its own key and labels; the events, read from a cursor in the
 * feed's order, share its selector's refusal (`selectorsRefused`) and its envelope. Beside it what each object is stamped with: its
 * `resourceVersion` (`atRevisions`) and its `creationTimestamp` off a file (`bornAt`). A factory's parts, a template and a subscription are
 * listed through it.
 */
import fs from 'node:fs';
import { Effect } from 'effect';
import { API_VERSION } from 'objects';
import { Invalid } from '../refusal/refusal.ts';
import { parseSelectors, selectorsRefusal, selectsLabels } from '../watch/selector.ts';
import { StoreRoot } from '../config/root.store.ts';
import { kindRevisions } from '../list-watch/kind-revisions.verb.ts';
import type { WatchedKind } from '../list-watch/index.ts';
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

/** The revisions a kind's objects stand at as of one read of the keyspace: each object's `resourceVersion`, and the head its list is at. */
export type AtRevisions = {
  readonly stamp: (namespace: string | undefined, name: string) => string;
  readonly head: string;
};

/**
 * The revision each object of `kind` stands at, read once and before the objects are, so a watch from a list's head loses no change
 * between the two: an object's `resourceVersion` is `stamp` of its namespace and name, the highest revision among the records it is made
 * of (`WATCHED_KINDS`); a list's is `head`. It writes nothing.
 * @param kind The kind served.
 * @param home The store's root.
 */
export const atRevisions = (kind: WatchedKind, home: string) =>
  Effect.map(
    kindRevisions(kind).pipe(Effect.provideService(StoreRoot, home)),
    ({ of, head }) => ({ stamp: (namespace, name) => String(of(namespace, name)), head: String(head) }) satisfies AtRevisions,
  );

/**
 * When a file was made, or the epoch where it cannot be read: a part's `creationTimestamp`.
 * @param file The path of the file read.
 */
export const bornAt = (file: string) => {
  try {
    const stat = fs.statSync(file);
    return (stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
};

/**
 * The refusal of a list's label selectors, naming the clause that is not one and `what` the list holds; none where each reads.
 * @param selectors The list's label selectors, as asked.
 * @param what What the list holds, named in the refusal (a card, a run).
 */
export const selectorsRefused = (selectors: readonly string[], what: string) => {
  const refusal = selectorsRefusal(selectors);
  return refusal === undefined
    ? undefined
    : new Invalid({ message: `labelSelector: ${refusal}. Correct it, or leave labelSelector out to list every ${what}` });
};

/** How a list reads an item it pages: the key it is sorted and paged by, and the labels its selectors read. */
export type ListedBy<T> = {
  readonly key: (item: T) => string;
  readonly labels: (item: T) => Readonly<Record<string, string>>;
  /** Whether the list runs from the highest key down: its token then resumes after the last key in that order. */
  readonly descending?: boolean;
};

/**
 * The page of `items` a list's query asks — the list page every list of objects cuts: those its label selectors keep, sorted by `by.key`
 * as `<` compares, cut by its `limit` after its `continue` (`pageOf`), so `remainingItemCount` counts what the selectors keep. `Invalid`
 * for a selector, a limit or a token that is not one.
 * @param items Every item the list holds, before its selectors keep any.
 * @param query The list's query: its limit, its continue token and its label selectors.
 * @param what What the list holds, named in the selector's refusal.
 * @param by How an item is read: its key, sorted and paged by, and its labels.
 */
export const pageListed = <T>(items: readonly T[], query: Omit<ObjectQuery, 'namespace'>, what: string, by: ListedBy<T>) => {
  const selectors = query.labelSelector ?? [];
  const refused = selectorsRefused(selectors, what);
  if (refused !== undefined) return Effect.fail(refused) satisfies Effect.Effect<Paged<T>, Invalid> as Effect.Effect<Paged<T>, Invalid>;
  const parsed = parseSelectors(selectors);
  const kept = items
    .filter((o) => selectsLabels(parsed, by.labels(o)))
    .sort((a, b) => (by.key(a) < by.key(b) ? -1 : by.key(a) > by.key(b) ? 1 : 0) * (by.descending === true ? -1 : 1));
  const page = pageOf(kept, by.key, { limit: query.limit ?? null, continue: query.continue }, undefined, by.descending === true);
  return (page instanceof Invalid ? Effect.fail(page) : Effect.succeed(page)) satisfies Effect.Effect<Paged<T>, Invalid> as Effect.Effect<
    Paged<T>,
    Invalid
  >;
};

/** A list's metadata: how many objects are after the page, the token of the next one, and the keyspace head it was read at. */
export type ListedMeta = { remainingItemCount: number; continue?: string; resourceVersion?: string };

/**
 * The `<kind>List` of a page: its envelope, the page's count and token, and `items`, the page's objects.
 * @param kind The kind of the objects listed, which the envelope's kind ends with `List`.
 * @param page The page's count of what is after it and its next token, if any.
 * @param items The page's objects, as served.
 * @param head The keyspace head the list was read at (`atRevisions`), none for a list of a kind the keyspace does not watch.
 */
export const listOf = <const K extends string, T>(kind: K, page: Omit<Paged<unknown>, 'items'>, items: T[], head?: string) =>
  ({
    apiVersion: API_VERSION,
    kind: `${kind}List`,
    metadata: {
      remainingItemCount: page.remainingItemCount,
      ...(page.continue !== undefined ? { continue: page.continue } : {}),
      ...(head === undefined ? {} : { resourceVersion: head }),
    },
    items,
  }) satisfies { apiVersion: typeof API_VERSION; kind: `${K}List`; metadata: ListedMeta; items: T[] };

/** An object's name and labels, as a list of objects reads them. */
const byMetadata: ListedBy<Named> = { key: (o) => o.metadata.name, labels: (o) => o.metadata.labels ?? {} };

/**
 * A page of `items`, as `<kind>List`: the list page (`pageListed`) by name. `Invalid` for a selector, a limit or a token that is not one.
 * @param kind The kind of the objects listed.
 * @param items Every object of the kind, before the query's selectors keep any.
 * @param query The list's query: its limit, its continue token and its label selectors.
 * @param what The kind as a person reads it, named in the selector's refusal.
 * @param head The keyspace head the objects were stamped at (`atRevisions`), the list's own `resourceVersion`.
 */
export const objectsListed = <const K extends string, T extends Named>(
  kind: K,
  items: readonly T[],
  query: ObjectQuery,
  what: string,
  head?: string,
) =>
  Effect.map(pageListed(items, query, what, byMetadata), (page) => listOf(kind, page, [...page.items], head)) satisfies Effect.Effect<
    { apiVersion: typeof API_VERSION; kind: `${K}List`; metadata: ListedMeta; items: T[] },
    Invalid
  > as Effect.Effect<{ apiVersion: typeof API_VERSION; kind: `${K}List`; metadata: ListedMeta; items: T[] }, Invalid>;
