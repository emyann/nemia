/**
 * The environment the e2e's workers and a served board give their api (`apiEnvOf`, `test/e2e/served.ts`) names no collector, whatever
 * the shell that runs them does: an api started for a test or a look exports nothing. Its PATH holds no `claude`, the store's or this
 * machine's, so the readiness read finds no harness installed on a fresh seed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scratch } from 'test-kit/scratch';
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

test("REFUSED a folder of the shell's PATH that holds a claude: the api a board is served with finds no harness installed", (t) => {
  const found = process.env.PATH;
  t.after(() => {
    process.env.PATH = found;
  });
  const root = scratch('served-env-');
  const installed = path.join(root, 'installed');
  const other = path.join(root, 'other');
  const bin = path.join(root, 'bin');
  for (const dir of [installed, other, bin]) fs.mkdirSync(dir);
  fs.writeFileSync(path.join(installed, 'claude'), '#!/bin/sh\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'claude'), '#!/bin/sh\n', { mode: 0o755 });
  process.env.PATH = [installed, other].join(path.delimiter);
  const dirs = (apiEnvOf(root, bin).PATH ?? '').split(path.delimiter);
  assert.deepEqual(
    [installed, other, bin].map((dir) => dirs.includes(dir)),
    [false, true, false],
    "this machine's claude and the store's are on no folder of its PATH, every other folder kept",
  );
});
