/**
 * The floor of an agent's standing token, on the api's own routes (`floorHandled`, objects/answer-bound.ts): a token the person minted for
 * the agent `operator` reaches a read, and is refused 403 with the floor's reason whatever reaches past it — an approval at a gate no rule
 * the person confirmed lets through (the step still waits), a command out of an agent's reach, a write above the token's narrowing, a
 * request in a factory other than the one the token is bound to — while a rule the person confirmed lets the approval through. Statuses
 * and reasons are asserted, never a sentence.
 *
 * A tool call on the MCP port reaches the same endpoint through the app's `fetch`, and is refused the same way.
 *
 * Over the harness's store and the app's engine: the run planted as its files, the store's level and the person's list written where
 * `nemia level` and `nemia policy confirm` write them, the tokens minted through the package's `TokenDoor`.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { approvalFile, TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import { app } from '../app.ts';
import { floorEntryOf } from './floor.ts';

const T0 = Date.parse('2026-10-02T09:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A token the person minted for `operator`, bound to `factory` (null: store-wide) and narrowed to `narrowed`, named `name`. */
const agentToken = (name: string, factory: string | null, narrowed: 'read' | 'act' | null) =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* (yield* TokenDoor).persons.mint(name, { kind: 'agent', agent: 'operator', factory, narrowed });
    }).pipe(Effect.provide(tokenDoorFiles(root))),
  );

const STORE_WIDE = agentToken('floor-ops', null, null);
const READ_ONLY = agentToken('floor-reader', null, 'read');
const BOUND_TO_A = agentToken('floor-in-a', 'a', null);

/** A run of `plan → implement`, started `--gate plan`, whose plan signed off: it waits at its gate. */
const gatedRun = (id: string) => {
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Parse the --flag option',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: at(0),
      workflow: [
        { name: 'plan', after: [], body: 'Plan it.' },
        { name: 'implement', after: ['plan'], body: 'Implement it.' },
      ],
      steps: { plan: { taskId: `${id}-plan`, branch: `wf/${id}/plan` }, implement: { taskId: null } },
      gates: ['plan'],
    }),
  );
  const closeout = { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] };
  write(
    path.join(root, 'engine', 'tasks', `${id}-plan.jsonl`),
    [
      { kind: 'filed', at: at(0), brief: 'Do it.', cwd: '/code/app', maxAttempts: 1, harness: 'codex' },
      { kind: 'starting', at: at(1), attempt: 1 },
      { kind: 'spawned', at: at(1), attempt: 1 },
      { kind: 'ended', at: at(9), attempt: 1, sessionId: `ae/${id}-plan/1`, observed: 'done', reason: 'harness', closeout },
      { kind: 'settled', at: at(9), outcome: 'succeeded' },
    ]
      .map((line) => `${JSON.stringify(line)}\n`)
      .join(''),
  );
};

/** The store at `auto`, as `nemia level auto` writes it. */
const storeAtAuto = () => write(path.join(root, 'nemia', 'level.json'), JSON.stringify({ level: 'auto', since: at(0) }));

/** The person's confirmed list for `operator`, as `nemia policy confirm` writes it: `rules`, which replace the builtin rule. */
const confirmed = (rules: object[]) => write(path.join(root, 'auto', 'operator.json'), JSON.stringify({ since: at(0), rules }));

/** What the board sends, with `token` as the bearer: JSON, same-origin. */
const headersOf = (token: string) => ({
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
  origin: 'http://localhost:5173',
  host: '127.0.0.1:8787',
  authorization: `Bearer ${token}`,
});

const post = (url: string, body: unknown, token: string) =>
  app.request(url, { method: 'POST', headers: headersOf(token), body: JSON.stringify(body) });

/** The status and the refusal word of `res`. */
const refusalOf = async (res: Response): Promise<[number, string | undefined]> => [
  res.status,
  res.status === 403 ? ((await res.json()) as { reason?: string }).reason : undefined,
];

test('REFUSED 403 waits-on-person: an approval at a gate in a store at auto that no rule the person confirmed lets through; the step still waits', async () => {
  storeAtAuto();
  confirmed([]);
  gatedRun('r-floor-waits');
  const res = await post('/api/namespaces/default/runs/r-floor-waits/steps/plan/approve', { message: 'Go.' }, STORE_WIDE);
  assert.deepEqual(await refusalOf(res), [403, 'waits-on-person']);
  assert.equal(fs.existsSync(approvalFile(root, 'r-floor-waits', 'plan', 1)), false, 'no approval was written: the step still waits');
});

test('a rule the person confirmed for the agent lets the same approval through, and it is written', async () => {
  storeAtAuto();
  confirmed([{ id: 'plans', answer: 'approve', steps: ['plan'], when: [], from: 'proposed' }]);
  gatedRun('r-floor-ruled');
  const res = await post('/api/namespaces/default/runs/r-floor-ruled/steps/plan/approve', { message: 'Go.' }, STORE_WIDE);
  assert.equal(res.status, 202);
  assert.equal(fs.existsSync(approvalFile(root, 'r-floor-ruled', 'plan', 1)), true);
});

test('REFUSED 403 out-of-reach: a command out of an agent’s reach (a token’s mint), before the route’s own refusal', async () => {
  const res = await post('/api/tokens', { name: 'minted-by-an-agent' }, STORE_WIDE);
  assert.deepEqual(await refusalOf(res), [403, 'out-of-reach']);
});

test('REFUSED 403 narrowed: a token narrowed to read, asking a retry', async () => {
  storeAtAuto();
  gatedRun('r-floor-narrowed');
  const res = await post('/api/namespaces/default/runs/r-floor-narrowed/steps/plan/retry', { mode: 'continue' }, READ_ONLY);
  assert.deepEqual(await refusalOf(res), [403, 'narrowed']);
});

test('REFUSED 403 other-factory: a token bound to the factory a, acting in b', async () => {
  const res = await post('/api/namespaces/b/runs/r-floor-elsewhere/steps/plan/retry', { mode: 'continue' }, BOUND_TO_A);
  assert.deepEqual(await refusalOf(res), [403, 'other-factory']);
});

test('a read is answered to an agent’s token, narrowed or not', async () => {
  for (const token of [STORE_WIDE, READ_ONLY]) {
    const res = await app.request('/api/runs', { headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
  }
});

test('REFUSED 403 other-factory on the MCP port: a tool call reaches its endpoint through the app, so the floor refuses it the same way', async () => {
  const client = new Client({ name: 'floor-test', version: '0.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8787/mcp'), {
      fetch: async (url: string | URL, init?: RequestInit) => app.request(url, init),
      requestInit: { headers: { authorization: `Bearer ${BOUND_TO_A}` } },
    }),
  );
  const result = await client.callTool({ name: 'hold', arguments: { namespace: 'b', name: 'r-floor-port', why: 'by the port' } });
  assert.equal(result.isError, true);
  assert.equal((result.structuredContent as { reason?: string } | undefined)?.reason, 'other-factory');
  assert.equal(fs.existsSync(path.join(root, 'runs', 'r-floor-port.hold')), false, 'nothing is held');
  await client.close();
});

test('floorEntryOf: an endpoint is the entry that links it; one no entry links is a read for a GET and out of reach otherwise', async (t) => {
  for (const [endpoint, method, name, cls] of [
    ['runs.approve', 'POST', 'approve', 'answer'],
    ['tokens.mint', 'POST', 'token add', 'none'],
    ['runs.lines', 'GET', 'runs.lines', 'read'],
    ['server.signIn', 'POST', 'server.signIn', 'none'],
  ] as const)
    await t.test(`${method} ${endpoint}`, () => {
      const entry = floorEntryOf(endpoint, method);
      assert.deepEqual([entry.name, entry.class], [name, cls]);
    });
});
