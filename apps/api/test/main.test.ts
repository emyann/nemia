import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PORT, portOf, ticksOf, VIEWER_PORT } from '../src/port.ts';
import { scratch } from './scratch.ts';

const API = path.join(import.meta.dirname, '..');

test('PORT unset or empty is 8787, or 8788 for an api that does not tick, 0 is any free port, and a number is that port', () => {
  assert.equal(portOf(undefined), DEFAULT_PORT);
  assert.equal(portOf(''), DEFAULT_PORT);
  assert.equal(portOf(undefined, false), VIEWER_PORT);
  assert.equal(portOf('', false), 8788);
  assert.equal(portOf('9001', false), 9001);
  assert.equal(portOf('0'), 0);
  assert.equal(portOf('9001'), 9001);
  assert.equal(portOf(' 65535 '), 65535);
});

test('a PORT that is not a port is refused with the fix, not read as 8787', () => {
  for (const value of ['abc', '80a', '-1', '65536', '1e3', '0x50', '8787.0', '100000']) {
    assert.throws(
      () => portOf(value),
      (err: Error & { exitCode?: number }) =>
        err.exitCode === 2 && err.message.startsWith(`PORT=${value} is not a port.`) && /0 for any free port/.test(err.message),
      value,
    );
  }
});

test('the api ticks with no argument, and not with --no-tick; any other is refused naming --no-tick', () => {
  assert.equal(ticksOf([]), true);
  assert.equal(ticksOf(['--no-tick']), false);
  for (const argv of [['--tick=no'], ['--no-tick', 'x'], ['tick']])
    assert.throws(
      () => ticksOf(argv),
      (err: Error & { exitCode?: number }) => err.exitCode === 2 && /Give --no-tick to serve the board without ticking/.test(err.message),
      argv.join(' '),
    );
});

/**
 * `node src/main.ts` with `PORT` and `args`, in the store `root` (one of its own unless given): what it printed, and how it ended if it
 * did. It is killed when the test is done, if it still runs, and in any case within a minute.
 */
function startApi(port: string, args: string[] = [], root = scratch('nemia-api-main-')) {
  const env = { ...process.env, PORT: port, WF_ROOT: root, HKB_REPO: root, WF_MAX_CONCURRENT: '2', WF_MAX_RUNS: '2' };
  const child = spawn(process.execPath, ['src/main.ts', ...args], { cwd: API, env, timeout: 60_000 });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const ended = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  const said = (pattern: RegExp) =>
    new Promise<RegExpMatchArray>((resolve, reject) => {
      const timer = setInterval(() => {
        const m = pattern.exec(output);
        if (m) {
          clearInterval(timer);
          resolve(m);
        }
      }, 20);
      void ended.then(() => {
        clearInterval(timer);
        const m = pattern.exec(output);
        if (m) resolve(m);
        else reject(new Error(`exited without ${pattern}:\n${output}`));
      });
    });
  return { child, ended, said, output: () => output, root };
}

test('PORT=0 starts the api on a free port, and it prints the port it got', async (t) => {
  const api = startApi('0');
  t.after(() => api.child.kill());
  const [, got] = await api.said(/api listening on http:\/\/127\.0\.0\.1:(\d+)/);
  assert.notEqual(Number(got), 0);
  assert.notEqual(Number(got), DEFAULT_PORT);
  const res = await fetch(`http://127.0.0.1:${got}/api/health`);
  assert.deepEqual(await res.json(), { ok: true }, 'and it is listening there');
});

test("REFUSED: the api listens on 127.0.0.1 alone — nothing answers on this machine's other addresses, where anyone on the network could start a run", async (t) => {
  const outward = Object.values(os.networkInterfaces())
    .flat()
    .find((a) => a?.family === 'IPv4' && !a.internal)?.address;
  const api = startApi('0');
  t.after(() => api.child.kill());
  const [, got] = await api.said(/api listening on http:\/\/127\.0\.0\.1:(\d+)/);
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${got}/api/health`)).json(), { ok: true }, 'it answers on loopback');
  if (!outward) return t.skip('this machine has no address but loopback to try');
  await assert.rejects(
    fetch(`http://${outward}:${got}/api/health`),
    (err: Error & { cause?: { code?: string } }) => err.cause?.code === 'ECONNREFUSED',
    `nothing answers on ${outward}:${got}`,
  );
});

test('the api refuses a PORT that is not a port: exit 2, the fix on stderr, nothing listening', async () => {
  const api = startApi('80a');
  assert.equal(await api.ended, 2);
  assert.match(api.output(), /PORT=80a is not a port\. Give a whole number from 0 to 65535/);
  assert.doesNotMatch(api.output(), /listening/);
});

/** The lease of the store at `root`, as the daemon wrote it. */
const leaseOf = (root: string) => JSON.parse(fs.readFileSync(path.join(root, 'daemon.json'), 'utf8')) as Record<string, unknown>;

/** Until the lease at `root` says `pred`: written after the api listens, a moment after it says so. */
const leaseSays = async (root: string, pred: (lease: Record<string, unknown>) => boolean) => {
  while (!(fs.existsSync(path.join(root, 'daemon.json')) && pred(leaseOf(root)))) await new Promise((r) => setTimeout(r, 20));
  return leaseOf(root);
};

test("(a) the api is the store's daemon: it holds the lease as the api, at its url, and /api/daemon says so", async (t) => {
  const api = startApi('0');
  t.after(() => api.child.kill());
  const [url] = await api.said(/http:\/\/127\.0\.0\.1:\d+/);
  const lease = await leaseSays(api.root, (l) => l.url === url);
  assert.deepEqual([lease.pid, lease.by], [api.child.pid, 'api']);
  const daemon = (await (await fetch(`${url}/api/daemon`)).json()) as Record<string, unknown>;
  assert.deepEqual([daemon.by, daemon.url, daemon.pid], ['api', url, api.child.pid]);
});

test('REFUSED (b, c): a second api, and a nemia up, on a store the api holds — exit 2 naming it, and the second api binds no port', async (t) => {
  const first = startApi('0');
  t.after(() => first.child.kill());
  const [url] = await first.said(/http:\/\/127\.0\.0\.1:\d+/);
  await leaseSays(first.root, (l) => l.url === url);
  const second = startApi('0', [], first.root);
  assert.equal(await second.ended, 2);
  assert.match(second.output(), new RegExp(`^api: \\S+ is held by the api of pid ${first.child.pid} at ${url}, `));
  assert.doesNotMatch(second.output(), /listening/);
  const wf = spawn(process.execPath, [path.join(API, '../../packages/agent-orchestrator/bin/nemia.ts'), 'up'], {
    env: { ...process.env, WF_ROOT: first.root, WF_MAX_CONCURRENT: '2', WF_MAX_RUNS: '2' },
    timeout: 60_000,
  });
  let said = '';
  wf.stderr.on('data', (c) => (said += c));
  const code = await new Promise((resolve) => wf.on('exit', resolve));
  assert.equal(code, 2);
  assert.match(
    said,
    new RegExp(`nemia up: \\S+ is held by the api of pid ${first.child.pid} at ${url}, .*stop it with kill ${first.child.pid} `),
  );
});

test('REFUSED (d): with a nemia up holding the store, the api exits 2 naming its pid, and binds no port', async (t) => {
  const root = scratch('nemia-api-main-');
  const wf = spawn(process.execPath, [path.join(API, '../../packages/agent-orchestrator/bin/nemia.ts'), 'up', '200'], {
    env: { ...process.env, WF_ROOT: root, WF_MAX_CONCURRENT: '2', WF_MAX_RUNS: '2' },
    cwd: root,
    timeout: 60_000,
  });
  t.after(() => wf.kill());
  await leaseSays(root, (l) => l.pid === wf.pid && l.passedAt !== null);
  const api = startApi('0', [], root);
  assert.equal(await api.ended, 2);
  assert.match(api.output(), new RegExp(`^api: \\S+ is held by the nemia up of pid ${wf.pid}, .*stop it with kill ${wf.pid} `));
  assert.doesNotMatch(api.output(), /listening/);
});

test('(e) SIGTERM ends the api with 143 and lets the lease go, and the next api takes the store', async (t) => {
  const first = startApi('0');
  const [url] = await first.said(/http:\/\/127\.0\.0\.1:\d+/);
  await leaseSays(first.root, (l) => l.url === url);
  first.child.kill('SIGTERM');
  assert.equal(await first.ended, 143, 'its own exit, 128 + 15, once the lease is let go');
  assert.ok(leaseOf(first.root).stoppedAt, 'stoppedAt written');
  const next = startApi('0', [], first.root);
  t.after(() => next.child.kill());
  await leaseSays(first.root, (l) => l.pid === next.child.pid && l.by === 'api');
});

test('REFUSED: a port another process holds ends the daemon with exit 2, naming the port and PORT=, and lets the lease go', async (t) => {
  const holder = net.createServer();
  await new Promise<void>((resolve) => holder.listen(0, '127.0.0.1', resolve));
  t.after(() => holder.close());
  const taken = String((holder.address() as net.AddressInfo).port);
  const api = startApi(taken);
  assert.equal(await api.ended, 2, 'a refusal, not a crash');
  assert.match(
    api.output(),
    new RegExp(`^api: 127\\.0\\.0\\.1:${taken} is in use by another process\\. Stop what listens there, or give PORT= another port`, 'm'),
  );
  assert.doesNotMatch(api.output(), /listening|    at /, 'no stack, and nothing listening');
  assert.ok(leaseOf(api.root).stoppedAt, 'the lease taken before the port is let go, so the next daemon takes it at once');
  const viewer = startApi(taken, ['--no-tick']);
  assert.equal(await viewer.ended, 2, 'a viewer on a held port is refused the same way');
  assert.match(viewer.output(), new RegExp(`^api: 127\\.0\\.0\\.1:${taken} is in use`, 'm'));
});

test('(f) --no-tick serves the board and writes no lease; (g) any other argument is refused naming --no-tick', async (t) => {
  const viewer = startApi('0', ['--no-tick']);
  t.after(() => viewer.child.kill());
  const [url] = await viewer.said(/http:\/\/127\.0\.0\.1:\d+/);
  assert.deepEqual(await (await fetch(`${url}/api/health`)).json(), { ok: true });
  assert.equal(fs.existsSync(path.join(viewer.root, 'daemon.json')), false);
  const wrong = startApi('0', ['--tick=no']);
  assert.equal(await wrong.ended, 2);
  assert.match(wrong.output(), /the api takes no --tick=no\. Give --no-tick /);
  assert.equal(fs.existsSync(path.join(wrong.root, 'daemon.json')), false);
});
