/**
 * The events group served (src/objects): the feed's lines as Events, a page walked by `continue` in the order they were written; a
 * `labelSelector` taking the very lines `/api/feed/stream?selector=` sends; a namespace's events those of the factory each names, a
 * daemon's line in none; one read by its name, the byte its line starts at — a daemon's at `/api/events/<name>` and a 404 under a
 * namespace; and a name or a token that is none, refused.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { Event, EventList } from 'objects';
import { app } from '../app.ts';

const feed = path.join(root, 'feed.jsonl');

/** A run's line of the feed as a writer before v1 wrote it: when, which run, the word the tick judged, and its factory's label. */
const runLine = (run: string, word: string, factory?: string) => ({
  at: '2026-11-05T10:00:00.000Z',
  run,
  word,
  ...(factory === undefined ? {} : { labels: { run, factory } }),
});

fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(
  feed,
  [
    runLine('r-1', 'running', 'mill'),
    runLine('r-2', 'waiting', 'mill'),
    { at: '2026-11-05T10:01:00.000Z', daemon: 4242, word: 'daemon started' },
    runLine('r-3', 'waiting'),
    runLine('r-4', 'succeeded', 'press'),
  ]
    .map((line) => `${JSON.stringify(line)}\n`)
    .join(''),
);

/** The api's answer to a GET of `url`: its status and its body. */
async function get(url: string): Promise<{ status: number; body: unknown }> {
  const res = await app.request(url);
  return { status: res.status, body: await res.json() };
}

const page = async (url: string) => {
  const { status, body } = await get(url);
  assert.equal(status, 200, url);
  return Schema.decodeUnknownSync(EventList)(body);
};

test('?limit=2 walked by continue answers each line once, in the order written; only the last page counts what is left, none', async () => {
  const names: string[] = [];
  const remaining: Array<number | undefined> = [];
  let next: string | undefined;
  let pages = 0;
  do {
    const list = await page(`/api/events?limit=2${next ? `&continue=${encodeURIComponent(next)}` : ''}`);
    names.push(...list.items.map((e) => e.involved.name));
    remaining.push(list.metadata.remainingItemCount);
    next = list.metadata.continue;
    pages++;
  } while (next && pages < 10);
  assert.deepEqual(names, ['r-1', 'r-2', '4242', 'r-3', 'r-4']);
  assert.deepEqual(
    remaining,
    [undefined, undefined, 0],
    'a page read to the page and one past it never counts the rest of the feed: remainingItemCount is optional, as in Kubernetes',
  );
});

test('a labelSelector takes the lines /api/feed/stream?selector= sends, each by the cursor after it', async () => {
  const events = await page('/api/events?labelSelector=reason%3DAwaitingAnswer');
  const streamed = await (await app.request('/api/feed/stream?selector=reason%3DAwaitingAnswer&until=end')).text();
  const ids = streamed
    .split('\n\n')
    .filter((block) => /^data: \{/m.test(block))
    .map((block) => /^id: (\d+)$/m.exec(block)?.[1]);
  assert.deepEqual(
    events.items.map((e) => e.metadata.resourceVersion),
    ids,
  );
  assert.deepEqual(
    events.items.map((e) => e.reason),
    ['AwaitingAnswer', 'AwaitingAnswer'],
  );
});

test("a namespace's events are its factory's, a run's naming none in default, and a daemon's in none", async () => {
  assert.deepEqual(
    (await page('/api/namespaces/mill/events')).items.map((e) => e.involved.name),
    ['r-1', 'r-2'],
  );
  assert.deepEqual(
    (await page('/api/namespaces/default/events')).items.map((e) => e.involved.name),
    ['r-3'],
  );
  const daemon = (await page('/api/events')).items.find((e) => e.involved.kind === 'Daemon');
  assert.equal(daemon?.metadata.namespace, undefined, "a daemon's event is cluster-scoped");
});

test("an event is read by its name, the byte its line starts at; a daemon's under a namespace, or a name in a line, is a 404", async () => {
  const all = (await page('/api/events')).items;
  const second = all[1];
  const daemon = all[2];
  assert.ok(second && daemon);
  const one = await get(`/api/namespaces/mill/events/${second.metadata.name}`);
  assert.equal(one.status, 200);
  assert.deepEqual(Schema.decodeUnknownSync(Event)(one.body), second);
  assert.equal((await get(`/api/events/${daemon.metadata.name}`)).status, 200);
  assert.equal((await get(`/api/namespaces/mill/events/${daemon.metadata.name}`)).status, 404, 'a daemon is in no namespace');
  assert.equal((await get(`/api/events/${Number(second.metadata.name) + 1}`)).status, 404, 'a byte in the middle of a line');
  assert.equal((await get('/api/events/nowhere')).status, 404);
});

test('a limit that is no whole number from 1, a continue that carries no cursor, and a selector that is none, are 422', async () => {
  for (const query of ['limit=0', 'continue=not-a-token', 'labelSelector=%3D%3D'])
    assert.equal((await app.request(`/api/events?${query}`)).status, 422, query);
});
