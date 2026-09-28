/**
 * `npm run e2e` made to refuse, whole: a page with a console error, one with a failed request, and one whose button
 * something lies over, each put through the code run.ts puts the app's pages through (visit.ts) in a process of its
 * own — which must exit non-zero, naming the page, and end both its streams saying so. checks.test.ts proves the
 * watch hears each problem; this proves hearing one fails the run. Needs Chromium, like checks.test.ts.
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
  const child = spawn(process.execPath, [path.join(import.meta.dirname, 'broken-page.ts'), how, out], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk));
  const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
  return { code, stdout, stderr, shots: fs.readdirSync(out).sort() };
}

const said = (ended: Ended) => `exit ${ended.code}\n--- stdout\n${ended.stdout}\n--- stderr\n${ended.stderr}`;

/** The lines a stream ends with, from the last `e2e: FAILED` on: what a check that shows a tail, or logs stdout alone, reads. */
const lastSaid = (stream: string): string[] => {
  const lines = stream.trimEnd().split('\n');
  const from = lines.map((line) => line.startsWith('e2e: FAILED — ')).lastIndexOf(true);
  return from < 0 ? [] : lines.slice(from);
};

/** Stdout and stderr both end with the same few lines, naming the failure: `first`, then `more`, then the picture of `shot`. */
function endsSaying(ended: Ended, first: RegExp, more: RegExp[], shot: string): void {
  for (const stream of [ended.stdout, ended.stderr]) {
    const last = lastSaid(stream);
    assert.match(last[0] ?? '', first, said(ended));
    assert.equal(last.length, 2 + more.length, said(ended));
    more.forEach((line, i) => assert.match(last[1 + i], line, said(ended)));
    assert.match(last.at(-1)!, new RegExp(`^  what it looked like: \\S+/${shot}$`), said(ended));
  }
}

test('a page with a console error makes the e2e exit non-zero, naming the page, the theme and the error', { timeout: 60_000 }, async () => {
  const ended = await e2eOn('console-error');
  assert.equal(ended.code, 1, said(ended));
  assert.match(
    ended.stderr,
    /^e2e: FAILED — the console-error page \(\/console-error\) in the light theme: no console error and no failed request — \d+ seen:$/m,
    said(ended),
  );
  assert.match(ended.stderr, /^\s+console error: the graph did not draw$/m, said(ended));
  endsSaying(
    ended,
    /^e2e: FAILED — the console-error page \(\/console-error\) in the light theme: no console error and no failed request — \d+ seen:$/,
    [],
    'console-error-light-failed.png',
  );
  assert.deepEqual(
    ended.shots,
    ['console-error-light-failed.png'],
    `stopped at the first failure, with a picture of it, and no screenshot claiming the page passed\n${said(ended)}`,
  );
});

test(
  'a page with a failed request makes the e2e exit non-zero, naming the page, the theme and the request',
  { timeout: 60_000 },
  async () => {
    const ended = await e2eOn('failed-request');
    assert.equal(ended.code, 1, said(ended));
    assert.match(
      ended.stderr,
      /^e2e: FAILED — the failed-request page \(\/failed-request\) in the light theme: no console error and no failed request — \d+ seen:$/m,
      said(ended),
    );
    assert.match(ended.stderr, /^\s+request failed: GET http:\/\/127\.0\.0\.1:\d+\/api\/dropped — /m, said(ended));
    assert.deepEqual(ended.shots, ['failed-request-light-failed.png'], said(ended));
    endsSaying(
      ended,
      /^e2e: FAILED — the failed-request page \(\/failed-request\) in the light theme: no console error and no failed request — \d+ seen:$/,
      [],
      'failed-request-light-failed.png',
    );
  },
);

test(
  "a press on a button something lies over makes the e2e exit non-zero, and its last lines on stdout and on stderr say the page, the theme, the button and what lay over it — not the call log's retries",
  { timeout: 60_000 },
  async () => {
    const ended = await e2eOn('covered');
    assert.equal(ended.code, 1, said(ended));
    assert.deepEqual(ended.shots, ['covered-light-failed.png'], said(ended));
    endsSaying(
      ended,
      /^e2e: FAILED — the covered page \(\/covered\) in the light theme: could not be checked: locator\.click: Timeout 2000ms exceeded\.$/,
      [/^  waiting for getByRole\('button', \{ name: 'Press' \}\)$/, /^  <div data-cover="">…<\/div> intercepts pointer events$/],
      'covered-light-failed.png',
    );
  },
);

test(
  "a page that fails once the e2e's store is gone says the store is gone, not what the page could not find",
  { timeout: 60_000 },
  async () => {
    const ended = await e2eOn('store-removed');
    assert.equal(ended.code, 1, said(ended));
    assert.match(ended.stderr, /^  what removes it: a sweep of the temporary directory — /m, said(ended));
    assert.match(
      ended.stderr,
      /^  what the page then failed on: the page draws a run the store has — not visible after 2000 ms$/m,
      said(ended),
    );
    endsSaying(
      ended,
      /^e2e: FAILED — the store-removed page \(\/store-removed\) in the light theme: the e2e's store \S+\/store is gone, removed from outside while the pages were visited: every run reads 404 since, so no page failed\. Run the e2e again$/,
      [],
      'store-removed-light-failed.png',
    );
    assert.deepEqual(ended.shots, ['store-removed-light-failed.png'], said(ended));
  },
);

test('a store gone between two visits is said before the next page, which is not visited', { timeout: 60_000 }, async () => {
  const ended = await e2eOn('store-swept');
  assert.equal(ended.code, 1, said(ended));
  assert.match(ended.stdout, /the store-swept page \(\/store-swept\) in the light theme ✓/, said(ended));
  for (const stream of [ended.stdout, ended.stderr]) {
    assert.match(
      lastSaid(stream).join('\n'),
      /^e2e: FAILED — before the store-swept page \(\/store-swept\) in the dark theme: the e2e's store \S+\/store is gone, removed from outside while the pages were visited: every run reads 404 since, so no page failed\. Run the e2e again$/,
      said(ended),
    );
  }
  assert.deepEqual(ended.shots, ['store-swept-light.png'], said(ended));
});

test(
  'the same page without the break passes in both themes — or the refusals above would be of the page, not the break',
  { timeout: 60_000 },
  async () => {
    const ended = await e2eOn('none');
    assert.equal(ended.code, 0, said(ended));
    assert.match(ended.stdout, /the none page \(\/none\) in the light theme ✓/, said(ended));
    assert.match(ended.stdout, /the none page \(\/none\) in the dark theme ✓/, said(ended));
    assert.deepEqual(ended.shots, ['none-dark.png', 'none-light.png'], said(ended));
  },
);
