/**
 * The favourites this browser keeps: the runs and workflows a person starred, read from local storage under `FAVORITES_KEY`, in the order
 * they were starred; a star pressed again takes one off, and the sidebar's rows say each by its title, a workflow gone once its list lacks
 * it and a run once its own read finds none. Pure, for the sidebar and the stars, which draw them, and its node test.
 */
import type { RunSummary, WorkflowListing } from './api';
import { runGone } from './api/detail.ts';
import { titleOf } from './factory.ts';

/** A favourite: a run by its id, or a workflow by its name and where it is read from, the repository's or yours. */
export type Favorite = { kind: 'run'; run: string } | { kind: 'workflow'; from: 'repo' | 'yours'; workflow: string };

/** The key this browser keeps the favourites under, a JSON list of `Favorite`. */
export const FAVORITES_KEY = 'nemia:favorites';

/** Whether `value` is a non-empty string. */
const named = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** `item` as a favourite, with no key but its own; none for anything not of that shape. */
function favoriteOf(item: unknown): Favorite | undefined {
  if (typeof item !== 'object' || item === null) return undefined;
  const { kind, run, from, workflow } = item as Record<string, unknown>;
  if (kind === 'run' && named(run)) return { kind, run };
  if (kind === 'workflow' && (from === 'repo' || from === 'yours') && named(workflow)) return { kind, from, workflow };
  return undefined;
}

/** Whether `a` and `b` name the same thing: the same run, or the same workflow read from the same place. */
export function sameFavorite(a: Favorite, b: Favorite): boolean {
  if (a.kind === 'run') return b.kind === 'run' && a.run === b.run;
  return b.kind === 'workflow' && a.from === b.from && a.workflow === b.workflow;
}

/** Whether `favorite` is among `favorites`. */
export const isStarred = (favorites: readonly Favorite[], favorite: Favorite): boolean =>
  favorites.some((kept) => sameFavorite(kept, favorite));

/** `favorites` with `favorite` taken off where it stands, or, not among them, added at the end. */
export const toggled = (favorites: readonly Favorite[], favorite: Favorite): Favorite[] =>
  isStarred(favorites, favorite) ? favorites.filter((kept) => !sameFavorite(kept, favorite)) : [...favorites, favorite];

/**
 * The favourites `raw` holds, as this browser stored it, in their order, each once where it first stands: none for nothing stored or no
 * list, and each item of another shape dropped.
 */
export function favoritesOf(raw: string | null): Favorite[] {
  let parsed: unknown;
  try {
    parsed = raw === null ? null : JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(favoriteOf)
    .filter((item): item is Favorite => item !== undefined)
    .filter((item, i, all) => all.findIndex((kept) => sameFavorite(kept, item)) === i);
}

/** A favourite as the sidebar lists it: a run by its title, a workflow by its name, and whether the api no longer lists it. */
export type FavoriteRow = { favorite: Favorite; title: string; gone: boolean };

/** What a starred run's own read answered: the run, by its id and brief, or `gone` where the store has no such run. */
export type OwnRead = Pick<RunSummary, 'id' | 'brief'> | 'gone';

/**
 * What each starred run's own read answered, by its id: `results[i]` is the read of `ids[i]`. The run where it was read, `gone` where
 * the read was refused because the store has no such run (`runGone`), and nothing while it is not answered or failed for another reason.
 */
export const ownReads = (
  ids: readonly string[],
  results: ReadonlyArray<{ data?: Pick<RunSummary, 'id' | 'brief'>; error: unknown }>,
): Map<string, OwnRead> =>
  new Map(
    results.flatMap((result, i): Array<[string, OwnRead]> => {
      if (result.data) return [[ids[i], result.data]];
      return runGone(result.error) ? [[ids[i], 'gone']] : [];
    }),
  );

/**
 * The sidebar's row of each of `favorites`, in their order. A run's title is its brief's (`titleOf`), read off `open`, the runs that wait
 * or move, else off its own read in `own`, by its id; its id until either has it. A run is gone only once its own read found none: one
 * `open` lacks may be finished. A workflow is gone only once `workflows`, the api's list, is read (not undefined) and lacks it.
 */
export function favoriteRows(
  favorites: readonly Favorite[],
  open: ReadonlyArray<Pick<RunSummary, 'id' | 'brief'>> | undefined,
  own: ReadonlyMap<string, OwnRead>,
  workflows: ReadonlyArray<Pick<WorkflowListing, 'from' | 'name'>> | undefined,
): FavoriteRow[] {
  return favorites.map((favorite) => {
    if (favorite.kind === 'workflow') {
      const listed = workflows?.some((item) => item.from === favorite.from && item.name === favorite.workflow);
      return { favorite, title: favorite.workflow, gone: listed === false };
    }
    const read = open?.find((item) => item.id === favorite.run) ?? own.get(favorite.run);
    return { favorite, title: read && read !== 'gone' ? titleOf(read) : favorite.run, gone: read === 'gone' };
  });
}
