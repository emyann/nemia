/**
 * The daemon started on demand, at the command line: each command that ticks, typed with `NEMIA_DAEMON_START` unset on a store no daemon
 * holds, asks the host `main` is handed to start one, once, before it runs; no read does; and the store keeps no `daemon.log` and no lease,
 * since the host's spawn starts nothing. A start that went around the host would leave both, or the reaper's process, and fail here.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from './placed.ts';
import { heldUnasked } from './unasked.ts';

const ROOT = scratch('wf-demand-cli-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { main } = await import('../src/cli/main.ts');
const { liveDemandHost } = await import('../src/demand/demand.verb.ts');
const { DEMAND_OFF } = await import('../src/demand/demand.ts');
const { TABLE } = await import('../src/runner.ts');
type DemandHost = import('../src/demand/demand.verb.ts').DemandHost;

const NOWHERE = scratch('wf-demand-cli-nowhere-');
const { [DEMAND_OFF]: _off, ...ON } = process.env;

const { engineOf } = await import('../src/runtime-client.ts');
const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(engine().layer);

/** Each command that ticks, typed with arguments it parses and its check lets through, on runs, cards and folders that are not there. */
const TICKING: Record<string, string[]> = {
  start: ['start', 'do it', '--workflows', NOWHERE, '--repo', NOWHERE],
  plan: ['plan', NOWHERE, '--repo', NOWHERE],
  'inbox queue': ['inbox', 'queue', 'no-card'],
  retry: ['retry', 'no-run', 'implement'],
  approve: ['approve', 'no-run', 'design'],
  round: ['round', 'no-run'],
  accept: ['accept', 'no-run', '--message', 'good enough'],
  merge: ['merge', 'no-run'],
  cancel: ['cancel', 'no-run'],
  resume: ['resume'],
  'agents try': ['agents', 'try', 'yours', 'nobody', '--brief', 'Do it.'],
  'factory upgrade': ['factory', 'upgrade', 'no-factory', '--to', '0.2.0'],
  'factory resolve': ['factory', 'resolve', 'no-factory', 'review.md#rounds', '--ours'],
};

/** Reads, typed the same way. */
const READS = [['ls'], ['version'], ['show', 'no-run'], ['inbox'], ['logs', 'no-run', 'implement']];

/** A host over the scratch store that keeps each spawn it is asked for and starts nothing; no service is found, and every program fails. */
function hostOf(): { host: () => DemandHost; spawns: string[] } {
  const spawns: string[] = [];
  const host: DemandHost = {
    ...liveDemandHost(),
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
    await main(argv, noEngine(), host);
  } catch {
    return;
  } finally {
    t.mock.restoreAll();
  }
}

/** Whatever a daemon would leave in the store: its log and its lease. */
const leftInStore = () => ['daemon.log', 'daemon.json'].filter((name) => fs.existsSync(path.join(ROOT, name)));

test('the commands typed here are the thirteen that tick', () => {
  assert.deepEqual(
    Object.keys(TICKING).sort(),
    TABLE.filter((c) => c.ticks === true)
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
