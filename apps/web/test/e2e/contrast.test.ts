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

const tile = (frequency: number, matrix: string): string =>
  `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n" x="0" y="0" width="100%" ` +
  `height="100%"><feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="2" seed="7" stitchTiles="stitch"/>` +
  `<feColorMatrix type="matrix" values="${matrix}"/></filter><rect width="220" height="220" filter="url(%23n)"/></svg>')`;
const INK_SPECKS = tile(0.9, '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.62 0 0 0 -0.24');
const LIGHT_SPECKS = tile(0.8, '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.3 0 0 0 -0.12');
const rowsOf = (pairs: readonly Pair[], text: string): Pair[] => pairs.filter((pair) => pair.text === text);

test('REFUSED: a text under the bar at the far end of a grain, its ground read plain and at the speck’s strongest 2%', async () => {
  const { pairs } = await pairsOf(
    `<style>.label{background-color:#fff;background-image:${INK_SPECKS};background-size:220px 220px}</style><div class="label">` +
      '<p style="color:#6a6a6a">on a label</p><p style="color:#000">in ink</p></div><p style="color:#555">beside it</p>',
  );
  const [plain, far, ...more] = rowsOf(pairs, 'on a label');
  assert.ok(plain && far && !more.length, 'a text on a grain has two rows');
  assert.deepEqual([plain.state, plain.grained, hex(plain.ground), under(plain)], ['measured', false, '#ffffff', false]);
  assert.deepEqual([far.state, far.grained, under(far)], ['measured', true, true], `refused at ${ratioOf(far)}:1`);
  assert.ok(ratioOf(far) > 3 && ratioOf(far) < 3.6, `ink specks at about a fifth darken the white to ${hex(far.ground)}`);
  assert.deepEqual(
    rowsOf(pairs, 'in ink').map((pair) => [pair.grained, under(pair)]),
    [
      [false, false],
      [true, false],
    ],
    'a text that holds at the far end passes both',
  );
  assert.deepEqual(
    rowsOf(pairs, 'beside it').map((pair) => pair.grained),
    [false],
    'a text off the grain has one row',
  );
});

test('a tile of more than one colour is no grain: its ground is answered unmeasured, as a gradient’s', async () => {
  const two =
    `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="10" height="20" ` +
    `fill="red" fill-opacity="0.2"/><rect x="10" width="10" height="20" fill="blue" fill-opacity="0.2"/></svg>')`;
  const { pairs } = await pairsOf(
    `<style>.pattern{background-image:${two}}</style><div class="pattern"><p style="color:#777">on a pattern</p></div>`,
  );
  const pattern = said(pairs, 'on a pattern');
  assert.deepEqual([pattern.state, pattern.why, under(pattern)], ['unmeasured', 'its ground is a background-image', false]);
  assert.equal(rowsOf(pairs, 'on a pattern').length, 1);
});

test('REFUSED: a far end carried through a translucent ground unpainted: it is the ground laid over the grain’s far end', async () => {
  const { pairs } = await pairsOf(
    `<style>.card{background-color:#000;background-image:${LIGHT_SPECKS};background-size:220px 220px}</style><div class="card">` +
      '<p style="color:#fff">on the grain</p><div style="background:rgba(255,255,255,0.5)"><p style="color:#000">on a chip</p></div></div>',
    'dark',
  );
  const [, grain, ...others] = rowsOf(pairs, 'on the grain');
  const [plain, far, ...more] = rowsOf(pairs, 'on a chip');
  assert.ok(grain?.grained && !others.length && plain && far && !more.length, 'each text on the grain has two rows');
  assert.ok(grain.ground[0] > 8 && grain.ground[0] < 64, `light specks lift the black to ${hex(grain.ground)}`);
  assert.deepEqual([plain.grained, hex(plain.ground)], [false, '#808080']);
  assert.deepEqual([far.state, far.grained], ['measured', true]);
  for (const [c, channel] of far.ground.entries())
    assert.ok(Math.abs(channel - (255 + (grain.ground[c] ?? 0)) / 2) <= 1, `half white over ${hex(grain.ground)}, not ${hex(far.ground)}`);
});

const framed = (ground: string, text: string): string =>
  '<div style="background:#000;padding:8px"><div data-cut-frame="none" style="position:relative">' +
  `<span data-cut-shape style="position:absolute;inset:0"><span data-cut-ground style="position:absolute;inset:0;${ground}"></span>` +
  `</span><div style="position:relative">${text}</div></div></div>`;

test('REFUSED: a text under the bar on a cut frame’s ground, a layer beside what the frame holds and no ancestor of it', async () => {
  const { pairs } = await pairsOf(framed('background:#fff', '<p style="color:#777">in a frame</p>'));
  const inside = said(pairs, 'in a frame');
  assert.deepEqual([inside.state, hex(inside.ground), ratioOf(inside), under(inside)], ['measured', '#ffffff', 4.47, true]);
  const nested = await pairsOf(
    framed('background:#fff', `<p style="color:#777">outer</p>${framed('background:#000', '<p style="color:#777">inner</p>')}`),
  );
  assert.equal(hex(said(nested.pairs, 'outer').ground), '#ffffff', 'a frame reads its own layer, not one of a frame it holds');
  assert.equal(hex(said(nested.pairs, 'inner').ground), '#000000');
});

test('REFUSED: a text that holds on a cut frame’s plain ground and falls under the bar at the far end of its grain', async () => {
  const { pairs } = await pairsOf(
    `<style>[data-cut-ground]{background-color:#000;background-image:${LIGHT_SPECKS};background-size:220px 220px}</style>` +
      framed('', '<p style="color:#797979">on a card</p>'),
    'dark',
  );
  const [plain, far, ...more] = rowsOf(pairs, 'on a card');
  assert.ok(plain && far && !more.length, 'a text on a grained card has two rows');
  assert.deepEqual([plain.grained, hex(plain.ground), under(plain)], [false, '#000000', false]);
  assert.deepEqual([far.state, far.grained, under(far)], ['measured', true, true], `refused at ${ratioOf(far)}:1`);
  assert.ok(ratioOf(far) > 3.8 && ratioOf(far) < 4.3, `light specks at about a tenth lift the black to ${hex(far.ground)}`);
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
