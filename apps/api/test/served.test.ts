/**
 * Every route the api serves is accounted for by the command table, both ways: an entry of the table declares it — a command of the
 * CLI's on its route, or one the api serves alone (`only: api`, with its why) — or `OWN` says why it is the api's own and no command of
 * the orchestrator's: the server answering, a stream, a read of the machine or of the request. `servedBreaks` refuses a route neither
 * names, an `OWN` line the api no longer serves, an `OWN` line an entry declares, and an `OWN` line with no why. The other way, that each
 * route the table declares is served, is `src/commands/routes.test.ts`'s.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { COMMANDS, routeList } from 'agent-orchestrator';
import { app } from '../src/app.ts';

/** The routes the api serves that are its own, each with why no entry of the command table declares it. */
const OWN: Readonly<Record<string, string>> = {
  'GET /api/health': 'the server answering at all, which no command of the orchestrator asks',
  'GET /api/nemia/chat': "Nemia's chat paged, a program of the package's chat and no command, as its writes are none",
  'GET /api/nemia/chat/stream': "Nemia's chat followed, a stream",
  'POST /api/nemia/chat/send':
    "the person's words to Nemia, a program of the package's chat and no command: a command would enter her fence, a second writer",
  'POST /api/nemia/chat/answer':
    "the person's answer to a question of Nemia's, a program of the package's chat and no command: the answer is theirs, written out of her fence",
  'POST /api/nemia/chat/read': "the person's read mark of Nemia's chat, a program of the package's chat and no command, as the send",
  'POST /api/nemia/chat/stop':
    "the turn Nemia is answering stopped, a program of the package's chat and no command: the stop is the person's record of it, written out of her fence",
  'GET /api/store': "your store's folders as the api reads them, under its store root, which no command of the orchestrator answers",
  'GET /api/version': "the api's build, as the board's bottom bar says it",
  'GET /api/capabilities': "the machine's harnesses and MCP servers, asked by the app's asker, which it keeps between requests",
  'GET /api/daemon': "the daemon's standing, read off its lease file: whether anything ticks the store at all",
  'GET /api/quota': "the harness's quota, asked by the app's asker, which it keeps between requests",
  'GET /api/feed/stream': "a stream of the feed, held open for as long as the board reads it: the api's counterpart of nemia watch",
  'GET /api/runs/:id/steps/:step/transcript/stream': "a stream of a step's transcript, held open for as long as the board reads it",
  'GET /api/machines': 'the state machines the board draws, read off their code: no run, no store',
  'GET /api/machines/:name': "one state machine's graph, read off its code: no run, no store",
  'GET /api/workflows/keys': "the keys a step may set and what each means, the builder's form: no run, no store",
  'GET /api/repository': 'the repository the request is served on, as the request names it',
  'POST /api/factories/:factory/servers/:server/sign-in':
    'a sign-in a person makes in their browser, held by the engine until they approve: a CLI verb would wait on a browser in its own process, and none is asked for',
  'GET /api/factories/:factory/servers/:server/sign-in': "the state of the sign-in the board holds open, read off the engine's memory",
  'DELETE /api/factories/:factory/servers/:server/sign-in':
    "a sign-out, the board's beside its sign-in, which no command of the table has either",
  'GET /api/metrics': "the api process's own metrics, kept in its memory: the command line runs in another process, which has none of them",
};

type Table = readonly Parameters<typeof routeList>[0][];
type Named = { readonly name: string };

/** Each route as `METHOD path`, once, but middleware (`ALL`), which serves no route of its own. */
const routesOf = (routes: readonly { method: string; path: string }[]): string[] => [
  ...new Set(routes.filter((r) => r.method !== 'ALL').map((r) => `${r.method} ${r.path}`)),
];

/** The entry of `table` that declares each route it routes, by `METHOD path`. */
const declaredBy = (table: readonly (Table[number] & Named)[]): Map<string, string> =>
  new Map(table.flatMap((c) => routeList(c).map((r) => [`${r.method} ${r.path}`, c.name] as const)));

/**
 * Where the routes the api serves and the table disagree, a sentence each naming the fix: a route no entry declares and `own` does not
 * list; an `own` line the api does not serve, one an entry declares, and one with no why.
 */
function servedBreaks(
  routes: readonly { method: string; path: string }[],
  table: readonly (Table[number] & Named)[],
  own: Readonly<Record<string, string>>,
): string[] {
  const served = routesOf(routes);
  const declared = declaredBy(table);
  const breaks: string[] = [];
  for (const at of served.filter((r) => !declared.has(r) && !(r in own)))
    breaks.push(
      `${at} is served by no entry of the command table, and OWN does not list it: declare it on an entry (only: api, with its why), or say why it is the api's own in OWN.`,
    );
  for (const [at, why] of Object.entries(own)) {
    if (!served.includes(at)) breaks.push(`OWN lists ${at}, which the api does not serve: take it off OWN.`);
    if (declared.has(at)) breaks.push(`OWN lists ${at}, which ${declared.get(at)} declares: take it off OWN.`);
    if (!why.trim()) breaks.push(`OWN lists ${at} and says no why: say why it is the api's own.`);
  }
  return breaks;
}

test('every route the api serves is declared by an entry of the command table, or is its own with a why', () => {
  assert.deepEqual(servedBreaks(app.routes, COMMANDS, OWN), []);
});

test("the runs' list is declared by runs, an entry the api serves alone, and ls routes nothing: the CLI serves it alone", () => {
  const runs = COMMANDS.find((c) => c.name === 'runs');
  const ls = COMMANDS.find((c) => c.name === 'ls');
  assert.equal(declaredBy(COMMANDS).get('GET /api/runs'), 'runs');
  assert.equal(runs?.only?.side, 'api', 'the runs entry is served on the api alone');
  assert.ok(runs?.only?.why.trim(), 'and says why');
  assert.deepEqual(routeList(ls!), [], 'ls has no route');
  assert.equal(ls?.only?.side, 'cli', 'ls is served on the CLI alone');
  assert.ok(ls?.only?.why.trim(), 'and says why');
});

test('REFUSED: a route no entry declares and OWN does not list, matched whole; middleware and a route mounted twice are none', () => {
  const extra = new Hono().get('/api/x', (c) => c.text('x'));
  const more = new Hono()
    .use(async (_c, next) => next())
    .route('/', app)
    .route('/', extra)
    .route('/', extra);
  assert.deepEqual(servedBreaks(more.routes, COMMANDS, OWN), [
    "GET /api/x is served by no entry of the command table, and OWN does not list it: declare it on an entry (only: api, with its why), or say why it is the api's own in OWN.",
  ]);
  const { 'GET /api/health': _health, ...rest } = OWN;
  assert.deepEqual(servedBreaks(app.routes, COMMANDS, rest), [
    "GET /api/health is served by no entry of the command table, and OWN does not list it: declare it on an entry (only: api, with its why), or say why it is the api's own in OWN.",
  ]);
});

test('REFUSED: an OWN line the api does not serve, one an entry declares, and one with no why', () => {
  assert.deepEqual(servedBreaks(app.routes, COMMANDS, { ...OWN, 'GET /api/gone': 'a route since removed' }), [
    'OWN lists GET /api/gone, which the api does not serve: take it off OWN.',
  ]);
  assert.deepEqual(servedBreaks(app.routes, COMMANDS, { ...OWN, 'GET /api/runs': 'the runs' }), [
    'OWN lists GET /api/runs, which runs declares: take it off OWN.',
  ]);
  assert.deepEqual(servedBreaks(app.routes, COMMANDS, { ...OWN, 'GET /api/health': ' ' }), [
    "OWN lists GET /api/health and says no why: say why it is the api's own.",
  ]);
});
