/**
 * The daemon started on demand, for real: on a scratch store no service serves, `nemia ls` finds no daemon, starts one through the
 * in-process `nemia daemon` (`ensureDaemon`, which spawns the checkout's api in a session of its own), reads
 * the store from it, and the test
 * stops the daemon it started — by the pid in the store's lease, checked first to be a process of that store.
 *
 * Nothing here can reach the person's store or service: the store and the home are scratch folders, so no login service names the store
 * (`ensureDaemon` starts a unit only where its `WF_ROOT` is the store) and the daemon's engine is the store's own. The daemon a start
 * spawns is given the service's environment alone (`daemonEnv`), so it listens on the daemon's port, 8787, whatever `PORT` says: where
 * another process holds that port — the person's own daemon — the test is skipped, saying so, rather than start one that cannot listen.
 * Run it where the port is free (CI), or in a network namespace of its own: `unshare -rn sh -c 'ip link set lo up && node --test <file>'`.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { scratch } from '../../api/test/scratch.ts';

const BIN = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');
const SCRATCH = scratch('nemia-demand-');
const ROOT = path.join(SCRATCH, 'store');
const HOME = path.join(SCRATCH, 'home');
fs.mkdirSync(ROOT, { recursive: true });
fs.mkdirSync(HOME, { recursive: true });

/** The port a daemon started on demand listens on: the api's default, since the start passes no `PORT`. */
const DAEMON_PORT = 8787;

/** Whether `port` on loopback is free to listen on. */
const free = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });

/** The environment of the test's `nemia`: the store and home scratch ones, the start left on, and no collector. */
const ENV: NodeJS.ProcessEnv = (() => {
  const {
    NEMIA_DAEMON_START: _start,
    OTEL_EXPORTER_OTLP_ENDPOINT: _otel,
    AE_ROOT: _ae,
    XDG_CONFIG_HOME: _config,
    PORT: _port,
    ...rest
  } = process.env;
  return { ...rest, WF_ROOT: ROOT, HOME, WF_VERIFY_REST: '1' };
})();

/** `nemia <argv>`, waited on for its exit: its code, and what it printed on each stream. */
function nemia(argv: readonly string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [BIN, ...argv], { env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** The store's lease, as the daemon wrote it, or undefined. */
const lease = (): { pid?: unknown; url?: unknown; by?: unknown } | undefined => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'daemon.json'), 'utf8')) as { pid?: unknown; url?: unknown; by?: unknown };
  } catch {
    return undefined;
  }
};

/** Whether `pid` is a process that runs on this store: its environment names the scratch store's `WF_ROOT`. */
const ofThisStore = (pid: number): boolean => {
  try {
    return fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').includes(`WF_ROOT=${ROOT}`);
  } catch {
    return false;
  }
};

/** Whether `pid` is still a process. */
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Stops the daemon this test started, if it did, and waits for it to be gone, a beat at a time. */
async function stopStarted(): Promise<void> {
  const pid = lease()?.pid;
  if (typeof pid !== 'number' || !ofThisStore(pid)) return;
  process.kill(pid, 'SIGTERM');
  while (alive(pid)) await new Promise((resolve) => setTimeout(resolve, 50));
}

after(async () => {
  await stopStarted();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

const skip =
  process.platform !== 'linux'
    ? 'the started daemon is told from another process by /proc, which only Linux has'
    : !(await free(DAEMON_PORT))
      ? `127.0.0.1:${DAEMON_PORT} is held by another process (a daemon of the person's own store?): a daemon started here could not listen`
      : false;

test('nemia ls on a store no daemon serves starts one through nemia daemon, reads from it, and the test stops it', { skip }, async () => {
  assert.equal(lease(), undefined);
  const { code, stderr } = await nemia(['ls']);
  assert.equal(code, 0, stderr);
  const held = lease();
  assert.equal(held?.by, 'api');
  assert.equal(held?.url, `http://127.0.0.1:${DAEMON_PORT}`);
  assert.equal(typeof held?.pid, 'number');
  assert.notEqual(held?.pid, process.pid);
  assert.ok(ofThisStore(held?.pid as number), `pid ${String(held?.pid)} is not a process of ${ROOT}`);
  assert.ok(stderr.includes(`kill ${String(held?.pid)}`), stderr);
  await stopStarted();
  assert.equal(alive(held?.pid as number), false);
});
