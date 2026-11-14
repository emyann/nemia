/**
 * The environment the cli's tests hand their children (`ambient`) is CI's, whatever the session that runs them: with the daemon's
 * per-session variables and the telemetry in this process's environment, a child built on it sees none of them, and a test that means
 * one sets it on top. Under a server's serving variables, the api a test serves listens on the loopback, and asks a token of its own
 * machine as every store does: the store's credential lets the test's `nemia` in, and with none it is refused.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ambient, DROPPED } from './ambient.ts';
import { servedStore } from './served.ts';

const DAEMONS: Record<(typeof DROPPED)[number], string> = {
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9',
  WF_SESSION_TOKEN: 'a-token-no-test-minted',
  WF_MEMORY_LIMIT: '6Gi',
  WF_MEMORY_REQUEST: '2Gi',
  WF_MEMORY_RESERVED: '1Gi',
  WF_CGROUP_PARENT: 'sessions.slice',
  NEMIA_BIND: '100.126.244.0',
  WF_EXPOSED: '1',
  NEMIA_CONTEXT: 'the-persons-vps',
  XDG_CONFIG_HOME: '/elsewhere/.config',
};

/** What a child spawned with `env` reads of each of `DROPPED`. */
const seenBy = (env: NodeJS.ProcessEnv): unknown => {
  const read = `console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(DROPPED)}.map((n) => [n, process.env[n] ?? null]))))`;
  const ran = spawnSync(process.execPath, ['-e', read], { env, encoding: 'utf8', timeout: 60_000 });
  assert.equal(ran.status, 0, ran.stderr);
  return JSON.parse(ran.stdout);
};

test("REFUSED under the daemon's environment: a child given `ambient()` reads none of its per-session variables, one given process.env does", (t) => {
  const was = Object.fromEntries(DROPPED.map((n) => [n, process.env[n]]));
  t.after(() => {
    for (const [n, v] of Object.entries(was)) {
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
    }
  });
  Object.assign(process.env, DAEMONS);
  assert.deepEqual(seenBy(ambient()), Object.fromEntries(DROPPED.map((n) => [n, null])));
  assert.deepEqual(seenBy(process.env), DAEMONS, "the child reads what it is given, so the absence above is ambient's");
  assert.deepEqual(seenBy({ ...ambient(), WF_SESSION_TOKEN: 'mine' }), {
    ...Object.fromEntries(DROPPED.map((n) => [n, null])),
    WF_SESSION_TOKEN: 'mine',
  });
});

test('`ambient` drops each name it is also given, and leaves the rest of the environment', () => {
  const env = ambient('PATH');
  assert.equal(env.PATH, undefined);
  assert.equal(env.HOME, process.env.HOME);
});

test(
  "under a server's serving variables, a served store's api listens on the loopback, the store's credential let in and none refused",
  { timeout: 120_000 },
  async (t) => {
    const was = { NEMIA_BIND: process.env.NEMIA_BIND, WF_EXPOSED: process.env.WF_EXPOSED };
    t.after(() => {
      for (const [n, v] of Object.entries(was)) {
        if (v === undefined) delete process.env[n];
        else process.env[n] = v;
      }
    });
    Object.assign(process.env, { NEMIA_BIND: '100.126.244.0', WF_EXPOSED: '1' });
    const served = await servedStore('nemia-ambient-serving-', () => {});
    t.after(served.stop);
    assert.match(served.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    const listed = await served.nemia(['ls']);
    assert.equal(listed.code, 0, `the store's credential is presented with nothing typed: ${listed.err}`);
    fs.rmSync(path.join(served.root, 'credential'));
    const refused = await served.nemia(['ls']);
    assert.equal(refused.code, 2, `a store not exposed asks a token of its own machine too, and refuses none: ${refused.err}`);
  },
);
