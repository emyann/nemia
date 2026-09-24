/**
 * `npm run e2e` made to refuse, whole: a page with a console error, and one with a failed request, each put
 * through the code run.ts puts the app's pages through (visit.ts) in a process of its own — which must exit
 * non-zero, naming the page. checks.test.ts proves the watch hears each problem; this proves hearing one
 * fails the run. Needs Chromium, like checks.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../scratch.ts';

type Ended = { code: number | null; stdout: string; stderr: string; shots: string[] };

/** broken-page.ts, run to its end, with the screenshots it wrote. */
async function e2eOn(how: string): Promise<Ended> {
  const out = scratch('hkb-e2e-refusal-');
  const child = spawn(process.execPath, [path.join(import.meta.dirname, 'broken-page.ts'), how, out], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk));
  const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
  return { code, stdout, stderr, shots: fs.readdirSync(out).sort() };
}

const said = (ended: Ended) => `exit ${ended.code}\n--- stdout\n${ended.stdout}\n--- stderr\n${ended.stderr}`;

test('a page with a console error makes the e2e exit non-zero, naming the page, the theme and the error', { timeout: 60_000 }, async () => {
  const ended = await e2eOn('console-error');
  assert.equal(ended.code, 1, said(ended));
  assert.match(ended.stderr, /^e2e: FAILED — the console-error page \(\/console-error\) in the light theme: no console error and no failed request — \d+ seen:$/m, said(ended));
  assert.match(ended.stderr, /^\s+console error: the graph did not draw$/m, said(ended));
  // Stopped at the first failure, with a picture of it, and no screenshot claiming the page passed.
  assert.deepEqual(ended.shots, ['console-error-light-failed.png'], said(ended));
});

test('a page with a failed request makes the e2e exit non-zero, naming the page, the theme and the request', { timeout: 60_000 }, async () => {
  const ended = await e2eOn('failed-request');
  assert.equal(ended.code, 1, said(ended));
  assert.match(ended.stderr, /^e2e: FAILED — the failed-request page \(\/failed-request\) in the light theme: no console error and no failed request — \d+ seen:$/m, said(ended));
  assert.match(ended.stderr, /^\s+request failed: GET http:\/\/127\.0\.0\.1:\d+\/api\/dropped — /m, said(ended));
  assert.deepEqual(ended.shots, ['failed-request-light-failed.png'], said(ended));
});

test('the same page without the break passes in both themes — or the two above would fail for the page, not the break', { timeout: 60_000 }, async () => {
  const ended = await e2eOn('none');
  assert.equal(ended.code, 0, said(ended));
  assert.match(ended.stdout, /the none page \(\/none\) in the light theme ✓/, said(ended));
  assert.match(ended.stdout, /the none page \(\/none\) in the dark theme ✓/, said(ended));
  assert.deepEqual(ended.shots, ['none-dark.png', 'none-light.png'], said(ended));
});
