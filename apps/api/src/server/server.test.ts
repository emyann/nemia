/**
 * The server group over HTTP: `GET /api/feed/wait`, `nemia wait` as a long poll — the feed read from a cursor until a line a selector
 * takes, answered as Events with the cursor to wait again from, or refused before anything is read; and the store's pause timeout, read
 * (`GET /api/pause/timeout`) and set (`PUT`) as `nemia pause-timeout` reads and sets it, a timeout out of its form refused unwritten.
 *
 * The store is the harness's scratch one (`root`, test/harness.ts); its feed is written by the package's own writer (`emitFeed`) on the
 * app's runtime, as the daemon in the api's process writes it, so a wait open on the app is handed the line from the app's hub.
 */
import '../../test/harness.ts';
import { until, WAITED } from '../../test/waits.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Logger, Metric } from 'effect';
import { emitFeed, FEED_FOLLOWERS, feedSize, freshFeedMemo } from 'agent-orchestrator';
import type { FeedWait, PauseTimeoutAnswer } from 'objects';
import { app, runtime } from '../app.ts';
import { root } from '../../test/harness.ts';

type FeedWords = import('agent-orchestrator').FeedWords;

/** The feed's live readers in this process, as the package counts them: a wait is counted once it holds its cursor. */
const followers = () => Effect.runSync(Metric.value(FEED_FOLLOWERS)).value;

/** A pass of the tick written on the app's runtime: each run of `runs` at its word, every other run of the store said removed. */
const memo = freshFeedMemo();
const written = (runs: Record<string, string>) =>
  runtime.runPromise(
    emitFeed(new Map(Object.entries(runs).map(([id, word]): [string, FeedWords] => [id, { run: { word }, steps: [] }])), { memo }).pipe(
      Effect.provide(Logger.layer([])),
    ),
  );

test(
  'GET /api/feed/wait answers the first line a selector takes once it is written, as an Event, with the cursor after it',
  WAITED,
  async (t) => {
    await written({ 'wait-before': 'started' });
    const from = feedSize(root);
    const was = followers();
    const asked = app.request('/api/feed/wait?labelSelector=run%3Dwait-1&labelSelector=run%3Dwait-2&for=60s');
    await until(t, () => followers() === was + 1, 'the wait holds its cursor', { everyMs: 5 });
    await written({ 'wait-before': 'started', 'wait-2': 'running' });
    const res = await asked;
    assert.equal(res.status, 200, await res.clone().text());
    const got = (await res.json()) as FeedWait;
    assert.equal(got.ended, 'matched');
    assert.equal(got.lines.length, 1, 'the line the second selector takes');
    assert.equal(got.lines[0]?.metadata.name, String(from), "the Event is named by the byte its line starts at, the wait's start");
    assert.equal(got.cursor, String(feedSize(root)), 'the cursor after the line');
  },
);

test(
  "GET /api/feed/wait answers a factory's line as an Event about the factory, its label query taking the factory's label",
  WAITED,
  async (t) => {
    const was = followers();
    const asked = app.request('/api/feed/wait?labelSelector=factory%3Dwait-f&for=60s');
    await until(t, () => followers() === was + 1, 'the wait holds its cursor', { everyMs: 5 });
    await runtime.runPromise(
      emitFeed(new Map(), { memo, conflicts: [{ factory: 'wait-f', pending: true, message: 'one conflict waits' }] }).pipe(
        Effect.provide(Logger.layer([])),
      ),
    );
    const res = await asked;
    assert.equal(res.status, 200, await res.clone().text());
    const got = (await res.json()) as FeedWait;
    assert.equal(got.ended, 'matched');
    assert.deepEqual(
      got.lines.map((e) => [e.involved.kind, e.involved.name, e.reason]),
      [['Factory', 'wait-f', 'ConflictsPending']],
    );
  },
);

test('REFUSED: GET /api/feed/wait refuses a bound out of its form, none to wait or longer than a call lives, and a bad selector, 422', async () => {
  for (const query of ['for=soon', 'for=0s', 'for=5m', 'labelSelector=run%3D%3D', 'from=start']) {
    const res = await app.request(`/api/feed/wait?${query}`);
    assert.equal(res.status, 422, `${query}: ${await res.text()}`);
  }
});

/** A `PUT /api/pause/timeout` of `body`, as the board would send it. */
const putTimeout = (body: unknown) =>
  app.request('/api/pause/timeout', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify(body),
  });

test("GET and PUT /api/pause/timeout read and set the store's pause timeout as nemia pause-timeout does; a timeout out of its form is refused, nothing written", async (t) => {
  const file = path.join(root, 'pause-timeout.json');
  t.after(() => fs.rmSync(file, { force: true }));
  await t.test('read with none set: ten minutes, the default, written by no call', async () => {
    const res = await app.request('/api/pause/timeout');
    assert.equal(res.status, 200, await res.clone().text());
    assert.deepEqual((await res.json()) as PauseTimeoutAnswer, { timeout: { ms: 600_000, set: false }, wrote: false });
  });
  await t.test('set to 15m: written, and a read then answers it with when it was set', async () => {
    const res = await putTimeout({ timeout: '15m' });
    assert.equal(res.status, 200, await res.clone().text());
    const wrote = (await res.json()) as PauseTimeoutAnswer;
    assert.deepEqual([wrote.wrote, wrote.timeout.ms, wrote.timeout.set], [true, 900_000, true]);
    const read = (await (await app.request('/api/pause/timeout')).json()) as PauseTimeoutAnswer;
    assert.deepEqual(read, { timeout: { ms: 900_000, set: true, at: wrote.timeout.at }, wrote: false });
  });
  await t.test('REFUSED: a timeout out of its form is a 422, one that is no text a 400, and the timeout set stays as it was', async () => {
    const before = fs.readFileSync(file, 'utf8');
    for (const timeout of ['0s', '24h', 'ten']) assert.equal((await putTimeout({ timeout })).status, 422, timeout);
    assert.equal((await putTimeout({ timeout: 15 })).status, 400);
    assert.equal((await putTimeout({})).status, 400);
    assert.equal(fs.readFileSync(file, 'utf8'), before, 'nothing written');
  });
});
