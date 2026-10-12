import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, sidebarOf, themeOf } from '../board.ts';
import { cardOf, showFinished } from '../canvas.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { FACTORIES, FOLDER, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The key this browser keeps its favourites under. */
const FAVORITES_KEY = 'nemia:favorites';
/** The run the page stars, by its title, which names it in Favorites. */
const RUN = { id: FOLDER.id, title: FOLDER.title, factory: FACTORIES.hiring.name };
/** The workflow the page stars, the repository's. */
const FLOW = WORKFLOWS.good.name;

/** The sidebar's Favorites. */
const favoritesOf = (page: Page): Locator => sidebarOf(page).locator('[data-favorites]');
/** Each favourite's link, in its order. */
const linksOf = (page: Page): Locator => favoritesOf(page).getByRole('link');
/** The star in `scope` that stars the thing named `name`. */
const starIn = (scope: Locator, name: string): Locator => scope.getByRole('button', { name: `Star ${name}`, exact: true });
/** The run's row on the Runs page. */
const rowOf = (page: Page): Locator => page.locator('main li[data-in-flight]', { has: page.locator(`a[href="/runs/${RUN.id}"]`) });
/** The workflow's card on the Workflows page. */
const flowCard = (page: Page): Locator => page.locator(`section[aria-label="Workflow ${FLOW}"]`);

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** Refuses unless `star` reads pressed when `pressed`, and not when not, by its toggle's state and its mark. */
async function expectStar(star: Locator, pressed: boolean, assertion: string): Promise<void> {
  await expectVisible(star, `${assertion}: the star is drawn`);
  const want = String(pressed);
  await star
    .page()
    .waitForFunction(([el, want]) => el?.getAttribute('aria-pressed') === want, [await star.elementHandle(), want] as const, {
      timeout: WAIT_MS,
    })
    .catch(() => undefined);
  const said = await star.getAttribute('aria-pressed');
  const marked = (await star.getAttribute('data-starred')) === 'true';
  if (said !== want || marked !== pressed)
    throw new Refused(`${assertion}: the star reads pressed=${want} — it reads ${said}, marked ${marked}`);
}

/** Refuses unless Favorites says nothing is starred. */
const expectNone = (page: Page, assertion: string) =>
  expectVisible(favoritesOf(page).getByText('Nothing starred yet.'), `${assertion}: Favorites says nothing is starred yet`);

/** The run starred on its Runs row is under Favorites by its title, a link to its page, and its star reads pressed. */
async function fromItsRow(page: Page): Promise<void> {
  await visit(page, '/runs');
  await expectNone(page, 'with none kept');
  await starIn(rowOf(page), RUN.title).click();
  await expectTexts(linksOf(page), [RUN.title], 'starred on its row, the run is under Favorites by its title');
  if ((await linksOf(page).getAttribute('href')) !== `/runs/${RUN.id}`) throw new Refused('its favourite links to its page');
  await expectStar(starIn(rowOf(page), RUN.title), true, 'its row');
  await settled(page);
  await photograph(page, path.join(OUT, `favorites-starred-${await themeOf(page)}.png`));
}

/** The same run's card on its factory's floor reads starred; its page's header star takes it off. */
async function onItsCardAndPage(page: Page): Promise<void> {
  await visit(page, `/factories/${RUN.factory}`);
  await showFinished(page);
  await expectStar(starIn(cardOf(page, RUN.id), RUN.title), true, 'its card on the floor');
  await visit(page, `/runs/${RUN.id}`);
  const star = starIn(page.locator('article header'), RUN.title);
  await expectStar(star, true, "its page's header");
  await star.click();
  await expectStar(star, false, "pressed again on its page's header");
  await expectNone(page, 'the run taken off');
}

/**
 * Starred from its card on the floor, the run is under Favorites with no bar opened by the press; a workflow starred from its card
 * follows it, oldest first, and its link opens its card.
 */
async function fromTheFloorThenAWorkflow(page: Page): Promise<void> {
  await visit(page, `/factories/${RUN.factory}`);
  await showFinished(page);
  await starIn(cardOf(page, RUN.id), RUN.title).click();
  await expectStar(starIn(cardOf(page, RUN.id), RUN.title), true, 'pressed on its card');
  await expectCount(page.locator('aside[data-bar]'), 0, "the star's press opens no bar");
  if (new URL(page.url()).searchParams.has('bar')) throw new Refused(`the address names no bar — it is ${page.url()}`);
  await visit(page, '/workflows');
  await starIn(flowCard(page), FLOW).click();
  await expectStar(starIn(flowCard(page), FLOW), true, "the workflow's card");
  await expectTexts(linksOf(page), [RUN.title, FLOW], 'the run, then the workflow, in the order starred');
  await settled(page);
  await photograph(page, path.join(OUT, `favorites-both-${await themeOf(page)}.png`));
  await visit(page, '/runs');
  await linksOf(page).filter({ hasText: FLOW }).click();
  await page.waitForURL((url) => url.pathname === `/workflows/repo/${FLOW}` && url.hash === '', { timeout: WAIT_MS });
  await visit(page, `/runs?factory=${FACTORIES.others[0]}`);
  await expectTexts(linksOf(page), [RUN.title, FLOW], `with ${FACTORIES.others[0]} picked, every factory's favourites are listed`);
}

/** The run's floating bar, opened from its card, stars it too: taken off there and starred again, it joins the end. */
async function fromItsBar(page: Page): Promise<void> {
  await visit(page, `/factories/${RUN.factory}`);
  await showFinished(page);
  await cardOf(page, RUN.id).locator('time').first().click();
  const bar = page.locator(`aside[data-bar="run:${RUN.id}"]`);
  await expectVisible(bar, "a press on the card opens the run's bar");
  const star = starIn(bar, RUN.title);
  await expectStar(star, true, 'its bar');
  await star.click();
  await expectTexts(linksOf(page), [FLOW], 'taken off in its bar');
  await star.click();
  await expectTexts(linksOf(page), [FLOW, RUN.title], 'starred again, it joins the end');
  await settled(page);
  await photograph(page, path.join(OUT, `favorites-bar-${await themeOf(page)}.png`));
}

/** Another page of this browser sees a star taken off here, without a reload. */
async function inAnotherPage(page: Page): Promise<void> {
  await visit(page, '/workflows');
  const other = await page.context().newPage();
  try {
    const { problems } = watch(other);
    await visit(other, page.url());
    await expectTexts(linksOf(other), [FLOW, RUN.title], 'another page reads the same favourites');
    await starIn(flowCard(page), FLOW).click();
    await expectTexts(linksOf(other), [RUN.title], 'and sees the workflow taken off here, without a reload');
    if (problems().length) throw new Refused(`the other page did nothing it must not: ${problems().join('; ')}`);
  } finally {
    await other.close();
  }
}

/**
 * A workflow the api no longer lists is said gone, links nowhere, and its star takes it off. A run the store no longer has is the page
 * `favorite-gone`'s: its read answers a refusal, which this page's watch would count.
 */
async function gone(page: Page): Promise<void> {
  const kept = [{ kind: 'workflow', from: 'yours', workflow: 'no-such-flow' }];
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [FAVORITES_KEY, JSON.stringify(kept)] as const);
  await visit(page, '/runs');
  const rows = favoritesOf(page).locator('li[data-gone]');
  await expectTexts(rows, ['no-such-flow (yours)gone'], 'a favourite gone is said so, by its name');
  await expectCount(linksOf(page), 0, 'and links nowhere');
  await settled(page);
  await photograph(page, path.join(OUT, `favorites-gone-${await themeOf(page)}.png`));
  await favoritesOf(page).getByRole('button', { name: 'Unstar no-such-flow (yours)', exact: true }).click();
  await expectNone(page, 'taken off');
}

/** Where this browser refuses its storage, the board says nothing is starred, and a star pressed lasts as long as the page. */
async function refused(page: Page): Promise<void> {
  const blocked = await page.context().newPage();
  try {
    const { problems } = watch(blocked);
    await blocked.addInitScript(() => {
      const refuse = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      };
      Storage.prototype.getItem = refuse;
      Storage.prototype.setItem = refuse;
    });
    await visit(blocked, new URL('/runs', page.url()).href);
    await expectNone(blocked, 'with storage refused');
    await starIn(rowOf(blocked), RUN.title).click();
    await expectTexts(linksOf(blocked), [RUN.title], 'a star pressed there is listed for the page');
    if (problems().length) throw new Refused(`refused storage breaks nothing: ${problems().join('; ')}`);
  } finally {
    await blocked.close();
  }
}

/** On a phone's screen the sheet's Favorites lists each by its title, and a favourite pressed there closes it and opens its page. */
async function onPhone(page: Page): Promise<void> {
  const kept = [
    { kind: 'run', run: RUN.id },
    { kind: 'workflow', from: 'repo', workflow: FLOW },
  ];
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [FAVORITES_KEY, JSON.stringify(kept)] as const);
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, '/runs');
  await page.locator('header[data-frame-header]').locator('[data-sidebar="trigger"]').click();
  const sheet = page.getByRole('dialog');
  await expectTexts(sheet.locator('[data-favorites]').getByRole('link'), [RUN.title, FLOW], "the sheet's Favorites");
  await settled(page);
  await photograph(page, path.join(OUT, `favorites-phone-${await themeOf(page)}.png`));
  await sheet.locator('[data-favorites]').getByRole('link', { name: RUN.title }).click();
  await expectCount(sheet, 0, 'a favourite pressed closes the sheet');
  await page.waitForURL((url) => url.pathname === `/runs/${RUN.id}`, { timeout: WAIT_MS });
}

export default {
  /**
   * Favourites: a run starred on its Runs row, its card on the floor, its page's header and its bar, and a workflow on its card, each
   * pressed again to take it off; Favorites lists them by title in the order starred, under any factory picked; another page sees a
   * change; a workflow the api no longer lists is said gone (a run gone is `favorite-gone`'s); refused storage says nothing is starred; and a phone's sheet. The favourites
   * and the window's size are taken back.
   */
  name: 'favorites',
  route: '/runs',
  expect: async (page) => {
    const size = page.viewportSize();
    try {
      await fromItsRow(page);
      await onItsCardAndPage(page);
      await fromTheFloorThenAWorkflow(page);
      await fromItsBar(page);
      await inAnotherPage(page);
      await gone(page);
      await refused(page);
      await onPhone(page);
    } finally {
      if (size) await page.setViewportSize(size);
      await page.evaluate((key) => localStorage.removeItem(key), FAVORITES_KEY);
      await visit(page, '/runs');
    }
  },
} satisfies PageSpec;
