/**
 * `nemia watch` over the api's stream (`GET /api/feed/stream`), against the in-process watch on the same feed (`--local`): a store of the
 * test's own, its feed written by the package's own writer as another process writes it (`emitFeed`, no hub), served by the api spawned
 * with `--no-tick` on a free port, whose url the test writes into the store's lease as a daemon's would be. What `--once` prints, with
 * the operator's selectors and a label a person put on a run (`team=core`), in JSON and in words with the pause standing; a cursor file
 * resumed, and one holding a cursor the feed cannot be read from; the api killed under a running watch and started again; and a selector
 * naming a former reason.
 *
 * Every child is bounded (`timeout`) and killed when its test is done; every wait is on the output it counts, never on a length of time.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { Effect, Layer, Logger } from 'effect';
import { emitFeed, type FeedWords, freshFeedMemo, StoreRoot } from 'agent-orchestrator';
import { ambient } from './ambient.ts';

const CLI = path.join(import.meta.dirname, '..');
const NEMIA = path.join(CLI, 'bin', 'nemia.ts');
const API = path.join(CLI, '..', 'api');

const SCRATCH = scratch('nemia-cli-watch-');

type FeedPause = Parameters<typeof emitFeed>[1] extends infer O ? (O extends { pause?: infer P } ? P : never) : never;

let stores = 0;

/** A store of its own, and a writer of its feed as another process writes it: one pass, every run in the store by id. */
function storeOf() {
  const root = path.join(SCRATCH, `store-${++stores}`);
  fs.mkdirSync(root);
  const memo = freshFeedMemo();
  const pass = (runs: Record<string, FeedWords>, pause?: FeedPause) =>
    Effect.runPromise(
      emitFeed(new Map(Object.entries(runs)), { memo, ...(pause !== undefined ? { pause } : {}) }).pipe(
        Effect.provide(Layer.merge(Logger.layer([]), StoreRoot.layer(root))),
      ),
    );
  const size = () => fs.statSync(path.join(root, 'feed.jsonl')).size;
  return { root, pass, size };
}

const planAt = (word: string, note?: string): FeedWords => ({
  run: { word: 'running' },
  steps: [{ name: 'plan', word, ...(note ? { note } : {}) }],
});

/** A child, its output as it comes, a wait on what it says, and its end; killed when the test is done. */
function child(t: TestContext, proc: ChildProcess) {
  let out = '';
  let err = '';
  const listeners = new Set<() => void>();
  const tell = () => {
    for (const l of listeners) l();
  };
  proc.stdout?.on('data', (c) => ((out += c), tell()));
  proc.stderr?.on('data', (c) => ((err += c), tell()));
  const ended = new Promise<number>((resolve) =>
    proc.on('exit', (code, signal) => resolve(code ?? 128 + (signal ? os.constants.signals[signal] : 0))),
  );
  void ended.then(tell);
  let done = false;
  void ended.then(() => (done = true));
  t.after(() => void proc.kill('SIGKILL'));
  const said = <T>(holds: (out: string, err: string) => T | undefined | false): Promise<T> =>
    new Promise((resolve, reject) => {
      const check = () => {
        const got = holds(out, err);
        if (got !== undefined && got !== false) {
          listeners.delete(check);
          resolve(got);
        } else if (done) {
          listeners.delete(check);
          reject(new Error(`exited without what was waited for:\nstdout: ${out}\nstderr: ${err}`));
        }
      };
      listeners.add(check);
      check();
    });
  return { proc, ended, said, out: () => out, err: () => err };
}

/** The api over `root`, `--no-tick` on a free port, its url written into the store's lease once it listens. */
async function apiOver(t: TestContext, root: string) {
  const env = { ...ambient('NEMIA_ON_INSTALLED'), PORT: '0', WF_ROOT: root, HKB_REPO: root };
  const api = child(t, spawn(process.execPath, ['src/main.ts', '--no-tick'], { cwd: API, env, timeout: 120_000 }));
  const url = await api.said((out) => /api listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(out)?.[1]);
  fs.writeFileSync(path.join(root, 'daemon.json'), `${JSON.stringify({ url })}\n`);
  return { ...api, url };
}

/** `nemia <args>` in the store `root`, starting no daemon. */
const nemia = (t: TestContext, root: string, args: readonly string[]) => {
  const env = { ...ambient(), WF_ROOT: root, NEMIA_DAEMON_START: 'off' };
  return child(t, spawn(process.execPath, [NEMIA, ...args], { cwd: root, env, timeout: 120_000 }));
};

/** `nemia <args>` run to its end: its code and what it printed. */
const ran = async (t: TestContext, root: string, args: readonly string[]) => {
  const c = nemia(t, root, args);
  const code = await c.ended;
  return { code, out: c.out(), err: c.err() };
};

/** The JSON lines of `out`. */
const json = (out: string): Array<Record<string, unknown>> =>
  out
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>);

/** `words` of the run `id` stamped with the label a person put on it, `team=core`, as the tick stamps a run's lines with its labels. */
const teamCore = (id: string, words: FeedWords): FeedWords => ({
  ...words,
  labels: { run: id, team: 'core' },
  steps: words.steps.map((s) => ({ ...s, labels: { run: id, step: s.name, team: 'core' } })),
});

/**
 * A store with the operator's lines among others: a gate that waits on a person, the pause put and lifted, and runs at work, `r-2`'s
 * lines labelled `team=core` by a person.
 */
async function seeded() {
  const store = storeOf();
  await store.pass({ 'r-1': planAt('running'), 'r-2': teamCore('r-2', planAt('running')) });
  await store.pass(
    { 'r-1': planAt('awaiting approval', 'approve it: nemia approve r-1 plan'), 'r-2': teamCore('r-2', planAt('running')) },
    {
      at: '2026-11-01T10:00:00.000Z',
      by: 'ann',
      why: 'merging by hand',
    },
  );
  await store.pass(
    { 'r-1': planAt('awaiting approval', 'approve it: nemia approve r-1 plan'), 'r-2': teamCore('r-2', planAt('succeeded')) },
    null,
  );
  return store;
}

const OPERATOR = ['-l', 'waits=person', '-l', 'kind=Store'];

test('`nemia watch --once` over the api prints what the in-process watch prints of the same feed: the lines, the bookmark, the pause', async (t) => {
  const store = await seeded();
  await apiOver(t, store.root);
  const served = await ran(t, store.root, ['watch', '--once', ...OPERATOR, '--json']);
  const local = await ran(t, store.root, ['watch', '--once', ...OPERATOR, '--json', '--local']);
  assert.equal(served.code, 0, served.err);
  assert.equal(local.code, 0, local.err);
  assert.equal(served.out, local.out, 'the same lines, each with its cursor, and the same last bookmark');
  const lines = json(served.out);
  assert.equal(lines.length, 4, `the gate, the pause put and lifted, and the bookmark: ${served.out}`);
  assert.deepEqual(lines.at(-1), { cursor: store.size() }, "the bookmark at the feed's end");

  const team = await ran(t, store.root, ['watch', '--once', '-l', 'team=core', '--json']);
  const teamLocal = await ran(t, store.root, ['watch', '--once', '-l', 'team=core', '--json', '--local']);
  assert.equal(team.code, 0, `a person's key is a selector the api takes: ${team.err}`);
  assert.equal(team.out, teamLocal.out, "the same lines of a person's key");
  const taken = json(team.out).filter((l) => !('cursor' in l && Object.keys(l).length === 1));
  assert.ok(taken.length > 0, `the lines of the run labelled team=core: ${team.out}`);
  assert.ok(
    taken.every((l) => (l as { labels?: { run?: string } }).labels?.run === 'r-2'),
    `only the labelled run's lines: ${team.out}`,
  );

  const paused = await ran(t, store.root, ['pause', '--why', 'held for the watch']);
  assert.equal(paused.code, 0, paused.err);
  const plain = await ran(t, store.root, ['watch', '--once', ...OPERATOR]);
  const plainLocal = await ran(t, store.root, ['watch', '--once', ...OPERATOR, '--local']);
  assert.equal(plain.code, 0, plain.err);
  assert.equal(plain.out, plainLocal.out, 'in words: the pause standing, the lines, and `cursor: <n>`');
  assert.match(plain.out.split('\n')[0] ?? '', /held for the watch/, 'the pause first');
  assert.match(plain.out, new RegExp(`cursor: ${store.size()}\\n$`));
});

test('`--once` with no api answering at the lease is refused, naming the read in process, where the in-process watch reads the file', async (t) => {
  const store = await seeded();
  const api = await apiOver(t, store.root);
  api.proc.kill('SIGTERM');
  await api.ended;
  const served = await ran(t, store.root, ['watch', '--once', '--json']);
  assert.equal(served.code, 2, `REFUSED: the watch reads the api, and none answers: ${served.out}`);
  assert.match(served.err, /--local/);
  assert.equal((await ran(t, store.root, ['watch', '--once', '--json', '--local'])).code, 0);
});

test('`--cursor-file` resumes from the saved cursor, no line twice; a cursor typed beside it is refused, naming what to drop', async (t) => {
  const store = await seeded();
  await apiOver(t, store.root);
  const file = path.join(store.root, 'cursor');
  const first = await ran(t, store.root, ['watch', '--once', '--json', '--cursor-file', file]);
  assert.equal(first.code, 0, first.err);
  assert.equal(fs.readFileSync(file, 'utf8'), `${store.size()}\n`, "the file at the feed's end");
  await store.pass({ 'r-1': planAt('succeeded'), 'r-2': teamCore('r-2', planAt('succeeded')) });
  const second = await ran(t, store.root, ['watch', '--once', '--json', '--cursor-file', file]);
  assert.equal(second.code, 0, second.err);
  const whole = await ran(t, store.root, ['watch', '--once', '--json', '--local']);
  const said = [...json(first.out), ...json(second.out)].filter((l) => 'at' in l);
  assert.deepEqual(
    said,
    json(whole.out).filter((l) => 'at' in l),
    'the two reads together are the feed whole, each line once',
  );
  assert.ok(json(second.out).filter((l) => 'at' in l).length >= 1, 'the second read has the lines written between');
  assert.equal(fs.readFileSync(file, 'utf8'), `${store.size()}\n`);

  const both = await ran(t, store.root, ['watch', '0', '--once', '--cursor-file', file]);
  assert.equal(both.code, 2, 'REFUSED: a cursor and a cursor file');
  assert.match(both.err, /--cursor-file/);
});

test('a saved cursor the feed cannot be read from restarts the watch at 0, said once on stderr, and the file kept at its end', async (t) => {
  const store = await seeded();
  await apiOver(t, store.root);
  const file = path.join(store.root, 'cursor');
  fs.writeFileSync(file, '5\n');
  const got = await ran(t, store.root, ['watch', '--once', '--json', '--cursor-file', file]);
  assert.equal(got.code, 0, got.err);
  assert.equal(got.err.match(/held cursor 5/g)?.length, 1, `said once: ${got.err}`);
  assert.match(got.err, /nemia watch/);
  const whole = await ran(t, store.root, ['watch', '--once', '--json', '--local']);
  assert.equal(got.out, whole.out, 'the feed from its start');
  assert.equal(fs.readFileSync(file, 'utf8'), `${store.size()}\n`);
});

test(
  'the api killed under a running watch is said `down`; started again it is said `up`, and the watch reads on with no line lost or repeated',
  { timeout: 90_000 },
  async (t) => {
    const store = await seeded();
    let api = await apiOver(t, store.root);
    const file = path.join(store.root, 'cursor');
    const watch = nemia(t, store.root, ['watch', '--json', '--cursor-file', file]);
    const atEnd = (end: number) => (out: string) => json(out).some((l) => l.cursor === end) || undefined;
    await watch.said(atEnd(store.size()));
    assert.match(watch.err(), /from 0\b/, 'the banner on stderr under --json');

    api.proc.kill('SIGTERM');
    await api.ended;
    await watch.said((out) => json(out).some((l) => l.liveness === 'down') || undefined);
    await store.pass({ 'r-1': planAt('failed'), 'r-2': teamCore('r-2', planAt('succeeded')) });
    api = await apiOver(t, store.root);
    await watch.said((out) => json(out).some((l) => l.liveness === 'up') || undefined);
    await watch.said(atEnd(store.size()));

    const printed = json(watch.out());
    const liveness = printed.filter((l) => 'liveness' in l).map((l) => l.liveness);
    assert.deepEqual(liveness, ['down', 'up'], 'down once, up once');
    const lines = printed.filter((l) => 'at' in l && !('liveness' in l));
    const whole = json((await ran(t, store.root, ['watch', '--once', '--json', '--local'])).out).filter((l) => 'at' in l);
    assert.deepEqual(lines, whole, 'every line of the feed once, in order, across the restart');
    assert.equal(fs.readFileSync(file, 'utf8'), `${store.size()}\n`);

    watch.proc.kill('SIGINT');
    assert.equal(await watch.ended, 130, 'a signal ends the watch at 128 and its number');
  },
);

test('a selector naming a former reason prints its hint on stderr, as the in-process watch does', async (t) => {
  const store = await seeded();
  await apiOver(t, store.root);
  const served = await ran(t, store.root, ['watch', '--once', '-l', 'reason=NeedsHuman']);
  const local = await ran(t, store.root, ['watch', '--once', '-l', 'reason=NeedsHuman', '--local']);
  assert.equal(served.code, 0, served.err);
  assert.match(served.err, /NeedsHuman/, 'the hint names the former word');
  assert.match(served.err, /reason=AwaitingAnswer/, 'and the selector to type');
  assert.equal(served.err, local.err, 'the same hint, once');
  assert.equal(served.out, local.out);

  const refused = await ran(t, store.root, ['watch', '--once', '-l', 'no/pe=x']);
  assert.equal(refused.code, 2, 'REFUSED: a key no label is spelled');
  assert.match(refused.err, /no\/pe/);
  assert.equal(refused.out, '');
});
