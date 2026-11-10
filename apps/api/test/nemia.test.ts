/**
 * Nemia on the api, the nemia group of `objects`' Api calling the entries of the package's command table by type, and the package's
 * refusals (`refusedAs`): `GET /api/level` says where she is, `manual` where no level was ever set; `PUT /api/level` sets `semi-auto`
 * while her folder is not trusted, the one act `nemia level semi-auto` takes, both answering the command that trusts it (`trust`), null
 * once it is; refuses a word that is no level with a 400 naming `level` (its body's Schema, `NemiaLevelSet`), before anything is
 * written; it raises a factory for a stretch and ends the raise, and refuses `for` with no factory with a
 * 422; `GET /api/level` lists each factory's level, the default factory first; `GET /api/nemia/memory` lists her facts, and `/:fact`
 * prints one, a fact she does not keep its 404; `/api/nemia/instructions` reads her custom instructions, none at first, writes them
 * (blank words refused 422, nothing written) and clears them.
 *
 * At shipped defaults, over the harness's scratch store (`root`) and its Claude Code folder (`config`), and an engine of the test's on
 * which no task is filed.
 */
import { config, root } from './harness.ts';
import { test } from 'node:test';
import { story } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { LEVEL, engine } from 'agent-orchestrator';
import { addFactory } from 'agent-orchestrator/testing';
import { runWith } from './builtin-place.ts';
import { appOf, liveOf } from '../src/app.ts';
import { Engine } from '../src/store.ts';

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

/** An engine on which no task is filed, the app's and the command line's. */
const e = {
  ...engine(process.env),
  view: (id: string) => Effect.succeed({ id, phase: 'pending', state: { settled: null, attempts: [] } }),
} as never;

const app = appOf(Layer.merge(liveOf(), Layer.succeed(Engine)(e))).app;

/** Her folder in the store, and the file her level is kept in. */
const NEMIA = path.join(root, 'nemia');
const LEVEL_FILE = path.join(NEMIA, 'level.json');

/** The api's answer to `method` on `url` with `body`, as the board sends it. */
async function asked(method: string, url: string, body?: unknown) {
  const res = await app.request(url, { method, headers: BOARD, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test('A person sets where Nemia is: manual by default, a word that is no level refused, one act through the board and the CLI, a raise for a stretch, and her memory read', async (t) => {
  const s = story(t);
  await s.test('where Nemia is: manual, no task and no spend, where no level was ever set', async () => {
    const read = await asked('GET', '/api/level');
    assert.equal(read.status, 200);
    assert.equal(read.body.level, 'manual');
    assert.equal(read.body.task, null);
    assert.equal(read.body.spend, null);
  });
  await s.test('REFUSED: a word that is no level is a 400 naming the key, and nothing is written', async () => {
    const none = await asked('PUT', '/api/level', { level: 'on' });
    assert.equal(none.status, 400);
    assert.equal(none.body.field, 'payload.level');
    assert.equal(fs.existsSync(LEVEL_FILE), false, 'nothing written');
  });
  await s.test(
    "one act: the board's PUT and nemia level semi-auto each set her level while her folder is not trusted, and answer the same command that trusts it",
    async () => {
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
      const cli = await runWith(e, LEVEL.handler({ level: 'semi-auto' }));
      assert.equal(cli.level, 'semi-auto');
      assert.equal(cli.trust, words, 'the same words at the command line');
      const byCli = level();
      assert.equal(byCli.task, cli.task);
      assert.deepEqual(Object.keys(byCli).sort(), Object.keys(byBoard).sort(), 'the same file, written by the same act');
      assert.equal(byCli.level, byBoard.level);
      fs.writeFileSync(path.join(config, '.claude.json'), JSON.stringify({ projects: { [NEMIA]: { hasTrustDialogAccepted: true } } }));
      assert.equal((await asked('GET', '/api/level')).body.trust, null, 'trusted: no command to run');
      assert.equal((await asked('PUT', '/api/level', { level: 'manual' })).status, 200);
    },
  );
  await s.test(
    'a factory raised for a stretch reads above its default until its end; a raise ended reads as its default; for with no factory a 422',
    async () => {
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
    },
  );
  await s.test(
    "her memory: the facts she keeps by name, one fact's words, and a fact she does not keep a 404 naming those she does",
    async () => {
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
    },
  );
  await s.test(
    'her custom instructions: none at first, written to her file and read back, blank words a 422 writing nothing, and cleared',
    async () => {
      const file = path.join(root, 'custom-instructions', 'nemia.md');
      const none = await asked('GET', '/api/nemia/instructions');
      assert.equal(none.status, 200);
      assert.deepEqual(none.body, { name: 'nemia', file, words: null, error: null });
      const written = await asked('PUT', '/api/nemia/instructions', { words: 'Answer in French.' });
      assert.equal(written.status, 200, String(written.body.error));
      assert.equal(written.body.words, 'Answer in French.');
      assert.equal(fs.readFileSync(file, 'utf8'), 'Answer in French.\n');
      assert.equal((await asked('GET', '/api/nemia/instructions')).body.words, 'Answer in French.');
      const blank = await asked('PUT', '/api/nemia/instructions', { words: '   ' });
      assert.equal(blank.status, 422);
      assert.equal(fs.readFileSync(file, 'utf8'), 'Answer in French.\n', 'a refused write leaves her words as they were');
      const cleared = await asked('DELETE', '/api/nemia/instructions');
      assert.equal(cleared.status, 200);
      assert.deepEqual(cleared.body, { name: 'nemia', file, removed: true });
      assert.equal(fs.existsSync(file), false);
    },
  );
});
