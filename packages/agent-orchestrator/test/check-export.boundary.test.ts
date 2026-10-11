/**
 * A run's check exports nothing to the daemon's collector: under the client's `engine()` in a process whose environment names a
 * collector, as the daemon's does, a check filed as a run files one, whose command starts a process that exports wherever its
 * environment says (`exporting-child.ts`), posts nothing, since that process is told of no collector. The same process told the
 * address by name posts its span, so the absence is the engine's doing. Against the real worker and a scratch collector.
 *
 * `WF_ROOT`, the collector's address and the ceiling the engine admits under (`WF_MAX_CONCURRENT`, its default) are set before the
 * engine is built, which reads all three; the address is put back after.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { Effect } from 'effect';
import { CHECK_NICENESS, checkArgv } from '../src/check/check.ts';
import { scratch } from './scratch.ts';
import { until, WAITED, type Waiter } from './waits.ts';

/** Every body posted to the scratch collector, by path. */
const posts: { path: string; body: string }[] = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
  req.on('end', () => {
    posts.push({ path: req.url ?? '', body });
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
});
await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
const COLLECTOR = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const found = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = COLLECTOR;
process.env.WF_ROOT = scratch('wf-check-export-');
delete process.env.WF_MAX_CONCURRENT;
after(async () => {
  if (found === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = found;
  await new Promise<void>((closed) => server.close(() => closed()));
});
const { engine } = await import('../src/runner.ts');
const { sessionTelemetryOf } = await import('../src/telemetry/telemetry.ts');

const e = engine();

/** The exporting process as a shell line, its one span named `span`. */
const exporting = (span: string): string =>
  `${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(import.meta.dirname, 'exporting-child.ts'))} ${span}`;

/** The posts whose body names `span`. */
const naming = (span: string): string[] => posts.filter((p) => p.body.includes(span)).map((p) => p.path);

/** Ticks the engine in test `t` until the task `id` has settled; answers how. */
const settled = (t: Waiter, id: string) => {
  let phase = 'not read yet';
  return until(
    t,
    async () => {
      await Effect.runPromise(e.tick());
      const v = await Effect.runPromise(e.view(id));
      phase = v.phase;
      return v.state.settled;
    },
    () => `${id} settled; phase ${phase}`,
    { everyMs: 100 },
  );
};

test(
  "REFUSED: a check's command that starts an exporting process posts nothing to the daemon's collector, and told it by name it posts",
  WAITED,
  async (t) => {
    assert.equal(sessionTelemetryOf(process.env)?.endpoint, COLLECTOR, 'the engine is given the collector, as the daemon is');
    const workspace = scratch('wf-check-export-ws-');
    const id = await Effect.runPromise(
      e.file({
        id: 'r-1-implement-check',
        harness: 'check',
        cwd: workspace,
        brief: 'the check',
        deadlineSeconds: 60,
        config: {
          command: checkArgv(exporting('span-of-the-check')),
          env: { WF_RUN: 'r-1', WF_STEP: 'implement', WF_BASE_REF: 'abc123', WF_WORKSPACE: workspace, WF_ARTIFACTS: workspace },
          niceness: CHECK_NICENESS,
        },
      }),
    );
    assert.equal(await settled(t, id), 'succeeded', (await Effect.runPromise(e.output(id, 'stderr'))) ?? '');
    assert.equal(await Effect.runPromise(e.output(id, 'stdout')), 'collector: none\n', 'the process the check started is told of none');
    assert.deepEqual(naming('span-of-the-check'), [], 'and nothing of it reached the collector');

    const told = spawn('sh', ['-c', exporting('span-told-by-name')], {
      cwd: workspace,
      env: { ...process.env, OTEL_EXPORTER_OTLP_ENDPOINT: COLLECTOR },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let said = '';
    told.stdout.on('data', (chunk: Buffer) => (said += chunk.toString('utf8')));
    const code = await new Promise<number | null>((exited) => told.once('close', (exit) => exited(exit)));
    assert.equal(code, 0);
    assert.equal(said, `collector: ${COLLECTOR}\n`);
    assert.deepEqual(naming('span-told-by-name'), ['/v1/traces'], 'the same process, told the address by name, posts its span');
  },
);
