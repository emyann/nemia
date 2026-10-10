/**
 * A factory's rules on the board: the file the store keeps them in and its words, read through `nemia factory rules`'s entry of the
 * package's command table (`FACTORY_RULES`), so the board and the command refuse the same things in the same words. Read afresh on each
 * request: what a run was told is on its record, frozen when it started. And the words of the routes that write and remove them
 * (`FACTORY_RULES_WORDS`).
 */
import { Hono } from 'hono';
import { FACTORY_RULES, factoryNameRefusal, runWith, type FactoryRules } from 'agent-orchestrator';
import { valueAt } from '../body.ts';
import type { Named, RouteWords } from '../commands/words.ts';
import { type ApiEnv, served } from '../layer.ts';

const RULES_PUT_SHAPE = '`{ "words": "<the factory\'s rules>" }`';

/** The route of a factory's rules `at` names, as a refusal says it: `PUT /api/factories/<name>/rules`. */
const rulesRoute = ({ method, factory }: Named): string => `${method} /api/factories/${factory}/rules`;

/**
 * A factory's rules written or removed, as the guard's refusals word it: a name that is no factory's is refused in the package's words,
 * before anything is read, and words that are not a string in the api's.
 */
export const FACTORY_RULES_WORDS: RouteWords = {
  shape: RULES_PUT_SHAPE,
  guard: (at) => ({
    route: rulesRoute(at),
    does: "writes a factory's rules",
    forAnother: 'write them',
    why: 'they are told to every agent hired into the factory, in every step of every run started after',
    reach: "write them on the factory's settings page on the board",
    instead: "Write them on the factory's settings page on the board",
    shape: at.method === 'DELETE' ? '`{}`' : RULES_PUT_SHAPE,
  }),
  issue: (at) => (_issue, body) =>
    `${rulesRoute(at)}: \`words\` are what every agent hired into the factory is told, a string: ${RULES_PUT_SHAPE}. This request's was ${JSON.stringify(valueAt(body, ['words']))}.`,
  named: (at) => {
    const wrong = factoryNameRefusal(at.factory);
    return wrong === undefined ? null : `${rulesRoute(at)}: ${wrong}`;
  },
  notJson: (at) => `${rulesRoute(at)} takes a JSON body: ${RULES_PUT_SHAPE}.`,
};

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
