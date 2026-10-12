/**
 * The board's own parts the runs page stands on, each rendered apart from any page: the steps rail, the pager, the text link, and the
 * look's marks — the cut-corner frame, the plate, the sticker and the scan lines. A cut corner is an overlay, never a clip.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  assert.match(tagWith(html, 'data-step="implement"'), /bg-alive /, 'the step at work is the lit bar, in its hue itself');
  assert.doesNotMatch(tagWith(html, 'data-step="implement"'), /bg-alive-container/);
  assert.match(tagWith(html, 'data-step="review"'), /bg-failure-container/, 'every other bar is drawn as its state is on every page');
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

test('the plate: its count, its heading and a barcode nobody reads, in grey too; quiet, in grey with none', async () => {
  const loud = await drawn(createElement(Plate, { count: 2, title: 'Waiting on you' }));
  assert.match(tagWith(loud, 'data-plate='), /data-plate="loud"[^>]*bg-yours text-on-yours/);
  assert.match(loud, /data-plate-count[^>]*>2</);
  assert.match(loud, /<h2[^>]*>Waiting on you<\/h2>/);
  assert.match(tagWith(loud, 'data-plate-barcode'), /aria-hidden="true"/);
  assert.match(tagWith(loud, 'data-plate-barcode'), /currentColor/);
  const rest = await drawn(createElement(Plate, { count: 6, title: 'Finished', hue: 'grey' }));
  assert.match(tagWith(rest, 'data-plate='), /data-plate="loud"[^>]*data-plate-hue="grey"[^>]*bg-rest text-on-rest/);
  assert.match(tagWith(rest, 'data-plate-barcode'), /currentColor/, 'a plate that counts runs keeps its barcode, at rest too');
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

test('the cut frame: a shape nobody reads or presses, before what the frame holds: an edge in its hue around the card ground', async () => {
  const child = createElement('button', { type: 'button' }, 'Approve');
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  const html = await drawn(createElement(CutFrame, { hue: 'yours', children: child }));
  assert.match(tagWith(html, 'data-cut-frame'), /data-cut-frame="yours"/);
  const shape = tagWith(html, 'data-cut-shape');
  assert.match(shape, /aria-hidden="true"/);
  assert.match(shape, /pointer-events-none/);
  assert.match(shape, /filter:drop-shadow\(0 0 10px color-mix\(in srgb, var\(--meaning-yours\) 26%, transparent\)\)/, 'its glow');
  assert.match(
    tagWith(html, 'data-cut-edge'),
    /background-color:var\(--meaning-yours\);clip-path:polygon\(0px 0px, calc\(100% - 28px\) 0px, 100% 28px, 100% 100%, 28px 100%, 0px calc\(100% - 28px\)\)/,
  );
  assert.match(
    tagWith(html, 'data-cut-ground'),
    /bg-card[^>]*clip-path:polygon\(1px 1px, calc\(100% - 28\.41px\) 1px, calc\(100% - 1px\) 28\.41px,/,
    "the ground a pixel inside the edge, its cut beside the edge's",
  );
  assert.ok(html.indexOf('data-cut-ground') < html.indexOf('<button'), 'the shape comes before the content, which stands above it');
  assert.match(html, /<div class="relative"><button/);
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  const quiet = await drawn(createElement(CutFrame, { size: 24, children: child }));
  assert.match(tagWith(quiet, 'data-cut-edge'), /var\(--md-sys-color-outline-variant\);clip-path:polygon\(0px 0px, calc\(100% - 24px\)/);
  assert.doesNotMatch(tagWith(quiet, 'data-cut-shape'), /filter/, 'a frame with no hue casts no glow');
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  const alive = await drawn(createElement(CutFrame, { hue: 'alive', children: child }));
  assert.doesNotMatch(tagWith(alive, 'data-cut-shape'), /filter/, 'nor one of a session at work');
});

/** Each way `markup` would cut what an element holds off: a clip path, or an overflow that hides or clips. */
const clips = (markup: string): string[] => [...markup.matchAll(/clip-?path|overflow-(?:hidden|clip)|overflow\s*:/gi)].map((m) => m[0]);

test('REFUSED: the cut frame clips what it holds: only its shape, which holds nothing, is cut, so a focus ring inside is whole', async () => {
  assert.deepEqual(clips('style="clip-path:polygon(0 0)"'), ['clip-path']);
  assert.deepEqual(clips('style={{ clipPath: "polygon(0 0)" }}'), ['clipPath']);
  assert.deepEqual(clips('class="relative overflow-hidden"'), ['overflow-hidden']);
  assert.deepEqual(clips('class="overflow-clip" style="overflow:hidden"'), ['overflow-clip', 'overflow:']);
  const child = createElement('button', { type: 'button' }, 'Approve');
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  const html = await drawn(createElement(CutFrame, { hue: 'yours', className: 'h-full', children: child }));
  const shape = /<span[^>]*data-cut-shape[^>]*>(?:<span[^>]*><\/span>)+<\/span>/.exec(html);
  assert.ok(shape, 'the shape is a span that holds its two layers and nothing else');
  assert.equal(clips(shape[0]).length, 2, 'each layer of the shape is cut');
  assert.deepEqual(clips(html.replace(shape[0], '')), [], 'and nothing else of the frame is: not the frame, not what holds its content');
});
