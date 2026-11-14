/**
 * The upgrades routes: a start by a token of the person's files `nemia upgrade <tag>` on the engine and answers it pending; a
 * session's token starts none (403); two starts at once are one 200 and one 409; a tag below the store's floor is a 409 and a tag no
 * release folder is named by a 422, nothing filed; an unknown upgrade is a 404 on its read; the output stream ends with `ended`; and the
 * read names the release going back goes to with the floor's words where the floor refuses it. Statuses, phases and event names are
 * asserted, never a sentence.
 *
 * On the stand-ins: the runtime's test engine, which runs no command — the upgrade's task is settled by the test with what it printed —
 * and the test place. The server's code is the test's own (`RunningCode`) where the read needs an install to go back from.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { RunningCode, TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import type { Upgrade, UpgradesRead } from 'objects';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';
import { root } from '../../test/harness.ts';

/** The install the server runs where a test says so: `v1.3.0`, from an archive. */
const install = Layer.succeed(RunningCode, () => ({
  kind: 'install' as const,
  root: '/r/v1.3.0',
  tag: 'v1.3.0',
  commit: 'c0ffee',
  source: 'file:///base',
  builtAt: '',
}));

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const app = eachTest(() => appOver(engine(), stand(), install));

/** A request of `method` to `url`, as a client sends one: JSON, from the board's own page. */
const send = (method: 'GET' | 'POST', url: string, body?: unknown, bearer?: string) =>
  app().request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });

/** The event names of a server-sent stream's text, in order. */
const eventsOf = (text: string): string[] => [...text.matchAll(/^event: ?(.*)$/gm)].map((m) => m[1] ?? '');

/** The store's floor, `store.json`, recorded as `tag` for the test, and taken away after it. */
const floorAt = (t: { after: (fn: () => void) => void }, tag: string) => {
  const file = path.join(root, 'store.json');
  fs.writeFileSync(file, JSON.stringify({ readableFrom: tag }));
  t.after(() => fs.rmSync(file, { force: true }));
};

test("a start by a token of the person's files the upgrade and answers it pending; its output ends with ended", async () => {
  const started = await send('POST', '/api/upgrades', { tag: 'v1.4.0' });
  assert.equal(started.status, 200, await started.clone().text());
  const upgrade = (await started.json()) as Upgrade;
  assert.equal(upgrade.phase, 'pending');
  const filed = engine().tasks.get(upgrade.id)?.spec;
  assert.ok(filed, 'filed on the engine');
  assert.equal(filed.harness, 'command', 'filed on the engine as a command task');
  assert.deepEqual((filed.config as { command: string[] }).command.slice(-2), ['upgrade', 'v1.4.0']);

  engine().settle(upgrade.id, 'succeeded', { exitCode: 0, printed: { stdout: 'releases/current now names v1.4.0\n' } });
  const read = (await (await send('GET', `/api/upgrades/${upgrade.id}`)).json()) as Upgrade;
  assert.equal(read.phase, 'succeeded');
  assert.equal(read.exitCode, 0);
  const last = ((await (await send('GET', '/api/upgrades')).json()) as UpgradesRead).last;
  assert.equal(last?.id, upgrade.id);

  const stream = await send('GET', `/api/upgrades/${upgrade.id}/output`);
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type') ?? '', /text\/event-stream/);
  const text = await stream.text();
  assert.deepEqual(eventsOf(text), ['output', 'ended']);
  assert.match(text, /releases\/current now names v1\.4\.0/, "the upgrade's line is carried");
});

test('two starts at once: one is filed (200), the other refused while it is at work (409)', async () => {
  const both = await Promise.all([send('POST', '/api/upgrades', { tag: 'v1.4.0' }), send('POST', '/api/upgrades', { tag: 'v1.4.0' })]);
  assert.deepEqual(
    both.map((r) => r.status).sort((a, b) => a - b),
    [200, 409],
  );
  assert.equal(engine().filings.length, 1, 'one upgrade filed');
});

test("a session's token starts no upgrade: 403, and nothing is filed", async () => {
  const task = 't-upgrades-session';
  const token = Effect.runSync(
    Effect.gen(function* () {
      return yield* (yield* TokenDoor).tokens.mint({ agent: 'nemia', factory: null, run: null, step: null, attempt: 1, task });
    }).pipe(Effect.provide(tokenDoorFiles(root))),
  );
  Effect.runSync(engineFor(engine()).file({ id: task, brief: 'Be on.', cwd: root, harness: 'claude' }));
  engine().settle(task, 'working');
  const before = engine().filings.length;
  const res = await send('POST', '/api/upgrades', { tag: 'v1.4.0' }, token);
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as { reason?: string }).reason, 'person-only');
  assert.equal(engine().filings.length, before, 'no upgrade filed');
});

test('REFUSED: a tag below the floor is a 409, a tag no folder is named by a 422, an unknown upgrade a 404; nothing filed', async (t) => {
  floorAt(t, 'v1.2.0');
  assert.equal((await send('POST', '/api/upgrades', { tag: 'v1.1.0' })).status, 409);
  assert.equal((await send('POST', '/api/upgrades', { tag: '../v1.4.0' })).status, 422);
  assert.equal((await send('POST', '/api/upgrades', {})).status, 400, 'a body with no tag');
  assert.equal((await send('GET', '/api/upgrades/upgrade-none')).status, 404);
  assert.equal((await send('GET', '/api/upgrades/upgrade-none/output')).status, 404);
  assert.deepEqual(engine().filings, [], 'nothing filed');
});

test('GET /api/upgrades names the release going back goes to, with refused where the floor refuses it', async (t) => {
  for (const tag of ['v1.1.0', 'v1.2.0']) {
    const dir = path.join(root, 'releases', tag);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify({ tag, commit: 'c0ffee', source: 'file:///base', builtAt: '' }));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  }
  const allowed = await send('GET', '/api/upgrades');
  assert.equal(allowed.status, 200, await allowed.clone().text());
  assert.deepEqual(((await allowed.json()) as UpgradesRead).previous, { tag: 'v1.2.0' });
  floorAt(t, 'v1.3.0');
  const refused = ((await (await send('GET', '/api/upgrades')).json()) as UpgradesRead).previous;
  assert.equal(refused?.tag, 'v1.2.0');
  assert.equal(typeof refused?.refused, 'string', 'the floor refuses going back');
});
