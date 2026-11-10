/**
 * The routes generated from the package's command table: every route that writes is guarded, and the table asks the api for nothing it
 * lacks — words for each routed command — and serves each route, on a route of Hono's before the mount or an endpoint of objects' `Api`
 * the mount serves, the table's `:runId` the `Api`'s `:name`. The run's named actions are no route of the table: runs/actions.test.ts
 * holds them on their endpoints.
 *
 * The walk over every writing route is the one place the guard's three refusals are proven route by route; then the table asking the api
 * for nothing it lacks.
 *
 * At shipped defaults: the api's own engine over the harness's scratch store (`root`), which this file seeds.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Api } from 'objects';
import { app } from '../app.ts';
import { COMMANDS, routeList } from 'agent-orchestrator';
import { wordBreaks } from './routes.ts';

const T0 = Date.parse('2026-10-02T09:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A step's task that ran once on Codex and signed off with `closeout`. */
const signedOff = (taskId: string, closeout: object) =>
  write(
    path.join(root, 'engine', 'tasks', `${taskId}.jsonl`),
    jsonl([
      { kind: 'filed', at: at(0), brief: 'Do it.', cwd: '/code/app', maxAttempts: 1, harness: 'codex' },
      { kind: 'starting', at: at(1), attempt: 1 },
      { kind: 'spawned', at: at(1), attempt: 1 },
      { kind: 'ended', at: at(9), attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout },
      { kind: 'settled', at: at(9), outcome: 'succeeded' },
    ]),
  );

const DONE = { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] };

/** A run's record, with what every run here shares. */
const runRecord = (id: string, workflow: object[], steps: object, more: object = {}) =>
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
      workflow,
      steps,
      ...more,
    }),
  );

/** A run of `plan → implement`, started `--gate plan`, whose plan signed off: it waits at its gate. */
const gatedRun = (id: string) => {
  runRecord(
    id,
    [
      { name: 'plan', after: [], body: 'Plan it.' },
      { name: 'implement', after: ['plan'], body: 'Implement it.' },
    ],
    { plan: { taskId: `${id}-plan`, branch: `wf/${id}/plan` }, implement: { taskId: null } },
    { gates: ['plan'] },
  );
  signedOff(`${id}-plan`, DONE);
};

const BOARD = {
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
  origin: 'http://localhost:5173',
  host: '127.0.0.1:8787',
};

/** Every file under a run's asks directory, waiting or consumed. */
const asked = (run: string): string[] => {
  const dir = path.join(root, 'runs', `${run}.asks`);
  return fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true }) as string[]).sort() : [];
};

/**
 * The three branches the write guard refuses a write on (`writeRefused`, src/guard.ts), each a header the board would never send: the
 * words of each refusal are nobody's to check (root CLAUDE.md), so the walk reads the status and that the refusal names the route. It
 * holds the table's routes still on Hono until they move onto the `Api`, whose writes `test/guarded.test.ts` walks; `src/guard.test.ts`
 * reads the near misses of each header.
 */
const GUARD_LEGS = [
  ['a page on another site', { 'sec-fetch-site': 'cross-site' }, 403],
  ['a name that is not this machine', { host: 'evil.example:8787' }, 403],
  ['a body not sent as JSON', { 'content-type': 'text/plain' }, 415],
] as const;

test('REFUSED at shipped defaults: every route that writes, asked by a page on another site (403), addressed to another name (403), or not sent as JSON (415) — nothing written', async () => {
  gatedRun('r-guard');
  const routed = COMMANDS.filter((c) => c.writes).flatMap((c) =>
    routeList(c)
      .filter((r) => r.method !== 'GET')
      .map((r) => ({ command: c, r })),
  );
  assert.ok(routed.length > 0, 'the table routes writes, each guarded below');
  for (const { command, r } of routed) {
    const { method, path: route } = r;
    const url = route.replace(':runId', 'r-guard').replace(':step', 'plan').replace(':name', 'g-guard').replace(':from', 'yours');
    const body = JSON.stringify({ mode: 'continue', message: 'Go.', text: 'Go.' });
    for (const [what, headers, status] of GUARD_LEGS) {
      const said = `${command.name} ${method} ${route}: ${what}`;
      const res = await app.request(url, { method, headers: { ...BOARD, ...headers }, body });
      assert.equal(res.status, status, said);
      assert.match(((await res.json()) as { error: string }).error, new RegExp(`^${method} ${url.replaceAll('/', '\\/')} `), said);
    }
  }
  assert.ok(fs.existsSync(path.join(root, 'runs', 'r-guard.json')), 'the run neither removed nor pruned');
  assert.deepEqual(asked('r-guard'), [], 'nothing written');
  assert.equal(fs.existsSync(path.join(root, 'cordon')), false, 'the store not paused');
  assert.equal(fs.existsSync(path.join(root, 'workflows', 'g-guard')), false, 'no workflow written');
  assert.equal(fs.existsSync(path.join(root, 'subscriptions')), false, 'no subscription written');
  assert.equal(fs.existsSync(path.join(root, 'nemia', 'level.json')), false, "no Nemia's level written");
  assert.equal(fs.existsSync(path.join(root, 'workflows', 'agents')), false, 'no agent written');
  assert.equal(fs.existsSync(path.join(root, 'workflows', 'skills')), false, 'no skill written');
  assert.equal(fs.existsSync(path.join(root, 'agent-sources')), false, 'no copy recorded');
  assert.deepEqual(
    fs.readdirSync(path.join(root, 'runs')).filter((f) => !f.startsWith('r-')),
    [],
    'no run started',
  );
});

test('the command table asks the api for nothing it lacks, and the api serves every route it generates', async (t) => {
  await t.test('the table asks the api for nothing it lacks: words for each routed command', () => {
    assert.deepEqual(wordBreaks(COMMANDS), []);
  });

  await t.test(
    'every command the table routes is served by the api on its method and path: the posts the table generates, and the reads the api answers',
    () => {
      const unnamed = (method: string, at: string) => `${method} ${at.replace(/:[A-Za-z]+/g, ':')}`;
      const served = new Set([
        ...app.routes.filter((r) => r.method !== 'ALL').map((r) => unnamed(r.method, r.path)),
        ...Object.values(Api.groups).flatMap((g) => Object.values(g.endpoints).map((e) => unnamed(e.method, e.path))),
      ]);
      assert.deepEqual(
        COMMANDS.flatMap((c) =>
          routeList(c)
            .filter((r) => !served.has(unnamed(r.method, r.path)))
            .map((r) => `${c.name} ${r.method}`),
        ),
        [],
      );
    },
  );

  await t.test('REFUSED: a routed command the api has no words for', () => {
    const route = { method: 'POST', path: '/api/runs/:runId/sing', status: 202 } as const;
    assert.deepEqual(wordBreaks([{ name: 'sing', route }]), [
      'sing is routed on the api, and words.ts has no words for it: give it its shape and its refusals there',
    ]);
    assert.deepEqual(wordBreaks([{ name: 'hush', route: { method: 'DELETE', path: '/api/runs/:runId/song', status: 200 } }]), [
      'hush is routed on the api, and words.ts has no words for it: give it its shape and its refusals there',
    ]);
    assert.deepEqual(wordBreaks([{ name: 'sing' }]), [], 'a command served on the command line alone needs no words');
  });
});
