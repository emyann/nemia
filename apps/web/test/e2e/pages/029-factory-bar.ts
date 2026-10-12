import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, stepBar, themeOf } from '../board.ts';
import { cardOf, dragBy, zoomOf } from '../canvas.ts';
import { expectCount, expectInside, expectLeftOf, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { ENDING, FAKE, QUEUE } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The floor the page reads. */
const FLOOR = '/factories/default';
/** The run the page inspects, and the step of it the page shows. */
const [RUN, STEP] = [FAKE.id, 'review'];

/** A window wide enough that the floor beside the queue's lane and the bar has room for its hint as well as its buttons, or nearly. */
const WIDE = { width: 1920, height: 1080 };

/** The queue's lane at the floor's left. */
const laneOf = (page: Page) => page.locator('aside[aria-label="Queued cards"]');

/** The floor's frame. */
const floorOf = (page: Page) => page.locator('.react-flow').first();

/** The bar showing RUN. */
const runBar = (page: Page) => page.locator(`aside[data-bar="run:${RUN}"]`);

/** RUN's card, pressed on its body: its time, which is no link and no button. */
const bodyOf = (page: Page) => cardOf(page, RUN).locator('time').first();

/** What the address's search holds for `bar`, or null. */
const barInUrl = (page: Page) => new URL(page.url()).searchParams.get('bar');

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** Refuses unless no bar is drawn and the address names none. */
async function expectNoBar(page: Page, assertion: string): Promise<void> {
  await expectCount(page.locator('aside[data-bar]'), 0, assertion);
  if (barInUrl(page) !== null) throw new Refused(`${assertion}: the address names no bar — it is ${page.url()}`);
}

/** Refuses unless the bar shows RUN, the address names it, and its card is marked as inspected. */
async function expectRun(page: Page, assertion: string): Promise<Locator> {
  const bar = runBar(page);
  await expectVisible(bar, assertion);
  if (barInUrl(page) !== `run:${RUN}`) throw new Refused(`${assertion}: the address names bar=run:${RUN} — it is ${page.url()}`);
  await expectVisible(floorOf(page).locator(`.react-flow__node[data-id="${RUN}"] [data-inspected]`), `${assertion}: its card is ringed`);
  return bar;
}

/** Refuses unless the page reaches `pathname` within the wait. */
async function expectAt(page: Page, pathname: string, assertion: string): Promise<void> {
  try {
    await page.waitForURL((url) => url.pathname === pathname, { timeout: WAIT_MS });
  } catch {
    throw new Refused(`${assertion} — the page is at ${page.url()}`);
  }
}

/** A point of the floor with nothing drawn on it, where a click lands on the empty pane. */
async function emptySpot(page: Page): Promise<{ x: number; y: number }> {
  const spot = await floorOf(page).evaluate((floor) => {
    const box = floor.getBoundingClientRect();
    for (let y = box.top + box.height - 24; y > box.top + 24; y -= 24)
      for (let x = box.left + box.width / 2; x > box.left + 24; x -= 24)
        if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
    return null;
  });
  if (!spot) throw new Refused('the floor has an empty spot to click');
  return spot;
}

/** Fits the floor, which brings every card back into view, wherever the bar's last run left it. */
async function fit(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Fit view' }).click();
  await settled(page);
}

/** Clicks the floor's empty pane. */
async function clickPane(page: Page): Promise<void> {
  const { x, y } = await emptySpot(page);
  await page.mouse.click(x, y);
}

/** A click on the card's body shows the run, its card and the floor's panels clear of the bar; again closes it; Enter, and the pane. */
async function presses(page: Page): Promise<void> {
  await bodyOf(page).click();
  await expectRun(page, `a click on ${RUN}'s card shows the run in the bar`);
  await expectCount(laneOf(page), 0, "the queue's lane gives its room to the floor while the bar shows a run");
  await settled(page);
  await expectLeftOf(cardOf(page, RUN), runBar(page), 'the card inspected is left of the bar');
  const panels = floorOf(page).locator('.react-flow__panel:visible');
  await expectLeftOf(panels, runBar(page), "the floor's buttons, legend and minimap are left of the bar");
  await expectInside(
    panels.getByRole('button'),
    floorOf(page),
    'and every button on them is on the floor, wrapped to it where it is narrow',
  );
  await photograph(page, path.join(OUT, `factory-bar-run-${await themeOf(page)}.png`));
  await bodyOf(page).click();
  await expectNoBar(page, `a click on ${RUN}'s card again closes the bar`);
  await expectCount(cardOf(page, RUN).locator('[data-inspected]'), 0, 'and its card is no longer ringed');
  await expectVisible(laneOf(page), "and the queue's lane is back beside the floor");

  await cardOf(page, RUN).focus();
  await page.keyboard.press('Enter');
  await expectRun(page, `Enter on ${RUN}'s card shows the run in the bar`);
  await clickPane(page);
  await expectNoBar(page, 'a click on the empty floor closes the bar');
}

/** The run bar holds the run's title and id, its banners, its steps each with its status, and its brief; a step's button shows it. */
async function contents(page: Page): Promise<void> {
  await bodyOf(page).click();
  const bar = await expectRun(page, `a click on ${RUN}'s card shows the run`);
  await expectVisible(bar.getByRole('heading', { name: FAKE.title }), `the bar is titled ${FAKE.title}`);
  await expectVisible(bar.getByText(RUN, { exact: true }), `and says the run's id, ${RUN}`);
  const steps = bar.locator('section[aria-label="Steps"] button[data-step]');
  await expectCount(steps, FAKE.steps.length, `a button per step (${FAKE.steps.join(', ')})`);
  await expectVisible(
    bar.locator(`section[aria-label="Steps"] button[data-step="${FAKE.refused}"] [data-state="failed-check"]`),
    `${FAKE.refused}'s button says its check refused`,
  );
  await expectVisible(bar.locator('section[aria-label="Brief"]').getByText(/A run seeded by npm run e2e/), 'the bar shows the brief');
  await expectCount(bar.locator('section[aria-label="Brief"]').getByText('npm run e2e', { exact: true }), 0, 'and no command line');
  await bar.locator(`button[data-step="${STEP}"]`).click();
  await expectVisible(stepBar(page, RUN, STEP), `${STEP}'s button shows the step in the bar`);
  await page.keyboard.press('Escape');
  await expectNoBar(page, 'Escape closes it');

  const { id, ending } = ENDING;
  await cardOf(page, id).locator('time').first().click();
  const decide = page.locator(`aside[data-bar="run:${id}"]`);
  await expectVisible(decide, `a click on ${id}'s card shows that run in the bar`);
  await decide.locator(`section[aria-label="To decide"] button[data-approve="${ending}"]`).click();
  await expectVisible(stepBar(page, id, ending), `${ending}, at its gate and named in the to-decide banner, shows in the bar when pressed`);
  await page.keyboard.press('Escape');
  await expectNoBar(page, 'Escape closes it');
}

/**
 * With the card unfolded by its chevron, a tile shows its step in the bar, the card whole on the floor left of it, and is pressed;
 * pressed again, it closes the bar.
 */
async function tiles(page: Page): Promise<void> {
  await fit(page);
  const card = cardOf(page, RUN);
  await card.getByRole('button', { name: 'Show steps' }).click();
  const tile = card.locator(`[data-tile="${STEP}"]`);
  await expectVisible(tile, `the chevron unfolds the card into its steps, ${STEP} among them`);
  await expectNoBar(page, 'and shows nothing in the bar');
  await settled(page);
  await tile.click();
  await expectVisible(stepBar(page, RUN, STEP), `a click on ${STEP}'s tile shows the step in the bar`);
  await expectVisible(card.locator(`[data-tile="${STEP}"][aria-pressed="true"]`), 'and its tile is pressed');
  await settled(page);
  await expectCount(laneOf(page), 0, "the queue's lane gives its room to the floor while the bar shows a step");
  await expectInside(card, floorOf(page), 'the open card is whole on the floor');
  await expectLeftOf(card, stepBar(page, RUN, STEP), 'left of the bar');
  await photograph(page, path.join(OUT, `factory-bar-step-${await themeOf(page)}.png`));
  await tile.click();
  await expectNoBar(page, `a click on ${STEP}'s tile again closes the bar`);
  await card.getByRole('button', { name: 'Hide steps' }).click();
}

/** The bar's Open and a double click on the card each open the run's page, with no bar. */
async function opens(page: Page): Promise<void> {
  await fit(page);
  await bodyOf(page).click();
  const bar = await expectRun(page, `a click on ${RUN}'s card shows the run`);
  await bar.getByRole('link', { name: 'Open', exact: true }).click();
  await expectAt(page, `/runs/${RUN}`, "the bar's Open opens the run's page");
  await visit(page, FLOOR);
  await bodyOf(page).dblclick();
  await expectAt(page, `/runs/${RUN}`, `a double click on ${RUN}'s card opens the run's page`);
  if (barInUrl(page) !== null) throw new Refused(`the run's page opens with no bar — it is ${page.url()}`);
  await visit(page, FLOOR);
}

/** The start of a run in the bar survives a click on the empty floor; a queue's ghost is a link to its card's page. */
async function others(page: Page): Promise<void> {
  const start = 'start:default';
  await visit(page, `${FLOOR}?bar=${start}`);
  const bar = page.locator(`aside[data-bar="${start}"]`);
  await expectVisible(bar, 'the start of a run opens in the bar on the floor');
  await clickPane(page);
  await expectVisible(bar, 'a click on the empty floor leaves the start of a run open');
  if (barInUrl(page) !== start) throw new Refused(`and the address keeps bar=${start} — it is ${page.url()}`);
  await expectVisible(laneOf(page), "the queue's lane stays beside the floor while the bar starts a run");
  const was = page.viewportSize();
  await page.setViewportSize(WIDE);
  try {
    await settled(page);
    const hint = floorOf(page).locator('.react-flow__panel.top.left:visible');
    if (await hint.count())
      await expectLeftOf(
        hint,
        floorOf(page).locator('.react-flow__panel.top.right'),
        "in a window as wide as WIDE, the floor's hint, where it is drawn, ends left of its buttons",
      );
  } finally {
    if (was) await page.setViewportSize(was);
  }
  await bar.getByRole('button', { name: 'Close', exact: true }).click();
  await expectNoBar(page, 'its Close closes it');

  const ghost = page.locator(`aside[aria-label="Queued cards"] a[data-ghost="${QUEUE.third.name}"]`);
  await ghost.click();
  await expectAt(page, `/inbox/${QUEUE.third.name}`, "a click on a queue's ghost opens its card's page");
  await expectNoBar(page, 'and shows nothing in the bar');
  await visit(page, FLOOR);
}

/** A card dragged to the floor's right edge, where the bar opens over it, is brought clear of the bar once inspected. */
async function edge(page: Page): Promise<void> {
  await fit(page);
  const [floor, card, zoom] = [await floorOf(page).boundingBox(), await cardOf(page, RUN).boundingBox(), await zoomOf(page)];
  if (!floor || !card) throw new Refused(`the floor and ${RUN}'s card are drawn`);
  await dragBy(page, bodyOf(page), { x: (floor.x + floor.width - card.x - card.width - 8) / zoom, y: 0 }, `the card of ${RUN}`);
  await settled(page);
  await expectNoBar(page, 'a drag shows nothing in the bar');
  await bodyOf(page).click();
  await expectRun(page, `a click on ${RUN}'s card, at the floor's right edge, shows the run`);
  await settled(page);
  await expectLeftOf(cardOf(page, RUN), runBar(page), 'the card, dragged to where the bar opens, is brought left of it');
  await photograph(page, path.join(OUT, `factory-bar-card-${await themeOf(page)}.png`));
  await runBar(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expectNoBar(page, 'its Close closes the bar');
}

export default {
  /**
   * The Factory's floor and the frame's bar: a click or Enter on a card shows its run in the bar, ringed, with the card and the floor's
   * panels clear of the bar and the queue's lane off to give the floor its room; again, or the empty floor, closes it. The run bar has the
   * run's title and id, the gates its banners name and its steps as buttons that show each step, and its brief. A tile, the card unfolded
   * by its chevron, shows its step and is pressed, the open card whole beside the bar. Open and a double click open the run's page. The
   * start of a run is not closed by the floor, keeps the lane, and leaves the floor's hint clear of its buttons; a ghost opens its card's
   * page. A card dragged under where the bar opens is brought clear of it. The page lays the floor out again at its end.
   */
  name: 'factory-bar',
  route: FLOOR,
  expect: async (page) => {
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await presses(page);
    await contents(page);
    await tiles(page);
    await opens(page);
    await others(page);
    await edge(page);
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
  },
} satisfies PageSpec;
