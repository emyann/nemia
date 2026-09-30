/**
 * The e2e's last lines when a page fails (`headlineOf`, visit.ts): the failure in a few lines — which page, in which theme, what failed,
 * and the picture — said again after each server's output, on stdout too. A check shows the tail of what it printed and logs its stdout
 * alone, so a failure said once, first, on stderr reads as an exit 1 with nothing printed. No browser, so `npm test` runs it;
 * `e2e/visit.test.ts` runs a page that fails so through the runner, and reads the lines at the end of both streams.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headlineOf } from './e2e/visit.ts';

const PICTURE = '  what it looked like: /tmp/out/factory-gate-light-failed.png';

/** A click Playwright gave up on, as it words one, under the failure's first line and over the picture (`PageFailure`). */
const CLICK = [
  'the factory-gate page (/) in the light theme: could not be checked: locator.click: Timeout 30000ms exceeded.',
  'Call log:',
  '  - waiting for locator(\'.react-flow__node[data-id="ship-it-e2e3"]\').locator(\'[data-answer="Approve"]\')',
  '    - locator resolved to <button type="button" data-answer="Approve">Approve</button>',
  '  - attempting click action',
  '    2 × waiting for element to be visible, enabled and stable',
  '      - element is visible, enabled and stable',
  '      - scrolling into view if needed',
  '      - done scrolling',
  '      - <span class="text-xs"> · resets 23:16</span> from <div class="flex flex-wrap">…</div> subtree intercepts pointer events',
  '    - retrying click action',
  '    - waiting 20ms',
  '    40 × waiting for element to be visible, enabled and stable',
  '       - element is visible, enabled and stable',
  '       - scrolling into view if needed',
  '       - done scrolling',
  '       - <span class="text-xs"> · resets 23:16</span> from <div class="flex flex-wrap">…</div> subtree intercepts pointer events',
  '     - retrying click action',
  '       - waiting 500ms',
  PICTURE,
].join('\n');

/** How Playwright words it: its call log dimmed, a colour code at each end of every line. */
const dimmed = (message: string) =>
  message
    .split('\n')
    .map((line, i) => (i > 1 && line !== PICTURE ? `${String.fromCharCode(27)}[2m${line}${String.fromCharCode(27)}[22m` : line))
    .join('\n');

test('a click Playwright gave up on is said in four lines: the page, the theme and the timeout; the element it waited for; what was in the way; and the picture — none of its retrying', () => {
  for (const message of [CLICK, dimmed(CLICK)])
    assert.deepEqual(headlineOf(message), [
      'the factory-gate page (/) in the light theme: could not be checked: locator.click: Timeout 30000ms exceeded.',
      'waiting for locator(\'.react-flow__node[data-id="ship-it-e2e3"]\').locator(\'[data-answer="Approve"]\')',
      '<span class="text-xs"> · resets 23:16</span> from <div class="flex flex-wrap">…</div> subtree intercepts pointer events',
      'what it looked like: /tmp/out/factory-gate-light-failed.png',
    ]);
});

test("an assertion's refusal, with no call log, is its first line and the picture — the list under it stays above, said once", () => {
  const refused = [
    'the runs page (/runs) in the dark theme: no console error and no failed request — 2 seen:',
    '    console error: a',
    '    request failed: GET /api/x',
    PICTURE,
  ].join('\n');
  assert.deepEqual(headlineOf(refused), [
    'the runs page (/runs) in the dark theme: no console error and no failed request — 2 seen:',
    'what it looked like: /tmp/out/factory-gate-light-failed.png',
  ]);
});

test('a failure before any page — the build, a server — is its first line; and no line of the headline runs past 300 characters', () => {
  assert.deepEqual(headlineOf('the web app did not build:\nsrc/x.ts: error'), ['the web app did not build:']);
  const long = headlineOf(`${'x'.repeat(1_000)}\nCall log:\n  - waiting for locator('${'y'.repeat(1_000)}')`);
  assert.deepEqual(
    long.map((line) => line.length),
    [300, 300],
  );
  assert.ok(long.every((line) => line.endsWith('…')));
});
