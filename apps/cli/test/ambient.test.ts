/**
 * The environment the cli's tests hand their children (`ambient`) is CI's, whatever the session that runs them: with the daemon's
 * per-session variables and the telemetry in this process's environment, a child built on it sees none of them, and a test that means
 * one sets it on top.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ambient, DROPPED } from './ambient.ts';

const DAEMONS: Record<(typeof DROPPED)[number], string> = {
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9',
  WF_SESSION_TOKEN: 'a-token-no-test-minted',
  WF_MEMORY_LIMIT: '6Gi',
  WF_CGROUP_PARENT: 'sessions.slice',
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
