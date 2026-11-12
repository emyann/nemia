/**
 * `nemia channel`, the feed pushed into a Claude Code session: the channel spawned as Claude Code spawns it, a stdio subprocess, and read
 * by the SDK's MCP client over its pipes (`piped`, a transport of the test's own, so the test holds the child's exit code and stderr), on a
 * store of the test's own whose feed the package's own writer writes (`emitFeed`), served by the api spawned with `--no-tick` on a free
 * port, its url written into the store's lease as a daemon's would be. What the server declares; a line written after the start sent as
 * one notification of the Event, and none written before; a selector; a cursor file resumed with no line lost or repeated, and past the
 * resume cap one notice in place of the lines; a saved cursor the feed cannot be read from; the api killed under the channel and started
 * again; and the refusals, exit 2.
 *
 * Every child is bounded (`timeout`) and killed when its test is done; every wait is on what it counts, never on a length of time.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, type JSONRPCMessage, ReadBuffer, serializeMessage, type Transport } from '@modelcontextprotocol/client';
import { scratch } from 'test-kit/scratch';
import { Effect, Layer, Logger } from 'effect';
import { emitFeed, type FeedWords, freshFeedMemo, StoreRoot } from 'agent-orchestrator';
import { ambient } from './ambient.ts';

const CLI = path.join(import.meta.dirname, '..');
const NEMIA = path.join(CLI, 'bin', 'nemia.ts');
const API = path.join(CLI, '..', 'api');
const CHANNEL_METHOD = 'notifications/claude/channel';

const SCRATCH = scratch('nemia-cli-channel-');

let stores = 0;

/**
 * A store of its own, a writer of its feed as another process writes it (one pass, every run in the store by id), the feed's size, and
 * how many lines it holds after a byte.
 */
function storeOf() {
  const root = path.join(SCRATCH, `store-${++stores}`);
  fs.mkdirSync(root);
  const memo = freshFeedMemo();
  const pass = (runs: Record<string, FeedWords>) =>
    Effect.runPromise(
      emitFeed(new Map(Object.entries(runs)), { memo }).pipe(Effect.provide(Layer.merge(Logger.layer([]), StoreRoot.layer(root)))),
    );
  const feed = path.join(root, 'feed.jsonl');
  const size = () => fs.statSync(feed).size;
  const linesAfter = (from: number) => fs.readFileSync(feed).subarray(from).toString('utf8').split('\n').filter(Boolean).length;
  return { root, pass, size, linesAfter };
}

const stepAt = (word: string, note?: string): FeedWords => ({
  run: { word: 'running' },
  steps: [{ name: 'plan', word, ...(note ? { note } : {}) }],
});

/** `words` of the run `id` stamped with the label a person put on it, `team=core`. */
const teamCore = (id: string, words: FeedWords): FeedWords => ({
  ...words,
  labels: { run: id, team: 'core' },
  steps: words.steps.map((s) => ({ ...s, labels: { run: id, step: s.name, team: 'core' } })),
});

/** A wait on `holds` over what changes, told by `tell`, rejected once `done` says the source ended. */
function waiter(done: () => boolean, describe: () => string) {
  const listeners = new Set<() => void>();
  const tell = () => {
    for (const l of listeners) l();
  };
  const until = <T>(holds: () => T | undefined | false): Promise<T> =>
    new Promise((resolve, reject) => {
      const check = () => {
        const got = holds();
        if (got !== undefined && got !== false) {
          listeners.delete(check);
          resolve(got);
        } else if (done()) {
          listeners.delete(check);
          reject(new Error(`ended without what was waited for:\n${describe()}`));
        }
      };
      listeners.add(check);
      check();
    });
  return { tell, until };
}

/** A child, its output as it comes, a wait on what it says, and its end; killed when the test is done. */
function child(t: TestContext, proc: ChildProcess) {
  let out = '';
  let err = '';
  let done = false;
  const w = waiter(
    () => done,
    () => `stdout: ${out}\nstderr: ${err}`,
  );
  proc.stdout?.on('data', (c) => ((out += c), w.tell()));
  proc.stderr?.on('data', (c) => ((err += c), w.tell()));
  const ended = new Promise<number>((resolve) =>
    proc.on('exit', (code, signal) => resolve(code ?? 128 + (signal ? os.constants.signals[signal] : 0))),
  );
  void ended.then(() => ((done = true), w.tell()));
  t.after(() => void proc.kill('SIGKILL'));
  const said = <T>(holds: (out: string, err: string) => T | undefined | false) => w.until(() => holds(out, err));
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

/**
 * A config folder of no context: `ambient()` drops `XDG_CONFIG_HOME`, which leaves the person's own config under `~/.config`, whose
 * token kept for `local` the test's api never minted.
 */
const NO_CONFIG = scratch('nemia-cli-channel-config-');

/** `nemia <args>` in the store `root`, starting no daemon, its stdin a pipe, reading no config of the person's. */
const nemia = (t: TestContext, root: string, args: readonly string[], env: NodeJS.ProcessEnv = {}) =>
  child(
    t,
    spawn(process.execPath, [NEMIA, ...args], {
      cwd: root,
      env: { ...ambient(), WF_ROOT: root, NEMIA_DAEMON_START: 'off', XDG_CONFIG_HOME: NO_CONFIG, ...env },
      timeout: 120_000,
    }),
  );

/** A transport of the MCP client over a child's pipes, as Claude Code's stdio transport speaks to the server it spawned. */
function piped(proc: ChildProcess): Transport {
  const buffer = new ReadBuffer();
  const transport: Transport = {
    start: async () => {
      proc.stdout?.on('data', (chunk: Buffer) => {
        buffer.append(chunk);
        for (let message = buffer.readMessage(); message !== null; message = buffer.readMessage()) transport.onmessage?.(message);
      });
      proc.on('exit', () => transport.onclose?.());
    },
    send: (message: JSONRPCMessage) =>
      new Promise<void>((resolve, reject) => proc.stdin?.write(serializeMessage(message), (e) => (e ? reject(e) : resolve()))),
    close: async () => void proc.stdin?.end(),
  };
  return transport;
}

/** A notification of the channel: its body and its attributes. */
type Notice = { content: string; meta: Record<string, string> };

/**
 * `nemia channel <args>` connected to an MCP client, the notifications it sends as they come, and a wait until what they hold is there
 * (`got`), rejected where the channel ends without it.
 */
async function channel(t: TestContext, root: string, args: readonly string[], env: NodeJS.ProcessEnv = {}) {
  const c = nemia(t, root, ['channel', ...args], env);
  const notices: Notice[] = [];
  const w = waiter(
    () => false,
    () => JSON.stringify(notices),
  );
  const client = new Client({ name: 'channel-test', version: '0' });
  client.fallbackNotificationHandler = async (n) => {
    if (n.method === CHANNEL_METHOD) notices.push(n.params as Notice);
    w.tell();
  };
  void c.ended.then(w.tell);
  await client.connect(piped(c.proc));
  t.after(() => client.close().catch(() => undefined));
  const got = <T>(holds: (all: readonly Notice[]) => T | undefined | false): Promise<T> =>
    Promise.race([w.until(() => holds(notices)), c.ended.then(() => holds(notices) || Promise.reject(new Error(`ended: ${c.err()}`)))]);
  return { ...c, client, notices, got };
}

/** The Events among `notices`, those that carry a `resource_version`. */
const events = (notices: readonly Notice[]) => notices.filter((n) => n.meta.resource_version !== undefined);

/** Waits until the channel says on stderr it opened its watch from `at`. */
const followingFrom = (c: { said: ReturnType<typeof child>['said'] }, at: number) =>
  c.said((_out, err) => new RegExp(`from resourceVersion ${at}\\b`).test(err) || undefined);

test('the channel declares claude/channel and no tools, and its instructions name the attributes', async (t) => {
  const store = storeOf();
  await store.pass({ 'r-1': stepAt('running') });
  await apiOver(t, store.root);
  const c = await channel(t, store.root, ['-l', 'waits=person']);
  const capabilities = c.client.getServerCapabilities();
  assert.deepEqual(capabilities?.experimental?.['claude/channel'], {}, 'the channel capability');
  assert.equal(capabilities?.tools, undefined, 'no tools: a one-way channel');
  const instructions = c.client.getInstructions() ?? '';
  for (const name of ['reason', 'involved_name', 'involved_kind', 'resource_version', 'waits', 'notice'])
    assert.match(instructions, new RegExp(`\\b${name}\\b`), name);
  assert.match(instructions, /waits=person/, 'the selectors it follows');
});

test('started with no cursor file, a line written after the start arrives as one notification of its Event; one before does not', async (t) => {
  const store = storeOf();
  await store.pass({ 'r-1': stepAt('running') });
  const api = await apiOver(t, store.root);
  const before = store.size();
  const c = await channel(t, store.root, []);
  await followingFrom(c, before);
  await store.pass({ 'r-1': stepAt('awaiting approval', 'approve it: nemia approve r-1 plan') });
  const [first] = await c.got((all) => (events(all).length > 0 ? events(all) : undefined));
  const event = (await (await fetch(`${api.url}/api/events/${before}`)).json()) as {
    message: string;
    reason: string;
    involved: { name: string };
    metadata: { resourceVersion: string };
  };
  assert.equal(first?.content, event.message, "the body is the Event's message");
  assert.equal(first?.meta.reason, event.reason);
  assert.equal(first?.meta.involved_name, event.involved.name);
  assert.equal(first?.meta.resource_version, event.metadata.resourceVersion, 'the cursor just after the line');
  assert.ok(
    events(c.notices).every((n) => Number(n.meta.resource_version) > before),
    'no line written before the start',
  );
  assert.ok(
    Object.keys(first?.meta ?? {}).every((key) => /^[A-Za-z0-9_]+$/.test(key)),
    `each attribute an identifier: ${Object.keys(first?.meta ?? {})}`,
  );
});

test('with -l a selector, a line the selector does not take does not arrive', async (t) => {
  const store = storeOf();
  await store.pass({ 'r-1': stepAt('running'), 'r-2': teamCore('r-2', stepAt('running')) });
  await apiOver(t, store.root);
  const c = await channel(t, store.root, ['-l', 'team=core']);
  await followingFrom(c, store.size());
  await store.pass({ 'r-1': stepAt('succeeded'), 'r-2': teamCore('r-2', stepAt('succeeded')) });
  await store.pass({ 'r-1': stepAt('succeeded'), 'r-2': teamCore('r-2', stepAt('failed')) });
  await c.got((all) => events(all).some((n) => n.meta.involved_name.startsWith('r-2') && /fail/i.test(n.meta.reason)) || undefined);
  assert.ok(
    events(c.notices).every((n) => n.meta.involved_name.startsWith('r-2')),
    `only the labelled run's lines: ${JSON.stringify(c.notices)}`,
  );
});

test('with --cursor-file, a channel killed and started again delivers the lines written while it was down, once each', async (t) => {
  const store = storeOf();
  await store.pass({ 'r-1': stepAt('running') });
  await apiOver(t, store.root);
  const file = path.join(store.root, 'cursor');
  const start = store.size();
  const first = await channel(t, store.root, ['--cursor-file', file]);
  await followingFrom(first, start);
  await store.pass({ 'r-1': stepAt('awaiting approval', 'approve it: nemia approve r-1 plan') });
  await first.got((all) => events(all).length > 0 || undefined);
  first.proc.kill('SIGTERM');
  await first.ended;
  const down = store.size();
  await store.pass({ 'r-1': stepAt('succeeded') });
  assert.ok(store.size() > down, 'lines written while it was down');
  const second = await channel(t, store.root, ['--cursor-file', file]);
  await second.got((all) => events(all).some((n) => Number(n.meta.resource_version) === store.size()) || undefined);
  const said = [...events(first.notices), ...events(second.notices)].map((n) => Number(n.meta.resource_version));
  assert.equal(said.length, store.linesAfter(start), 'every line written since the first start');
  assert.deepEqual(
    said,
    [...new Set(said)].sort((a, b) => a - b),
    'each once, in order',
  );
  second.proc.kill('SIGTERM');
  assert.equal(await second.ended, 143, 'a signal ends the channel at 128 and its number');
  assert.equal(fs.readFileSync(file, 'utf8').trim(), String(store.size()), "the cursor at the feed's end, kept once its line was sent");
});

test('resumed past the cap, one notice with the count in place of the lines, then the later lines', async (t) => {
  const store = storeOf();
  await store.pass({ 'r-1': stepAt('running') });
  await apiOver(t, store.root);
  const file = path.join(store.root, 'cursor');
  fs.writeFileSync(file, `${store.size()}\n`);
  const saved = store.size();
  await store.pass({ 'r-1': stepAt('awaiting approval', 'approve it'), 'r-2': stepAt('running'), 'r-3': stepAt('running') });
  const skipped = store.linesAfter(saved);
  assert.ok(skipped > 2, `more lines than the cap: ${skipped}`);
  const c = await channel(t, store.root, ['--cursor-file', file], { NEMIA_CHANNEL_RESUME_MOST: '2' });
  const [notice] = await c.got((all) => {
    const n = all.filter((x) => x.meta.skipped !== undefined);
    return n.length > 0 ? n : undefined;
  });
  assert.equal(notice?.meta.skipped, String(skipped), 'the count of the lines skipped');
  assert.equal(notice?.meta.after, String(saved), 'the cursor they start after');
  assert.match(notice?.content ?? '', new RegExp(`nemia watch --once ${saved}`), 'how a person reads them');
  assert.equal(events(c.notices).length, 0, 'none of the skipped lines');
  await store.pass({ 'r-1': stepAt('succeeded'), 'r-2': stepAt('running'), 'r-3': stepAt('running') });
  await c.got((all) => events(all).some((n) => Number(n.meta.resource_version) === store.size()) || undefined);
  assert.equal(c.notices.filter((x) => x.meta.skipped !== undefined).length, 1, 'one notice');
});

test("a cursor file past the feed's end starts from now, with one notice that lines may have been missed", async (t) => {
  const store = storeOf();
  await store.pass({ 'r-1': stepAt('running') });
  await apiOver(t, store.root);
  const file = path.join(store.root, 'cursor');
  fs.writeFileSync(file, `${store.size() + 1000}\n`);
  const c = await channel(t, store.root, ['--cursor-file', file]);
  await c.got((all) => all.some((n) => n.meta.notice === 'missed') || undefined);
  await followingFrom(c, store.size());
  await store.pass({ 'r-1': stepAt('succeeded') });
  await c.got((all) => events(all).some((n) => Number(n.meta.resource_version) === store.size()) || undefined);
  assert.equal(c.notices.filter((n) => n.meta.notice === 'missed').length, 1, 'said once');
  c.proc.kill('SIGTERM');
  await c.ended;
  assert.equal(fs.readFileSync(file, 'utf8').trim(), String(store.size()));
});

test(
  'the api killed under a channel is one `down` notice; started again one `up`, and the lines written between arrive',
  { timeout: 90_000 },
  async (t) => {
    const store = storeOf();
    await store.pass({ 'r-1': stepAt('running') });
    let api = await apiOver(t, store.root);
    const c = await channel(t, store.root, []);
    await followingFrom(c, store.size());
    api.proc.kill('SIGTERM');
    await api.ended;
    await c.got((all) => all.some((n) => n.meta.notice === 'down') || undefined);
    await store.pass({ 'r-1': stepAt('succeeded') });
    api = await apiOver(t, store.root);
    await c.got((all) => all.some((n) => n.meta.notice === 'up') || undefined);
    await c.got((all) => events(all).some((n) => Number(n.meta.resource_version) === store.size()) || undefined);
    assert.deepEqual(
      c.notices.filter((n) => n.meta.notice === 'down' || n.meta.notice === 'up').map((n) => n.meta.notice),
      ['down', 'up'],
      'down once, up once',
    );
  },
);

test('an unknown flag is refused, exit 2, naming the usage; --help prints it', async (t) => {
  const store = storeOf();
  const refused = nemia(t, store.root, ['channel', '--follow']);
  assert.equal(await refused.ended, 2, 'REFUSED: no flag of the channel');
  assert.match(refused.err(), /nemia channel --help/);
  assert.match(refused.err(), /--follow/);
  const help = nemia(t, store.root, ['channel', '--help']);
  assert.equal(await help.ended, 0);
  assert.match(help.out(), /--cursor-file/);
});

test('a selector the api refuses is refused, exit 2, naming the key, on stderr and in one notice', async (t) => {
  const store = storeOf();
  await store.pass({ 'r-1': stepAt('running') });
  await apiOver(t, store.root);
  const c = await channel(t, store.root, ['-l', 'no/pe=x']);
  assert.equal(await c.ended, 2, 'REFUSED: a key no label is spelled');
  assert.match(c.err(), /no\/pe/);
  const refusals = c.notices.filter((n) => n.meta.notice === 'refused');
  assert.equal(refusals.length, 1, `one notice: ${JSON.stringify(c.notices)}`);
  assert.match(refusals[0]?.content ?? '', /no\/pe/);
});
