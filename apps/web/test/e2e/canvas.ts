/**
 * The e2e on a React Flow canvas — the Factory's floor and the builder's: where a node is, gestures made as a person makes them (a drag,
 * an edge drawn, a switch pressed), and what the floor must keep (`expectClearOfEachOther`).
 */
import type { Locator, Page } from 'playwright';
import { CELL_HEIGHT } from '../../src/lib/factory.ts';
import { expectCount, expectVisible, Refused, settled } from './checks.ts';
import { FAKE } from './seed.ts';

/**
 * Finished runs on the Factory's floor too. Off by default, on every visit. Pressed where a person presses it, on its track: React Aria's
 * switch is a label drawn round an input hidden to the eye, so a click aimed at the input lands on the label, and Playwright waits for ever.
 */
export async function showFinished(page: Page): Promise<void> {
  const toggle = page.getByRole('switch', { name: 'Show finished' });
  await expectVisible(toggle, 'the Factory has a Show finished switch');
  await expectCount(page.getByRole('switch', { name: 'Show finished', checked: false }), 1, 'Show finished is off as the Factory opens');
  await page.locator('label', { has: toggle }).click();
  await expectCount(page.getByRole('switch', { name: 'Show finished', checked: true }), 1, 'pressed, Show finished is on');
}

/** The fake run on the Factory: its card, its step nodes, and both together. */
export function onTheFloor(page: Page): { card: Locator; steps: Locator; run: Locator; step: (name: string) => Locator } {
  const card = `.react-flow__node[data-id="${FAKE.id}"]`;
  const steps = `.react-flow__node[data-id^="${FAKE.id}/"]`;
  return {
    card: page.locator(card),
    steps: page.locator(steps),
    run: page.locator(`${card}, ${steps}`),
    step: (name) => page.locator(`.react-flow__node[data-id="${FAKE.id}/${name}"]`),
  };
}

/** A run's card on the Factory, and the edge from one card into another (`after`). */
export const cardOf = (page: Page, id: string): Locator => page.locator(`.react-flow__node[data-id="${id}"]`);

/** Where a node is on its canvas, in the canvas's own units, whatever the zoom or the pan: where React Flow put it (`translate(x, y)`). */
export const placeOf = (node: Locator): Promise<{ x: number; y: number }> =>
  node.evaluate((el) => {
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec((el as HTMLElement).style.transform) ?? [];
    return { x: Number(m[1]), y: Number(m[2]) };
  });

/** Where a step is beside its card, in the canvas's units: the same on every visit that keeps the arrangement, wherever the card went. */
export async function besideCard(step: Locator, card: Locator): Promise<{ x: number; y: number }> {
  const [s, c] = await Promise.all([placeOf(step), placeOf(card)]);
  return { x: s.x - c.x, y: s.y - c.y };
}

/** How far the floor is zoomed, off React Flow's viewport (`scale(z)`): what a pixel of the pointer's move is worth in the canvas's units. */
export const zoomOf = (page: Page): Promise<number> =>
  page.locator('.react-flow__viewport').first().evaluate((el) => Number(/scale\(([\d.]+)\)/.exec((el as HTMLElement).style.transform)?.[1] ?? 1));

/**
 * A drag as a person makes one: the pointer down on `grip`, moved `by` in the canvas's units — through the floor's zoom — in a
 * dozen moves, and up. React Flow moves a node from the second move of a drag, so one move would move nothing.
 */
export async function dragBy(page: Page, grip: Locator, by: { x: number; y: number }, what: string): Promise<void> {
  const [box, zoom] = [await grip.boundingBox(), await zoomOf(page)];
  if (!box) throw new Refused(`${what} is on the page, to be dragged`);
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + by.x * zoom, y + by.y * zoom, { steps: 12 });
  await page.mouse.up();
}

/**
 * Every card on the floor, in the canvas's own units whatever the zoom: where React Flow put it (`placeOf`), and how tall it is drawn.
 * A card's node alone — a step's node is named `<run>/<step>`.
 */
export const cardsDrawn = async (page: Page): Promise<Array<{ id: string; x: number; y: number; height: number }>> => {
  const zoom = await zoomOf(page);
  return page.locator('.react-flow__node[data-id]:not([data-id*="/"])').evaluateAll((nodes, z) => nodes.map((node) => {
    const el = node as HTMLElement;
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform) ?? [];
    return { id: el.getAttribute('data-id') ?? '', x: Number(m[1]), y: Number(m[2]), height: el.getBoundingClientRect().height / z };
  }), zoom);
};

/**
 * That no card on the floor reaches over the card beneath it: for each card, the nearest card down its own column starts below its bottom
 * edge. The grid puts that card a cell's height below (`CELL_HEIGHT`), so a card drawn taller than its cell is over it wherever it is put.
 */
export async function expectClearOfEachOther(page: Page): Promise<void> {
  const cards = await cardsDrawn(page);
  const over = cards.flatMap((card) => {
    const beneath = cards.filter((other) => Math.abs(other.x - card.x) < 1 && other.y > card.y).sort((a, b) => a.y - b.y)[0];
    return beneath && beneath.y < card.y + card.height
      ? [`${card.id} is ${Math.round(card.height)} tall in a cell of ${CELL_HEIGHT}, and ${beneath.id} starts ${Math.round(beneath.y - card.y)} below it`]
      : [];
  });
  if (over.length) throw new Refused(`no card on the floor reaches over the card beneath it — ${over.join('; ')}`);
}

export const samePlace = (a: { x: number; y: number }, b: { x: number; y: number }): boolean => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
export const said = ({ x, y }: { x: number; y: number }): string => `(${Math.round(x)}, ${Math.round(y)})`;
export const cardsOf = (page: Page, ...ids: string[]): Locator => page.locator(ids.map((id) => `.react-flow__node[data-id="${id}"]`).join(', '));
export const edgeOf = (page: Page, from: string, to: string): Locator => page.locator(`.react-flow__edge[data-id="after:${from}->${to}"]`);

/**
 * An edge drawn on a builder, as a person drags it: from `from`'s right-hand dot to `to`'s left-hand dot, which makes `to` wait on `from` — or,
 * with `loop`, from the violet dot under `from` to the one under `to`, which makes `from` loop back to `to`. With the mouse, not `dragTo`: a
 * handle a drag cannot start from takes no pointer events until a drag is under way, so `dragTo`'s check that the target is what the pointer
 * would hit finds the node over it, and waits for ever.
 */
export async function drawEdge(page: Page, builder: Locator, from: string, to: string, loop = false): Promise<void> {
  await settled(page);
  const source = builder.locator(`.react-flow__node[data-id="${from}"] .react-flow__handle.source[data-handlepos="${loop ? 'bottom' : 'right'}"]`);
  const target = builder.locator(`.react-flow__node[data-id="${to}"] .react-flow__handle.target[data-handlepos="${loop ? 'bottom' : 'left'}"]`);
  await expectVisible(source, `${from}'s dot to draw from`);
  await expectVisible(target, `${to}'s dot to draw to`);
  await source.scrollIntoViewIfNeeded();
  const [a, b] = [await source.boundingBox(), await target.boundingBox()];
  if (!a || !b) throw new Refused(`${from}'s and ${to}'s dots are on the page to draw between`);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await expectCount(builder.locator(`.react-flow__edge[data-id="${loop ? 'loop:' : ''}${from}->${to}"]`), 1, `the ${loop ? 'loop' : 'edge'} drawn from ${from} to ${to}`);
}
