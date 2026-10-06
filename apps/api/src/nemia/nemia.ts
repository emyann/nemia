/**
 * Nemia, the store's own agent, read by the board: where she is, and what she keeps. Her level is set on the route the table generates
 * from `nemia level` (`PUT /api/level`, commands/routes.ts).
 */
import { Hono } from 'hono';
import { COMMANDS, runWith } from 'agent-orchestrator';
import { type ApiEnv, served } from '../layer.ts';

/** `nemia level`'s entry of the package's table, whose bare read the api serves by hand. */
const LEVEL = COMMANDS.find((c) => c.name === 'level')!;

/** `nemia memory`'s entry of the package's table. */
const MEMORY = COMMANDS.find((c) => c.name === 'memory')!;

/**
 * - `GET /api/level` — where Nemia is, as `nemia level --json` prints it:
 *   `{ level, since, task, phase, sessionId, reach, bridge, stopped, spend, allows, factories }`, the store's level `manual` where none
 *   was ever set, `reach` the command that attaches to her session once it runs, then her web link or why it is not up, `bridge` that
 *   link as `{ url, why }` (null where her session is not bridged), `spend` what her ended sessions cost, `allows` what a person
 *   allowed her at a prompt beyond what ships, and `factories` each factory's level, the default factory first:
 *   `{ factory, level, default, own, raise }`, `raise` `{ level, until }` while one is in force. 422 for a level file that does not
 *   read, naming it. Its write, `PUT /api/level`, takes `{ level?, factory?, for?, end? }`.
 * - `GET /api/nemia/memory` — the facts she keeps, `{ dir, facts, fact: null }`, by name.
 * - `GET /api/nemia/memory/:fact` — one fact's words, `{ dir, facts, fact: { name, text } }`; 404 for a fact she does not keep, naming
 *   those she does.
 */
export const nemia = new Hono<ApiEnv>()
  .get('/api/level', (c) => served(c, async ({ e }) => c.json(await runWith(e, LEVEL.handler({})))))
  .get('/api/nemia/memory', (c) => served(c, async ({ e }) => c.json(await runWith(e, MEMORY.handler({})))))
  .get('/api/nemia/memory/:fact', (c) =>
    served(c, async ({ e }) => c.json(await runWith(e, MEMORY.handler({ fact: c.req.param('fact') })))),
  );
