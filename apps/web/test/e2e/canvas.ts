/**
 * The e2e on a React Flow canvas — the Factory's floor and the builder's: where a node is, gestures made as a person makes them (a drag,
 * an edge drawn, a switch pressed), and what the floor must keep (`expectClearOfEachOther`).
 */
import type { Locator, Page } from 'playwright';
import { CELL_HEIGHT } from '../../src/lib/factory.ts';
import { expectCount, expectVisible, Refused, settled } from './checks.ts';
import { FAKE } from './seed.ts';
import { photograph } from './board.ts';
import { photographing } from './world.ts';

/**
 * Finished runs on the Factory's floor too. Off by default, on every visit. Pressed where a person presses it, on its track: React Aria's
 * switch is a label drawn round an input hidden to the eye, so a click aimed at the input lands on the label, and Playwright waits for
 * ever.
 */
export async function showFinished(page: Page): Promise<void> {
  const toggle = page.getByRole('switch', { name: 'Show finished' });
  await expectVisible(toggle, 'the Factory has a Show finished switch');
  await expectCount(page.getByRole('switch', { name: 'Show finished', checked: false }), 1, 'Show finished is off as the Factory opens');
  await page.locator('label', { has: toggle }).click();
  await expectCount(page.getByRole('switch', { name: 'Show finished', checked: true }), 1, 'pressed, Show finished is on');
}

/**
 * The fake run on the Factory: its card; the pills of its rail, at rest; and the tiles it opens into, one a step, each a button that opens
 * the step's inspector.
 */
export function onTheFloor(page: Page): {
  card: Locator;
  pills: Locator;
  tiles: Locator;
  pill: (name: string) => Locator;
  tile: (name: string) => Locator;
} {
  const card = page.locator(`.react-flow__node[data-id="${FAKE.id}"]`);
  return {
    card,
    pills: card.locator('ul[aria-label="Steps"] [data-step]'),
    tiles: card.locator('[data-tile]'),
    pill: (name) => card.locator(`ul[aria-label="Steps"] [data-step="${name}"]`),
    tile: (name) => card.locator(`[data-tile="${name}"]`),
  };
}

/** A run's card on the Factory. */
export const cardOf = (page: Page, id: string): Locator => page.locator(`.react-flow__node[data-id="${id}"]`);

/** Where a node is on its canvas, in the canvas's own units, whatever the zoom or the pan: where React Flow put it (`translate(x, y)`). */
export const placeOf = (node: Locator): Promise<{ x: number; y: number }> =>
  node.evaluate((el) => {
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec((el as HTMLElement).style.transform) ?? [];
    return { x: Number(m[1]), y: Number(m[2]) };
  });

/**
 * How far the floor is zoomed, off React Flow's viewport (`scale(z)`): what a pixel of the pointer's move is worth in the canvas's units.
 */
export const zoomOf = (page: Page): Promise<number> =>
  page
    .locator('.react-flow__viewport')
    .first()
    .evaluate((el) => Number(/scale\(([\d.]+)\)/.exec((el as HTMLElement).style.transform)?.[1] ?? 1));

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
 * A picture of one card at its own size, which a picture of the fitted floor draws a third as large: the floor zoomed in about the card by
 * the wheel, as a person zooms, up to its own size or as much as fits; the pane dragged from an empty spot to bring it to the middle; the
 * card photographed alone; and the floor fitted again, as the page found it. Unless the page being visited is pictured (`photographing`),
 * it does nothing, and leaves the floor as it was.
 */
export async function photographCard(page: Page, card: Locator, file: string): Promise<void> {
  if (!photographing) return;
  const floor = page.locator('.react-flow').first();
  const [frame, size] = [
    await floor.boundingBox(),
    await card.evaluate((el) => ({ width: (el as HTMLElement).offsetWidth, height: (el as HTMLElement).offsetHeight })),
  ];
  if (!frame) throw new Refused('the floor is on the page, to photograph a card on');
  const wanted = Math.min(1, (0.9 * frame.width) / size.width, (0.8 * frame.height) / size.height);
  for (let turns = 0; (await zoomOf(page)) < wanted * 0.97 && turns < 60; turns++) {
    const box = await card.boundingBox();
    if (!box) throw new Refused('the card is on the page, to be photographed');
    const at = (from: number, length: number, lo: number, span: number) => Math.min(Math.max(from + length / 2, lo + 8), lo + span - 8);
    await page.mouse.move(at(box.x, box.width, frame.x, frame.width), at(box.y, box.height, frame.y, frame.height));
    await page.mouse.wheel(0, -Math.max(8, Math.min(60, Math.log2(wanted / (await zoomOf(page))) * 500)));
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  await settled(page);
  const [box, empty] = [
    await card.boundingBox(),
    await floor.evaluate((el) => {
      const r = el.getBoundingClientRect();
      for (let y = r.top + 24; y < r.bottom - 24; y += 24) {
        for (let x = r.left + 24; x < r.right - 24; x += 24) {
          if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
        }
      }
      return null;
    }),
  ];
  if (!box || !empty) throw new Refused('an empty spot on the floor, to move it by');
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await page.mouse.move(
    empty.x + frame.x + frame.width / 2 - (box.x + box.width / 2),
    empty.y + frame.y + frame.height / 2 - (box.y + box.height / 2),
    { steps: 12 },
  );
  await page.mouse.up();
  await settled(page);
  await photograph(card, file);
  await page.getByRole('button', { name: 'Fit view' }).click();
  await settled(page);
}

/**
 * Every card on the floor, in the canvas's own units whatever the zoom: where React Flow put it (`placeOf`), and how wide and tall it is
 * drawn.
 */
export const cardsDrawn = async (page: Page): Promise<Array<{ id: string; x: number; y: number; width: number; height: number }>> => {
  const zoom = await zoomOf(page);
  return page.locator('.react-flow__node[data-id]').evaluateAll(
    (nodes, z) =>
      nodes.map((node) => {
        const el = node as HTMLElement;
        const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform) ?? [];
        const box = el.getBoundingClientRect();
        return { id: el.getAttribute('data-id') ?? '', x: Number(m[1]), y: Number(m[2]), width: box.width / z, height: box.height / z };
      }),
    zoom,
  );
};

/**
 * That no card on the floor reaches over another: no two cards' boxes meet. The grid puts the card beneath a cell's height below
 * (`CELL_HEIGHT`), so a card drawn taller than its cell is over it wherever it is put; and an open card reaches right across the cells its
 * tiles take (`openSpan`), so a card left in one of them is under it.
 */
export async function expectClearOfEachOther(page: Page): Promise<void> {
  const cards = await cardsDrawn(page);
  const over = cards.flatMap((card, i) =>
    cards
      .slice(i + 1)
      .flatMap((other) =>
        card.x < other.x + other.width && other.x < card.x + card.width && card.y < other.y + other.height && other.y < card.y + card.height
          ? [
              `${card.id}, ${Math.round(card.width)} by ${Math.round(card.height)} at ${said(card)}, and ${other.id}, ${Math.round(other.width)} by ${Math.round(other.height)} at ${said(other)} (a cell is ${CELL_HEIGHT} tall)`,
            ]
          : [],
      ),
  );
  if (over.length) throw new Refused(`no card on the floor reaches over another — ${over.join('; ')}`);
}

/**
 * Every card on a floor just fitted is clear of the panels drawn over the floor — the buttons at its top, the zoom controls, the legend
 * and the minimap at its bottom — so each can be read and pressed where it is. Measured, not seen: a card's footer under the legend is
 * drawn, and a press on its Approve lands on the legend. `when` names the moment in the refusal.
 */
export async function expectClearOfPanels(page: Page, when: string): Promise<void> {
  const under = await page
    .locator('.react-flow')
    .first()
    .evaluate((floor) => {
      const boxes = (selector: string) =>
        Array.from(floor.querySelectorAll(selector))
          .map((el) => ({ el, box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.height > 0);
      const panels = boxes('.react-flow__panel');
      return boxes('.react-flow__node').flatMap(({ el, box }) =>
        panels
          .filter(({ box: at }) => box.left < at.right && at.left < box.right && box.top < at.bottom && at.top < box.bottom)
          .map(
            ({ el: panel }) =>
              `${(el as HTMLElement).dataset.id} is under the ${panel.getAttribute('aria-label') ?? Array.from(panel.classList).join('.')} panel`,
          ),
      );
    });
  if (under.length) throw new Refused(`${when}, the fitted floor puts no card under a panel over it — ${under.join('; ')}`);
}

export const samePlace = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
  Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
export const said = ({ x, y }: { x: number; y: number }): string => `(${Math.round(x)}, ${Math.round(y)})`;
export const cardsOf = (page: Page, ...ids: string[]): Locator =>
  page.locator(ids.map((id) => `.react-flow__node[data-id="${id}"]`).join(', '));
/** The edge from a run into one that waits on it (`--after`). */
export const edgeOf = (page: Page, from: string, to: string): Locator => page.locator(`.react-flow__edge[data-id="after:${from}->${to}"]`);
/** The edge from a run into a card held until it lands (`wf hold`), which `runEdges` names apart from an `--after` one. */
export const holdEdgeOf = (page: Page, from: string, to: string): Locator =>
  page.locator(`.react-flow__edge[data-id="hold:${from}->${to}"]`);

/**
 * An edge drawn on a builder, as a person drags it: from `from`'s right-hand dot to `to`'s left-hand dot, which makes `to` wait on `from` —
 * or, with `loop`, from the grey dot under `from` to the one under `to`, which makes `from` loop back to `to`. With the mouse, not
 * `dragTo`: a handle a drag cannot start from takes no pointer events until a drag is under way, so `dragTo`'s check that the target is
 * what the pointer would hit finds the node over it, and waits for ever.
 */
export async function drawEdge(page: Page, builder: Locator, from: string, to: string, loop = false): Promise<void> {
  await settled(page);
  const source = builder.locator(
    `.react-flow__node[data-id="${from}"] .react-flow__handle.source[data-handlepos="${loop ? 'bottom' : 'right'}"]`,
  );
  const target = builder.locator(
    `.react-flow__node[data-id="${to}"] .react-flow__handle.target[data-handlepos="${loop ? 'bottom' : 'left'}"]`,
  );
  await expectVisible(source, `${from}'s dot to draw from`);
  await expectVisible(target, `${to}'s dot to draw to`);
  await source.scrollIntoViewIfNeeded();
  const [a, b] = [await source.boundingBox(), await target.boundingBox()];
  if (!a || !b) throw new Refused(`${from}'s and ${to}'s dots are on the page to draw between`);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await expectCount(
    builder.locator(`.react-flow__edge[data-id="${loop ? 'loop:' : ''}${from}->${to}"]`),
    1,
    `the ${loop ? 'loop' : 'edge'} drawn from ${from} to ${to}`,
  );
}
