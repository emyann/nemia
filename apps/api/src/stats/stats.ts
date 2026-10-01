/** The flow numbers of every run in the store, for the board: what `wf stats --json` prints. */
import { Hono } from 'hono';
import { stats as flowNumbers, statsQueryOf, type QueryKey, type Stats } from 'agent-orchestrator';
import { type ApiEnv, served } from '../layer.ts';

export type { Stats };

/**
 * The query keys `GET /api/stats` reads, by the key of the package's query each sets. The factory and the repository to keep are read
 * off `ofFactory` and `ofRepo`, since `factory` and `repo` name the place every route is answered in (`served`).
 */
const QUERY_KEYS: Record<QueryKey, string> = {
  from: 'from',
  to: 'to',
  by: 'by',
  agent: 'agent',
  step: 'step',
  workflow: 'workflow',
  factory: 'ofFactory',
  repo: 'ofRepo',
};

/**
 * - `GET /api/stats` — `Stats`, as `wf stats --json` prints it (`flowNumbers`, the package's `stats`): the flow numbers of every run in
 *   the store, whatever factory and repository the request is answered in, like `GET /api/runs`. `from` and `to` are UTC days
 *   (YYYY-MM-DD), `by` one of agent, step, factory, workflow or repo, and `agent`, `step`, `workflow`, `ofFactory` and `ofRepo` keep only
 *   the facts that have that value, compared as strings: `ofRepo` a repository's path as a run's record names it. A number nothing
 *   measured is null, never 0: `deniedPerTry`, the mean calls a try was refused, is null on a day whose tries all ran on a harness that
 *   records no denial (codex, a remote agent, `background: true`) or were a recheck's, as is a step row's `deniedCalls`; its `denials`
 *   name each call refused, with a count. `skillsPerTry`, the mean skills a try's session loaded, is null on a day with no try whose
 *   session's ends all say what they loaded, as is a step row's `skillLoads`; its `skills` name each skill loaded, with a count. Each
 *   group carries its `marks`: the days a run froze a step, an agent or a rendered skill that differs from the run of the same workflow
 *   folder before it. A query the package refuses (`statsQueryOf`) is a 422 naming the key and what it takes.
 */
export const stats = new Hono<ApiEnv>().get('/api/stats', (c) =>
  served(c, async ({ e }) => {
    const given = Object.fromEntries(Object.entries(QUERY_KEYS).map(([key, name]) => [key, c.req.query(name)]));
    const query = statsQueryOf(given, (key) => `?${QUERY_KEYS[key]}=`);
    return c.json(await flowNumbers(e, query));
  }),
);
