/**
 * Every list watched (`?watch=true`, src/watch/watch.ts): the initial state as an ADDED per object then a BOOKMARK; a card filed,
 * relabelled, started and dropped arriving as ADDED, MODIFIED and DELETED, the DELETED carrying the last object sent; a labelSelector
 * kept on every read, a card relabelled out of it DELETED; every GET list of the `Api` watchable; the watch's query refused before any
 * stream; and the feed's reader let go when the request is aborted. The resync beat is shortened (`Beats.watch`), never waited out.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer, Metric, Schema } from 'effect';
import { FEED_FOLLOWERS } from 'agent-orchestrator';
import { Api, WatchedObject, watchEventOf } from 'objects';
import { appOf, liveOf } from '../app.ts';
import { Beats } from '../layer.ts';
import { until, type Waiter } from '../../test/waits.ts';

/** Waits for `ok`, read every 20 ms, said as `what` if it never comes. */
const waitFor = (t: Waiter, ok: () => boolean, what: string) => until(t, ok, what, { everyMs: 20 });

const { app } = appOf(Layer.merge(liveOf(), Layer.succeed(Beats)({ ...Beats.defaultValue(), watch: '50 millis', feed: '50 millis' })));
const WatchEvent = watchEventOf(WatchedObject);
type WatchEvent = typeof WatchEvent.Type;

const inbox = path.join(root, 'inbox');

/** A card filed by hand in `default`, with the labels given in its front matter. */
const card = (name: string, labels: Record<string, string> = {}) => {
  fs.mkdirSync(inbox, { recursive: true });
  const keys = Object.entries(labels);
  const front = keys.length ? `---\nlabels: { ${keys.map(([k, v]) => `${k}: ${v}`).join(', ')} }\n---\n` : '';
  fs.writeFileSync(path.join(inbox, `${name}.md`), `${front}Do ${name}.\n`);
};

card('w-1', { team: 'core' });
card('w-2', { team: 'infra' });

/** A watch opened on `url`: each event as it arrives, read off the stream, and the abort that ends it. */
async function watch(t: Waiter, url: string) {
  const gone = new AbortController();
  const res = await app.request(url, { signal: gone.signal });
  assert.equal(res.status, 200, url);
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/, `${url} answers a stream`);
  const events: WatchEvent[] = [];
  const reader = res.body?.getReader();
  assert.ok(reader, 'the stream has a body');
  const decoder = new TextDecoder();
  let held = '';
  const read = (async () => {
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (done) return;
      held += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = held.indexOf('\n\n')) !== -1) {
        const frame = held.slice(0, end);
        held = held.slice(end + 2);
        const data = frame
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n');
        if (data !== '') events.push(Schema.decodeUnknownSync(WatchEvent)(JSON.parse(data)));
      }
    }
  })();
  const initial = async () => {
    await waitFor(t, () => events.some((e) => e.type === 'BOOKMARK'), `the first BOOKMARK of ${url}`);
    return events.slice(
      0,
      events.findIndex((e) => e.type === 'BOOKMARK'),
    );
  };
  const stop = async () => {
    gone.abort();
    await reader.cancel().catch(() => undefined);
    await read;
  };
  return { events, initial, stop };
}

const named = (e: WatchEvent) => (e.type === 'BOOKMARK' ? '' : e.object.metadata.name);
const changes = (events: readonly WatchEvent[], name: string) => events.filter((e) => named(e) === name).map((e) => e.type);

test('a watch of cards sends each as ADDED, then a BOOKMARK; then a card filed ADDED, relabelled MODIFIED, dropped DELETED with its last object', async (t) => {
  const w = await watch(t, '/api/namespaces/default/cards?watch=true');
  try {
    const initial = await w.initial();
    assert.ok(initial.every((e) => e.type === 'ADDED' && e.object.kind === 'Card'));
    assert.ok(['w-1', 'w-2'].every((n) => initial.some((e) => named(e) === n)));
    card('w-3', { team: 'core' });
    await waitFor(t, () => changes(w.events, 'w-3').includes('ADDED'), "changes(w.events, 'w-3').includes('ADDED')");
    card('w-3', { team: 'docs' });
    await waitFor(t, () => changes(w.events, 'w-3').includes('MODIFIED'), "changes(w.events, 'w-3').includes('MODIFIED')");
    fs.rmSync(path.join(inbox, 'w-3.md'));
    await waitFor(t, () => changes(w.events, 'w-3').includes('DELETED'), "changes(w.events, 'w-3').includes('DELETED')");
    const deleted = w.events.find((e) => e.type === 'DELETED' && named(e) === 'w-3');
    assert.equal(deleted?.type !== 'BOOKMARK' && deleted?.object.metadata.labels?.team, 'docs', 'DELETED carries the last object sent');
    assert.deepEqual(changes(w.events, 'w-3'), ['ADDED', 'MODIFIED', 'DELETED'], 'an unchanged re-read sends nothing');
    assert.deepEqual(changes(w.events, 'w-1'), ['ADDED'], 'a card that did not change is sent once');
  } finally {
    await w.stop();
  }
});

test('a labelSelector keeps its cards on every read, and a card relabelled out of it arrives as DELETED', async (t) => {
  card('s-1', { team: 'core' });
  const w = await watch(t, '/api/namespaces/default/cards?watch=true&labelSelector=team%3Dcore');
  try {
    const initial = await w.initial();
    assert.ok(initial.every((e) => e.type !== 'BOOKMARK' && e.object.metadata.labels?.team === 'core'));
    assert.ok(initial.some((e) => named(e) === 's-1'));
    card('s-1', { team: 'infra' });
    await waitFor(t, () => changes(w.events, 's-1').includes('DELETED'), "changes(w.events, 's-1').includes('DELETED')");
  } finally {
    await w.stop();
  }
});

test('the watch refuses watch=yes, and limit or continue beside watch=true, with 400 before any stream; an unknown namespace is the list own refusal', async () => {
  for (const query of ['watch=yes', 'watch=true&limit=2', 'watch=true&continue=YQ']) {
    const res = await app.request(`/api/cards?${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(typeof ((await res.json()) as { error: unknown }).error, 'string', `${query} says why in \`error\``);
  }
  const plain = await app.request('/api/namespaces/nowhere/hires');
  const watched = await app.request('/api/namespaces/nowhere/hires?watch=true');
  assert.notEqual(plain.status, 200);
  assert.equal(watched.status, plain.status, 'the list refuses as it would unwatched');
  assert.equal(typeof ((await watched.json()) as { error: unknown }).error, 'string');
});

/** The feed's live readers in this process, as the package counts them. */
const followers = () => Effect.runSync(Metric.value(FEED_FOLLOWERS)).value;

test('aborting a watch lets its feed reader go', async (t) => {
  const before = followers();
  const w = await watch(t, '/api/cards?watch=true');
  await w.initial();
  await waitFor(t, () => followers() > before, 'followers() > before');
  await w.stop();
  await waitFor(t, () => followers() === before, 'followers() === before');
});

/** Every GET of a collection the `Api` serves, its params filled: a namespace `default`, a template the store builds in (`sdlc`). */
const collections = Object.values(Api.groups)
  .flatMap((group) => Object.values(group.endpoints))
  .filter((e) => e.method === 'GET' && e.path !== '/api' && !/\/:[A-Za-z]+$/.test(e.path) && !e.path.includes('/runs/:runId/'))
  .filter((e) => !/\/(rules|instruction|commands|card|files|sign-in|told)$/.test(e.path))
  .map((e) => e.path.replace(':namespace', 'default').replace(':name', 'sdlc'));

test('every list the Api serves answers ?watch=true with its objects ADDED, then a BOOKMARK of its kind', async (t) => {
  assert.ok(collections.length >= 15, `${collections.length} lists found`);
  for (const url of collections) {
    const plain = await app.request(url);
    assert.equal(plain.status, 200, `${url} lists`);
    const list = (await plain.json()) as { kind: string };
    const w = await watch(t, `${url}?watch=true`);
    try {
      const initial = await w.initial();
      const kind = list.kind.replace(/List$/, '');
      assert.ok(
        initial.every((e) => e.type === 'ADDED' && e.object.kind === kind),
        `${url}: every initial event an ADDED ${kind}`,
      );
      const bookmark = w.events.find((e) => e.type === 'BOOKMARK');
      assert.equal(bookmark?.object.kind, kind, `${url}: the BOOKMARK names ${kind}`);
    } finally {
      await w.stop();
    }
  }
});
