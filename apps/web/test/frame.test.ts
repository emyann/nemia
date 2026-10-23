/**
 * The floor's frame (src/lib/frame.ts), two tables: what it measures of itself and its cards, and which card is in view and how a view
 * is aimed at one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anyInView, boxesOf, revealView, sized, sizeOf, wholeInView, type Transform } from '../src/lib/frame.ts';

const FRAME = { width: 768, height: 638 };
const CARD = { x: 400, y: 0, width: 352, height: 288 };
const AT_REST: Transform = [0, 0, 1];

test('sized, sizeOf and boxesOf: what the floor measures of its frame and cards', async (t) => {
  await t.test('a frame hidden or squeezed flat has no size, and one drawn has', () => {
    assert.equal(sized({ width: 0, height: 0 }), false);
    assert.equal(sized({ width: 768, height: 0 }), false);
    assert.equal(sized({ width: 0, height: 638 }), false);
    assert.equal(sized(FRAME), true);
    assert.deepEqual(sizeOf({ clientWidth: 704, clientHeight: 0 }), { width: 704, height: 0 });
  });
  await t.test("a card's box is where React Flow drew it and how big it measured it, and a card not measured takes no room", () => {
    const boxes = boxesOf([
      { internals: { positionAbsolute: { x: 384, y: 320 } }, measured: { width: 352, height: 280 } },
      { internals: { positionAbsolute: { x: 0, y: 0 } }, measured: {} },
    ]);
    assert.deepEqual(boxes, [
      { x: 384, y: 320, width: 352, height: 280 },
      { x: 0, y: 0, width: 0, height: 0 },
    ]);
  });
});

test('revealView, wholeInView and anyInView: which card is in view, and the view aimed at one', async (t) => {
  await t.test('no view is aimed at a frame without a size, where the card would land above and left of it', () => {
    assert.equal(revealView(CARD, [-2000, -2000, 1], { width: 0, height: 0 }, 0.4), null);
    assert.equal(revealView(CARD, [-2000, -2000, 1], { width: 704, height: 0 }, 0.4), null);
    assert.notEqual(revealView(CARD, [-2000, -2000, 1], FRAME, 0.4), null);
  });
  await t.test("a card brought into view has its middle in the frame's middle and is then wholly in view", () => {
    const to = revealView(CARD, [-2000, -2000, 1], FRAME, 0.4)!;
    assert.deepEqual(to, { x: 768 / 2 - (400 + 352 / 2), y: 638 / 2 - 288 / 2, zoom: 1 });
    assert.equal(wholeInView(CARD, [to.x, to.y, to.zoom], FRAME), true);
  });
  await t.test('a card all in view is left where it is, and one cut by any edge of the frame is not', () => {
    assert.equal(revealView(CARD, AT_REST, FRAME, 0.4), null);
    assert.equal(wholeInView(CARD, AT_REST, FRAME), true);
    assert.equal(wholeInView(CARD, [-1, 0, 1], { width: 1000, height: 1000 }), true);
    assert.equal(wholeInView(CARD, [-401, 0, 1], FRAME), false);
    assert.equal(wholeInView(CARD, [0, -1, 1], FRAME), false);
    assert.equal(wholeInView(CARD, [17, 0, 1], FRAME), false);
    assert.equal(wholeInView(CARD, [0, 351, 1], FRAME), false);
  });
  await t.test('a card too big for the frame is zoomed out only as far as it must be, and never past the least zoom', () => {
    const tall = { x: 0, y: 0, width: 352, height: 1276 };
    assert.equal(revealView(tall, AT_REST, FRAME, 0.4)!.zoom, (0.9 * 638) / 1276);
    assert.equal(revealView(tall, AT_REST, { width: 768, height: 100 }, 0.4)!.zoom, 0.4);
    assert.equal(revealView(CARD, [-2000, -2000, 0.5], FRAME, 0.4)!.zoom, 0.5);
  });
  await t.test('the floor shows a card while any part of one is in the frame, and none once every card is above and left of it', () => {
    const cards = [CARD, { x: 0, y: 400, width: 352, height: 288 }];
    assert.equal(anyInView(cards, AT_REST, FRAME), true);
    assert.equal(anyInView(cards, [-751, 0, 1], FRAME), true);
    assert.equal(anyInView(cards, [-752, -688, 1], FRAME), false);
    assert.equal(anyInView(cards, [768, 0, 1], FRAME), false);
    assert.equal(anyInView(cards, [0, 638, 1], FRAME), false);
    assert.equal(anyInView(cards, AT_REST, { width: 0, height: 0 }), false);
    assert.equal(anyInView([], AT_REST, FRAME), false);
  });
  await t.test("a card that does not fit the frame even at the least zoom shows its head, its left and its top at the room's", () => {
    const tall = { x: 384, y: 640, width: 352, height: 1276 };
    const low = revealView(tall, [0, -2000, 1], { width: 768, height: 34 }, 0.4)!;
    assert.deepEqual(low, { x: 768 / 2 - (384 + 352 / 2) * 0.4, y: -640 * 0.4, zoom: 0.4 });
    const underPanels = revealView(tall, [0, -2000, 1], { width: 768, height: 133 }, 0.4, 56)!;
    assert.equal(underPanels.y, 56 - 640 * 0.4, 'its top below the panels over the frame');
    assert.equal(
      revealView(CARD, [-2000, -2000, 1], FRAME, 0.4, 56)!.y,
      56 + (638 - 56) / 2 - 288 / 2,
      'a card that fits is centred below them',
    );
    const narrow = revealView(tall, [0, -2000, 1], { width: 100, height: 300 }, 0.4)!;
    assert.equal(narrow.x, -384 * 0.4);
    assert.equal(narrow.y, -640 * 0.4);
  });
  await t.test('a card under the panels over the frame is not in view, and no view is aimed at a frame no taller than its panels', () => {
    assert.equal(revealView(CARD, AT_REST, FRAME, 0.4), null);
    assert.notEqual(revealView(CARD, AT_REST, FRAME, 0.4, 56), null);
    assert.equal(revealView(CARD, [0, 56, 1], FRAME, 0.4, 56), null);
    assert.equal(revealView(CARD, [-2000, -2000, 1], { width: 768, height: 56 }, 0.4, 56), null);
    assert.equal(revealView(CARD, [-2000, -2000, 1], { width: 768, height: 34 }, 0.4, 56), null);
  });
});
