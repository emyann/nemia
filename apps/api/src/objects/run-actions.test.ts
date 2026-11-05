/**
 * The run's named actions as endpoints of `objects`' one `Api` (src/objects/runs.ts), each served in the run's namespace through the
 * pipeline a route of the command table runs (`commandAnswered`, commands/routes.ts).
 *
 * First, each action's body in the `Api` (`RunRetry`, `RunApprove`, …) holds the keys the command takes on the api (`bodySchema`), each
 * as optional as the pipeline takes it — the one known difference said by name. Then the statuses each answers on its namespaced path: its
 * success, a run or a step it lacks and a run addressed in another namespace (404), the command's `Conflict` (409) and its check (422), and
 * the guard's 403 and 415 before any body is read; a former `mode` still answered with a `hint`. Last, the Hono routes they replace answer
 * 404, and `GET /api/runs` is no array.
 *
 * On the stand-ins: the runtime's test engine, each step's task filed and left where this file says, and the test place, under the run
 * records this file seeds. The successes of a removal, a prune and a start, which need a try, git worktrees or a workflow folder, are
 * `routes.test.ts`'s, `prune.test.ts`'s and `workflows.test.ts`'s, on the same paths.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, SchemaAST } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { type Route, routeList } from 'agent-orchestrator';
import { LabelEdit, RunApprove, RunHold, RunPrune, RunRefresh, RunRetry, RunSay } from 'objects';
import { bodySchema } from '../commands/routes.ts';
import { commandNamed } from '../store.ts';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const app = eachTest(() => appOver(standIn(), stand()));

/** Whether each key of a Struct's AST is required or optional, by its name: what the parity compares, never the Schema itself. */
type Shape = Record<string, 'required' | 'optional'>;

const shapeOf = ({ ast }: { readonly ast: SchemaAST.AST }): Shape => {
  if (!SchemaAST.isObjects(ast)) throw new Error(`a body is a Struct, and this is a ${ast._tag}`);
  return Object.fromEntries(ast.propertySignatures.map((ps) => [String(ps.name), SchemaAST.isOptional(ps.type) ? 'optional' : 'required']));
};

/** Each moved command's body in the `Api`, by the route of the command it is sent on: its method and the last word of its path. */
const BODIES = [
  ['retry', '/retry', RunRetry],
  ['approve', '/approve', RunApprove],
  ['refresh', '/refresh', RunRefresh],
  ['say', '/say', RunSay],
  ['hold', '/hold', RunHold],
  ['prune', '/prune', RunPrune],
  ['label run', '/labels', LabelEdit],
] as const;

/** The POST route of `name` whose path ends `suffix`, and the names its path gives (`namespace`, `runId`, `step`). */
const routeOf = (name: string, suffix: string): { route: Route; inPath: string[] } => {
  const route = routeList(commandNamed(name)).find((r) => r.method === 'POST' && r.path.endsWith(suffix));
  if (route === undefined) throw new Error(`${name} has no POST route ending ${suffix}`);
  return { route, inPath: [...route.path.matchAll(/:(\w+)/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]])) };
};

test("each action's body in the Api holds the keys the command takes on the api, each as optional, but the one difference named", () => {
  const differences: string[] = [];
  for (const [name, suffix, payload] of BODIES) {
    const { route, inPath } = routeOf(name, suffix);
    assert.deepEqual(inPath.slice(0, 2), ['namespace', 'runId'], `${name}'s route names the run in its namespace`);
    const api = shapeOf(payload);
    const pipeline = shapeOf(bodySchema(commandNamed(name), inPath, route));
    assert.deepEqual(Object.keys(api).sort(), Object.keys(pipeline).sort(), `${name}: the same keys`);
    for (const key of Object.keys(api))
      if (api[key] !== pipeline[key]) differences.push(`${name}.${key}: ${api[key]} in the Api, ${pipeline[key]} in the pipeline`);
  }
  assert.deepEqual(
    differences,
    ['label run.labels: required in the Api, optional in the pipeline'],
    "the card's `LabelEdit`, shared with the run, requires `labels`; the pipeline leaves it to `nemia label run`'s check, a 422",
  );
});

const T0 = Date.parse('2026-11-05T06:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A Claude Code task filed and left in `phase`, signed `closeout` where it ended. */
const task = (taskId: string, phase: Parameters<ReturnType<typeof testEngine>['settle']>[1], closeout?: object) => {
  Effect.runSync(engine().file({ id: taskId, brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  standIn().settle(taskId, phase, closeout ? { exitCode: 0, closeout } : undefined);
};

const DONE = { outcome: 'done', summary: 'Planned it.', needs: null, artifacts: [] };
const BLOCKED = { outcome: 'blocked', summary: 'Half of it.', needs: 'Which database?', artifacts: [] };

/** The workflow folder the runs were started from, each step a file of it, so a refresh has a revision to read. */
const FLOW = path.join(root, 'ra-flow');
for (const name of ['plan', 'implement', 'nudged', 'talk', 'review'])
  write(path.join(FLOW, `${name}.md`), `---\nplace: git\n---\n${name} it.\n`);

/** A run's record: its steps, each its task or none, `gate: true` on `gated`'s, in `factory` where one is named. */
const record = (id: string, steps: Record<string, string | null>, more: { gated?: string; factory?: string } = {}) =>
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Act on it',
      workflowDir: FLOW,
      createdAt: at(0),
      workflow: Object.keys(steps).map((name) => ({
        name,
        after: [],
        body: `${name} it.`,
        ...(name === more.gated ? { gate: true } : {}),
      })),
      steps: Object.fromEntries(Object.entries(steps).map(([name, taskId]) => [name, { taskId }])),
      ...(more.factory ? { factory: more.factory } : {}),
    }),
  );

const R = 'ra-run';
const OTHER = 'ra-other';
const MILL = 'ra-mill';
const seed = () => {
  task('t-ra-plan', 'succeeded', DONE);
  task('t-ra-implement', 'succeeded', BLOCKED);
  task('t-ra-nudged', 'succeeded', BLOCKED);
  task('t-ra-talk', 'working');
  task('t-ra-other', 'working');
  task('t-ra-mill', 'working');
};
record(R, { plan: 't-ra-plan', implement: 't-ra-implement', nudged: 't-ra-nudged', talk: 't-ra-talk', review: null }, { gated: 'plan' });
record(OTHER, { implement: 't-ra-other' });
record(MILL, { implement: 't-ra-mill' }, { factory: 'mill' });

/** What the board sends, through vite's proxy: JSON, same-origin, and Host rewritten to the api's. */
const BOARD = {
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
  origin: 'http://localhost:5173',
  host: '127.0.0.1:8787',
};

/** `method` on `address` with `body` (none for a delete), sent with `headers`. */
const send = (method: string, address: string, body?: unknown, headers: Record<string, string> = BOARD) =>
  app().request(address, {
    method,
    headers,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });

/** The path of the run `id` in `namespace`. */
const run = (id = R, namespace = 'default') => `/api/namespaces/${namespace}/runs/${id}`;

/** The status `res` answered, and its body read as JSON. */
const answered = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });

test("each action answers its status on the run's namespaced path, and refuses as its command does", async (t) => {
  seed();
  await t.test('retry, approve and say are accepted, 202, each with what its command answers', async () => {
    const retried = await answered(
      await send('POST', `${run()}/steps/implement/retry`, { mode: 'continue', message: 'The one in compose.' }),
    );
    assert.equal(retried.status, 202, JSON.stringify(retried.body));
    assert.equal(typeof retried.body.file, 'string', 'the ask written');
    const approved = await answered(await send('POST', `${run()}/steps/plan/approve`, { message: 'Go.' }));
    assert.equal(approved.status, 202, JSON.stringify(approved.body));
    assert.deepEqual([approved.body.step, approved.body.message], ['plan', 'Go.']);
    const said = await answered(await send('POST', `${run()}/steps/talk/say`, { text: 'Widen the scope.' }));
    assert.equal(said.status, 202, JSON.stringify(said.body));
    assert.equal(said.body.text, 'Widen the scope.');
  });
  await t.test('a former mode is still taken, and answered with a hint naming the spelling to send now', async () => {
    const nudged = await answered(await send('POST', `${run()}/steps/nudged/retry`, { mode: 'nudge' }));
    assert.equal(nudged.status, 202, JSON.stringify(nudged.body));
    assert.equal(typeof nudged.body.hint, 'string', 'the hint is said');
    assert.match(String(nudged.body.hint), /continue/);
  });
  await t.test(
    "REFUSED: a refresh of a run already on its workflow's newest revision is its Conflict, 409 — routes.test.ts's merge of the base its 202",
    async () => {
      const refreshed = await answered(await send('POST', `${run()}/refresh`, {}));
      assert.equal(refreshed.status, 409, JSON.stringify(refreshed.body));
      assert.match(String(refreshed.body.error), /nemia refresh ra-run/, 'the command that takes them, named');
    },
  );
  await t.test("labels, hold and its lift answer 200, a run of a factory's in its own namespace", async () => {
    const labelled = await answered(await send('POST', `${run(MILL, 'mill')}/labels`, { labels: ['team=core'] }));
    assert.equal(labelled.status, 200, JSON.stringify(labelled.body));
    const held = await answered(await send('POST', `${run()}/hold`, { until: [OTHER], why: 'After the other.' }));
    assert.equal(held.status, 200, JSON.stringify(held.body));
    assert.deepEqual([held.body.id, held.body.lifted], [R, false]);
    const lifted = await answered(await send('DELETE', `${run()}/hold`));
    assert.equal(lifted.status, 200, JSON.stringify(lifted.body));
    assert.deepEqual([lifted.body.id, lifted.body.lifted], [R, true]);
  });
  await t.test('REFUSED: a run or a step the store lacks, and a run addressed in another namespace, are each 404', async () => {
    for (const [method, address, body] of [
      ['POST', `${run('ra-none')}/steps/plan/approve`, {}],
      ['POST', `${run()}/steps/nope/approve`, {}],
      ['POST', `${run(R, 'mill')}/hold`, { until: [OTHER] }],
      ['POST', `${run(MILL)}/labels`, { labels: ['team=core'] }],
      ['DELETE', `${run(R, 'elsewhere')}/hold`, undefined],
      ['DELETE', run('ra-none'), undefined],
      ['POST', `${run(R, 'mill')}/steps/talk/say`, { text: 'Hello.' }],
    ] as const) {
      const res = await answered(await send(method, address, body));
      assert.equal(res.status, 404, `${method} ${address}: ${JSON.stringify(res.body)}`);
      assert.equal(typeof res.body.error, 'string');
    }
  });
  await t.test(
    "REFUSED: the command's Conflict is a 409 — an approval of a step at no gate, the removal of a run that is no try",
    async () => {
      const approve = await answered(await send('POST', `${run()}/steps/review/approve`, {}));
      assert.equal(approve.status, 409, JSON.stringify(approve.body));
      const removal = await answered(await send('DELETE', run(OTHER)));
      assert.equal(removal.status, 409, JSON.stringify(removal.body));
    },
  );
  await t.test("REFUSED: the command's check is a 422 — a hold put by no one, a run's labels with none", async () => {
    const hold = await answered(await send('POST', `${run()}/hold`, { until: [OTHER], by: ' ' }));
    assert.equal(hold.status, 422, JSON.stringify(hold.body));
    const labels = await answered(await send('POST', `${run()}/labels`, { labels: [] }));
    assert.equal(labels.status, 422, JSON.stringify(labels.body));
  });
  await t.test(
    "REFUSED: a body not the action's is a 400 in its route's words — a key the hold does not take, `answers` sent to a refresh is a 422",
    async () => {
      const off = await answered(await send('POST', `${run()}/hold`, { until: [OTHER], off: true }));
      assert.equal(off.status, 400, JSON.stringify(off.body));
      assert.match(String(off.body.error), /`off`/, 'the key it does not take, named');
      const foreign = await answered(await send('POST', `${run()}/refresh`, { answers: [] }));
      assert.equal(foreign.status, 422, JSON.stringify(foreign.body));
      assert.match(String(foreign.body.error), /`answers`/);
      const notJson = await answered(await send('POST', `${run()}/steps/talk/say`, 'Widen it.'));
      assert.equal(notJson.status, 400, JSON.stringify(notJson.body));
    },
  );
  await t.test('REFUSED: another site is a 403 and a body that is not JSON a 415, before the run or the body is read', async () => {
    for (const address of [`${run('ra-none')}/steps/plan/retry`, `${run()}/hold`, '/api/namespaces/default/runs']) {
      const site = await send('POST', address, { mode: 'continue' }, { ...BOARD, 'sec-fetch-site': 'cross-site' });
      assert.equal(site.status, 403, address);
      const typed = await send('POST', address, 'mode=continue', { ...BOARD, 'content-type': 'text/plain' });
      assert.equal(typed.status, 415, address);
    }
    const lift = await send('DELETE', `${run()}/hold`, undefined, { ...BOARD, 'sec-fetch-site': 'cross-site' });
    assert.equal(lift.status, 403, 'a lift too');
  });
  await t.test('REFUSED: a start with no brief is a 422, one sent a card a 400 pointing at the Card', async () => {
    const briefless = await answered(await send('POST', '/api/namespaces/default/runs', { workflow: 'no-such-workflow' }));
    assert.ok([404, 422].includes(briefless.status), JSON.stringify(briefless.body));
    const carded = await answered(await send('POST', '/api/namespaces/default/runs', { workflow: 'w', card: 'c', brief: 'b' }));
    assert.equal(carded.status, 400, JSON.stringify(carded.body));
  });
});

test('the routes the actions replace are gone: a write on /api/runs/:runId/… and POST /api/runs answer 404, and GET /api/runs is no array', async () => {
  for (const [method, address] of [
    ['POST', `/api/runs/${R}/hold`],
    ['DELETE', `/api/runs/${R}/hold`],
    ['POST', `/api/runs/${R}/steps/plan/approve`],
    ['POST', `/api/runs/${R}/steps/implement/retry`],
    ['POST', `/api/runs/${R}/refresh`],
    ['DELETE', `/api/runs/${R}`],
    ['POST', '/api/runs'],
  ] as const) {
    const res = await send(method, address, method === 'DELETE' ? undefined : {});
    assert.equal(res.status, 404, `${method} ${address}`);
  }
  const listed = (await (await app().request('/api/runs')).json()) as unknown;
  assert.equal(Array.isArray(listed), false, 'no array');
  assert.equal((listed as { kind?: unknown }).kind, 'RunList');
});

test("REFUSED: a run's action whose body is over the limit is a 413, as every object's write is, never a body that is no JSON", async () => {
  const { OBJECT_BODY_LIMIT } = await import('./serve.ts');
  const body = JSON.stringify({ workflow: 'flow', brief: 'x'.repeat(Number(OBJECT_BODY_LIMIT)) });
  for (const route of ['/api/namespaces/default/runs', `/api/namespaces/default/runs/${R}/hold`]) {
    const res = await app().request(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(res.status, 413, route);
    assert.equal(typeof ((await res.json()) as { error?: unknown }).error, 'string', `${route}: the 413 says why`);
  }
});
