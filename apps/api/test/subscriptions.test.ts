/**
 * A subscription to the feed on the api, as `nemia subscribe` and `nemia unsubscribe` put and take it, through their entries of the
 * package's command table: `POST /api/subscriptions/:name` gives a long-lived task one, 201, with the level its runs' factories are at
 * least at (`atLeast`) where one is asked for; a task never filed is the package's 404, one not long-lived, minutes not above zero and a
 * floor that is no level its 422, a name taken its 409; a body that is not one, and a name that names no file, 400,
 * before anything is written; `DELETE /api/subscriptions/:name` takes it away, and a second is its 404; and a page on another site is
 * refused by the guard.
 *
 * At shipped defaults, over the harness's scratch store (`root`), and an engine of the test's whose `view` answers its tasks.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { DEFAULT_WAKE, engine } from 'agent-orchestrator';
import { appOf, liveOf } from '../src/app.ts';
import { Engine } from '../src/store.ts';

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

/** The tasks the engine has filed, each by its state as the runtime folds it; a task never filed has no `filedAt`. */
const TASKS: Record<string, object> = {
  nemia: { filedAt: '2026-10-05T10:00:00.000Z', restartPolicy: 'Always', settled: null },
  job: { filedAt: '2026-10-05T10:00:00.000Z', settled: null },
};

const app = appOf(
  Layer.merge(
    liveOf(),
    Layer.succeed(Engine)({
      ...engine(),
      view: (id: string) => Effect.succeed({ id, phase: 'pending', state: { settled: null, ...TASKS[id] } }),
    } as never),
  ),
).app;

/** The api's answer to `method` on the subscription `name` with `body`, as the board sends it unless `headers` say otherwise. */
async function asked(method: string, name: string, body?: unknown, headers: Record<string, string> = BOARD) {
  const res = await app.request(`/api/subscriptions/${name}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const file = (name: string): string => path.join(root, 'subscriptions', `${name}.json`);
const SHAPE = '`{ "task": "<task>", "wake"?: ["<word>"], "digestEvery"?: <minutes>, "atLeast"?: "<level>" }`';

test('a long-lived task is given a subscription, 201, by its words or the defaults; a name taken is a 409; it is taken away, then a 404', async () => {
  const put = await asked('POST', 'watch', { task: 'nemia' });
  assert.equal(put.status, 201);
  const subscription = { task: 'nemia', wake: [...DEFAULT_WAKE], digestEvery: 60, from: 0 };
  assert.deepEqual(put.body, { name: 'watch', subscription });
  assert.deepEqual(JSON.parse(fs.readFileSync(file('watch'), 'utf8')), subscription, "the store's file holds it");
  const own = await asked('POST', 'own', { task: 'nemia', wake: ['verified', 'failed'], digestEvery: 15 });
  assert.equal(own.status, 201);
  assert.deepEqual(own.body.subscription, { task: 'nemia', wake: ['verified', 'failed'], digestEvery: 15, from: 0 });
  const taken = await asked('POST', 'watch', { task: 'nemia' });
  assert.equal(taken.status, 409);
  assert.match(String(taken.body.error), /^a subscription is already named watch: nemia unsubscribe watch removes it first/);
  assert.deepEqual(await asked('DELETE', 'watch'), { status: 200, body: { name: 'watch' } });
  assert.equal(fs.existsSync(file('watch')), false, 'the file removed');
  const again = await asked('DELETE', 'watch');
  assert.equal(again.status, 404);
  assert.match(String(again.body.error), /^no subscription is named watch: nemia subscribe watch <task> puts one/);
  assert.deepEqual((await asked('DELETE', 'own')).status, 200);
});

test('REFUSED: a task never filed is a 404, one not long-lived and minutes not above zero a 422, each before anything is written', async () => {
  const nowhere = await asked('POST', 'a', { task: 'nowhere' });
  assert.equal(nowhere.status, 404);
  assert.match(String(nowhere.body.error), /^no task nowhere is filed on the store's engine: file it long-lived/);
  const job = await asked('POST', 'a', { task: 'job' });
  assert.equal(job.status, 422);
  assert.match(String(job.body.error), /^the task job is not long-lived.*restartPolicy: Always/);
  const zero = await asked('POST', 'a', { task: 'nemia', digestEvery: 0 });
  assert.equal(zero.status, 422);
  assert.match(String(zero.body.error), /^--digest-every takes the minutes a digest waits for a wake/);
  const blank = await asked('POST', 'a', { task: 'nemia', wake: [' '] });
  assert.equal(blank.status, 422);
  assert.match(String(blank.body.error), /^--wake takes a word/);
  assert.equal(fs.existsSync(file('a')), false, 'nothing written');
});

test('REFUSED: a body that is not a subscription, and a name that names no file, 400 before anything is written', async () => {
  assert.deepEqual(await asked('POST', 'b', 'not json'), {
    status: 400,
    body: { error: `POST …/subscribe takes a JSON body: ${SHAPE}.` },
  });
  const noTask = await asked('POST', 'b', {});
  assert.equal(noTask.status, 400);
  assert.match(String(noTask.body.error), /^`task` names the engine's long-lived task the feed is said to.*This request's was left out/);
  const oneWord = await asked('POST', 'b', { task: 'nemia', wake: 'blocked' });
  assert.equal(oneWord.status, 400);
  assert.equal(
    oneWord.body.error,
    "`wake` is the words that wake the task, as `nemia subscribe --wake <word>` takes each: a list of text, or left out for the feed's " +
      `words for a wait on a person. This request's was "blocked": ${SHAPE}.`,
  );
  const soon = await asked('POST', 'b', { task: 'nemia', digestEvery: 'soon' });
  assert.equal(soon.status, 400);
  assert.match(String(soon.body.error), /^`digestEvery` is the minutes a digest waits for a wake/);
  const dotted = await asked('POST', '..up', { task: 'nemia' });
  assert.equal(dotted.status, 400);
  assert.match(String(dotted.body.error), /is no subscription's name/);
  assert.equal((await asked('DELETE', '..up')).status, 400);
  assert.equal(fs.existsSync(file('b')), false, 'nothing written');
});

test('REFUSED at shipped defaults: a page on another site gives no subscription, nor takes one away — 403, nothing written', async () => {
  const cross = { ...BOARD, 'sec-fetch-site': 'cross-site' };
  const put = await asked('POST', 'c', { task: 'nemia' }, cross);
  assert.equal(put.status, 403);
  assert.match(String(put.body.error), /^POST \/api\/subscriptions\/c /);
  assert.equal(fs.existsSync(file('c')), false, 'nothing written');
  assert.equal((await asked('POST', 'c', { task: 'nemia' })).status, 201);
  const drop = await asked('DELETE', 'c', undefined, cross);
  assert.equal(drop.status, 403);
  assert.equal(fs.existsSync(file('c')), true, 'the subscription kept');
  assert.equal((await asked('DELETE', 'c')).status, 200);
});

test("a subscription is stored with the floor its runs' factories must be at, and takes the level the package knows alone", async () => {
  const put = await asked('POST', 'floored', { task: 'nemia', atLeast: 'auto' });
  assert.equal(put.status, 201);
  assert.deepEqual(
    (put.body.subscription as { scope?: unknown }).scope,
    { atLeast: 'auto' },
    "the body carries the floor as the subscription's scope",
  );
  assert.deepEqual(
    (JSON.parse(fs.readFileSync(file('floored'), 'utf8')) as { scope?: unknown }).scope,
    { atLeast: 'auto' },
    "the store's file holds it too",
  );
  assert.equal((await asked('DELETE', 'floored')).status, 200);

  const none = await asked('POST', 'open', { task: 'nemia' });
  assert.equal(none.status, 201);
  assert.equal(
    (none.body.subscription as { scope?: unknown }).scope,
    undefined,
    'a subscription asked for with no floor carries none, and every line is in its scope',
  );
  assert.equal((await asked('DELETE', 'open')).status, 200);
});

test("REFUSED: a floor that is no level is a 422 in the package's words, naming --at-least and the levels; one of the wrong type a 400 naming the shape", async () => {
  const nonsense = await asked('POST', 'd', { task: 'nemia', atLeast: 'nonsense' });
  assert.equal(nonsense.status, 422);
  assert.match(String(nonsense.body.error), /^--at-least takes a level, one of .*, and "nonsense" is none/);
  const numbered = await asked('POST', 'd', { task: 'nemia', atLeast: 7 });
  assert.equal(numbered.status, 400);
  assert.match(
    String(numbered.body.error),
    /^`atLeast` is the level a run's factory is at least at for its lines to be carried, as `nemia subscribe --at-least <level>` takes it/,
  );
  assert.match(String(numbered.body.error), /This request's was 7: .*"atLeast"\?: "<level>"/);
  assert.equal(fs.existsSync(file('d')), false, 'nothing written');
});
