/**
 * Every kind of object is listed the one way (`objectsListed`): selected by its labels first — no kind of a factory's parts stores a
 * label, so only a negative selector (`key!=value`, `key notin (…)`) keeps any — sorted by name, then cut into a page (`pageOf`), so
 * `remainingItemCount` counts what the selector keeps. Beside it what each object is stamped with: its `resourceVersion` (`versionOf`)
 * and its `creationTimestamp` off a file (`bornAt`). A factory's parts, a template and a subscription are listed through it.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { Effect } from 'effect';
import { API_VERSION } from 'objects';
import { Invalid } from '../refusal/refusal.ts';
import { parseSelectors, selectorsRefusal, selectsLabels } from '../watch/selector.ts';
import { pageOf } from './page.ts';

/** What a list of objects is asked: its namespace (none for every namespace's), `?limit=`, `?continue=`, its selectors, OR'd. */
export type ObjectQuery = {
  readonly namespace?: string | undefined;
  readonly limit?: number | null | undefined;
  readonly continue?: string | undefined;
  readonly labelSelector?: readonly string[] | undefined;
};

/** An object of any kind here: what a list reads of it, its name and labels. */
type Named = { readonly metadata: { readonly name: string; readonly labels?: Readonly<Record<string, string>> } };

/** Objects in the order a list answers them and a token reads them: by name, as `<` compares. */
const byName = (a: Named, b: Named): number => (a.metadata.name < b.metadata.name ? -1 : a.metadata.name > b.metadata.name ? 1 : 0);

/**
 * The `resourceVersion` of an object: a digest of its spec and status as they encode, and of the sub-resources read beside them, `parts`,
 * where it has any (a Factory's rules and instruction). Without `parts` the digest is the spec's and the status's alone.
 */
export const versionOf = (spec: unknown, status: unknown, parts?: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(parts === undefined ? { spec, status } : { spec, status, parts }))
    .digest('hex')
    .slice(0, 16);

/** When a file was made, or the epoch where it cannot be read: a part's `creationTimestamp`. */
export const bornAt = (file: string): string => {
  try {
    const stat = fs.statSync(file);
    return (stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
};

/**
 * A page of `items`, as `<kind>List`: those its label selectors keep, sorted by name, cut by its `limit` after its `continue`. `Invalid`
 * for a selector, a limit or a token that is not one; `what` names the kind in the selector's refusal.
 */
export const objectsListed = <const K extends string, T extends Named>(
  kind: K,
  items: readonly T[],
  query: ObjectQuery,
  what: string,
): Effect.Effect<{ apiVersion: typeof API_VERSION; kind: `${K}List`; metadata: ListedMeta; items: T[] }, Invalid> => {
  const selectors = query.labelSelector ?? [];
  const refusal = selectorsRefusal(selectors);
  if (refusal !== undefined)
    return Effect.fail(new Invalid({ message: `labelSelector: ${refusal}. Correct it, or leave labelSelector out to list every ${what}` }));
  const parsed = parseSelectors(selectors);
  const kept = items.filter((o) => selectsLabels(parsed, o.metadata.labels ?? {})).sort(byName);
  const page = pageOf(kept, (o) => o.metadata.name, { limit: query.limit ?? null, continue: query.continue });
  if (page instanceof Invalid) return Effect.fail(page);
  return Effect.succeed({
    apiVersion: API_VERSION,
    kind: `${kind}List`,
    metadata: { remainingItemCount: page.remainingItemCount, ...(page.continue !== undefined ? { continue: page.continue } : {}) },
    items: [...page.items],
  });
};

/** A list's metadata: how many objects are after the page, and the token of the next one. */
type ListedMeta = { remainingItemCount: number; continue?: string };
