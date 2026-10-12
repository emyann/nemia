/**
 * The board's own parts the runs page stands on, each rendered apart from any page: the steps rail, the pager, the text link, and the
 * look's marks — the cut-corner frame, the plate, the sticker and the scan lines. A cut corner is an overlay, never a clip.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router';
import './tsx.ts';

const { CutFrame } = await import('../src/components/CutFrame.tsx');
const { Pager } = await import('../src/components/Pager.tsx');
const { Plate } = await import('../src/components/Plate.tsx');
const { RunSteps } = await import('../src/components/RunSteps.tsx');
const { ScanLines } = await import('../src/components/ScanLines.tsx');
const { Sticker } = await import('../src/components/Sticker.tsx');
const { TextLink } = await import('../src/components/TextLink.tsx');

const COMPONENTS = path.resolve(import.meta.dirname, '../src/components');

/** The markup of `element` under a router whose address is `at`. */
async function drawn(element: ReactElement, at = '/'): Promise<string> {
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: [at] }) });
  await router.load();
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  return renderToStaticMarkup(createElement(RouterContextProvider, { router, children: element }));
}

/** The opening tag in `html` that holds `mark`, an attribute of it. */
function tagWith(html: string, mark: string): string {
  const tag = html.match(new RegExp(`<[a-z0-9]+\\b[^>]*\\b${mark}[^>]*>`))?.[0];
  assert.ok(tag, `a tag with ${mark} in ${html}`);
  return tag;
}

const STEPS = [
  { name: 'design', status: 'verified ✓' },
  { name: 'implement', status: 'running (working)' },
  { name: 'review', status: 'failed ✗ check (exit 1)' },
  { name: 'land', status: 'awaiting approval' },
];

test('the steps rail: one bar a step by its state, its names in the hue of what waits or failed, and read aloud as one picture', async () => {
  const html = await drawn(createElement(RunSteps, { steps: STEPS, cancelled: false, held: false, names: true }));
  assert.match(tagWith(html, 'data-run-steps'), /role="img"/);
  assert.match(html, /aria-label="design done, implement at work, review failed its check, land waits for you"/);
  assert.deepEqual(
    [...html.matchAll(/data-step="([^"]+)" data-state="([^"]+)"/g)].map((m) => [m[1], m[2]]),
    [
      ['design', 'verified'],
      ['implement', 'working'],
      ['review', 'failed-check'],
      ['land', 'awaiting-approval'],
    ],
  );
  assert.match(tagWith(html, 'data-step-name="land"'), /text-yours/);
  assert.match(tagWith(html, 'data-step-name="review"'), /text-failure/);
  assert.match(tagWith(html, 'data-step-name="design"'), /text-on-surface-variant/);
  assert.match(tagWith(html, 'data-step="land"'), /bg-yours/);
  assert.match(tagWith(html, 'data-step="implement"'), /bg-alive-container/);
  const bare = await drawn(createElement(RunSteps, { steps: STEPS, cancelled: false, held: true }));
  assert.doesNotMatch(bare, /data-step-name/, 'no names unless asked');
  assert.match(tagWith(bare, 'data-step="land"'), /data-state="held"/, "a held run's gate is drawn held");
});

test('the pager: Newer and Older keep the address and change its page alone, and say the rows and where it stands', async () => {
  const html = await drawn(createElement(Pager, { page: 2, pages: 3, total: 25, size: 9 }), '/?factory=nemia&page=2');
  assert.match(html, /role="group" aria-label="Pages of finished runs"/);
  assert.match(tagWith(html, 'data-pager-rows'), /data-pager-rows/);
  assert.match(html, />Runs 10–18 of 25</);
  assert.match(html, />Page 2 \/ 3</);
  assert.match(tagWith(html, 'data-pager-newer'), /href="\/\?factory=nemia"/, 'Newer drops the page for the first, and keeps the factory');
  assert.match(tagWith(html, 'data-pager-older'), /href="\/\?factory=nemia&amp;page=3"/);
});

test('REFUSED: the pager at an end offers no link there, and from a page past the last Newer leads to the last', async () => {
  const first = await drawn(createElement(Pager, { page: 1, pages: 3, total: 25, size: 9 }));
  const newer = tagWith(first, 'data-pager-newer');
  assert.match(newer, /aria-disabled="true"/);
  assert.doesNotMatch(newer, /href=/);
  assert.match(tagWith(first, 'data-pager-older'), /href="\/\?page=2"/);
  const last = await drawn(createElement(Pager, { page: 3, pages: 3, total: 25, size: 9 }), '/?page=3');
  assert.match(tagWith(last, 'data-pager-older'), /aria-disabled="true"/);
  assert.match(tagWith(last, 'data-pager-newer'), /href="\/\?page=2"/);
  const past = await drawn(createElement(Pager, { page: 80, pages: 3, total: 25, size: 9 }), '/?page=80');
  assert.match(past, />Page 80 is past the last, 3\.</);
  assert.match(tagWith(past, 'data-pager-newer'), /href="\/\?page=3"/);
  assert.match(tagWith(past, 'data-pager-older'), /aria-disabled="true"/);
});

test('the text link is a link to its route, underlined, with a ring for the keyboard', async () => {
  const html = await drawn(createElement(TextLink, { to: '/', search: { factory: 'nemia' } } as never, 'Read the review'));
  const link = tagWith(html, 'data-text-link');
  assert.match(link, /^<a /);
  assert.match(link, /href="\/\?factory=nemia"/);
  assert.match(link, / underline /, 'underlined, not only offset');
  assert.match(link, /data-focus-visible:ring-2/);
  assert.match(html, />Read the review</);
});

test('the plate: its count, its heading and a barcode nobody reads; quiet, in grey with none', async () => {
  const loud = await drawn(createElement(Plate, { count: 2, title: 'Waiting on you' }));
  assert.match(tagWith(loud, 'data-plate='), /data-plate="loud"[^>]*bg-yours text-on-yours/);
  assert.match(loud, /data-plate-count[^>]*>2</);
  assert.match(loud, /<h2[^>]*>Waiting on you<\/h2>/);
  assert.match(tagWith(loud, 'data-plate-barcode'), /aria-hidden="true"/);
  assert.match(tagWith(loud, 'data-plate-barcode'), /currentColor/);
  const quiet = await drawn(createElement(Plate, { count: 0, title: 'Waiting on you', quiet: true }));
  assert.match(tagWith(quiet, 'data-plate='), /data-plate="quiet"[^>]*bg-rest text-on-rest/);
  assert.doesNotMatch(quiet, /data-plate-barcode/);
});

test('the sticker: a label over its value, filled in its hue', async () => {
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  const html = await drawn(createElement(Sticker, { hue: 'money', label: 'Cost', children: '$4.25' }));
  assert.match(tagWith(html, 'data-sticker'), /data-sticker="money"[^>]*bg-money text-on-money/);
  assert.match(html, />Cost<\/span><span[^>]*>\$4\.25</);
});

test('the scan lines: a glow and lines in the hue of a session at work, thinned, and the glow alone without lines', async () => {
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  const html = await drawn(createElement(ScanLines, { children: 'page' }));
  const ground = tagWith(html, 'data-scan-lines');
  assert.match(ground, /radial-gradient\(/);
  assert.match(ground, /repeating-linear-gradient\(/);
  assert.match(ground, /var\(--meaning-alive\) 7%/);
  assert.match(ground, /var\(--meaning-alive\) 4%/);
  assert.doesNotMatch(ground, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i, 'no colour written by hand');
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  const plain = tagWith(await drawn(createElement(ScanLines, { lines: false, children: 'page' })), 'data-scan-lines');
  assert.doesNotMatch(plain, /repeating-linear-gradient/);
});

test('the cut frame: two overlays nobody reads or presses, each before what the frame holds, in the hue of its edge', async () => {
  const child = createElement('button', { type: 'button' }, 'Approve');
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  const html = await drawn(createElement(CutFrame, { hue: 'yours', children: child }));
  assert.match(tagWith(html, 'data-cut-frame'), /data-cut-frame="yours"[^>]*border-yours/);
  const corners = [...html.matchAll(/<span[^>]*data-cut-corner="([^"]+)"[^>]*>/g)];
  assert.deepEqual(
    corners.map((m) => m[1]),
    ['top-right', 'bottom-left'],
  );
  for (const [tag] of corners) {
    assert.match(tag, /aria-hidden="true"/);
    assert.match(tag, /pointer-events-none/);
    assert.match(tag, /var\(--background\)[^"]*var\(--meaning-yours\)[^"]*transparent/, 'the ground outside, the edge, then nothing');
    assert.match(tag, /width:28px;height:28px/);
  }
  assert.ok(
    html.lastIndexOf('data-cut-corner') < html.indexOf('<button'),
    'both overlays come before the content, which stands above them',
  );
  assert.match(html, /<div class="relative"><button/);
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  const quiet = await drawn(createElement(CutFrame, { on: 'card', size: 12, children: child }));
  assert.match(tagWith(quiet, 'data-cut-frame'), /border-outline-variant/);
  assert.match(tagWith(quiet, 'data-cut-corner="top-right"'), /width:12px;height:12px[^"]*var\(--card\)/);
});

/** Each way `source` would cut what a frame holds off: a clip path, or an overflow that hides or clips. */
const clips = (source: string): string[] => [...source.matchAll(/clip-?path|overflow-(?:hidden|clip)|overflow\s*:/gi)].map((m) => m[0]);

test('REFUSED: the cut frame clips nothing, so a focus ring inside it is drawn whole', () => {
  assert.deepEqual(clips('style={{ clipPath: "polygon(0 0)" }}'), ['clipPath']);
  assert.deepEqual(clips('clip-path: polygon(0 0, calc(100% - 28px) 0)'), ['clip-path']);
  assert.deepEqual(clips('className="relative overflow-hidden"'), ['overflow-hidden']);
  assert.deepEqual(clips('className="overflow-clip" style={{ overflow: "hidden" }}'), ['overflow-clip', 'overflow:']);
  const source = fs.readFileSync(path.join(COMPONENTS, 'CutFrame.tsx'), 'utf8');
  assert.match(source, /export function CutFrame\(/, 'the frame is read');
  assert.deepEqual(clips(source), []);
});
