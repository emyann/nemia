/**
 * The board's own parts the runs page stands on, each rendered apart from any page: the steps rail, the pager, the text link, and the
 * look's marks — the cut-corner frame, the plate, the sticker and the scan lines. A cut corner is an overlay, never a clip.
 */
import { beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router';
import './tsx.ts';
import { coded } from './run.fixture.ts';

const { CutFrame } = await import('../src/components/look/CutFrame.tsx');
const { CutCue } = await import('../src/components/look/CutCue.tsx');
const { CutField } = await import('../src/components/look/CutField.tsx');
const { CutTag } = await import('../src/components/look/CutTag.tsx');
const { Pager } = await import('../src/components/look/Pager.tsx');
const { PageName, Plate } = await import('../src/components/look/Plate.tsx');
const { StepGraph } = await import('../src/components/look/StepGraph.tsx');
const { ScanLines } = await import('../src/components/look/ScanLines.tsx');
const { Sticker } = await import('../src/components/look/Sticker.tsx');
const { TextLink } = await import('../src/components/look/TextLink.tsx');

/** The markup of `element` under a router whose address is `at`. */
async function drawn(element: ReactElement, at = '/') {
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: [at] }) });
  await router.load();
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
  return renderToStaticMarkup(createElement(RouterContextProvider, { router, children: element }));
}

/** The opening tag in `html` that holds `mark`, an attribute of it. */
function tagWith(html: string, mark: string) {
  const tag = html.match(new RegExp(`<[a-z0-9]+\\b[^>]*\\b${mark}[^>]*>`))?.[0];
  assert.ok(tag, `a tag with ${mark} in ${html}`);
  return tag;
}

const STEPS = [
  { name: 'design', ...coded('verified ✓'), note: null, roundDue: false },
  { name: 'implement', ...coded('running (working)'), note: null, roundDue: false },
  { name: 'review', ...coded('failed ✗ check (exit 1)'), note: null, roundDue: false },
  { name: 'land', ...coded('awaiting approval'), note: null, roundDue: false },
];

/** A run of `steps` on a chain in their order, design and land gated, held where `held` says. */
const graphRun = (steps: ReadonlyArray<(typeof STEPS)[number]>, held = false) => ({
  steps,
  graph: {
    roots: [steps[0].name],
    edges: steps.slice(1).map((step, i) => ({ from: steps[i].name, to: step.name, kind: 'after' as const })),
  },
  gates: [
    { step: 'design', at: 'after' as const },
    { step: 'land', at: 'before' as const },
  ],
  cancelledAt: null,
  holding: held ? { at: '2026-11-15T17:30:00.000Z', runs: [], word: 'held by you', advice: '', waitingOnYou: false } : null,
});

/** The canvas's barcode of each plate: an inked bar and a gap in turn, in pixels. */
const BARS = {
  yours: 'currentColor 0 2px, transparent 2px 3px, currentColor 3px 4px, transparent 4px 7px, currentColor 7px 10px, transparent 10px 12px',
  alive: 'currentColor 0 1px, transparent 1px 3px, currentColor 3px 6px, transparent 6px 7px, currentColor 7px 8px, transparent 8px 11px',
  grey: 'currentColor 0 3px, transparent 3px 4px, currentColor 4px 5px, transparent 5px 8px, currentColor 8px 10px, transparent 10px 13px',
} as const;

/** The hues whose plate, as `barcodeOf` draws it, carries another barcode than the canvas gives it. */
const wrongBarcodes = (barcodeOf: (hue: keyof typeof BARS) => string) =>
  (Object.keys(BARS) as (keyof typeof BARS)[]).filter(
    (hue) => !barcodeOf(hue).includes(`background-image:repeating-linear-gradient(90deg, ${BARS[hue]})`),
  );

/** How many elements of `markup` name a grain. */
const grains = (markup: string) => markup.split('data-grain=').length - 1;

/** Each way `markup` would cut what an element holds off: a clip path, or an overflow that hides or clips. */
const clips = (markup: string) => [...markup.matchAll(/clip-?path|overflow-(?:hidden|clip)|overflow\s*:/gi)].map((m) => m[0]);

describe('the cut parts: CutTag, CutFrame, CutField and CutCue, the grain each wears, and no clip on what a frame holds', () => {
  test('the cut tag cuts its top-right corner by seven pixels on its shape, draws its own edge and ring, and bares what it holds', async () => {
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const html = await drawn(createElement(CutTag, { children: 'YOUR WORD' }));
    assert.deepEqual(clips(tagWith(html, 'data-cut-tag')), [], 'the holder is cut by nothing, so its ring stands outside it');
    const shape = tagWith(html, 'data-cut-shape');
    assert.match(
      shape,
      /clip-path:polygon\(0px 0px, calc\(100% - 7px\) 0px, 100% 7px, 100% 100%, 0px 100%\)/,
      'the corner is cut as the canvas cuts it',
    );
    assert.match(shape, /\*\*:border-transparent!/, 'what it holds loses its border, which the clip would cut open');
    assert.match(shape, /\*\*:\[box-shadow:none\]!/, 'and its ring');
    assert.match(shape, /\*\*:outline-none!/, 'and its outline');
    const ring = tagWith(html, 'data-cut-ring');
    assert.match(ring, /aria-hidden="true"/);
    assert.match(ring, /\bhidden\b[^"]*group-has-\[:focus-visible\]\/tag:block/, 'shown with the keyboard on what it holds');
    assert.match(ring, /clip-path:polygon\(evenodd, 0px 0px, calc\(100% - 9\.93px\) 0px, 100% 9\.93px, 100% 100%, 0px 100%,/);
    assert.doesNotMatch(html, /data-cut-edge/, 'no edge unless it is asked for');
    assert.match(html, />YOUR WORD<\/span><\/span>$/);
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const edged = await drawn(createElement(CutTag, { edge: true, children: 'TO COME' }));
    const edge = tagWith(edged, 'data-cut-edge');
    assert.match(edge, /aria-hidden="true"/);
    assert.match(
      edge,
      /clip-path:polygon\(evenodd, 0px 0px, calc\(100% - 7px\) 0px, 100% 7px, 100% 100%, 0px 100%, 0px 0px, 1px 1px, calc\(100% - 7\.41px\) 1px,/,
      'a band a pixel wide along the whole cut shape, the diagonal too',
    );
    assert.match(edge, /background-image:linear-gradient\(var\(--md-sys-color-outline-variant\)/, 'painted as an image, never a ground');
  });
  test('the cut frame: a shape nobody reads or presses, before what the frame holds: an edge in its hue around the card ground', async () => {
    const child = createElement('button', { type: 'button' }, 'Approve');
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
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
      /bg-surface-container-low[^>]*clip-path:polygon\(1px 1px, calc\(100% - 28\.41px\) 1px, calc\(100% - 1px\) 28\.41px,/,
      "the ground a pixel inside the edge, its cut beside the edge's",
    );
    assert.ok(html.indexOf('data-cut-ground') < html.indexOf('<button'), 'the shape comes before the content, which stands above it');
    assert.match(html, /<div class="relative"><button/);
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const quiet = await drawn(createElement(CutFrame, { size: 24, children: child }));
    assert.match(tagWith(quiet, 'data-cut-edge'), /var\(--md-sys-color-outline-variant\);clip-path:polygon\(0px 0px, calc\(100% - 24px\)/);
    assert.doesNotMatch(tagWith(quiet, 'data-cut-shape'), /filter/, 'a frame with no hue casts no glow');
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const alive = await drawn(createElement(CutFrame, { hue: 'alive', children: child }));
    assert.doesNotMatch(tagWith(alive, 'data-cut-shape'), /filter/, 'nor one of a session at work');
  });
  test('a frame of what failed: its edge in failure, and no glow', async () => {
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const html = await drawn(createElement(CutFrame, { hue: 'failure', children: createElement('span', null, 'Not sent') }));
    assert.match(tagWith(html, 'data-cut-frame'), /data-cut-frame="failure"/);
    assert.match(tagWith(html, 'data-cut-edge'), /background-color:var\(--meaning-failure\);/);
    assert.doesNotMatch(tagWith(html, 'data-cut-shape'), /filter/);
  });
  test("the cut field: its edge drawn in the cut shape, the whole of it in a session's hue when the focus is in it", async () => {
    const field = createElement('input', { 'aria-label': 'Message' });
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const html = await drawn(createElement(CutField, { size: 10, children: field }));
    const shape = tagWith(html, 'data-cut-shape');
    assert.match(shape, /aria-hidden="true"/);
    assert.match(shape, /pointer-events-none/);
    assert.doesNotMatch(shape, /filter/, 'a field casts no glow');
    assert.match(tagWith(html, 'data-cut-field'), /group\/field/, 'the focus in it is read from the box itself');
    const edge = tagWith(html, 'data-cut-edge');
    assert.match(edge, /clip-path:polygon\(0px 0px, calc\(100% - 10px\) 0px, 100% 10px, 100% 100%, 10px 100%, 0px calc\(100% - 10px\)\)/);
    assert.match(edge, /\bbg-outline-variant\b/, "quiet, the outline's hue");
    assert.match(edge, /\bgroup-focus-within\/field:bg-ring\b/, "with the focus in it, the focus ring's ink, the diagonals with the sides");
    assert.match(
      tagWith(html, 'data-cut-ground="quiet"'),
      /group-focus-within\/field:hidden[^>]*clip-path:polygon\(1px 1px,/,
      'quiet, the ground a pixel inside the edge',
    );
    assert.match(
      tagWith(html, 'data-cut-ground="focus"'),
      /hidden group-focus-within\/field:block[^>]*clip-path:polygon\(2px 2px,/,
      'focused, two pixels inside it: the edge the width it has quiet and a pixel more',
    );
    assert.deepEqual(
      html.match(/(?:focus-within:|focus-visible:|data-focus-visible:)?ring-[\w[]/g),
      null,
      'no rectangular ring on the field or on the frame: a clip would take it off the two cut corners',
    );
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const quiet = await drawn(createElement(CutField, { ground: 'bg-surface-container', children: field }));
    assert.match(tagWith(quiet, 'data-cut-edge'), /calc\(100% - 12px\) 0px/, 'a field cut 12 by default');
    for (const layer of ['quiet', 'focus']) assert.match(tagWith(quiet, `data-cut-ground="${layer}"`), /\bbg-surface-container\b/);
    assert.match(
      html,
      /<div class="relative" style="clip-path:polygon\(-9999px -9999px, calc\(100% - 10011\.83px\) -9999px, calc\(100% \+ 9999px\) 10011\.83px,/,
      'what it holds is kept two pixels inside each diagonal, its straight sides open',
    );
    assert.doesNotMatch(html, /data-cut-end/, 'no end unless one is given');
    const button = createElement('button', { type: 'submit' }, 'Filter');
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const ended = await drawn(createElement(CutField, { end: button, children: field }));
    assert.match(
      tagWith(ended, 'data-cut-end'),
      /style="padding-block:4px;margin-right:16px"/,
      'the control at its end set in from the right by the cut and the room the row keeps, above and below it too',
    );
    assert.ok(ended.indexOf('<input') < ended.indexOf('data-cut-end'), 'what it holds before the control');
  });
  test("the cut bubble: the agent's words on the highest surface, the bubble's own element cut at two corners, its padding its own", async () => {
    const { CutBubble } = await import('../src/components/look/CutBubble.tsx');
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const html = await drawn(createElement(CutBubble, { 'data-chat-bubble': 'agent', children: 'Hello' }));
    assert.equal(
      html,
      '<div data-chat-bubble="agent" class="bg-surface-container-highest px-3.5 py-2.5 text-body-medium text-on-surface" style="clip-path:polygon(0px 0px, calc(100% - 10px) 0px, 100% 10px, 100% 100%, 10px 100%, 0px calc(100% - 10px))">Hello</div>',
      "the conversation's bubble as it was drawn by hand: one element, its ground, its padding and its cut",
    );
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const pre = await drawn(createElement(CutBubble, { pre: true, children: 'a\nb' }));
    assert.match(pre, /class="bg-surface-container-highest px-3\.5 py-2\.5 whitespace-pre-wrap text-body-medium text-on-surface"/);
  });
  test("the cut icon press: the kit's tonal icon button in the cut, its ring a band in the cut shape around it", async () => {
    const { CutIconPress } = await import('../src/components/look/CutIconPress.tsx');
    const { ArrowUpIcon } = await import('lucide-react');
    const html = await drawn(createElement(CutIconPress, { label: 'Send', icon: ArrowUpIcon, 'data-chat-button': 'send' }));
    const ring = tagWith(html, 'data-cut-ring');
    assert.match(ring, /\bhidden\b[^"]*group-has-data-focus-visible\/cutpress:block/, 'shown with the keyboard on it');
    assert.match(ring, /clip-path:polygon\(evenodd, 0px 0px, calc\(100% - 12\.93px\) 0px,/, 'a band in the cut shape grown by its gap');
    const button = tagWith(html, 'data-chat-button');
    assert.match(button, /aria-label="Send"/);
    assert.match(button, /clip-path:polygon\(0px 0px, calc\(100% - 10px\) 0px, 100% 10px, 100% 100%, 10px 100%, 0px calc\(100% - 10px\)\)/);
    assert.doesNotMatch(button, /class="[^"]*(?<![\w-])border(?![\w-])/, 'tonal: no border for the clip to cut open');
  });
  test('a cue: its words in small caps, in the ink of its hue, in a frame of that hue cut 9', async () => {
    const inks = { yours: 'text-yours', alive: 'text-alive', failure: 'text-failure', none: 'text-on-surface-variant' } as const;
    for (const [hue, ink] of Object.entries(inks)) {
      // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
      const html = await drawn(createElement(CutCue, { hue: hue as keyof typeof inks, children: 'Answering' }));
      assert.match(tagWith(html, 'data-cut-frame'), new RegExp(`data-cut-frame="${hue}"`));
      assert.match(tagWith(html, 'data-cut-edge'), /clip-path:polygon\(0px 0px, calc\(100% - 9px\) 0px, 100% 9px,/, `${hue}: cut 9`);
      const words = tagWith(html, 'data-cue');
      assert.match(words, new RegExp(`data-cue="${hue}"`));
      assert.match(words, /text-label-small/);
      assert.match(words, /uppercase/);
      assert.match(words, new RegExp(`\\b${ink}\\b`), `${hue}: its ink`);
      assert.equal(/filter/.test(tagWith(html, 'data-cut-shape')), hue === 'yours', `${hue}: only what waits on you glows`);
    }
  });
  test("the grain: the cut frame's ground wears the quiet one, a frame inside a frame none, a sticker and a plate a label's, a tag and a button none", async () => {
    const child = createElement('button', { type: 'button' }, 'Approve');
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const frame = await drawn(createElement(CutFrame, { hue: 'yours', children: child }));
    assert.match(tagWith(frame, 'data-cut-ground'), /data-grain="quiet"/);
    assert.equal(grains(frame), 1, 'the ground alone: neither the edge, the shape that casts the glow, nor what the frame holds');
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const inner = createElement(CutFrame, { size: 12, children: child });
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const nested = await drawn(createElement(CutFrame, { children: createElement('div', null, inner) }));
    assert.equal(grains(nested), 1, 'grain never doubles: the outer frame wears it, the frame inside it none');
    assert.match(tagWith(nested, 'data-cut-ground'), /data-grain="quiet"/, "the first ground is the outer frame's");
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const sticker = await drawn(createElement(Sticker, { hue: 'ink', label: 'Cost', children: '$4.25' }));
    assert.match(tagWith(sticker, 'data-sticker'), /data-grain="label"/);
    assert.equal(grains(sticker), 1);
    for (const quiet of [false, true]) {
      const plate = await drawn(createElement(Plate, { count: 2, title: 'Waiting on you', quiet }));
      assert.match(tagWith(plate, 'data-plate='), /data-grain="label"/, quiet ? 'a quiet plate' : 'a loud plate');
      assert.equal(grains(plate), 1, 'the barcode wears none');
    }
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    assert.equal(grains(await drawn(createElement(CutTag, { children: 'YOUR WORD' }))), 0, 'a cut tag');
    const { CutButton } = await import('../src/components/look/CutButton.tsx');
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    assert.equal(grains(await drawn(createElement(CutButton, { to: '/runs', children: 'Open' }))), 0, 'a cut button');
  });
  test('REFUSED: the cut frame clips what it holds: only its shape, which holds nothing, is cut, so a focus ring inside is whole', async () => {
    assert.deepEqual(clips('style="clip-path:polygon(0 0)"'), ['clip-path']);
    assert.deepEqual(clips('style={{ clipPath: "polygon(0 0)" }}'), ['clipPath']);
    assert.deepEqual(clips('class="relative overflow-hidden"'), ['overflow-hidden']);
    assert.deepEqual(clips('class="overflow-clip" style="overflow:hidden"'), ['overflow-clip', 'overflow:']);
    const child = createElement('button', { type: 'button' }, 'Approve');
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const html = await drawn(createElement(CutFrame, { hue: 'yours', className: 'h-full', children: child }));
    const shape = /<span[^>]*data-cut-shape[^>]*>(?:<span[^>]*><\/span>)+<\/span>/.exec(html);
    assert.ok(shape, 'the shape is a span that holds its two layers and nothing else');
    assert.equal(clips(shape[0]).length, 2, 'each layer of the shape is cut');
    assert.deepEqual(clips(html.replace(shape[0], '')), [], 'and nothing else of the frame is: not the frame, not what holds its content');
  });
});

describe("StepGraph, Pager and TextLink: a run's steps as its graph, and the ways off a page", () => {
  test("the step graph: one node a step by its mark, at work and waiting on you a size larger, read aloud as a group named, each node told in the kit's tooltip", async () => {
    const html = await drawn(createElement(StepGraph, { run: graphRun(STEPS) }));
    assert.match(tagWith(html, 'data-run-steps'), /role="group"/);
    assert.match(html, /aria-label="design verified, implement at work, review failed its check, land waits on you"/);
    assert.deepEqual(
      [...html.matchAll(/data-step="([^"]+)" data-state="([^"]+)" data-mark="([^"]+)"/g)].map((m) => [m[1], m[2], m[3]]),
      [
        ['design', 'verified', 'done'],
        ['implement', 'working', 'alive'],
        ['review', 'failed-check', 'failure'],
        ['land', 'awaiting-approval', 'yours'],
      ],
    );
    assert.match(html, /role="img" aria-label="review · failed its check"[^>]*tabindex="0"/, 'each node a stop of the keyboard, told');
    const sizeOf = (step: string) => Number(/d="M0,-([\d.]+) /.exec(html.slice(html.indexOf(`data-step="${step}"`)))![1]);
    assert.ok(sizeOf('implement') > sizeOf('design') && sizeOf('land') > sizeOf('design'), 'at work and yours a size larger');
    assert.equal(html.match(/data-step-pulse/g)?.length, 1, 'the step at work alone pulses');
    assert.match(html, /data-step="implement"[\s\S]*?data-step-pulse/, "the pulse is the step at work's");
    assert.deepEqual(
      [...html.matchAll(/data-gate="([^"]+)" data-gate-at="([^"]+)"[^>]*stroke="([^"]+)"/g)].map((m) => [m[1], m[2], m[3]]),
      [
        ['design', 'after', 'var(--md-sys-color-outline)'],
        ['land', 'before', 'var(--meaning-yours)'],
      ],
      "a gate's tick on the side of its step its approval is, yellow where that step waits on you",
    );
  });
  test('the step graph with a wrap: each node inside what the wrap gives, its step and state handed, and no tooltip of its own', async () => {
    const wrap = (node: unknown, step: { name: string; state: string }) =>
      createElement('button', { 'data-wrapped': `${step.name} ${step.state}` }, node as ReactElement);
    const html = await drawn(createElement(StepGraph, { run: graphRun(STEPS), wrap }));
    assert.match(
      tagWith(html, 'data-run-steps'),
      /aria-label="design verified, implement at work, review failed its check, land waits on you"/,
    );
    assert.deepEqual(
      [...html.matchAll(/data-step="([^"]+)"[^>]*><button data-wrapped="([^"]+)"/g)].map((m) => [m[1], m[2]]),
      [
        ['design', 'design verified'],
        ['implement', 'implement working'],
        ['review', 'review failed-check'],
        ['land', 'land awaiting-approval'],
      ],
    );
    assert.doesNotMatch(html, /tabindex="0"/, 'the wrap is the stop, not a told mark');
  });
  test('done is filled whether a check says so or its own word does; one to come is hollow; one that waits on something now by its corners; a held run as not started', async () => {
    const steps = [
      { name: 'design', ...coded('unverified'), note: null, roundDue: false },
      { name: 'implement', ...coded('verified ✓'), note: null, roundDue: false },
      { name: 'review', ...coded('waiting'), note: null, roundDue: false },
    ];
    const html = await drawn(createElement(StepGraph, { run: graphRun(steps) }));
    const markOf = (markup: string, step: string) => /data-mark="([^"]+)"/.exec(tagWith(markup, `data-step="${step}"`))?.[1];
    assert.match(tagWith(html, 'data-step="design"'), /data-state="unverified"/, 'the state is still said as it is');
    assert.equal(markOf(html, 'design'), 'done');
    assert.equal(markOf(html, 'implement'), 'done');
    assert.equal(markOf(html, 'review'), 'todo', 'a step that only waits its turn is hollow');
    const waiting = await drawn(
      createElement(StepGraph, { run: graphRun([{ name: 'land', ...coded('waiting on r-0'), note: null, roundDue: false }]) }),
    );
    assert.equal(markOf(waiting, 'land'), 'waits', 'a step that waits on a run is drawn by its corners');
    assert.match(waiting, /stroke-dasharray:3.2 3.871/);
    const held = await drawn(createElement(StepGraph, { run: graphRun(steps, true) }));
    assert.equal(markOf(held, 'review'), 'waits', "a held run's first step not started waits on the hold");
    const gate = await drawn(createElement(StepGraph, { run: graphRun(STEPS, true) }));
    assert.match(tagWith(gate, 'data-step="land"'), /data-state="held"/, "a held run's gate is drawn held");
    assert.equal(markOf(gate, 'land'), 'waits', 'and as not started');
    assert.match(html, /aria-label="design done, implement verified, review to come"/, 'read aloud, a check is told from a word');
  });
  test('a run listed without its graph says what to do', async () => {
    const html = await drawn(createElement(StepGraph, { run: { ...graphRun(STEPS), graph: undefined as never } }));
    assert.match(html, /data-graph-error/);
    assert.match(html, /restart the api/);
  });
  test('the pager: Newer and Older keep the address and change its trail alone, and say the rows and where it stands', async () => {
    const at = { trail: ['f.a'], next: 'f.b', count: 9, total: 25, size: 9 };
    const html = await drawn(createElement(Pager, at), '/?factory=nemia&older=f.a');
    assert.match(html, /role="group" aria-label="Pages of finished runs"/);
    assert.match(tagWith(html, 'data-pager-rows'), /data-pager-rows/);
    assert.match(html, />Runs 10–18 of 25</);
    assert.match(html, />Page 2 \/ 3</);
    assert.match(
      tagWith(html, 'data-pager-newer'),
      /href="\/\?factory=nemia"/,
      'Newer takes the last token off, the first page holding none, and keeps the factory',
    );
    assert.match(tagWith(html, 'data-pager-older'), /href="\/\?factory=nemia&amp;older=f.a%7Ef.b"/, "Older puts the page's continue on");
  });
  test('REFUSED: the pager at an end offers no link there, and from a page past the last Newer leads back', async () => {
    const first = await drawn(createElement(Pager, { trail: [], next: 'f.a', count: 9, total: 25, size: 9 }));
    const newer = tagWith(first, 'data-pager-newer');
    assert.match(newer, /aria-disabled="true"/);
    assert.doesNotMatch(newer, /href=/);
    assert.match(tagWith(first, 'data-pager-older'), /href="\/\?older=f.a"/);
    const last = await drawn(createElement(Pager, { trail: ['f.a', 'f.b'], next: null, count: 7, total: 25, size: 9 }), '/?older=f.a~f.b');
    assert.match(tagWith(last, 'data-pager-older'), /aria-disabled="true"/);
    assert.match(tagWith(last, 'data-pager-newer'), /href="\/\?older=f.a"/);
    const trail = ['f.a', 'f.b', 'f.gone'];
    const past = await drawn(createElement(Pager, { trail, next: null, count: 0, total: 25, size: 9 }), '/?older=f.a~f.b~f.gone');
    assert.match(past, />Page 4 is past the last, 3\.</);
    assert.match(tagWith(past, 'data-pager-newer'), /href="\/\?older=f.a%7Ef.b"/);
    assert.match(tagWith(past, 'data-pager-older'), /aria-disabled="true"/);
  });
  test('the pager writes its buttons in the label face, never the mono of its counts, and rings them as the kit does', async () => {
    const html = await drawn(createElement(Pager, { trail: ['f.a'], next: 'f.b', count: 9, total: 25, size: 9 }));
    for (const mark of ['data-pager-newer', 'data-pager-older']) {
      const button = tagWith(html, mark);
      assert.match(button, /\bfont-label-large\b/, `${mark} is in the label face`);
      assert.match(button, /text-label-large uppercase/);
      assert.match(button, /outline-none outline-3 outline-offset-2 outline-ring focus-visible:outline-solid/);
      assert.doesNotMatch(button, /font-mono|ring-2\b|ring-offset/);
    }
  });
  test('the text link is a link to its route, underlined under the pointer and the keyboard alone, with a ring for the keyboard', async () => {
    const html = await drawn(createElement(TextLink, { to: '/', search: { factory: 'nemia' } } as never, 'Read the review'));
    const link = tagWith(html, 'data-text-link');
    assert.match(link, /^<a /);
    assert.match(link, /href="\/\?factory=nemia"/);
    assert.match(link, / no-underline /, 'no line at rest: a title reads as a title');
    assert.match(link, / hover:underline /, 'underlined under the pointer');
    assert.match(link, / focus-visible:underline /, 'and with the keyboard on it');
    assert.doesNotMatch(link, /(?<![\w:-])underline(?![\w-])/, 'never underlined at rest');
    assert.match(link, /outline-none outline-3 outline-offset-2 outline-ring focus-visible:outline-solid/, "the kit's ring, not its own");
    assert.doesNotMatch(link, /ring-2\b|ring-offset/);
    assert.match(html, />Read the review</);
  });
});

describe("Plate, PageName, Sticker and ScanLines: the look's headings, tiles and ground", () => {
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
  test('each plate carries its own barcode, bar for bar, and two swapped are seen', async () => {
    const tags = Object.fromEntries(
      await Promise.all(
        (Object.keys(BARS) as (keyof typeof BARS)[]).map(
          async (hue) => [hue, tagWith(await drawn(createElement(Plate, { count: 2, title: 'Runs', hue })), 'data-plate-barcode')] as const,
        ),
      ),
    );
    assert.equal(wrongBarcodes((hue) => tags[hue]).length, 0, `each plate carries its own barcode — ${JSON.stringify(tags)}`);
    assert.equal(new Set(Object.values(tags)).size, 3, 'no two plates carry the same');
    const swapped: Record<string, string> = { ...tags, alive: tags.grey, grey: tags.alive };
    assert.equal(wrongBarcodes((hue) => swapped[hue]).join(','), 'alive,grey', 'two barcodes swapped: the check names both plates');
  });
  test("a page's name stands over a hairline, lit under the name alone, as wide as the name and never a fixed width", async () => {
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const html = await drawn(createElement(PageName, { children: 'Factories' }));
    const [name, rule, text, lit] = ['data-page-name', 'data-page-rule', 'data-page-name-text', 'data-page-rule-lit'].map((mark) =>
      tagWith(html, `${mark}[ >=]`),
    );
    assert.match(name, /^<h1 /);
    assert.match(name, /\bpb-4\.5\b/, '18 pixels under the name');
    assert.doesNotMatch(name, /border-b|style=/, 'the name carries no rule of its own, nor an image a contrast measure cannot read');
    assert.match(rule, /aria-hidden="true"/);
    assert.match(rule, /\binset-x-0\b/, 'the hairline runs the whole h1');
    assert.match(rule, /\bh-px\b/);
    assert.match(rule, /background-color:var\(--md-sys-color-outline-variant\)/);
    assert.match(text, /\bw-fit\b/, "the name's own box is as wide as the name");
    assert.match(lit, /aria-hidden="true"/);
    assert.match(lit, /\binset-x-0\b/, "the lit part spans the name's box");
    assert.match(lit, /\s-bottom-4\.5\s/, "on the h1's rule, 18 pixels under the name");
    assert.match(lit, /background-color:var\(--md-sys-color-on-surface\)/, "in the name's own ink, no meaning's hue");
    assert.doesNotMatch(lit, /\bw-|\d+px|width/, 'the lit part has no width of its own');
    assert.match(
      html,
      /<span data-page-name-text[^>]*>Factories<span aria-hidden="true" data-page-rule-lit/,
      'the lit part hangs from the name',
    );
  });
  test('the sticker: a label over its value, filled in its hue, or in plain ink for a cost', async () => {
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const html = await drawn(createElement(Sticker, { hue: 'ink', label: 'Cost', children: '$4.25' }));
    assert.match(tagWith(html, 'data-sticker'), /data-sticker="ink"[^>]*bg-surface-container-highest text-on-surface/);
    assert.match(html, />Cost<\/span><span[^>]*>\$4\.25</);
  });
  test("the scan lines: a glow and lines in the ink of what is read, thinned, no meaning's hue, and the glow alone without lines", async () => {
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const html = await drawn(createElement(ScanLines, { children: 'page' }));
    const ground = tagWith(html, 'data-scan-lines');
    assert.match(ground, /radial-gradient\(/);
    assert.match(ground, /repeating-linear-gradient\(/);
    assert.match(ground, /var\(--md-sys-color-on-surface\) 7%/);
    assert.match(ground, /var\(--md-sys-color-on-surface\) 4%/);
    assert.doesNotMatch(ground, /--meaning-/, 'the ground says no meaning');
    assert.doesNotMatch(ground, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i, 'no colour written by hand');
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const plain = tagWith(await drawn(createElement(ScanLines, { lines: false, children: 'page' })), 'data-scan-lines');
    assert.doesNotMatch(plain, /repeating-linear-gradient/);
  });
});

/** A row of the runs table in the kit's table, its four columns, as `FlightTable` draws it. */
async function inTable(row: ReactElement) {
  const { Column, Table, TableBody, TableHeader } = await import('../src/components/ui/ds/index.ts');
  const columns = ['Run', 'Now', 'Clock', 'Cost'].map((name, i) =>
    createElement(Column, { key: name, id: name, isRowHeader: i === 0 } as never, name),
  );
  return createElement(
    Table,
    { 'aria-label': 'Runs in flight' } as never,
    createElement(TableHeader, null, ...columns),
    createElement(TableBody, null, row),
  );
}

describe('Run: each size draws what its ladder says and no more, in its tone, and only a card at lg or xl that waits on you glows', () => {
  let Run!: (props: import('../src/components/look/Run.tsx').RunProps) => import('react').JSX.Element;
  let says!: (typeof import('../src/lib/runSays.ts'))['says'];
  let smallestSize!: (typeof import('../src/lib/runSays.ts'))['smallestSize'];
  let nowOf!: (typeof import('../src/lib/runWords.ts'))['nowOf'];
  let runViewOf!: (object: import('objects').Run) => import('../src/lib/api/judged.ts').RunView;
  let TARGET_RUNS!: (typeof import('../.storybook/fixtures/runs.ts'))['TARGET_RUNS'];
  let READS!: (typeof import('../.storybook/fixtures/runs.ts'))['READS'];
  let asOf!: Date;
  let among!: import('../src/lib/api/judged.ts').RunView[];
  let run!: import('../src/lib/api/judged.ts').RunView;
  let none!: Set<string>;
  beforeAll(async () => {
    ({ Run } = await import('../src/components/look/Run.tsx'));
    ({ says, smallestSize } = await import('../src/lib/runSays.ts'));
    ({ nowOf } = await import('../src/lib/runWords.ts'));
    ({ runViewOf } = await import('../src/lib/api/judged.ts'));
    ({ TARGET_RUNS, READS } = await import('../.storybook/fixtures/runs.ts'));
    asOf = new Date('2026-11-15T18:00:00.000Z');
    among = Object.values(TARGET_RUNS).map((one) => ({ ...runViewOf(one), clock: null }));
    run = among.find((one) => one.id.endsWith('1sw7'))!;
    none = new Set(['words']);
  });
  const said = (html: string) => [...new Set([...html.matchAll(/data-run-says="([^"]+)"/g)].flatMap((m) => m[1].split(' ')))].sort();
  const sizes = [
    ['xs', 'card'],
    ['sm', 'card'],
    ['md', 'row'],
    ['md', 'card'],
    ['lg', 'card'],
    ['xl', 'card'],
  ] as const;
  for (const [size, layout] of sizes)
    test(`${size} ${layout}`, async () => {
      const element = createElement(Run, { run, size, layout, asOf, among, read: READS['1sw7'] });
      const html = await drawn(size === 'md' && layout === 'row' ? await inTable(element) : element);
      assert.deepEqual(said(html), [...says(size, layout)].filter((thing) => !none.has(thing)).sort());
      if (layout === 'row') {
        assert.match(html, new RegExp(`<tr[^>]*data-run="${run.id}"`), 'the row is the table row, marked by its run');
        assert.match(html, /data-factory="/, 'and says its factory');
      }
    });
  test('each thing a card says is drawn first at its smallest size, and at every size above it', async () => {
    const ladder = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
    const drawings = await Promise.all(
      ladder.map(async (size) => said(await drawn(createElement(Run, { run, size, layout: 'card', asOf, among, read: READS['1sw7'] })))),
    );
    for (const thing of [...says('xl', 'card')].filter((one) => !none.has(one))) {
      const first = ladder.indexOf(smallestSize(thing, 'card'));
      assert.deepEqual(
        ladder.filter((_, at) => drawings[at].includes(thing)),
        ladder.slice(first),
        thing,
      );
    }
  });
  test("xs: a run's mark is the mark its own graph draws on the step it is on, in every staged state, finished too", async () => {
    for (const one of among) {
      const xs = await drawn(createElement(Run, { run: one, size: 'xs', layout: 'card', asOf, among }));
      const mark = /data-mark="([^"]+)"/.exec(xs)?.[1];
      const step = nowOf(one)?.step ?? one.steps.at(-1)!.name;
      const graph = await drawn(createElement(StepGraph, { run: one }));
      const node = new RegExp(`data-step="${step}" data-state="[^"]+" data-mark="([^"]+)"`).exec(graph)?.[1];
      assert.ok(node, `${one.id}: its graph draws ${step}`);
      assert.equal(mark, node, `${one.id}: on ${step}`);
    }
  });
  test('its words where it has some: 649a waits on a run, by its mark', async () => {
    const waits = among.find((one) => one.id.endsWith('649a'))!;
    const html = await drawn(createElement(Run, { run: waits, size: 'md', layout: 'card', asOf, among }));
    assert.ok(said(html).includes('words'));
    assert.match(html, /data-run-mark="api-a-factorys-pages-stop-paying-lgll"/);
  });
  test('its tone is its chip’s, rest when finished; a yours card glows at lg and xl, never at md', async () => {
    for (const one of among) {
      const html = await drawn(createElement(Run, { run: one, size: 'md', layout: 'card', asOf, among }));
      assert.match(tagWith(html, 'data-size="md"'), new RegExp(`data-tone="${nowOf(one)?.tone ?? 'rest'}"`), one.id);
    }
    const yours = among.find((one) => one.id.endsWith('72wy'))!;
    for (const size of ['md', 'lg', 'xl'] as const) {
      const html = await drawn(createElement(Run, { run: yours, size, layout: 'card', asOf, among }));
      const glows = /filter:drop-shadow/.test(tagWith(html, 'data-cut-shape'));
      assert.equal(glows, size !== 'md', size);
    }
  });
});

describe('CutFrame given a ground and no glow, and StepGraph naming its steps', () => {
  test('a ground replaces the card’s on its ground layer, and glow={false} leaves a yours frame unlit', async () => {
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
    const html = await drawn(createElement(CutFrame, { hue: 'yours', ground: 'bg-background', glow: false, children: 'x' }));
    assert.match(tagWith(html, 'data-cut-ground'), /class="absolute inset-0 bg-background"/);
    assert.doesNotMatch(tagWith(html, 'data-cut-shape'), /filter/);
  });
  test('named: each step under its node, its agent and what is said of it; without, none', async () => {
    const run = graphRun(STEPS);
    const named = new Map(STEPS.map((step) => [step.name, { agent: `${step.name}-agent`, said: '4m · $1.00' }]));
    const html = await drawn(createElement(StepGraph, { run, named, width: 600 }));
    assert.deepEqual(
      [...html.matchAll(/data-named="([^"]+)"/g)].map((m) => m[1]),
      STEPS.map((step) => step.name),
    );
    assert.match(html, /design-agent/);
    assert.doesNotMatch(html, /data-fold/, 'no column folds');
    assert.doesNotMatch(await drawn(createElement(StepGraph, { run })), /data-named/);
  });
  test('named, forked: two steps in one column, each a lane, are named in boxes of their own', async () => {
    const [design, implement, review, land] = STEPS;
    const tokens = { ...implement, name: 'tokens' };
    const steps = [design, implement, tokens, review, land];
    const run = {
      ...graphRun(steps),
      graph: {
        roots: ['design'],
        edges: [
          { from: 'design', to: 'implement', kind: 'after' as const },
          { from: 'design', to: 'tokens', kind: 'after' as const },
          { from: 'implement', to: 'review', kind: 'after' as const },
          { from: 'tokens', to: 'review', kind: 'after' as const },
          { from: 'review', to: 'land', kind: 'after' as const },
        ],
      },
    };
    const named = new Map(steps.map((step) => [step.name, { agent: `${step.name}-agent`, said: '' }]));
    const html = await drawn(createElement(StepGraph, { run, named, width: 600 }));
    const boxes = [...html.matchAll(/data-named="([^"]+)"[^>]*style="left:([\d.-]+)(?:px)?;top:([\d.-]+)(?:px)?"/g)].map((m) => ({
      name: m[1],
      at: `${m[2]},${m[3]}`,
    }));
    assert.deepEqual(boxes.map((box) => box.name).sort(), steps.map((step) => step.name).sort(), 'each step is named once');
    assert.equal(new Set(boxes.map((box) => box.at)).size, boxes.length, `no two names share a box: ${JSON.stringify(boxes)}`);
    assert.match(html, /data-named="land"(?:(?!data-named).)*>–<\/span>/s, 'a step with nothing read yet says – for its time and cost');
  });
});
