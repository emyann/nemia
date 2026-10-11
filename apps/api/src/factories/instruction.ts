/**
 * A factory's instruction on the board: where it is kept and its words, read through `nemia factory instruction`'s entry of the package's
 * command table (`FACTORY_INSTRUCTION`), so the board and the command refuse the same things in the same words. Read afresh on each
 * request, where the factory's file says: a file in its first folder, which the api never writes, or the store.
 */
import { Hono } from 'hono';
import { FACTORY_INSTRUCTION, factoryNameRefusal, type FactoryInstruction } from 'agent-orchestrator';
import { type ApiEnv, served } from '../layer.ts';
import { runPlaced } from '../store.ts';

/**
 * A factory's instruction's read. A name that is no factory's is refused in the package's words (400) before anything is read, so none
 * reaches outside the store; the default factory, which keeps none, is 409 (`Conflict`); a name with no factory 404 (`Missing`); a file
 * that does not read as a factory 422 (`Invalid`) — each by `app.onError`.
 *
 * - `GET /api/factories/:factory/instruction` — the factory's instruction (`FactoryInstruction`): the path its file names, or none, whether
 *   the store keeps it, the file it is read from, its words, why a file there does not read, and whether the store keeps text for it.
 *
 * Where it is kept is put (`PUT`, `{ "path": "<path>" }` or `{ "store": true }`) and cleared (`DELETE`) on the same path, and the store's
 * text written (`PUT …/instruction/words`, `{ "words": "…" }`) and cleared (`DELETE …/instruction/words`): routes the table generates from
 * the entries (commands/routes.ts), guarded, each answered as the read.
 */
export const factoryInstruction = new Hono<ApiEnv>().get('/api/factories/:factory/instruction', (c) =>
  served(c, async ({ e, placeService }) => {
    const { factory } = c.req.param();
    const wrong = factoryNameRefusal(factory);
    if (wrong !== undefined) return c.json({ error: `GET /api/factories/${factory}/instruction: ${wrong}` }, 400);
    return c.json((await runPlaced(placeService, e, FACTORY_INSTRUCTION.handler({ factory }))) satisfies FactoryInstruction);
  }),
);
