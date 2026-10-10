/**
 * A factory's rules on the board: the file the store keeps them in and its words, read through `nemia factory rules`'s entry of the
 * package's command table (`FACTORY_RULES`), so the board and the command refuse the same things in the same words. Read afresh on each
 * request: what a run was told is on its record, frozen when it started.
 */
import { Hono } from 'hono';
import { FACTORY_RULES, factoryNameRefusal, runWith, type FactoryRules } from 'agent-orchestrator';
import { type ApiEnv, served } from '../layer.ts';

/**
 * A factory's rules' read. A name that is no factory's is refused in the package's words (400) before anything is read, so none reaches
 * outside the store; the default factory, which keeps none, is 409 (`Conflict`); a name with no factory 404 (`Missing`) — each by
 * `app.onError`. Rules that cannot be told are answered, never refused: their words, and why in `error`.
 *
 * - `GET /api/factories/:factory/rules` — the factory's rules (`FactoryRules`): the file they are kept in, their words, or none, and why
 *   a file there cannot be told.
 *
 * They are written (`PUT`, `{ "words": "…" }`) and removed (`DELETE`) on the same path: routes the table generates from the entry
 * (commands/routes.ts), guarded, each answered as the read.
 */
export const factoryRules = new Hono<ApiEnv>().get('/api/factories/:factory/rules', (c) =>
  served(c, async ({ e }) => {
    const { factory } = c.req.param();
    const wrong = factoryNameRefusal(factory);
    if (wrong !== undefined) return c.json({ error: `GET /api/factories/${factory}/rules: ${wrong}` }, 400);
    return c.json((await runWith(e, FACTORY_RULES.handler({ factory }))) satisfies FactoryRules);
  }),
);
