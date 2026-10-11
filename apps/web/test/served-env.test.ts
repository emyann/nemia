/**
 * The environment the e2e's workers and a served board give their api (`apiEnvOf`, `test/e2e/served.ts`) names no collector, whatever
 * the shell that runs them does: an api started for a test or a look exports nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiEnvOf } from './e2e/served.ts';

test("REFUSED under the shell's OTEL_EXPORTER_OTLP_ENDPOINT: the api a board is served with is given no collector", (t) => {
  const found = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  t.after(() => {
    if (found === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = found;
  });
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:9';
  const env = apiEnvOf('/store', '/bin');
  assert.equal(env.OTEL_EXPORTER_OTLP_ENDPOINT, '');
  assert.equal(env.WF_ROOT, '/store', 'and the rest of the environment is the served store');
});
