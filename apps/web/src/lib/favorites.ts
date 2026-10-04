/**
 * The favourites this browser keeps: the runs and workflows a person starred, read from local storage under `FAVORITES_KEY`. Pure, for the
 * sidebar, which draws them, and its node test.
 */

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

/**
 * The favourites `raw` holds, as this browser stored it, in their order: none for nothing stored or no list, and each item of another
 * shape dropped.
 */
export function favoritesOf(raw: string | null): Favorite[] {
  let parsed: unknown;
  try {
    parsed = raw === null ? null : JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(favoriteOf).filter((item): item is Favorite => item !== undefined);
}

/** The anchor of a workflow's card on the Workflows page, by where it is read from and its name, which a favourite links to. */
export const workflowAnchor = ({ from, workflow }: { from: 'repo' | 'yours'; workflow: string }): string => `workflow-${from}-${workflow}`;
