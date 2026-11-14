/**
 * The run's named actions as endpoints of `objects`' one `Api` (src/objects/runs.ts), each served in the run's namespace: its body decoded
 * by its Schema in `objects` (`RunRetry`, `RunApprove`, …) and handed, with the keys of its path, to the orchestrator's typed entry.
 *
 * First, the statuses each answers on its namespaced path: its success, a run or a step it lacks and a run addressed in another namespace
 * (404), the command's `Conflict` (409) and its check (422); a former `mode` still answered with a `hint`. Then a body its Schema refuses,
 * a 400 naming the key; then the Hono routes they replace answer 404, and `GET /api/runs` is no array — a `Table` where one is asked.
 *
 * On the stand-ins: the runtime's test engine, each step's task filed and left where this file says, and the test place, under the run
 * records this file seeds. The successes of a removal, a prune and a start, which need a try, git worktrees or a workflow folder, are
 * `routes.test.ts`'s, `prune.test.ts`'s and `workflows.test.ts`'s, on the same paths.
 *
 * Last, who acted: each write keeps the actor of the token its request presented — the person under its name, an agent by its standing
 * token or by its session — and the run serves it where the write is read.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { TABLE_ACCEPT } from 'objects';
import { TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';
import { OBJECT_BODY_LIMIT } from './serve.ts';
import { objectOf } from '../../test/run-reads.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const app = eachTest(() => appOver(standIn(), stand()));

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
    "a key the action's Schema does not hold is no part of it: `off` sent to a hold puts it, never lifts it; a body that is no JSON is a 400",
    async () => {
      const off = await answered(await send('POST', `${run()}/hold`, { until: [OTHER], off: true }));
      assert.equal(off.status, 200, JSON.stringify(off.body));
      assert.deepEqual([off.body.id, off.body.lifted], [R, false], 'the hold put, its lift a DELETE alone');
      const notJson = await answered(await send('POST', `${run()}/steps/talk/say`, 'Widen it.'));
      assert.equal(notJson.status, 400, JSON.stringify(notJson.body));
    },
  );
  await t.test(
    'REFUSED: a start of a workflow the store lacks is a 404 — a `card` beside it a 400 naming it, refused before the workflow is looked for',
    async () => {
      const briefless = await answered(await send('POST', '/api/namespaces/default/runs', { workflow: 'no-such-workflow' }));
      assert.ok([404, 422].includes(briefless.status), JSON.stringify(briefless.body));
      const carded = await answered(
        await send('POST', '/api/namespaces/default/runs', { workflow: 'no-such-workflow', card: 'c', brief: 'b' }),
      );
      assert.equal(carded.status, 400, JSON.stringify(carded.body));
      assert.equal((carded.body as { field?: string }).field, 'payload.card', "the key refused: a card is started at the Card's own path");
    },
  );
});

test("REFUSED: a body its action's Schema refuses is a 400 naming the key, before any command runs — nothing written", async () => {
  seed();
  const hold = path.join(root, 'runs', `${R}.hold`);
  const holdBefore = fs.existsSync(hold) ? fs.readFileSync(hold, 'utf8') : null;
  for (const [method, address, body, key] of [
    ['POST', `${run()}/steps/implement/retry`, { mode: 'sideways' }, 'mode'],
    ['POST', `${run()}/refresh`, { base: 'yes' }, 'base'],
    ['POST', `${run()}/steps/talk/say`, {}, 'text'],
    ['POST', `${run()}/hold`, { until: 'x' }, 'until'],
    ['POST', `${run()}/prune`, { artifacts: 'x' }, 'artifacts'],
    ['POST', `${run()}/labels`, { labels: 'x' }, 'labels'],
    ['POST', '/api/namespaces/default/runs', { workflow: '' }, 'workflow'],
  ] as const) {
    const res = await answered(await send(method, address, body));
    assert.equal(res.status, 400, `${method} ${address}: ${JSON.stringify(res.body)}`);
    assert.ok(String(res.body.field).startsWith(`payload.${key}`), `${address} names payload.${key}: ${JSON.stringify(res.body)}`);
  }
  assert.equal(fs.existsSync(hold) ? fs.readFileSync(hold, 'utf8') : null, holdBefore, 'the hold as it was');
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

test('a run list asked for as a Table answers one, a row for each run with its name, and a watch of the list is never one', async () => {
  seed();
  for (const address of ['/api/runs', '/api/namespaces/default/runs']) {
    const table = (await (await app().request(address, { headers: { accept: TABLE_ACCEPT } })).json()) as {
      kind?: unknown;
      columnDefinitions?: { name: string }[];
      rows?: { cells: unknown[]; object: { metadata: { name: string } } }[];
    };
    assert.equal(table.kind, 'Table', address);
    assert.equal(table.columnDefinitions?.[0]?.name, 'Name', `${address}: its first column the run's name`);
    const names = (table.rows ?? []).map((row) => row.object.metadata.name);
    assert.ok(names.includes(R), `${address}: ${R} among ${names.join(', ')}`);
    for (const row of table.rows ?? []) assert.equal(row.cells.length, table.columnDefinitions?.length, `${address}: a cell per column`);
  }
});

test("REFUSED: a run's action whose body is over the limit is a 413, as every object's write is, never a body that is no JSON", async () => {
  const body = JSON.stringify({ workflow: 'flow', brief: 'x'.repeat(Number(OBJECT_BODY_LIMIT)) });
  for (const route of ['/api/namespaces/default/runs', `/api/namespaces/default/runs/${R}/hold`]) {
    const res = await app().request(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(res.status, 413, route);
    assert.equal(typeof ((await res.json()) as { error?: unknown }).error, 'string', `${route}: the 413 says why`);
  }
});

/** A token the person minted for the agent `operator`, store-wide and not narrowed, named `ops`, through the package's token door. */
const operatorToken = () =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* (yield* TokenDoor).persons.mint('ops', { kind: 'agent', agent: 'operator', factory: null, narrowed: null });
    }).pipe(Effect.provide(tokenDoorFiles(root))),
  );

/** The token of the session of `step` of run `id`, its task `task`, as the store mints it when it files the try. */
const sessionToken = (id: string, step: string, task: string) =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* (yield* TokenDoor).tokens.mint({ agent: 'reviewer', factory: null, run: id, step, attempt: 1, task });
    }).pipe(Effect.provide(tokenDoorFiles(root))),
  );

test('each write keeps who acted, by the token its request presented, and the run serves it where the write is read', async (t) => {
  seed();
  const status = async (id: string) => (await objectOf(app(), id)).status;
  const person = { kind: 'person', token: 'harness' } as const;

  await t.test("the person's approval at a gate, under the token the seat presents: answered and served on the step's gate", async () => {
    task('t-by-plan', 'succeeded', DONE);
    record('ra-by-person', { plan: 't-by-plan', implement: null }, { gated: 'plan' });
    const approved = await answered(await send('POST', `${run('ra-by-person')}/steps/plan/approve`, { message: 'Go.' }));
    assert.equal(approved.status, 202, JSON.stringify(approved.body));
    assert.deepEqual(approved.body.actor, person, 'the approval answered with who gave it');
    const gate = (await status('ra-by-person')).steps.find((s) => s.name === 'plan')?.gate;
    assert.deepEqual(gate?.approval?.actor, person, "and served on the step's gate");
  });

  await t.test("an agent's standing token, let through by the person's rule: the approval names the agent and its token", async () => {
    const level = path.join(root, 'nemia', 'level.json');
    const rules = path.join(root, 'auto', 'operator.json');
    write(level, JSON.stringify({ level: 'auto', since: at(0) }));
    write(
      rules,
      JSON.stringify({ since: at(0), rules: [{ id: 'plans', answer: 'approve', steps: ['plan'], when: [], from: 'proposed' }] }),
    );
    try {
      task('t-by-agent-plan', 'succeeded', DONE);
      record('ra-by-agent', { plan: 't-by-agent-plan', implement: null }, { gated: 'plan' });
      const asOperator = { ...BOARD, authorization: `Bearer ${operatorToken()}` };
      const approved = await answered(await send('POST', `${run('ra-by-agent')}/steps/plan/approve`, { message: 'Go.' }, asOperator));
      assert.equal(approved.status, 202, JSON.stringify(approved.body));
      const gate = (await status('ra-by-agent')).steps.find((s) => s.name === 'plan')?.gate;
      assert.deepEqual(gate?.approval?.actor, { kind: 'agent', agent: 'operator', token: 'ops' });
    } finally {
      fs.rmSync(level, { force: true });
      fs.rmSync(rules, { force: true });
    }
  });

  await t.test("a session's token: a hold keeps its free-text `by` and, beside it, the session's agent, run and step", async () => {
    task('t-by-session', 'working');
    record('ra-by-session', { review: 't-by-session' });
    const asSession = { ...BOARD, authorization: `Bearer ${sessionToken('ra-by-session', 'review', 't-by-session')}` };
    const held = await answered(await send('POST', `${run(OTHER)}/hold`, { until: [MILL], by: 'ann' }, asSession));
    assert.equal(held.status, 200, JSON.stringify(held.body));
    const session = { kind: 'agent', agent: 'reviewer', run: 'ra-by-session', step: 'review' };
    const hold = held.body.hold as { by?: string; actor?: unknown };
    assert.deepEqual([hold.by, hold.actor], ['ann', session], 'the hold answered with both');
    assert.deepEqual((await status(OTHER)).holding?.actor, session, "and served on the run's holding");
    assert.equal((await send('DELETE', `${run(OTHER)}/hold`)).status, 200);
  });

  await t.test("a cancel keeps who called the run off, answered and served on the run's status", async () => {
    task('t-by-called', 'working');
    record('ra-by-called', { implement: 't-by-called' });
    const cancelled = await answered(await send('POST', `${run('ra-by-called')}/cancel`, {}));
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.deepEqual(cancelled.body.actor, person, 'the cancel answered with who called it off');
    const called = await status('ra-by-called');
    assert.equal(typeof called.cancelledAt, 'string');
    assert.deepEqual(called.cancelledBy, person, "and served on the run's status beside its time");
  });
});
