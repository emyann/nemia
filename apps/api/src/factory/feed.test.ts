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
import { type Duration, Effect, Layer, Logger, Metric, Stream } from 'effect';
import { app, appOf, liveOf, runtime } from '../app.ts';
import { Beats } from '../layer.ts';
import { feedEvents, OPENED } from './feed.ts';
import {
  BOOKMARK_EVERY,
  emitFeed,
  FEED_FOLLOWERS,
  feedFile,
  type FeedLine,
  freshFeedMemo,
  parseSelectors,
  readFeed,
  type Selectors,
} from 'agent-orchestrator';

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
/** A run running, at each step named, all at `running`: the words a pass hands the feed for it. */
const steps = (...named: readonly string[]): FeedWords => ({
  run: { word: 'running' },
  steps: named.map((name) => ({ name, word: 'running' })),
});

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
const open = async (query = '', headers: Record<string, string> = {}, over: { request: typeof app.request } = app) => {
  const res = await over.request(`${STREAM}${query}`, { headers });
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

test("the store's pause put and lifted, as the tick writes them, are each sent as a store event, its data the line whole", WAITED, async (t) => {
  const pass = emptyFeed();
  await pass({ 'r-1': planAt('running') });
  const memo = freshFeedMemo();
  const at = '2026-10-23T06:00:00.000Z';
  for (const pause of [{ at }, null])
    await runtime.runPromise(
      emitFeed(new Map([['r-1', planAt('running')]]), { memo, pause }).pipe(Effect.provide(Logger.layer([]))),
    );
  const lines = readFeed(0).lines;
  const opened = await open();
  const all = await readUntil(t, opened.reader, opened.text, (s) => s.length >= 4);
  await opened.reader.cancel();
  assert.deepEqual(
    all.map((b) => b.event),
    ['run', 'step', 'store', 'store'],
    'a line of no run and no step is the store’s, never a run event',
  );
  assert.deepEqual(
    all.slice(2).map((b) => JSON.parse(b.data!).reason),
    ['StorePaused', 'StoreResumed'],
  );
  assert.equal(all[3].data, JSON.stringify(lines.at(-1)));
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

test('`from=end` starts the stream at the feed as it stands: none of the lines it holds, and the next one written', WAITED, async (t) => {
  const pass = emptyFeed();
  await pass({ 'r-1': planAt('running') });
  const { reader, text } = await open('?from=end');
  try {
    const [gate] = await pass({ 'r-1': planAt('awaiting approval', 'approve it: nemia approve r-1 plan') });
    const said = await readUntil(t, reader, text, (s) => s.length >= 1);
    assert.deepEqual(
      said,
      [{ event: 'step', data: JSON.stringify(gate), id: String(end()) }],
      'the line written after it opened, and nothing of the feed it opened on',
    );
  } finally {
    await reader.cancel();
  }
});

test('a cursor wins over `from=end`: a Last-Event-ID resumes where its reader was, and the lines after it are sent', WAITED, async (t) => {
  const pass = emptyFeed();
  await pass({ 'r-1': planAt('running') });
  const size = end();
  const { reader, text } = await open('?from=end', { 'Last-Event-ID': '0' });
  try {
    const said = await readUntil(t, reader, text, (s) => s.at(-1)?.id === String(size));
    assert.ok(said.length >= 1, 'the feed from the cursor, not from its end: an EventSource reconnecting misses nothing');
    assert.equal(said.at(-1)!.id, String(size), 'read to the end of the feed it opened on');
  } finally {
    await reader.cancel();
  }
});

test('REFUSED: a `from` that is not `end` is a 400 before the stream opens, saying `end` is the one value it takes', async () => {
  const pass = emptyFeed();
  await pass({ 'r-1': planAt('running') });
  for (const raw of ['start', '0', 'END', '']) {
    const res = await app.request(`${STREAM}?from=${raw}`);
    const where = `?from=${raw}`;
    assert.equal(res.status, 400, where);
    assert.match(res.headers.get('content-type') ?? '', /^application\/json/, `${where}: an answer, not a stream`);
    const { error } = (await res.json()) as { error: string };
    assert.equal(
      error,
      `\`${raw}\` is not a start this feed takes: \`from=end\` starts at the feed's end, which is the one value \`from\` takes; pass none to read the feed from the start, or a cursor this stream gave as \`after\`.`,
      where,
    );
  }
  const taken = await open('?from=end');
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

/** The reader's beat the test below gives its app (`Beats.feed`): a few of them are waited for, never the package's seconds. */
const BEAT_MS = 100;

test(
  'a read that fails is said once, `retrying`, and cleared by the first read that works, before the lines it found',
  WAITED,
  async (t) => {
    if (process.getuid?.() === 0) return t.skip('a mode of 200 does not keep root from reading');
    assert.ok(BEAT_MS < 1_000, "the reader's beat shorter than the package's own second (`followFeed`), never longer");
    const own = appOf(Layer.merge(liveOf(), Layer.succeed(Beats)({ ...Beats.defaultValue(), feed: `${BEAT_MS} millis` })));
    t.after(() => own.runtime.dispose());
    const pass = emptyFeed();
    const [first] = await pass({ 'r-1': planAt('running') });
    await until(
      t,
      () => followers() === 0,
      () => `${followers()} readers left behind by the tests before this one`,
      { everyMs: 20 },
    );
    const { reader, text } = await open(`?after=${end()}`, {}, own.app);
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
        await new Promise((r) => setTimeout(r, BEAT_MS * 5));
      } finally {
        fs.chmodSync(feedFile(), 0o644);
      }
      const cleared = await readUntil(t, reader, text, (s) => s.length >= 3);
      assert.deepEqual(
        cleared.map((b) => b.event),
        ['unreadable', 'readable', 'step'],
        "said once over more than two of the reader's beats, each failing again, then cleared by the next read that works, before the line it found; an absence, so a bound of time is all there is, and a slow machine makes it prove less, never fail",
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

/**
 * Every line of the feed as a stream sends it, in order: the signed line (`readFeed`) as its data, and the cursor just after it as its
 * id, counted off the file's own bytes — so a test names what a selector must keep and what it must drop by the feed itself.
 */
const everySent = (): { line: FeedLine; sent: { data: string; id: string } }[] => {
  const raw = fs
    .readFileSync(feedFile(), 'utf8')
    .split('\n')
    .filter((l) => l.trim());
  let cursor = 0;
  return readFeed(0).lines.map((line, i) => {
    cursor += Buffer.byteLength(raw[i], 'utf8') + 1;
    return { line, sent: { data: JSON.stringify(line), id: String(cursor) } };
  });
};

/** What a stream sent, by data and id alone: what a selector keeps, without the event name each line's own test holds. */
const sentOf = (said: Block[]): { data: string; id: string }[] => said.map((b) => ({ data: b.data!, id: b.id! }));

/** The label a line carries under `key`, or undefined: what a selector reads of it. */
const labelOf = (line: FeedLine, key: string): string | undefined => (line as { labels?: Record<string, string> }).labels?.[key];

/**
 * What `feedEvents` sends from `from` under `selectors`, up to and including the first bookmark, at a cadence of the test's own. The wait
 * is the stream's: it ends on the event it counts, never on a length of time.
 */
const untilBookmark = (from: number, selectors: Selectors, every: Duration.Input) =>
  runtime.runPromise(Stream.runCollect(Stream.takeUntil(feedEvents(from, selectors, every), (m) => m.event === 'bookmark')));

test(
  'a selector sends only the lines it takes, each with its own cursor as its id, and the lines between them are not sent',
  WAITED,
  async (t) => {
    const pass = emptyFeed();
    await pass({ 'r-a': planAt('running') });
    await pass({ 'r-a': planAt('running'), 'r-b': planAt('running') });
    await pass({ 'r-a': planAt('succeeded'), 'r-b': planAt('running') });
    const every = everySent();
    const mine = every.filter((l) => labelOf(l.line, 'run') === 'r-a');
    assert.equal(mine.length, 3, "three of run a's lines");
    assert.ok(
      every.some((l, i) => labelOf(l.line, 'run') === 'r-b' && i > 0 && i < every.length - 1),
      "run b's lines are written between run a's, so a stream that sent the feed whole would carry them",
    );

    const { reader, text } = await open('?selector=run%3Dr-a');
    try {
      const said = await readUntil(t, reader, text, (s) => s.length >= 3);
      assert.deepEqual(
        sentOf(said),
        mine.map((l) => l.sent),
        "run a's lines alone, each its own line's cursor as its id, with no line of run b's among them",
      );
      assert.equal(
        said.filter((b) => labelOf(JSON.parse(b.data!) as FeedLine, 'run') === 'r-b').length,
        0,
        "a line the selector does not take never crosses the wire: run b's are dropped at the source",
      );
    } finally {
      await reader.cancel();
    }
  },
);

test(
  'every clause of one selector must hold, and one selector of those given: a comma ands, and `selector` again ors',
  WAITED,
  async (t) => {
    const pass = emptyFeed();
    await pass({ 'r-a': steps('plan') });
    await pass({ 'r-a': steps('plan', 'review') });
    await pass({ 'r-a': steps('plan', 'review'), 'r-b': steps('review') });
    const every = everySent();
    const anded = every.filter((l) => labelOf(l.line, 'run') === 'r-a' && labelOf(l.line, 'step') === 'review');
    const ored = every.filter((l) => labelOf(l.line, 'run') === 'r-a' || labelOf(l.line, 'step') === 'review');
    assert.equal(anded.length, 1, "run a at review alone: run a's other lines and run b's review line are the fixture");
    assert.equal(ored.length, 4, "run a's three lines and run b's review line");

    const and = await open('?selector=run%3Dr-a,step%3Dreview');
    try {
      const said = await readUntil(t, and.reader, and.text, (s) => s.length >= 1);
      assert.deepEqual(
        sentOf(said),
        anded.map((l) => l.sent),
        "the clauses of one selector both hold of the line it takes: run a's own run line, which carries no step, is not sent",
      );
    } finally {
      await and.reader.cancel();
    }

    const or = await open('?selector=run%3Dr-a&selector=step%3Dreview');
    try {
      const said = await readUntil(t, or.reader, or.text, (s) => s.length >= 4);
      assert.deepEqual(
        sentOf(said),
        ored.map((l) => l.sent),
        "one selector of the two holds: run a's lines and run b's review line, and nothing else",
      );
    } finally {
      await or.reader.cancel();
    }
  },
);

test(
  "a bookmark says where the stream has read to: the feed's own cursor, past a line the selector dropped, as its id, with an empty data field",
  WAITED,
  async (t) => {
    const pass = emptyFeed();
    await pass({ 'r-a': planAt('running') });
    await pass({ 'r-a': planAt('running'), 'r-b': planAt('running') });
    const mine = everySent().filter((l) => labelOf(l.line, 'run') === 'r-a');
    await until(
      t,
      () => followers() === 0,
      () => `${followers()} readers left behind by the tests before this one`,
      { everyMs: 20 },
    );

    const got = await untilBookmark(0, parseSelectors(['run=r-a']), '200 millis');
    const marked = got.at(-1)!;
    assert.equal(marked.event, 'bookmark', 'the stream of a silent feed says where it is, named');
    assert.equal(marked.data, '', 'the field present and empty: an EventSource both keeps the id and dispatches the event');
    assert.match(String(marked.id), /^\d+$/);
    assert.equal(
      marked.id,
      String(end()),
      "the cursor advanced past run b's lines, which the selector dropped: a reader resuming here re-reads none of them",
    );
    assert.notEqual(
      marked.id,
      mine.at(-1)!.sent.id,
      "not the cursor after the last line the selector took, which is short of the feed's end",
    );
    assert.deepEqual(
      got.slice(0, -1).map((m) => ({ data: m.data, id: m.id! })),
      mine.map((l) => l.sent),
      "run a's lines alone before it",
    );
    await until(
      t,
      () => followers() === 0,
      () => `the reader outlived the stream that ended on its bookmark: ${followers()} left`,
      { everyMs: 20 },
    );
  },
);

test(
  'a stream resumes after a bookmark: its id taken back as Last-Event-ID resends nothing, and the next line arrives',
  WAITED,
  async (t) => {
    const pass = emptyFeed();
    await pass({ 'r-a': planAt('running') });
    await pass({ 'r-a': planAt('running'), 'r-b': planAt('running') });
    const got = await untilBookmark(0, parseSelectors(['run=r-a']), '200 millis');
    const marked = got.at(-1)!;
    assert.equal(marked.event, 'bookmark');

    const again = await open('?selector=run%3Dr-a', { 'Last-Event-ID': marked.id! });
    try {
      const [next] = await pass({ 'r-a': planAt('succeeded'), 'r-b': planAt('running') });
      const said = await readUntil(t, again.reader, again.text, (s) => s.length >= 1);
      assert.deepEqual(
        sentOf(said),
        [{ data: JSON.stringify(next), id: String(end()) }],
        'what was written after the bookmark, and none of the lines before it',
      );
    } finally {
      await again.reader.cancel();
    }

    const fresh = emptyFeed();
    const first = await untilBookmark(0, parseSelectors(['run=r-a']), '200 millis');
    assert.equal(first.at(-1)!.id, '0', 'a bookmark before any line carries the cursor the stream started from');
    const empty = await open('', { 'Last-Event-ID': first.at(-1)!.id! });
    await empty.reader.cancel();
    await fresh({ 'r-a': planAt('running') });
  },
);

test('a selector the grammar takes opens the stream: a bare key sends the lines that carry it', WAITED, async (t) => {
  const pass = emptyFeed();
  await pass({ 'r-a': planAt('running') });
  const carried = everySent().filter((l) => labelOf(l.line, 'run') !== undefined);
  assert.ok(carried.length >= 1, 'the feed has lines carrying a run');
  const { reader, text } = await open('?selector=run');
  try {
    const said = await readUntil(t, reader, text, (s) => s.length >= carried.length);
    assert.deepEqual(
      sentOf(said),
      carried.map((l) => l.sent),
    );
  } finally {
    await reader.cancel();
  }
});

test(
  'REFUSED: a selector the grammar refuses is a 422 naming it and how this stream is asked for one, with no stream opened',
  WAITED,
  async (t) => {
    const pass = emptyFeed();
    await pass({ 'r-1': planAt('running') });
    await until(
      t,
      () => followers() === 0,
      () => `${followers()} readers left behind by the tests before this one`,
      { everyMs: 20 },
    );
    const cases: [string, RegExp][] = [
      ['?selector=message%3Dhi', /^"message" is no key of a feed line: a selector names one of /],
      ['?selector=run%3D%3Da', /compares with ==, and a selector compares with one =/],
      ['?selector=run%20in%20a', /names a list and spells it with no \(values\) after in/],
      ['?selector=', /is no selector: it holds no clause/],
      ['?selector=run%3Dr-1&selector=nope%3Dx', /^"nope" is no key of a feed line/],
    ];
    for (const [query, pattern] of cases) {
      const res = await app.request(`${STREAM}${query}`);
      if (res.status !== 422) await res.body?.cancel();
      assert.equal(res.status, 422, `${query}: a stream opened for it is let go, and the refusal is what this test waits on`);
      assert.match(res.headers.get('content-type') ?? '', /^application\/json/, `${query}: an answer, not a stream`);
      const { error } = (await res.json()) as { error: string };
      assert.match(error, pattern, query);
      assert.match(
        error,
        /\. A selector reaches this stream as `selector`, given again for another selector, of which one must hold; pass none to follow every line\.$/,
        `${query}: the package's words, which end on its key list, closed by a full stop before the api's own sentence`,
      );
    }
    assert.equal(followers(), 0, 'no reader was started for a selector the grammar refuses: it is answered before the stream opens');
  },
);

test('the stream says where it has read to at the one cadence every surface reads, and the api spells no length of its own', () => {
  const source = fs.readFileSync(new URL('./feed.ts', import.meta.url), 'utf8');
  assert.match(
    source,
    /bookmarkEvery:\s*Duration\.Input\s*=\s*BOOKMARK_EVERY/,
    "the shipped cadence is the package's constant, read by every surface that follows the feed",
  );
  assert.equal(
    source.match(/'-?\d+(\.\d+)? (nanos|micros|millis|seconds|minutes|hours|days|weeks)'/g),
    null,
    'and the api spells no cadence of its own, which would be a second cadence to drift',
  );
  assert.equal(typeof BOOKMARK_EVERY, 'string', 'the constant the package owns');
});

test("the tick's first beat is dropped: no bookmark comes among the lines the feed already holds when the stream opens", async () => {
  const pass = emptyFeed();
  await pass({ 'r-a': planAt('running') });
  const every = everySent();
  assert.equal(every.length, 2, 'two lines are written before the stream is subscribed, and one read hands both on');
  const got = await untilBookmark(0, [], '200 millis');
  assert.deepEqual(
    got.map((m) => [m.event, m.id]),
    [
      ['run', every[0].sent.id],
      ['step', every[1].sent.id],
      ['bookmark', every[1].sent.id],
    ],
    'both lines, then the beat: a first beat not dropped comes at subscription, and lands between the two lines the first read hands on',
  );
});
