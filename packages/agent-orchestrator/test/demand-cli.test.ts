/**
 * The daemon started on demand, at the command line: each command that ticks, typed with `NEMIA_DAEMON_START` unset on a store no daemon
 * holds, asks the host `main` is handed to start one, once, before it runs; no read does; and the store keeps no `daemon.log` and no lease,
 * since the host's spawn starts nothing. A start that went around the host would leave both, or the reaper's process, and fail here.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from './placed.ts';
import { heldUnasked } from './unasked.ts';
import { main } from '../src/cli/main.ts';
import { liveDemandHost } from '../src/demand/demand.verb.ts';
import { DEMAND_OFF } from '../src/demand/demand.ts';
import { TABLE } from '../src/runner.ts';
import { COMMAND_WORDS } from 'objects';
import { engineOf } from '../src/runtime-client.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-demand-cli-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1' };
type DemandHost = import('../src/demand/demand.verb.ts').DemandHost;

const NOWHERE = scratch('wf-demand-cli-nowhere-');
const { [DEMAND_OFF]: _off, ...ON } = ENV;

const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(engine().layer);

/** The commands the client holds (`objects`' `COMMAND_WORDS`), which ask the api and never reach `main`'s demand. */
const MOVED: readonly string[] = COMMAND_WORDS.map((w) => w.name);

/**
 * Each command `main` still runs that ticks, typed with arguments it parses and its check lets through, on runs, cards and folders that
 * are not there.
 */
const TICKING: Record<string, string[]> = {
  'inbox queue': ['inbox', 'queue', 'no-card'],
  'agents run': ['agents', 'run', 'yours', 'nobody', '--brief', 'Do it.'],
  'factory upgrade': ['factory', 'upgrade', 'no-factory', '--to', '0.2.0'],
  'factory resolve': ['factory', 'resolve', 'no-factory', 'review.md#rounds', '--ours'],
  daemon: ['daemon'],
  'doctor fix': ['doctor', 'fix', 'no-piece'],
};

/** Reads, typed the same way. */
const READS = [['ls'], ['version'], ['show', 'no-run'], ['inbox'], ['logs', 'no-run', 'implement']];

/** A host over the scratch store that keeps each spawn it is asked for and starts nothing; no service is found, and every program fails. */
function hostOf(): { host: () => DemandHost; spawns: string[] } {
  const spawns: string[] = [];
  const host: DemandHost = {
    ...liveDemandHost(ROOT),
    machine: () => ({ platform: 'linux', wsl: false, systemd: false }),
    call: (argv) => assert.fail(`ran ${argv.join(' ')}`),
    daemon: () => ({ checkout: NOWHERE, entry: path.join(NOWHERE, 'main.ts'), cwd: NOWHERE }),
    spawn: (s) => {
      spawns.push(s.entry);
      return { pid: undefined, ended: Promise.resolve({ code: 2, signal: null }) };
    },
    say: () => undefined,
    env: ON,
    pollMs: 1,
  };
  return { host: () => host, spawns };
}

/** `nemia <argv>` over `host`, its lines kept off the test's output and any refusal it ends with swallowed. */
async function typed(t: TestContext, argv: string[], host: () => DemandHost): Promise<void> {
  t.mock.method(console, 'log', () => undefined);
  t.mock.method(console, 'error', () => undefined);
  try {
    await main(argv, noEngine(), host, undefined, ENV);
  } catch {
    return;
  } finally {
    t.mock.restoreAll();
  }
}

/** Whatever a daemon would leave in the store: its log and its lease. */
const leftInStore = () => ['daemon.log', 'daemon.json'].filter((name) => fs.existsSync(path.join(ROOT, name)));

test('the commands typed here are the ones that tick and the client does not hold', () => {
  assert.deepEqual(
    Object.keys(TICKING).sort(),
    TABLE.filter((c) => c.ticks === true && !MOVED.includes(c.name))
      .map((c) => c.name)
      .sort(),
  );
});

for (const [name, argv] of Object.entries(TICKING))
  test(`nemia ${name}, on a store no daemon holds, asks its host to start one once, and the store keeps no daemon`, async (t) => {
    const { host, spawns } = hostOf();
    await typed(t, argv, host);
    assert.deepEqual(spawns, [path.join(NOWHERE, 'main.ts')]);
    assert.deepEqual(leftInStore(), []);
  });

test('no read asks for a daemon', async (t) => {
  const { host, spawns } = hostOf();
  for (const argv of READS) await typed(t, argv, host);
  assert.deepEqual(spawns, []);
  assert.deepEqual(leftInStore(), []);
});
