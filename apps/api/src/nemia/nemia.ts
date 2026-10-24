/**
 * Nemia, the store's own agent, read by the board: where she is, and what she keeps. Her level is set on the route the table generates
 * from `nemia level` (`PUT /api/level`, commands/routes.ts).
 */
import { Hono } from 'hono';
import { COMMANDS } from 'agent-orchestrator';
import { type ApiEnv, served } from '../layer.ts';
import { runPlaced } from '../store.ts';

/** `nemia level`'s entry of the package's table, whose bare read the api serves by hand. */
const LEVEL = COMMANDS.find((c) => c.name === 'level')!;

/** `nemia memory`'s entry of the package's table. */
const MEMORY = COMMANDS.find((c) => c.name === 'memory')!;

/** `nemia policy`'s entry of the package's table. */
const POLICY = COMMANDS.find((c) => c.name === 'policy')!;

/**
 * - `GET /api/level` — where Nemia is, as `nemia level --json` prints it:
 *   `{ level, since, task, phase, sessionId, reach, bridge, stopped, spend, allows, factories, trust }`, the store's level `manual`
 *   where none was ever set, `reach` the command that attaches to her session once it runs, then her web link or why it is not up,
 *   `bridge` that link as `{ url, why }` (null where her session is not bridged), `spend` what her ended sessions cost, `allows` what a
 *   person allowed her at a prompt beyond what ships, and `factories` each factory's level, the default factory first:
 *   `{ factory, level, default, own, raise }`, `raise` `{ level, until }` while one is in force; `trust` the command a person runs once
 *   to trust her folder, her session waiting for it, null where it is trusted. 422 for a level file that does not read, naming it. Its
 *   write, `PUT /api/level`, takes `{ level?, factory?, for?, end? }`, and is never refused for her folder's trust.
 * - `GET /api/nemia/memory` — the facts she keeps, `{ dir, facts, fact: null }`, by name.
 * - `GET /api/nemia/memory/:fact` — one fact's words, `{ dir, facts, fact: { name, text } }`; 404 for a fact she does not keep, naming
 *   those she does.
 * - `GET /api/policy/:name` — an agent's rules for auto: `{ agent, file, isDefault, rules, proposed, instruction }`, each rule with its
 *   words, `proposed` null where it proposed none, else `{ file, at, rules, guidance, stale }`; 400 for a name that is no agent's, 422 for
 *   a file of rules that does not read. Its writes, `PUT` and `DELETE /api/policy/:name/rules/:id`, confirm a rule and drop one.
 * - `/api/auto/…`, the routes' former spelling, as `nemia auto` was the commands': a 308 to the same path under `/api/policy/`, which
 *   keeps the method and the body, its `Location` naming the route to call now.
 */
export const nemia = new Hono<ApiEnv>()
  .get('/api/level', (c) => served(c, async ({ e, placeService }) => c.json(await runPlaced(placeService, e, LEVEL.handler({})))))
  .get('/api/nemia/memory', (c) => served(c, async ({ e, placeService }) => c.json(await runPlaced(placeService, e, MEMORY.handler({})))))
  .get('/api/nemia/memory/:fact', (c) =>
    served(c, async ({ e, placeService }) => c.json(await runPlaced(placeService, e, MEMORY.handler({ fact: c.req.param('fact') })))),
  )
  .get('/api/policy/:name', (c) =>
    served(c, async ({ e, placeService, home }) => {
      const wrong = POLICY.check?.({ name: c.req.param('name') });
      if (wrong) return c.json({ error: wrong }, 400);
      return c.json(await runPlaced(placeService, e, POLICY.handler({ name: c.req.param('name') }, undefined, home)));
    }),
  )
  .all('/api/auto/*', (c) => {
    const url = new URL(c.req.url);
    return c.redirect(`${url.pathname.replace(/^\/api\/auto\//, '/api/policy/')}${url.search}`, 308);
  });
