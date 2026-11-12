/**
 * Every list watched (`?watch=true`, src/watch/watch.ts): the initial state as an ADDED per object then a BOOKMARK; a card filed,
 * relabelled, started and dropped arriving as ADDED, MODIFIED and DELETED, the DELETED carrying the last object sent; a labelSelector
 * kept on every read, a card relabelled out of it DELETED; the runs of a store holding one watched, plain and namespaced; a fieldSelector
 * of the runs' state kept on every read, a run waiting sent no MODIFIED for its clock alone and approved out of waiting DELETED; every
 * GET list of the `Api` watchable; the watch's query refused before any stream; the feed's reader let go when the request is aborted; and
 * the Event list's watch resumed from a `resourceVersion` (a page's, or the last event's), sent no state, its refusals 400, 410 and 422.
 * The resync beat is shortened (`Beats.watch`), never waited out.
 */
import { root } from '../../test/harness.ts';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer, Metric, Schema } from 'effect';
import { FEED_FOLLOWERS } from 'agent-orchestrator';
import { TABLE_ACCEPT, WatchedObject, watchEventOf } from 'objects';
import { appOf, liveOf } from '../app.ts';
import { ENDPOINTS } from '../objects/endpoints.ts';
import { Beats } from '../layer.ts';
import { WatchPage } from './watch.ts';
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
async function watch(t: Waiter, url: string, over: { request: typeof app.request } = app) {
  const gone = new AbortController();
  const res = await over.request(url, { signal: gone.signal });
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

test('a watch reads its list through every page: over more cards than a page holds, each is sent ADDED once', async (t) => {
  const paged = appOf(
    Layer.mergeAll(liveOf(), Layer.succeed(Beats)({ ...Beats.defaultValue(), watch: '50 millis' }), Layer.succeed(WatchPage)(2)),
  );
  const names = ['wp-1', 'wp-2', 'wp-3', 'wp-4', 'wp-5'];
  for (const name of names) card(name, { pages: 'yes' });
  t.after(() => {
    for (const name of names) fs.rmSync(path.join(inbox, `${name}.md`), { force: true });
  });
  const w = await watch(t, '/api/namespaces/default/cards?watch=true&labelSelector=pages%3Dyes', paged.app);
  try {
    const initial = await w.initial();
    assert.deepEqual(initial.map(named).sort(), names, 'every card of three pages of two, once each');
    card('wp-6', { pages: 'yes' });
    names.push('wp-6');
    await waitFor(t, () => changes(w.events, 'wp-6').includes('ADDED'), 'a card filed after, on the third page, ADDED');
    assert.deepEqual(changes(w.events, 'wp-1'), ['ADDED'], 'a card on the first page is not sent DELETED by a read again of later pages');
  } finally {
    await w.stop();
  }
});

test('a card started arrives as MODIFIED, its status.runs moved though its file, and so its resourceVersion, stand', async (t) => {
  card('st-1');
  const w = await watch(t, '/api/namespaces/default/cards?watch=true');
  try {
    const initial = await w.initial();
    const sent = initial.find((e) => named(e) === 'st-1');
    assert.ok(sent && sent.type !== 'BOOKMARK');
    fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'runs', 'r-started-st-1.json'),
      JSON.stringify({
        id: 'r-started-st-1',
        repo: '/code/app',
        workspace: '/code/app',
        baseRef: 'abc123',
        branch: 'main',
        isolate: true,
        brief: 'Do st-1.',
        workflowDir: path.join(root, 'no-such-workflow'),
        createdAt: '2026-11-05T06:00:00.000Z',
        workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'claude' }],
        steps: { implement: { taskId: 't-r-started-st-1' } },
        from: { inbox: 'st-1' },
      }),
    );
    await waitFor(t, () => changes(w.events, 'st-1').includes('MODIFIED'), 'st-1 MODIFIED once a run names it');
    const modified = w.events.find((e) => e.type === 'MODIFIED' && named(e) === 'st-1');
    assert.ok(modified && modified.type !== 'BOOKMARK');
    assert.equal(modified.object.metadata.resourceVersion, sent.object.metadata.resourceVersion, 'its resourceVersion stands');
    assert.deepEqual((modified.object.status as { runs: string[] }).runs, ['r-started-st-1'], 'its status names the run');
  } finally {
    await w.stop();
    fs.rmSync(path.join(root, 'runs', 'r-started-st-1.json'), { force: true });
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

/** A task's journal under the engine's store, as the engine writes it: filed, run and signed off done, settled. */
const doneTask = (taskId: string) => {
  const at = '2026-11-05T06:00:00.000Z';
  const file = path.join(root, 'engine', 'tasks', `${taskId}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const closeout = { outcome: 'done', summary: 'Designed it.', needs: null, artifacts: [] };
  const events = [
    { kind: 'filed', at, brief: 'Design it.', cwd: '/code/app', maxAttempts: 1, harness: 'codex' },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    { kind: 'ended', at, attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout },
    { kind: 'settled', at, outcome: 'succeeded' },
  ];
  fs.writeFileSync(file, events.map((e) => `${JSON.stringify(e)}\n`).join(''));
};

/** A run of `default` waiting at its `design` gate, its task done, its record laid by hand and taken away after `t`. */
const gatedRun = (t: TestContext, id: string, createdAt = '2026-11-05T06:00:00.000Z') => {
  t.after(() => fs.rmSync(path.join(root, 'runs', `${id}.json`), { force: true }));
  doneTask(`t-${id}`);
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Design it.',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt,
      workflow: [
        { name: 'design', after: [], body: 'Design it.', harness: 'codex' },
        { name: 'implement', after: ['design'], body: 'Implement it.', harness: 'codex' },
      ],
      gates: ['design'],
      steps: { design: { taskId: `t-${id}` }, implement: { taskId: null } },
    }),
  );
};

test('a watch of the runs over a store holding one, plain and namespaced, sends it ADDED as a Run carrying a resourceVersion, then a BOOKMARK of Run', async (t) => {
  const id = 'r-watch-plain';
  gatedRun(t, id);
  for (const url of ['/api/runs?watch=true', '/api/namespaces/default/runs?watch=true']) {
    const w = await watch(t, url);
    try {
      const sent = (await w.initial()).find((e) => named(e) === id);
      assert.ok(sent && sent.type === 'ADDED', `${url}: the run is sent ADDED`);
      assert.equal(sent.object.kind, 'Run');
      assert.equal(typeof sent.object.metadata.resourceVersion, 'string', `${url}: the Run carries a resourceVersion`);
      assert.equal(w.events.find((e) => e.type === 'BOOKMARK')?.object.kind, 'Run', `${url}: the BOOKMARK names Run`);
    } finally {
      await w.stop();
    }
  }
});

test('a watch of the runs by state sends no MODIFIED for the clock alone: a run that waits, then is approved, arrives as ADDED, then DELETED, and nothing between', async (t) => {
  const id = 'r-watch-gated';
  gatedRun(t, id);
  const w = await watch(t, '/api/runs?watch=true&fieldSelector=status.state%3Dwaiting');
  try {
    const initial = await w.initial();
    const sent = initial.find((e) => named(e) === id);
    assert.ok(sent && sent.type === 'ADDED', 'the run at its gate is among the waiting');
    assert.equal(sent.object.kind, 'Run');
    assert.equal((sent.object.status as { state?: string }).state, 'waiting', 'with the frame its list carries');
    const other = 'r-watch-gated-later';
    const plantedAt = Date.now();
    gatedRun(t, other, new Date(plantedAt).toISOString());
    await waitFor(t, () => changes(w.events, other).includes('ADDED'), `${other} ADDED once it waits`);
    const receivedAt = Date.now();
    const added = w.events.find((e) => named(e) === other);
    assert.ok(added && added.type === 'ADDED', `${other} sent ADDED`);
    const status = added.object.status as { wallMs?: number; clock?: { wallMs?: number } } | undefined;
    const wallMs = status?.wallMs ?? -1;
    assert.ok(wallMs >= 0 && wallMs <= receivedAt - plantedAt, `its wall time measured to the read that sent it, got ${wallMs}`);
    assert.equal(status?.clock?.wallMs, wallMs, 'its clock measured to the same instant');
    const approved = await app.request(`/api/namespaces/default/runs/${id}/steps/design/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', host: '127.0.0.1:8787' },
      body: '{}',
    });
    assert.equal(approved.status, 202, await approved.clone().text());
    await waitFor(t, () => changes(w.events, id).includes('DELETED'), `${id} DELETED once it waits no more`);
    assert.deepEqual(changes(w.events, id), ['ADDED', 'DELETED'], 'its clock moving between the reads is no change of it');
    assert.deepEqual(changes(w.events, other), ['ADDED'], 'nor of the run still waiting');
  } finally {
    await w.stop();
  }
});

test('the watch refuses watch=yes, and limit or continue beside watch=true, with 400 before any stream, a Table asked with 406; an unknown namespace is the list own refusal', async () => {
  for (const query of ['watch=yes', 'watch=true&limit=2', 'watch=true&continue=YQ']) {
    const res = await app.request(`/api/cards?${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(typeof ((await res.json()) as { error: unknown }).error, 'string', `${query} says why in \`error\``);
  }
  for (const url of ['/api/cards?watch=true', '/api/runs?watch=true']) {
    const res = await app.request(url, { headers: { accept: TABLE_ACCEPT } });
    assert.equal(res.status, 406, `${url} asked as a Table: refused, never a stream of rows`);
    assert.equal(typeof ((await res.json()) as { error: unknown }).error, 'string', `${url} says why in \`error\``);
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

/**
 * Every GET of a collection the `Api` serves, its params filled: a namespace `default`, a template the store builds in (`sdlc`). A
 * collection is what the Api declares one: an endpoint whose success has a `kind` ending in `List` (`ENDPOINTS`, read off `Api`) — so
 * neither the builder's `keys` (a `KeyForm`), nor the server's reads, nor a run's reads under its name, which are no list of a kind; nor
 * the discovery document (`/api`), a list of resources rather than of objects.
 */
const collections = ENDPOINTS.filter((e) => e.method === 'GET' && e.path !== '/api' && e.kinds.some((k) => k.endsWith('List'))).map((e) =>
  e.path.replace(':namespace', 'default').replace(':name', 'sdlc'),
);

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

const feed = path.join(root, 'feed.jsonl');

/** A run's line of the feed as the tick writes it: when, which run, its word, and its factory's label. */
const runLine = (run: string, factory: string) =>
  `${JSON.stringify({ at: '2026-11-05T10:00:00.000Z', run, word: 'running', labels: { run, factory } })}\n`;

/** The runs the Events among `events` are about, in the order sent, with what was said of each. */
const runsSaid = (events: readonly WatchEvent[]) =>
  events.flatMap((e) =>
    e.type === 'BOOKMARK' ? [] : [`${e.type} ${(e.object as { involved?: { name?: string } }).involved?.name ?? ''}`],
  );

test('a watch of the events sends each as ADDED, then a BOOKMARK, then each line the tick writes as one ADDED, never twice', async (t) => {
  fs.appendFileSync(feed, runLine('ev-1', 'mill') + runLine('ev-2', 'press'));
  const w = await watch(t, '/api/events?watch=true');
  try {
    const initial = await w.initial();
    assert.ok(['ev-1', 'ev-2'].every((run) => runsSaid(initial).includes(`ADDED ${run}`)));
    fs.appendFileSync(feed, runLine('ev-3', 'mill'));
    await waitFor(t, () => runsSaid(w.events).includes('ADDED ev-3'), 'ev-3 ADDED');
    fs.appendFileSync(feed, runLine('ev-4', 'mill'));
    await waitFor(t, () => runsSaid(w.events).includes('ADDED ev-4'), 'ev-4 ADDED');
    assert.deepEqual(
      runsSaid(w.events).filter((said) => /ev-[1-4]$/.test(said)),
      ['ADDED ev-1', 'ADDED ev-2', 'ADDED ev-3', 'ADDED ev-4'],
      'each line once, in the order written',
    );
  } finally {
    await w.stop();
  }
});

test("a namespace's watch of the events sends none of another factory's", async (t) => {
  const w = await watch(t, '/api/namespaces/mill/events?watch=true');
  try {
    await w.initial();
    fs.appendFileSync(feed, runLine('ns-press', 'press') + runLine('ns-mill', 'mill'));
    await waitFor(t, () => runsSaid(w.events).includes('ADDED ns-mill'), 'ns-mill ADDED');
    assert.ok(!runsSaid(w.events).some((said) => said.endsWith('press') || said === 'ADDED ev-2'), 'no Event of press');
  } finally {
    await w.stop();
  }
});

/** The `resourceVersion` the Event list answers on its page: the feed's end as read. */
const listedAt = async (url = '/api/events?limit=1') => {
  const res = await app.request(url);
  assert.equal(res.status, 200, url);
  const at = ((await res.json()) as { metadata: { resourceVersion?: string } }).metadata.resourceVersion;
  assert.ok(at !== undefined, `${url} carries metadata.resourceVersion`);
  return at;
};

test("a list of events answers the feed's end as its resourceVersion, and a watch from it sends no state, only each line after it", async (t) => {
  fs.appendFileSync(feed, runLine('rv-1', 'mill'));
  const at = await listedAt();
  assert.equal(at, String(fs.statSync(feed).size), "the page's resourceVersion is the feed's size");
  const w = await watch(t, `/api/events?watch=true&resourceVersion=${at}`);
  try {
    fs.appendFileSync(feed, runLine('rv-2', 'mill'));
    await waitFor(t, () => runsSaid(w.events).includes('ADDED rv-2'), 'rv-2 ADDED');
    assert.ok(!runsSaid(w.events).includes('ADDED rv-1'), 'a line before the resourceVersion asked is not sent');
    assert.ok(!runsSaid(w.events).includes('ADDED ev-1'), 'no state is sent');
    assert.equal(w.events[0]?.type, 'ADDED', 'the first event is the line after it, no BOOKMARK of a state');
  } finally {
    await w.stop();
  }
});

test('a watch resumed from the resourceVersion of the last event it was sent repeats nothing and loses no line', async (t) => {
  const first = await watch(t, `/api/events?watch=true&resourceVersion=${await listedAt()}`);
  let last: string | undefined;
  try {
    fs.appendFileSync(feed, runLine('rs-1', 'mill'));
    await waitFor(t, () => runsSaid(first.events).includes('ADDED rs-1'), 'rs-1 ADDED');
    last = first.events.filter((e) => e.type === 'ADDED').at(-1)?.object.metadata.resourceVersion;
  } finally {
    await first.stop();
  }
  assert.ok(last !== undefined);
  fs.appendFileSync(feed, runLine('rs-2', 'mill'));
  const again = await watch(t, `/api/events?watch=true&resourceVersion=${last}`);
  try {
    await waitFor(t, () => runsSaid(again.events).includes('ADDED rs-2'), 'rs-2, written while no watch was open, ADDED');
    assert.ok(!runsSaid(again.events).includes('ADDED rs-1'), 'the line already sent is not sent again');
  } finally {
    await again.stop();
  }
});

test('a resourceVersion asked of a list read again, or that names no byte, is refused 400 naming it; one inside a line or past the end 410; a bad selector 422', async () => {
  for (const url of [
    '/api/runs?watch=true&resourceVersion=5',
    '/api/events?watch=true&resourceVersion=abc',
    '/api/events?watch=true&resourceVersion=007',
  ]) {
    const res = await app.request(url);
    assert.equal(res.status, 400, url);
    assert.match(((await res.json()) as { error: string }).error, /resourceVersion/, `${url} names the key`);
  }
  const end = fs.statSync(feed).size;
  for (const at of [end - 1, end + 100]) {
    const res = await app.request(`/api/events?watch=true&resourceVersion=${at}`);
    assert.equal(res.status, 410, `resourceVersion ${at} of a feed of ${end} bytes`);
    assert.equal(typeof ((await res.json()) as { error: unknown }).error, 'string');
  }
  const bad = await app.request(`/api/events?watch=true&resourceVersion=${end}&labelSelector=((`);
  assert.equal(bad.status, 422, 'a selector the grammar refuses, before any stream');
  const nowhere = await app.request(`/api/namespaces/nowhere/events?watch=true&resourceVersion=${end}`);
  const plain = await app.request('/api/namespaces/nowhere/events');
  assert.equal(nowhere.status, plain.status, 'a namespace the list refuses is refused as it would be unwatched');
});
