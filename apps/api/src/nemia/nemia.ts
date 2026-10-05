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
 *   `{ level, since, task, phase, sessionId, reach, stopped, spend, allows }`, her level `manual` where none was ever set, `reach` the
 *   command that attaches to her session once it runs, `spend` what her ended sessions cost, and `allows` what a person allowed her at a
 *   prompt beyond what ships. 422 for a level file that does not read, naming it.
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
