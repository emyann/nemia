/**
 * The contrast measure on pages made for it: what it reads, what it composites, and what it answers unmeasured or exempt. Launches
 * Chromium, so it runs with the e2e (`npm run e2e`), not with the node tests.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { hex, measure, ratioOf, under, type Pair } from './contrast.ts';

let browser: Browser;
before(async () => {
  browser = await chromium.launch();
});
after(() => browser.close());

async function pairsOf(html: string, scheme: 'light' | 'dark' = 'light'): Promise<{ scheme: string; pairs: readonly Pair[] }> {
  const context = await browser.newContext({ colorScheme: scheme });
  try {
    const page = await context.newPage();
    await page.setContent(`<body style="margin:0;background:#fff">${html}</body>`);
    return await measure(page);
  } finally {
    await context.close();
  }
}
const said = (pairs: readonly Pair[], text: string): Pair => {
  const found = pairs.find((pair) => pair.text === text);
  assert.ok(found, `${text} is measured among ${pairs.map((pair) => pair.text).join(', ')}`);
  return found;
};

test('a text under the bar is found and one at it is not: #777777 and #767676 on white', async () => {
  const { pairs, scheme } = await pairsOf('<p style="color:#777777">faint</p><p class="ok" style="color:#767676">fair</p>');
  assert.equal(scheme, 'light');
  assert.equal(under(said(pairs, 'faint')), true);
  assert.equal(ratioOf(said(pairs, 'faint')), 4.47);
  assert.equal(under(said(pairs, 'fair')), false);
  assert.equal(said(pairs, 'fair').classes, 'ok');
  assert.equal((await pairsOf('<p>x</p>', 'dark')).scheme, 'dark');
});

test('a translucent ground is composited over what is under it, and a translucent ink over its ground', async () => {
  const { pairs } = await pairsOf(
    '<div style="background:#000"><div style="background:rgb(255 255 255 / 0.5)"><p style="color:#000">on grey</p>' +
      '<p style="color:rgb(0 0 0 / 0.5)">half ink</p></div></div>',
  );
  assert.equal(hex(said(pairs, 'on grey').ground), '#808080');
  assert.equal(hex(said(pairs, 'on grey').ink), '#000000');
  assert.equal(hex(said(pairs, 'half ink').ink), '#404040');
});

test('a colour written in oklch or color-mix is read as the sRGB it paints', async () => {
  const { pairs } = await pairsOf(
    '<p style="color:oklch(0 0 0)">black</p><p style="color:color-mix(in srgb, #ff0000 50%, #0000ff)">mixed</p>',
  );
  assert.equal(hex(said(pairs, 'black').ink), '#000000');
  assert.equal(hex(said(pairs, 'mixed').ink), '#800080');
});

test('a ground drawn by a background-image is answered unmeasured, never passed nor failed', async () => {
  const { pairs } = await pairsOf(
    '<div style="background-image:linear-gradient(#000,#fff)"><p style="color:#777">on a gradient</p>' +
      '<p style="color:#777;background:#fff">on its own ground</p></div>',
  );
  const gradient = said(pairs, 'on a gradient');
  assert.deepEqual([gradient.state, gradient.why, under(gradient)], ['unmeasured', 'its ground is a background-image', false]);
  assert.equal(said(pairs, 'on its own ground').state, 'measured', 'an opaque ground over the image is read');
});

test('a text nobody sees is not counted, a disabled control is exempt, and a faded text is measured blended', async () => {
  const { pairs } = await pairsOf(
    '<p style="display:none;color:#eee">hidden</p><p style="visibility:hidden;color:#eee">unseen</p>' +
      '<button disabled style="color:#ccc;background:#fff">off</button>' +
      '<div style="opacity:0.5"><p style="color:#000">dimmed</p></div><p style="color:#000">plain</p>',
  );
  assert.equal(
    pairs.some((pair) => pair.text === 'hidden' || pair.text === 'unseen'),
    false,
  );
  assert.deepEqual([said(pairs, 'off').state, under(said(pairs, 'off'))], ['exempt', false]);
  assert.deepEqual([hex(said(pairs, 'dimmed').ink), said(pairs, 'dimmed').faded], ['#808080', true]);
  assert.equal(said(pairs, 'plain').faded, false);
});

test("a field's value is read in its colour, its placeholder in the placeholder's, and an SVG text by its fill", async () => {
  const { pairs } = await pairsOf(
    '<style>input::placeholder{color:#999999}</style><input value="typed" style="color:#111111;background:#fff">' +
      '<input placeholder="hint" style="color:#111111;background:#fff">' +
      '<svg width="80" height="20"><text y="15" fill="#123456" style="color:#fff">drawn</text></svg>',
  );
  assert.equal(hex(said(pairs, 'typed').ink), '#111111');
  assert.equal(hex(said(pairs, 'hint').ink), '#999999');
  assert.equal(hex(said(pairs, 'drawn').ink), '#123456');
});
