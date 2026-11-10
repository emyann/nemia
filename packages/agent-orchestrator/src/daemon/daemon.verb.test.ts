/**
 * `nemia daemon`: the store's daemon as its lease stands — its pid, its url and its state — printed in words or as JSON; and, on a store
 * no daemon ticks, the start asked of the host `main` is handed (`ensureDaemon`), once, before it answers, as every command that ticks.
 */
import { rootNow } from '../../test/config-given.ts';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';

const ROOT = scratch('wf-daemon-verb-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { main } = await import('../cli/main.ts');
const { liveDemandHost } = await import('../demand/demand.verb.ts');
const { DEMAND_OFF } = await import('../demand/demand.ts');
const { heldUrl, releaseStore, takeStore } = await import('./daemon.store.ts');
const { TABLE } = await import('../runner.ts');
const { engineOf } = await import('../runtime-client.ts');
type DemandHost = import('../demand/demand.verb.ts').DemandHost;

const NOWHERE = scratch('wf-daemon-verb-nowhere-');
const { [DEMAND_OFF]: _off, ...ON } = process.env;
const engine = eachTest(testEngine);
heldUnasked(engine);

/** A host over the scratch store that keeps each spawn it is asked for and starts nothing, as `test/demand-cli.test.ts`'s. */
function hostOf(): { host: () => DemandHost; spawns: string[] } {
  const spawns: string[] = [];
  const host: DemandHost = {
    ...liveDemandHost(rootNow()),
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

/** What `nemia <argv>` prints on stdout, over `host`. */
async function printed(t: TestContext, argv: string[], host: () => DemandHost): Promise<string> {
  const lines: string[] = [];
  t.mock.method(console, 'log', (line: unknown) => void lines.push(String(line)));
  t.mock.method(console, 'error', () => undefined);
  try {
    await main(argv, engineOf(engine().layer), host);
  } finally {
    t.mock.restoreAll();
  }
  return lines.join('\n');
}

test('nemia daemon is served on the command line alone and starts the daemon as a command that ticks', () => {
  const entry = TABLE.find((c) => c.name === 'daemon');
  assert.equal(entry?.ticks, true);
  assert.equal(entry?.only?.side, 'cli');
});

test('nemia daemon --json, on a store whose lease holds a url, prints the url and the pid, and starts nothing', async (t) => {
  const { held } = takeStore(rootNow(), { every: 4000, cwd: ROOT, by: 'api' });
  t.after(() => releaseStore(rootNow(), held));
  assert.equal(heldUrl(rootNow(), 'http://127.0.0.1:65530'), true);
  const { host, spawns } = hostOf();
  const answer: unknown = JSON.parse(await printed(t, ['daemon', '--json'], host));
  assert.deepEqual(answer, { state: 'ticking', by: 'api', pid: process.pid, url: 'http://127.0.0.1:65530' });
  assert.deepEqual(spawns, []);
  assert.match(await printed(t, ['daemon'], host), new RegExp(`pid ${process.pid}`));
});

test('nemia daemon, on a store no daemon ticks, asks its host to start one once, then answers where the store stands', async (t) => {
  const { host, spawns } = hostOf();
  const answer: unknown = JSON.parse(await printed(t, ['daemon', '--json'], host));
  assert.deepEqual(spawns, [path.join(NOWHERE, 'main.ts')]);
  assert.equal((answer as { url: unknown }).url, null);
  assert.notEqual((answer as { state: unknown }).state, 'ticking');
});
