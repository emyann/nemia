/**
 * Nemia on the api, through the entries of the package's command table and the package's refusals (`REFUSAL_STATUS`): `GET /api/level`
 * says where she is, `manual` where no level was ever set; `PUT /api/level` sets `semi-auto` while her folder is not trusted, the one act
 * `nemia level semi-auto` takes, both answering the command that trusts it (`trust`), null once it is; refuses a word that is no level
 * with a 422, before anything is written; it raises a factory for a stretch and ends the raise, and refuses `for` with no factory with a
 * 422; `GET /api/level` lists each factory's level, the default factory first; `GET /api/nemia/memory` lists her facts, and `/:fact`
 * prints one, a fact she does not keep its 404.
 *
 * At shipped defaults, over the harness's scratch store (`root`) and its Claude Code folder (`config`), and an engine of the test's on
 * which no task is filed.
 */
import { config, root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { COMMANDS, addFactory, engine } from 'agent-orchestrator';
import { runWith } from './shipped-place.ts';
import { appOf, liveOf } from '../src/app.ts';
import { Engine } from '../src/store.ts';

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

/** An engine on which no task is filed, the app's and the command line's. */
const e = {
  ...engine(),
  view: (id: string) => Effect.succeed({ id, phase: 'pending', state: { settled: null, attempts: [] } }),
} as never;

const app = appOf(Layer.merge(liveOf(), Layer.succeed(Engine)(e))).app;

/** `nemia level`'s entry of the package's table, the command line's door. */
const LEVEL = COMMANDS.find((c) => c.name === 'level')!;

/** Her folder in the store, and the file her level is kept in. */
const NEMIA = path.join(root, 'nemia');
const LEVEL_FILE = path.join(NEMIA, 'level.json');

/** The api's answer to `method` on `url` with `body`, as the board sends it. */
async function asked(method: string, url: string, body?: unknown) {
  const res = await app.request(url, { method, headers: BOARD, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test('where Nemia is: manual, no task and no spend, where no level was ever set', async () => {
  const read = await asked('GET', '/api/level');
  assert.equal(read.status, 200);
  assert.equal(read.body.level, 'manual');
  assert.equal(read.body.task, null);
  assert.equal(read.body.spend, null);
});

test('REFUSED: a word that is no level is a 422, and nothing is written', async () => {
  const none = await asked('PUT', '/api/level', { level: 'on' });
  assert.equal(none.status, 422);
  assert.match(String(none.body.error), /^"on" is no level/);
  assert.equal(fs.existsSync(LEVEL_FILE), false, 'nothing written');
});

test("one act: the board's PUT and nemia level semi-auto each set her level while her folder is not trusted, and answer the same command that trusts it", async () => {
  const words = `mkdir -p ${NEMIA} && cd ${NEMIA} && claude`;
  const level = () => JSON.parse(fs.readFileSync(LEVEL_FILE, 'utf8')) as { level: string; since: string; task: string };
  const before = await asked('GET', '/api/level');
  assert.equal(before.body.trust, words, 'the command is answered before she is turned on, so the person can trust first');
  const board = await asked('PUT', '/api/level', { level: 'semi-auto' });
  assert.equal(board.status, 200, String(board.body.error));
  assert.equal(board.body.level, 'semi-auto');
  assert.equal(board.body.trust, words);
  const byBoard = level();
  assert.equal(byBoard.task, board.body.task);
  assert.equal((await asked('GET', '/api/level')).body.trust, words);
  assert.equal((await asked('PUT', '/api/level', { level: 'manual' })).status, 200);
  fs.rmSync(LEVEL_FILE);
  const cli = (await runWith(e, LEVEL.handler({ level: 'semi-auto' }))) as { level: string; task: string; trust: string | null };
  assert.equal(cli.level, 'semi-auto');
  assert.equal(cli.trust, words, 'the same words at the command line');
  const byCli = level();
  assert.equal(byCli.task, cli.task);
  assert.deepEqual(Object.keys(byCli).sort(), Object.keys(byBoard).sort(), 'the same file, written by the same act');
  assert.equal(byCli.level, byBoard.level);
  fs.writeFileSync(path.join(config, '.claude.json'), JSON.stringify({ projects: { [NEMIA]: { hasTrustDialogAccepted: true } } }));
  assert.equal((await asked('GET', '/api/level')).body.trust, null, 'trusted: no command to run');
  assert.equal((await asked('PUT', '/api/level', { level: 'manual' })).status, 200);
});

test('a factory raised for a stretch reads above its default until its end; a raise ended reads as its default; for with no factory a 422', async () => {
  addFactory({ name: 'mill', repos: [fs.mkdtempSync(path.join(root, 'mill-'))] });
  const read = await asked('GET', '/api/level');
  assert.deepEqual(
    (read.body.factories as Array<{ factory: string }>).map((f) => f.factory),
    ['default', 'mill'],
  );
  const raised = await asked('PUT', '/api/level', { level: 'semi-auto', factory: 'mill', for: '2h' });
  assert.equal(raised.status, 200);
  const mill = (raised.body.factories as Array<{ factory: string; level: string; raise: { until: string } | null }>)[1];
  assert.equal(mill.level, 'semi-auto');
  assert.ok(Date.parse(mill.raise?.until ?? '') > Date.now() + 7_000_000, 'raised for two hours');
  const loose = await asked('PUT', '/api/level', { level: 'semi-auto', for: '2h' });
  assert.equal(loose.status, 422);
  assert.match(String(loose.body.error), /^--for and --end take the factory raised/);
  const ended = await asked('PUT', '/api/level', { factory: 'mill', end: true });
  assert.equal(ended.status, 200);
  assert.deepEqual((ended.body.factories as Array<{ level: string; raise: unknown }>)[1], {
    factory: 'mill',
    level: 'manual',
    default: 'manual',
    own: null,
    raise: null,
  });
});

test("her memory: the facts she keeps by name, one fact's words, and a fact she does not keep a 404 naming those she does", async () => {
  fs.mkdirSync(path.join(NEMIA, 'memory'), { recursive: true });
  fs.writeFileSync(path.join(NEMIA, 'memory', 'feed-cursor'), '42\n');
  const facts = await asked('GET', '/api/nemia/memory');
  assert.equal(facts.status, 200);
  assert.deepEqual(facts.body.facts, ['feed-cursor']);
  const one = await asked('GET', '/api/nemia/memory/feed-cursor');
  assert.equal(one.status, 200);
  assert.deepEqual(one.body.fact, { name: 'feed-cursor', text: '42\n' });
  const none = await asked('GET', '/api/nemia/memory/pending');
  assert.equal(none.status, 404);
  assert.match(String(none.body.error), /no fact named pending: she keeps feed-cursor/);
});
