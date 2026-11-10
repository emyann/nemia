/**
 * The endpoints of `objects`' `Api`, read off it once, each as the pattern of the paths it serves: what the mount (serve.ts) serves on
 * one line of app.ts, `.all(MOUNT, …)`, told apart again by path. A request's route is its endpoint's path (`endpointOf`), as a route of
 * Hono's is its pattern, so a request's span and line (request/request.ts) and its reads (`POLL_READS`, layer.ts) are said under
 * `/api/runs`, never under the mount's wildcard nor the path asked; and a list is told by its endpoint's success (`listAt`, serve.ts).
 *
 * It imports `objects` alone, so the request's middleware and the layer read it without the mount's handlers.
 */
import { SchemaAST } from 'effect';
import { Api } from 'objects';

/** What app.ts mounts the `Api`'s web handler on: every path under `/api/` no Hono route before it answered. */
export const MOUNT = '/api/*';

/**
 * An endpoint of the `Api`: its method, its path as declared (`/api/runs/:name`), the pattern of the paths it serves, its success kinds.
 */
export type Endpoint = {
  readonly method: string;
  readonly path: string;
  readonly pattern: RegExp;
  readonly kinds: readonly string[];
};

/** The `kind` a schema answers, where it is a literal: `RunList` for a list of runs; each member's for a union. */
const kindsOf = (ast: SchemaAST.AST): string[] => {
  if (SchemaAST.isUnion(ast)) return ast.types.flatMap(kindsOf);
  if (!SchemaAST.isObjects(ast)) return [];
  const kind = ast.propertySignatures.find((p) => p.name === 'kind')?.type;
  return kind !== undefined && SchemaAST.isLiteral(kind) && typeof kind.literal === 'string' ? [kind.literal] : [];
};

/** A path of the `Api` as a pattern of the paths it serves: each `:name` one segment. */
const patternOf = (path: string): RegExp => new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z]+/g, '[^/]+')}$`);

/** How many names a path leaves to the request: a path that names a segment (`/api/runs/watch`) is matched before one that takes any. */
const namesIn = (path: string): number => path.match(/:[A-Za-z]+/g)?.length ?? 0;

/** Every endpoint of the `Api`, the fewest names first, so a request matches the most specific path that serves it. */
export const ENDPOINTS: readonly Endpoint[] = Object.values(Api.groups)
  .flatMap((group) => Object.values(group.endpoints))
  .map((endpoint) => ({
    method: endpoint.method,
    path: endpoint.path,
    pattern: patternOf(endpoint.path),
    kinds: [...endpoint.success].flatMap((schema) => kindsOf(schema.ast)),
  }))
  .sort((a, b) => namesIn(a.path) - namesIn(b.path));

/** The endpoint that serves `method` on `path` (its query left off), or none where no endpoint of the `Api` does. */
export const endpointOf = (method: string, path: string): Endpoint | undefined =>
  ENDPOINTS.find((endpoint) => endpoint.method === method && endpoint.pattern.test(path));

/**
 * A request's route as its pattern, from the routes Hono matched it to (`matched`, in the order they were registered, the middleware's
 * wildcard left out): the first route before the mount, which answered it or handed it on; else its endpoint's path, where only the
 * mount (`MOUNT`, which matches every path under `/api/`) did; none where neither did.
 */
export const routeAt = (matched: readonly string[], method: string, path: string): string | undefined => {
  const route = matched.find((one) => one !== MOUNT);
  if (route !== undefined || !matched.includes(MOUNT)) return route;
  return endpointOf(method === 'HEAD' ? 'GET' : method, path)?.path;
};
