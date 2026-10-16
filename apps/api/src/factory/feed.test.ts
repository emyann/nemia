/**
 * The workflow feed over HTTP: GET /api/feed/stream, what the tick judged of each run and step, as server-sent events.
 *
 * At shipped defaults: a store of the file's own, whose feed is written by the package's own writer (`emitFeed`) on the app's runtime,
 * as the daemon in the api's process writes it, or with no hub, as another process writes it. What the stream sends is held to what the
 * feed says: each line, named by what it is about, its id the cursor just after it. Its readers are counted as the package counts them
 * (`FEED_FOLLOWERS`), so a stream whose reader went and left one behind fails here.
 * The store is the harness's scratch one (`root`, test/harness.ts). A socket is served by the adaptor's server, which, given no
 * `createServer`, is a plain `http.Server`, not one of the HTTP/2 servers its type also allows.
 */
import '../../test/harness.ts';
import { until, WAITED, type Waiter } from '../../test/waits.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAdaptorServer } from '@hono/node-server';
import { Effect, Logger, Metric } from 'effect';
import { app, runtime } from '../app.ts';
import { OPENED } from './feed.ts';
import { emitFeed, FEED_FOLLOWERS, feedFile, freshFeedMemo, readFeed } from 'agent-orchestrator';

type FeedWords = import('agent-orchestrator').FeedWords;

const STREAM = '/api/feed/stream';

/**
 * A store whose feed is gone, and a writer that has read none of it — the tick's memo, started afresh. Returns one pass, as the tick hands
 * the feed what it judged — every run in the store, by id — written on the app's runtime, its lines published to the app's streams; and
 * one written as another process writes it (`elsewhere`), with no hub, whose lines a stream reads from the file alone.
 */
const emptyFeed = () => {
  fs.rmSync(feedFile(), { force: true });
  const memo = freshFeedMemo();
  const written = (runs: Record<string, FeedWords>) =>
    emitFeed(new Map(Object.entries(runs)), { memo }).pipe(Effect.provide(Logger.layer([])));
  return Object.assign((runs: Record<string, FeedWords>) => runtime.runPromise(written(runs)), {
    elsewhere: (runs: Record<string, FeedWords>) => Effect.runPromise(written(runs)),
  });
};
const planAt = (word: string, note?: string): FeedWords => ({
  run: { word: 'running' },
  steps: [{ name: 'plan', word, ...(note ? { note } : {}) }],
});
const end = () => readFeed(0).cursor;

type Block = { event?: string; data?: string; id?: string };
/** Server-sent events as a reader gets them: the fields of each block, a comment line read as nothing, as an EventSource reads it. */
const blocks = (text: string): Block[] =>
  text
    .split('\n\n')
    .map((block) =>
      block
        .split('\n')
        .filter((line) => !line.startsWith(':'))
        .join('\n'),
    )
    .filter((block) => block.trim())
    .map((block) =>
      Object.fromEntries(
        block.split('\n').map((line) => {
          const colon = line.indexOf(': ');
          return [line.slice(0, colon), line.slice(colon + 2)];
        }),
      ),
    );

/**
 * Read a stream until `holds` holds for the blocks it has sent, or it ends: one chunk an ask, so the wait is paced by the stream itself,
 * never by a length of time, and ends at its test's timeout when what it waits for never comes.
 *
 * @param t the test that waits
 * @param reader the stream's reader
 * @param text what the stream has sent so far, kept between reads of the same stream
 * @param holds what the blocks sent must come to
 * @returns the whole blocks sent, once `holds` holds for them; or every block, once the stream ends
 */
function readUntil(
  t: Waiter,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  text: { value: string },
  holds: (said: Block[]) => boolean,
): Promise<Block[]> {
  const decoder = new TextDecoder();
  const complete = () => blocks(text.value.slice(0, text.value.lastIndexOf('\n\n') + 2));
  return until(
    t,
    async () => {
      if (holds(complete())) return complete();
      const { done, value } = await reader.read();
      if (done) return blocks(text.value);
      text.value += decoder.decode(value, { stream: true });
      return holds(complete()) && complete();
    },
    () => `the events waited for, from a stream that had sent ${complete().length}: ${text.value}`,
    { everyMs: 0 },
  );
}

/** A stream opened on the api, and a reader of it. */
const open = async (query = '', headers: Record<string, string> = {}) => {
  const res = await app.request(`${STREAM}${query}`, { headers });
  assert.equal(res.status, 200, await (res.status === 200 ? '' : res.text()));
  return { res, reader: res.body!.getReader(), text: { value: '' } };
};

/**
 * The feed's live readers in this process, as the package counts them (`FEED_FOLLOWERS`). A reader gone is counted until its stream's scope
 * has closed, and a stream read through `app.request` may take a turn of the event loop: a count is waited for, at a pace (`until`),
 * never read once after a close.
 */
const followers = () => Effect.runSync(Metric.value(FEED_FOLLOWERS)).value;

test(
  "a transition the tick writes to the feed arrives on the stream as it is written: named by what it is about, the line as data, the feed's end as its id",
  WAITED,
  async (t) => {
    const pass = emptyFeed();
    await pass({ 'r-1': planAt('running') });
    const from = end();
    const { res, reader, text } = await open(`?after=${from}`);
    try {
      assert.match(res.headers.get('content-type') ?? '', /^text\/event-stream/);

      const [gate] = await pass({ 'r-1': planAt('awaiting approval', 'approve it: nemia approve r-1 plan') });
      let said = await readUntil(t, reader, text, (s) => s.length >= 1);
      assert.deepEqual(
        said,
        [{ event: 'step', data: JSON.stringify(gate), id: String(end()) }],
        'the gate, and nothing that was there before the cursor',
      );

      const [done] = await pass({
        'r-1': { run: { word: 'done' }, steps: [{ name: 'plan', word: 'awaiting approval', note: 'approve it: nemia approve r-1 plan' }] },
      });
      said = await readUntil(t, reader, text, (s) => s.length >= 2);
      assert.deepEqual(said[1], { event: 'run', data: JSON.stringify(done), id: String(end()) });

      const [removed] = await pass({});
      said = await readUntil(t, reader, text, (s) => s.length >= 3);
      assert.deepEqual(said[2], { event: 'removed', data: JSON.stringify(removed), id: String(end()) });
      assert.equal(JSON.parse(said[2].data).word, 'removed');
    } finally {
      await reader.cancel();
    }
  },
);

test(
  'a stream says it is open before its first line, as a comment: a feed with no line yet still answers, through a proxy that sends a head with its first bytes',
  WAITED,
  async (t) => {
    const pass = emptyFeed();
    const { reader, text } = await open();
    try {
      const [first] = await pass({ 'r-1': planAt('running') });
      const said = await readUntil(t, reader, text, (s) => s.length >= 1);
      assert.ok(text.value.startsWith(OPENED), `the stream's first bytes are its comment, before any line: ${text.value}`);
      assert.equal(said[0].data, JSON.stringify(first), 'then the first line, the comment read as nothing');
    } finally {
      await reader.cancel();
    }
  },
);

test(
  'a stream opened with no cursor reads the feed from the start; one reconnected with Last-Event-ID resumes after that event, over any `after` in its address',
  WAITED,
  async (t) => {
    const pass = emptyFeed();
    await pass({ 'r-1': planAt('running') });
    assert.equal(readFeed(0).lines.length, 2);
    await pass({ 'r-1': planAt('succeeded') });
    const lines = readFeed(0).lines;
    assert.equal(lines.length, 3);

    const first = await open();
    const all = await readUntil(t, first.reader, first.text, (s) => s.length >= 3);
    await first.reader.cancel();
    assert.deepEqual(
      all.map((b) => [b.event, b.data]),
      lines.map((l) => ['step' in l && l.step ? 'step' : 'run', JSON.stringify(l)]),
    );
    assert.equal(all[2].id, String(end()));
    for (const [i, b] of all.entries())
      assert.deepEqual(
        readFeed(Number(b.id)).lines,
        lines.slice(i + 1),
        `event ${i}: its id is where a read takes up after that line, and no other`,
      );

    const again = await open('?after=0', { 'Last-Event-ID': all[0].id! });
    const resumed = await readUntil(t, again.reader, again.text, (s) => s.length >= 2);
    await pass({ 'r-1': planAt('failed') });
    const more = await readUntil(t, again.reader, again.text, (s) => s.length >= 3);
    await again.reader.cancel();
    assert.deepEqual(
      resumed.map((b) => b.id),
      all.slice(1).map((b) => b.id),
      'the header wins over the address: the second and third, not the first',
    );
    assert.equal(JSON.parse(more[2].data!).word, 'failed', 'and then what is written next');

    const fromSecond = await open(`?after=${all[1].id}`);
    const third = await readUntil(t, fromSecond.reader, fromSecond.text, (s) => s.length >= 2);
    await fromSecond.reader.cancel();
    assert.deepEqual(
      third.map((b) => b.id),
      [all[2].id, more[2].id],
      'from the second event on',
    );

    const empty = await open('?after=');
    const whole = await readUntil(t, empty.reader, empty.text, (s) => s.length >= 4);
    await empty.reader.cancel();
    assert.equal(whole[0].id, all[0].id, 'an empty `after` is none: from the start');
  },
);

test('a daemon’s line, as up writes it once it holds the store, is sent as a daemon event, its data the line whole', WAITED, async (t) => {
  const pass = emptyFeed();
  await pass({ 'r-1': planAt('running') });
  const v0 = { at: '2026-10-07T12:00:00.000Z', daemon: 4242, word: 'daemon started', note: 'first daemon on this store' };
  fs.appendFileSync(feedFile(), `${JSON.stringify(v0)}\n`);
  const lines = readFeed(0).lines;
  const daemon = lines.at(-1)!;
  assert.deepEqual(
    {
      ...v0,
      apiVersion: 'nemia/v1',
      involved: { kind: 'Daemon', name: '4242' },
      labels: {},
      reason: 'DaemonStarted',
      type: 'Normal',
      source: 'daemon',
      message: 'daemon started · first daemon on this store',
    },
    daemon,
    'the package reads a line written before the feed was signed back as a signed one',
  );
  const opened = await open();
  const all = await readUntil(t, opened.reader, opened.text, (s) => s.length >= 3);
  await opened.reader.cancel();
  assert.deepEqual(
    all.map((b) => b.event),
    ['run', 'step', 'daemon'],
  );
  assert.equal(all[2].data, JSON.stringify(daemon));
});

test(
  'a tool denial comes out as a step event, its data the line whole: the api names an event by what the line is about, not by its reason',
  WAITED,
  async (t) => {
    const pass = emptyFeed();
    await pass({
      'r-1': { ...planAt('running'), denials: [{ step: 'plan', try: 2, call: 'Bash(git push)' }] },
    });
    const opened = await open();
    const all = await readUntil(t, opened.reader, opened.text, (s) => s.length >= 3);
    await opened.reader.cancel();
    assert.deepEqual(
      all.map((b) => b.event),
      ['run', 'step', 'step'],
      'the run, its step, and the denial of that step — each an event of what it is about',
    );
    const shot = JSON.parse(all[2].data!);
    assert.deepEqual(
      { reason: shot.reason, type: shot.type, source: shot.source, call: shot.call, try: shot.try, step: shot.step },
      { reason: 'ToolDenied', type: 'Warning', source: 'runtime', call: 'Bash(git push)', try: 2, step: 'plan' },
      'and the body a reader gets is the whole line, the fields a selector will match among them',
    );
  },
);

test('REFUSED: a cursor the feed never gave is a 400 that names it and says what to pass — inside a line, past the end, not a number; by address and by Last-Event-ID — and one it gave is taken', async () => {
  const pass = emptyFeed();
  await pass({ 'r-1': planAt('running') });
  const size = end();
  const cases: [string, Record<string, string>, RegExp][] = [
    [
      `?after=${size - 2}`,
      {},
      new RegExp(`^\`${size - 2}\` is not a cursor this feed gave: cursor ${size - 2} falls inside a line of the feed`),
    ],
    ['', { 'Last-Event-ID': String(size - 2) }, /falls inside a line of the feed, not after one/],
    [
      `?after=${size + 10}`,
      {},
      new RegExp(`^\`${size + 10}\` is not a cursor this feed gave: cursor ${size + 10} is past the end of the feed \\(${size} bytes`),
    ],
    ['?after=abc', {}, /^`abc` is not a cursor this feed gave: a feed cursor is a whole number of bytes\./],
    ['?after=-1', {}, /^`-1` is not a cursor this feed gave: a feed cursor is a whole number of bytes\./],
    ['', { 'Last-Event-ID': 'page-2' }, /^`page-2` is not a cursor this feed gave/],
  ];
  for (const [query, headers, pattern] of cases) {
    const res = await app.request(`${STREAM}${query}`, { headers });
    const where = `${query} ${JSON.stringify(headers)}`;
    assert.equal(res.status, 400, where);
    assert.match(res.headers.get('content-type') ?? '', /^application\/json/, `${where}: an answer, not a stream`);
    const { error } = (await res.json()) as { error: string };
    assert.match(error, pattern, where);
    assert.match(
      error,
      /the id of an event this stream sent, which an EventSource sends back as Last-Event-ID; pass none to read the feed from the start\.$/,
      where,
    );
  }
  const taken = await open(`?after=${size}`);
  await taken.reader.cancel();
});

test('a feed truncated under the stream ends it: `unreadable`, not tried again, and the response closes', WAITED, async (t) => {
  const pass = emptyFeed();
  await pass({ 'r-1': planAt('running') });
  await pass({ 'r-1': planAt('succeeded') });
  const { reader, text } = await open(`?after=${end()}`);
  await pass({ 'r-1': planAt('failed') });
  await readUntil(t, reader, text, (s) => s.length >= 1);

  const first = fs.readFileSync(feedFile(), 'utf8').split('\n')[0];
  fs.writeFileSync(feedFile(), `${first}\n`);
  const said = await readUntil(t, reader, text, () => false);
  const last = said.at(-1)!;
  assert.equal(
    last.event,
    'unreadable',
    "the read resolves only once the api closes the stream: one that went on trying would reach its test's timeout",
  );
  const { error, retrying } = JSON.parse(last.data!);
  assert.equal(retrying, false);
  assert.match(error, /is past the end of the feed/);
  assert.equal(said.filter((b) => b.event === 'unreadable').length, 1, 'said once');
  await until(
    t,
    () => followers() === 0,
    () => `the reader outlived the feed that ended its stream: ${followers()} left`,
    { everyMs: 20 },
  );
});

test(
  "a line another process writes — a `nemia tick`, beside an api run with `--no-tick` — arrives on the stream's next beat, read from the file",
  WAITED,
  async (t) => {
    const pass = emptyFeed();
    await pass({ 'r-1': planAt('running') });
    const { reader, text } = await open(`?after=${end()}`);
    try {
      const [line] = await pass.elsewhere({ 'r-1': planAt('succeeded') });
      const said = await readUntil(t, reader, text, (s) => s.length >= 1);
      assert.deepEqual(said, [{ event: 'step', data: JSON.stringify(line), id: String(end()) }]);
    } finally {
      await reader.cancel();
    }
  },
);

test(
  'a read that fails is said once, `retrying`, and cleared by the first read that works, before the lines it found',
  WAITED,
  async (t) => {
    if (process.getuid?.() === 0) return t.skip('a mode of 200 does not keep root from reading');
    const pass = emptyFeed();
    const [first] = await pass({ 'r-1': planAt('running') });
    await until(
      t,
      () => followers() === 0,
      () => `${followers()} readers left behind by the tests before this one`,
      { everyMs: 20 },
    );
    const { reader, text } = await open(`?after=${end()}`);
    try {
      await until(
        t,
        () => followers() === 1,
        () => `the stream's reader did not start: ${followers()} readers`,
        { everyMs: 20 },
      );
      const line = {
        at: first.at,
        run: 'r-1',
        step: 'plan',
        word: 'succeeded',
        apiVersion: 'nemia/v1',
        involved: { kind: 'Step', name: 'r-1/plan' },
        labels: { run: 'r-1', step: 'plan' },
        reason: 'Succeeded',
        type: 'Normal',
        source: 'tick',
        message: 'succeeded',
      };
      fs.chmodSync(feedFile(), 0o200);
      try {
        fs.appendFileSync(feedFile(), `${JSON.stringify(line)}\n`);
        const failed = await readUntil(t, reader, text, (s) => s.length >= 1);
        assert.equal(failed[0].event, 'unreadable');
        const { error, retrying } = JSON.parse(failed[0].data!);
        assert.equal(retrying, true, 'a read that failed, not a feed that cannot be read from again');
        assert.match(error, /EACCES/);
        await new Promise((r) => setTimeout(r, 2_500));
      } finally {
        fs.chmodSync(feedFile(), 0o644);
      }
      const cleared = await readUntil(t, reader, text, (s) => s.length >= 3);
      assert.deepEqual(
        cleared.map((b) => b.event),
        ['unreadable', 'readable', 'step'],
        "said once over more than two of the reader's one-second beats, each failing again, then cleared by the next read that works, before the line it found; an absence, so a bound of time is all there is, and a slow machine makes it prove less, never fail",
      );
      assert.deepEqual(cleared[2], { event: 'step', data: JSON.stringify(line), id: String(end()) });

      const [next] = await pass({ 'r-1': planAt('failed') });
      const more = await readUntil(t, reader, text, (s) => s.length >= 4);
      assert.deepEqual(more[3], { event: 'step', data: JSON.stringify(next), id: String(end()) });
      assert.equal(more.length, 4, 'and the line that comes next, with nothing more said of the failure');
    } finally {
      await reader.cancel();
    }
  },
);

test(
  "a stream whose reader goes is no longer counted among the feed's followers: each open stream is one, and a cancelled one is not",
  WAITED,
  async (t) => {
    const pass = emptyFeed();
    await pass({ 'r-1': planAt('running') });
    await until(
      t,
      () => followers() === 0,
      () => `${followers()} readers left behind by the tests before this one, whose streams are gone with their readers`,
      { everyMs: 20 },
    );
    const streams = await Promise.all([open(), open(), open()]);
    for (const s of streams) await readUntil(t, s.reader, s.text, (said) => said.length >= 1);
    assert.equal(followers(), 3, 'one follower a stream, each counted once it sent an event');
    await streams[0].reader.cancel();
    await until(
      t,
      () => followers() === 2,
      () => `${followers()} followers, with one of three readers gone`,
      { everyMs: 20 },
    );
    for (const s of streams.slice(1)) await s.reader.cancel();
    await until(
      t,
      () => followers() === 0,
      () => `${followers()} followers left behind by three streams whose readers went`,
      { everyMs: 20 },
    );
  },
);

test(
  'a client that closes its socket lets its reader go too — the path `main.ts` serves, where nothing is being written when it goes',
  WAITED,
  async (t) => {
    const pass = emptyFeed();
    await pass({ 'r-1': planAt('running') });
    const server = createAdaptorServer({ fetch: app.fetch }) as Server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      await until(
        t,
        () => followers() === 0,
        () => `${followers()} followers left behind by the tests before this one`,
        { everyMs: 20 },
      );
      const { port } = server.address() as AddressInfo;
      const abort = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}${STREAM}`, { signal: abort.signal });
      assert.equal(res.status, 200);
      await readUntil(t, res.body!.getReader(), { value: '' }, (said) => said.length >= 2);
      assert.equal(followers(), 1);
      abort.abort();
      await until(
        t,
        () => followers() === 0,
        () => `the reader outlived its client's socket: ${followers()} left`,
        { everyMs: 20 },
      );
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
