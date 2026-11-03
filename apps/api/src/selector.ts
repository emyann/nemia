/**
 * The `?selector=` a read of runs or cards takes: one selector of their labels each time it is given, of which one must take a run or a
 * card (OR), in the package's grammar (`selectorsRefusal`, `parseSelectors`). Handed to the entry under its `selector` key, as `-l`
 * hands it at the command line; a malformed one is the entry's `Invalid`, a 422 by `app.onError`.
 */
import type { Context } from 'hono';
import type { ApiEnv } from './layer.ts';

/** `{ selector }`, every `?selector=` the request gives in its order, or nothing where it gives none. */
export const selectorOf = (c: Context<ApiEnv>): { selector?: string[] } => {
  const given = c.req.queries('selector') ?? [];
  return given.length ? { selector: given } : {};
};
