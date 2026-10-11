/**
 * `nemia up` as a person runs it: a process of its own, whose passes are said through the telemetry it provides (`telemetryLayer`), each
 * log printed as its line — the time, two spaces, the words — on stdout. A store paused before it starts is said Paused on its first pass.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { nodeChild } from './child.ts';
import { scratch } from './scratch.ts';

const PKG = path.join(import.meta.dirname, '..');
const BIN = path.join(PKG, 'bin', 'nemia.ts');

test("nemia up says a pass's lines on stdout, through the logger its process provides: a paused store, Paused, as its line", async (t) => {
  const root = scratch('wf-up-lines-');
  const env = {
    ...process.env,
    WF_ROOT: root,
    AE_ROOT: path.join(root, 'engine'),
    WF_MAX_CONCURRENT: '2',
    WF_MAX_RUNS: '2',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  };
  execFileSync(process.execPath, [BIN, 'pause'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const up = nodeChild(`process.argv = [process.argv[0], ${JSON.stringify(BIN)}, 'up']; await import(${JSON.stringify(BIN)});`, env);
  t.after(() => up.child.kill());
  await up.until(() => /Paused /.test(up.out() + up.err()), 'nemia up says the pause, in whatever form');
  assert.match(up.out(), /^\d\d:\d\d:\d\d {2}Paused .* — nothing runs and nothing new starts; nemia resume resumes it$/m);
});
