/**
 * The server group over HTTP: `GET /api/feed/wait`, `nemia wait` as a long poll — the feed read from a cursor until a line a selector
 * takes, answered as Events with the cursor to wait again from, or refused before anything is read.
 *
 * The store is the harness's scratch one (`root`, test/harness.ts); its feed is written by the package's own writer (`emitFeed`) on the
 * app's runtime, as the daemon in the api's process writes it, so a wait open on the app is handed the line from the app's hub.
 */
import '../../test/harness.ts';
import { until, WAITED } from '../../test/waits.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Logger, Metric } from 'effect';
import { emitFeed, FEED_FOLLOWERS, feedSize, freshFeedMemo } from 'agent-orchestrator';
import type { FeedWait } from 'objects';
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
    const asked = app.request('/api/feed/wait?selector=run%3Dwait-1&selector=run%3Dwait-2&for=60s');
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

test('REFUSED: GET /api/feed/wait refuses a bound out of its form, none to wait or longer than a call lives, and a bad selector, 422', async () => {
  for (const query of ['for=soon', 'for=0s', 'for=5m', 'selector=run%3D%3D', 'from=start']) {
    const res = await app.request(`/api/feed/wait?${query}`);
    assert.equal(res.status, 422, `${query}: ${await res.text()}`);
  }
});
