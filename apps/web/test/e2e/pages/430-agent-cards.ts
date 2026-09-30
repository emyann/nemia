import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { AGENTS, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The runner's viewport, put back before the page ends. */
const WIDE = { width: 1280, height: 800 };

/** A phone held upright. */
const PHONE = { width: 390, height: 844 };

/** What the face on `card` shows: Blobatar's `--mo-amp` on its drawing, 1 awake and 0 at rest, and whether its root is lifted. */
const faceOf = (card: Locator) =>
  card.locator('svg[data-agent-face] .mo-root').evaluate((root) => {
    const style = getComputedStyle(root);
    return { amp: style.getPropertyValue('--mo-amp').trim(), lifted: style.transform !== 'none' };
  });

/** Waits until the face on `card` is awake and lifted or not, as `faceOf` reads it; refuses with the last reading after `WAIT_MS`. */
async function waitForFace(page: Page, card: string, lifted: boolean, assertion: string) {
  try {
    await page.waitForFunction(
      ({ card, lifted }) => {
        const root = document.querySelector(`${card} svg[data-agent-face] .mo-root`);
        if (!root) return false;
        const style = getComputedStyle(root);
        return style.getPropertyValue('--mo-amp').trim() === '1' && (style.transform !== 'none') === lifted;
      },
      { card, lifted },
      { timeout: WAIT_MS },
    );
  } catch {
    throw new Refused(`${assertion} — it shows ${JSON.stringify(await faceOf(page.locator(card)))}`);
  }
}

/** Each card lies on a row of its own and holds its face: as wide as its list, give or take a pixel, and its face inside its box. */
async function expectOnePerRow(page: Page) {
  const cards = await page.locator('section[data-agent]').evaluateAll((sections) =>
    sections.map((section) => {
      const box = section.getBoundingClientRect();
      const list = section.closest('ul')!.getBoundingClientRect();
      const face = section.querySelector('svg[data-agent-face]')!.getBoundingClientRect();
      return {
        name: section.getAttribute('data-agent'),
        width: box.width,
        list: list.width,
        faceInside: face.left >= box.left && face.right <= box.right && face.top >= box.top && face.bottom <= box.bottom,
      };
    }),
  );
  for (const card of cards) {
    if (card.width < card.list - 1)
      throw new Refused(`on a phone, ${card.name}'s card has a row of its own — it is ${card.width}px of its list's ${card.list}px`);
    if (!card.faceInside) throw new Refused(`on a phone, ${card.name}'s face lies inside its card`);
  }
}

export default {
  /**
   * The Agents page's character cards, as a person meets them. Each face is awake with nothing hovering its card; hovered anywhere, a card
   * lifts its face, as hovering the face itself would, and the pointer gone, the lift goes and the face stays awake. On a phone held
   * upright, each card has a row of its own, holds its face, and the page does not scroll sideways. Read-only; the runner's viewport is put
   * back before the page ends.
   */
  name: 'agent-cards',
  route: '/agents',
  expect: async (page) => {
    await sidebar(page);
    const people = [AGENTS.seeded.name, WORKFLOWS.good.agent.name];
    await expectCount(page.locator('section[data-agent]'), people.length, 'the list draws a card an agent');
    const card = `section[data-agent="${WORKFLOWS.good.agent.name}"]`;
    await waitForFace(page, card, false, 'a face is awake and unlifted while nothing hovers its card');
    await page.locator(`${card} [data-agent-role]`).scrollIntoViewIfNeeded();
    const role = await page.locator(`${card} [data-agent-role]`).boundingBox();
    if (!role) throw new Refused('the role line is laid out');
    await page.mouse.move(role.x + role.width / 2, role.y + role.height / 2, { steps: 4 });
    await waitForFace(page, card, true, 'hovering the card away from its face lifts the face, as hovering the face itself would');
    await page.mouse.move(WIDE.width - 5, 5, { steps: 4 });
    await waitForFace(page, card, false, 'and the pointer gone, the lift goes and the face stays awake');

    try {
      await page.setViewportSize(PHONE);
      await idle(page);
      const wide = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      if (wide.scroll > wide.client)
        throw new Refused(`on a phone, the page does not scroll sideways — it is ${wide.scroll}px wide in ${wide.client}px`);
      await expectOnePerRow(page);
      await settled(page);
      await photograph(page, path.join(OUT, `agent-cards-phone-${await themeOf(page)}.png`), { fullPage: true });
    } finally {
      await page.setViewportSize(WIDE);
    }
  },
} satisfies PageSpec;
