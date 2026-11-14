/**
 * The board's built pages, served by the daemon beside the `Api` on one origin, so a browser that reaches the daemon — on this machine
 * or at a private network's address (`NEMIA_BIND`, port.ts) — reaches the board, and the board reaches `/api` with no proxy and no
 * second port. Host content, not an endpoint of the `Api`: static files are no object kind (`test/served.test.ts` lists the route).
 *
 * The folder is `NEMIA_BOARD_DIR`, else the running install's (or checkout's) `apps/web/dist`, which `npm run build` writes and a
 * release archive carries. A GET of any path outside the api's own (`/api`, `/openapi`, `/mcp`: the api's 404 there, `noRoute`)
 * answers the file it names, else, but under `assets/`, the board's `index.html`, which routes it in the browser. A path that climbs
 * out of the folder, `..` encoded or not, is refused 400; with no board built, a 404 naming the build.
 *
 * A page carries no data of the store, so it needs no token, on any store (`needOf`, caller/caller.ts): the page that
 * asks for one must load. The disk is read through what app.ts hands it (`BoardFiles`), as the OpenAPI page's script is: a reader here
 * touches nothing of the machine.
 */
import path from 'node:path';
import { Effect } from 'effect';
import type { Handler } from 'hono';
import { runningRelease } from 'agent-orchestrator';
import { answered, onPort } from '../caller/index.ts';
import { ApiConfig, type ApiEnv } from '../layer.ts';

/** The route the board is served on: every path, after the mount, before the api's 404. */
export const BOARD_ROUTE = '/*';

/** The content type of each kind of file the board's build writes; any other is sent as bytes. */
const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

/** The folder of files the board's build wrote under `root`. */
const DIST = path.join('apps', 'web', 'dist');

/** The board's folder: `NEMIA_BOARD_DIR` where set, else the running code's `apps/web/dist`. */
const boardDirOf = async (c: Parameters<Handler<ApiEnv>>[0]): Promise<string> => {
  const { env, running } = await c.var.runtime.runPromise(Effect.map(ApiConfig, (config) => config));
  const given = env.NEMIA_BOARD_DIR?.trim() ?? '';
  return given !== '' ? path.resolve(given) : path.join((running ?? runningRelease()).root, DIST);
};

/**
 * The file `urlPath` names inside the board's folder, as segments, or null where it climbs out of it: a `..` segment, encoded or not,
 * a backslash, a NUL, or an encoding that does not decode.
 */
export function segmentsOf(urlPath: string): string[] | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\\') || decoded.includes('\0')) return null;
  const segments = decoded.split('/').filter((segment) => segment !== '' && segment !== '.');
  return segments.includes('..') ? null : segments;
}

/** How the board reads its folder, handed by app.ts: whether a path is a file that can be read, and its bytes. */
export type BoardFiles = {
  readonly isFile: (file: string) => Promise<boolean>;
  readonly read: (file: string) => Promise<Uint8Array<ArrayBuffer>>;
};

/** `file` sent with its type, read afresh: the board's build replaces its files whole, under new names. */
const sent = async (c: Parameters<Handler<ApiEnv>>[0], files: BoardFiles, file: string, cache: string): Promise<Response> =>
  c.body(await files.read(file), 200, {
    'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': cache,
  });

/** The board's handler over `files`: a file of its folder, its `index.html` for a route of the board's own, or the refusals above. */
export const boardOf =
  (files: BoardFiles): Handler<ApiEnv> =>
  async (c) => {
    const urlPath = c.req.path;
    if (onPort(urlPath) || answered(urlPath)) return c.notFound();
    const segments = segmentsOf(urlPath);
    if (segments === null)
      return c.json(
        {
          error: `${c.req.method} ${urlPath} climbs out of the board's folder: ask for a page or a file of the board, by a path with no '..'.`,
        },
        400,
      );
    const dir = await boardDirOf(c);
    const index = path.join(dir, 'index.html');
    if (!(await files.isFile(index)))
      return c.json(
        {
          error: `${c.req.method} ${urlPath} is a page of the board, and no board is built at ${dir}: run \`npm run build\` in the checkout, or set NEMIA_BOARD_DIR to a folder holding the board's built files.`,
        },
        404,
      );
    const file = path.join(dir, ...segments);
    if (segments.length > 0 && (await files.isFile(file)))
      return sent(c, files, file, segments[0] === 'assets' ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (segments[0] === 'assets') return c.notFound();
    return sent(c, files, index, 'no-cache');
  };
