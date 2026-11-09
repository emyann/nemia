/**
 * A factory and its parts served as objects (factories.ts, mcp-servers.ts, schedules.ts, hires.ts, volumes.ts): each path answers its
 * kind, each list its `<Kind>List`; each write is 403 for another site and 415 for a body that is not JSON, the factory's files as they
 * were; and the routes these retire answer 404 in the api's words — in a scratch store whose factory is filed with the package's own verbs.
 * And the schedules, which find the run each fired among every run's record, read them through the app's memo: a warm list is answered
 * from it, and judged afresh under `WF_VERIFY_REST=1`.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { addFactory, attachWorkflow, setSchedule } from 'agent-orchestrator';
import { scratch } from 'test-kit/scratch';
import { app, appOf, liveOf, runtime } from '../app.ts';
import { ReadMemo } from '../layer.ts';

const repo = scratch('nemia-api-parts-');
fs.mkdirSync(path.join(repo, 'workflows', 'make'), { recursive: true });
fs.writeFileSync(path.join(repo, 'workflows', 'make', 'implement.md'), '---\nplace: git\n---\nImplement it.\n');
addFactory({ name: 'works', repos: [repo] });
attachWorkflow({ factory: 'works', workflow: 'make' });

/** Every file of the factory in the store, as bytes: what a refused write leaves as it was. */
const files = (): string =>
  JSON.stringify(
    [path.join(root, 'factories', 'works.json'), path.join(root, 'factories', 'works')].map((at) =>
      fs.existsSync(at) && fs.statSync(at).isFile() ? fs.readFileSync(at, 'utf8') : fs.existsSync(at) ? fs.readdirSync(at) : null,
    ),
  );

test('each path answers its kind, and each list its <Kind>List', async () => {
  const kinds: Array<[string, string]> = [
    ['/api/factories', 'FactoryList'],
    ['/api/factories/works', 'Factory'],
    ['/api/namespaces/works/mcpservers', 'McpServerList'],
    ['/api/builtin/mcpservers', 'McpServerList'],
    ['/api/namespaces/works/schedules', 'ScheduleList'],
    ['/api/namespaces/works/hires', 'HireList'],
    ['/api/namespaces/works/hires/make.implement', 'Hire'],
    ['/api/namespaces/works/volumes', 'VolumeList'],
  ];
  for (const [url, kind] of kinds) {
    const res = await app.request(url);
    const body = (await res.json()) as { kind?: string; apiVersion?: string };
    assert.equal(res.status, 200, `${url}: ${JSON.stringify(body)}`);
    assert.deepEqual([body.apiVersion, body.kind], ['nemia/v1', kind], url);
  }
  const commands = (await (await app.request('/api/factories/works/commands')).json()) as Record<string, unknown>;
  assert.equal(commands.attach, 'nemia factory attach works <workflow>');
});

test('the builtin servers carry no namespace', async () => {
  const body = (await (await app.request('/api/builtin/mcpservers')).json()) as { items: Array<{ metadata: { namespace?: string } }> };
  assert.ok(body.items.length > 0);
  for (const s of body.items) assert.equal(s.metadata.namespace, undefined);
});

test('a list in a namespace no factory has is a 404, and one the default factory has is empty', async () => {
  assert.equal((await app.request('/api/namespaces/nowhere/hires')).status, 404);
  const empty = (await (await app.request('/api/namespaces/default/schedules')).json()) as { items: unknown[] };
  assert.deepEqual(empty.items, []);
});

test('each write is 403 for another site and 415 for a body that is not JSON, the factory as it was', async () => {
  const writes: Array<[string, string]> = [
    ['PUT', '/api/namespaces/works/mcpservers/docs'],
    ['DELETE', '/api/namespaces/works/mcpservers/docs'],
    ['POST', '/api/namespaces/works/mcpservers/docs/sign-in'],
    ['DELETE', '/api/namespaces/works/mcpservers/docs/sign-in'],
    ['PUT', '/api/namespaces/works/schedules/make'],
    ['DELETE', '/api/namespaces/works/schedules/make'],
    ['PUT', '/api/namespaces/works/hires/make.implement'],
    ['DELETE', '/api/namespaces/works/hires/make.implement'],
    ['PUT', '/api/factories/works/rules'],
    ['DELETE', '/api/factories/works/rules'],
    ['PUT', '/api/factories/works/instruction'],
    ['DELETE', '/api/factories/works/instruction'],
    ['PUT', '/api/factories/works/instruction/words'],
    ['DELETE', '/api/factories/works/instruction/words'],
  ];
  const before = files();
  for (const [method, url] of writes) {
    const site = await app.request(url, {
      method,
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      body: '{}',
    });
    assert.equal(site.status, 403, `${method} ${url} from another site`);
    const form = await app.request(url, { method, headers: { 'content-type': 'text/plain' }, body: '{}' });
    assert.equal(form.status, 415, `${method} ${url} sent as text`);
    assert.ok(((await form.json()) as { error?: string }).error, `${method} ${url} says why`);
  }
  assert.equal(files(), before, 'nothing was written');
});

test('the routes these retire answer 404 in the api’s words', async () => {
  const retired: Array<[string, string]> = [
    ['GET', '/api/factories/works/servers'],
    ['PUT', '/api/factories/works/servers/docs'],
    ['POST', '/api/factories/works/servers/docs/sign-in'],
    ['PUT', '/api/factories/works/schedules/make'],
    ['DELETE', '/api/factories/works/schedules/make'],
    ['PUT', '/api/factories/works/hires/make%2Fimplement'],
    ['DELETE', '/api/factories/works/hires/make%2Fimplement'],
  ];
  for (const [method, url] of retired) {
    const res = await app.request(url, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(method === 'GET' ? {} : { body: '{}' }),
    });
    assert.equal(res.status, 404, `${method} ${url}`);
    const said = ((await res.json()) as { error?: string }).error ?? '';
    assert.match(said, /openapi/, `${method} ${url} says where the paths are listed: ${said}`);
  }
});

/** A record of a run, as a start writes one, `scheduled` where a schedule's fire started it. */
const writeRun = (id: string, createdAt: string, scheduled?: { factory: string; workflow: string; due: string }) => {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      workspace: root,
      brief: 'x',
      workflowDir: path.join(repo, 'workflows', 'make'),
      place: { kind: 'folder' },
      steps: {},
      createdAt,
      ...(scheduled ? { scheduled } : {}),
    }),
  );
};

/** With the memo's check off: what the memo alone answers, and reads. */
async function unverified<T>(f: () => Promise<T>): Promise<T> {
  process.env.WF_VERIFY_REST = '0';
  try {
    return await f();
  } finally {
    process.env.WF_VERIFY_REST = '1';
  }
}

type Schedules = { items: Array<{ metadata: { name: string }; status: { last?: { run: string; at: string } } }> };

test("a warm list of a factory's schedules is answered from the app's memo of the runs, and judged afresh under WF_VERIFY_REST=1", async () => {
  setSchedule({ factory: 'works', workflow: 'make', cron: '0 3 * * *', brief: 'make it nightly' });
  writeRun('r-made', '2026-10-16T00:00:00.000Z', { factory: 'works', workflow: 'make', due: '2026-10-16T03:00:00.000Z' });
  for (let n = 0; n < 20; n++) writeRun(`r-done-${String(n).padStart(2, '0')}`, '2026-10-16T00:00:00.000Z');
  const listed = async (on = app) => {
    const res = await on.request('/api/namespaces/works/schedules');
    assert.equal(res.status, 200);
    return (await res.json()) as Schedules;
  };
  const cold = await listed(appOf(liveOf()).app);
  assert.equal(cold.items[0]?.status.last?.run, 'r-made', 'the fixture has a run of the schedule');

  await listed();
  const { records } = await runtime.runPromise(ReadMemo.useSync((kept) => kept));
  const kept = records.factories.runs.get('r-made');
  assert.ok(kept, "the schedules' read keeps each run in the app's memo of the factories' runs");
  assert.deepEqual(await listed(), cold, "verified, the warm list is a cold app's own");

  const at = kept.of.createdAt;
  kept.of.createdAt = '2026-01-01T00:00:00.000Z';
  try {
    const memory = await unverified(() => listed());
    assert.equal(memory.items[0]?.status.last?.at, '2026-01-01T00:00:00.000Z', "unverified, the memo answers: no run's record is read");
    const res = await app.request('/api/namespaces/works/schedules');
    assert.equal(res.status, 500, 'verified, the memo is judged against a read afresh, and refused where it differs');
  } finally {
    kept.of.createdAt = at;
  }

  writeRun('r-made-again', '2026-10-17T00:00:00.000Z', { factory: 'works', workflow: 'make', due: '2026-10-17T03:00:00.000Z' });
  const next = await unverified(() => listed());
  assert.equal(next.items[0]?.status.last?.run, 'r-made-again', 'a run the schedule fired since is its last on the next read');
  assert.deepEqual(next, await listed(appOf(liveOf()).app), "and the answer is a cold app's own");
});
