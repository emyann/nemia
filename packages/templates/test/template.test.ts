/**
 * The environment a template's test spawns `nemia` with (`storeEnv`) is CI's, whatever the session that runs it: the telemetry and the
 * daemon's per-session variables in this process's environment reach no child built on it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scratch } from 'test-kit/scratch';
import { storeEnv } from './template.ts';

const DAEMONS = {
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9',
  WF_SESSION_TOKEN: 'a-token-no-test-minted',
  WF_MEMORY_LIMIT: '6Gi',
  WF_CGROUP_PARENT: 'sessions.slice',
};

test("REFUSED under the daemon's environment: storeEnv carries none of its per-session variables nor its collector", (t) => {
  const was = Object.fromEntries(Object.keys(DAEMONS).map((n) => [n, process.env[n]]));
  t.after(() => {
    for (const [n, v] of Object.entries(was)) {
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
    }
  });
  Object.assign(process.env, DAEMONS);
  const env = storeEnv(scratch('nemia-template-env-'));
  assert.deepEqual(
    Object.keys(DAEMONS).filter((n) => n in env),
    [],
  );
});
