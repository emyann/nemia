/**
 * A workflow of yours removed from the board: the folder whole, through the package's entry `workflows rm`, which refuses a folder a
 * run, a queued card or a factory still needs, naming each with the command that frees it (409, by its kind, `app.onError`).
 *
 * The removal carries the `version` the folder was listed at (`workflowVersion`), and the entry refuses it (409) when the folder holds
 * something else: a step edited, added or removed by hand since the board read it would otherwise go unseen. Yours only, as every write
 * of the builder's (`yoursOnly`: 403 for the repository's); the guard (guard.ts) passes it before its body is read.
 */
import { Schema } from 'effect';
import { Hono } from 'hono';
import { readBody, valueAt } from '../body.ts';
import { refusedBeforeReading } from '../guard.ts';
import { type ApiEnv, served } from '../layer.ts';
import { buildGuard, yoursOnly } from './builder.ts';
import { folderOf } from './workflows.ts';
import { commandNamed, runPlaced } from '../store.ts';

/** The table's entry a folder of yours is removed through, which refuses a folder changed since it was read. */
const REMOVE = commandNamed('workflows rm');

const DELETE_SHAPE = '`{ "version": "<as GET /api/workflows lists it>" }`';

const DELETE_BODY = Schema.Struct({ version: Schema.NonEmptyString });

/**
 * The removal's route.
 *
 * - `DELETE /api/workflows/:from/:name` — a folder of yours removed whole: `{ "version" }` as the listing has it. 403 for the
 *   repository's (`yoursOnly`); 400 for a body without its version; 404 or 409 as `folderOf` says; 409 when the folder holds something
 *   other than what was read; the package's refusal by its kind — 409 while a run, a queued card or a factory still needs the folder. 200
 *   with the folder and the files it held (`WorkflowRemoved`).
 */
export const remover = new Hono<ApiEnv>().delete('/api/workflows/:from/:name', (c) =>
  served(c, async ({ e, placeService, repo, home }) => {
    const { from, name } = c.req.param();
    const route = `DELETE /api/workflows/${from}/${name}`;
    const refused = refusedBeforeReading(
      buildGuard(route, 'removes a workflow', DELETE_SHAPE),
      c.req.header('host'),
      c.req.header('sec-fetch-site'),
      c.req.header('content-type'),
    );
    if (refused) return c.json({ error: refused.error }, refused.status);
    const where = yoursOnly(route, from, name, repo, home);
    if (where) return c.json({ error: where.error }, where.status);
    const read = await readBody(
      c.req,
      DELETE_BODY,
      `${route} takes a JSON body: ${DELETE_SHAPE}.`,
      (_, body) =>
        `${route} takes the \`version\` the folder was read at, as GET /api/workflows lists it, so a folder changed since is not removed unseen: ${DELETE_SHAPE}. This request's was ${JSON.stringify(valueAt(body, ['version']))}.`,
    );
    if ('status' in read) return c.json({ error: read.error }, read.status);
    const folder = folderOf(name, 'yours', repo, home);
    if ('status' in folder) return c.json({ error: folder.error }, folder.status);
    return c.json(await runPlaced(placeService, e, REMOVE.handler({ from, name, version: read.body.version, repo }, undefined, home)));
  }),
);
