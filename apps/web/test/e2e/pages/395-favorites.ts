import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { cardOf, showFinished } from '../canvas.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { FACTORIES, FOLDER, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The key this browser keeps its favourites under. */
const FAVORITES_KEY = 'nemia:favorites';
/** The run the page stars, by its title, which names it in Favorites. */
const RUN = { id: FOLDER.id, title: FOLDER.title, factory: FACTORIES.hiring.name };
/** The workflow the page stars, the repository's. */
const FLOW = WORKFLOWS.good.name;

/** What this browser keeps of its favourites, in the order starred: each by its run's id or its workflow's name. */
const keptOf = (page: Page): Promise<string[]> =>
  page.evaluate((key) => {
    const kept = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ run?: string; workflow?: string }>;
    return kept.map((one) => one.run ?? one.workflow ?? '');
  }, FAVORITES_KEY);

/** Refuses unless this browser keeps `want` as its favourites, in that order, waiting for the press that writes them. */
async function expectKept(page: Page, want: string[], assertion: string): Promise<void> {
  await page
    .waitForFunction(
      ([key, want]) => {
        const kept = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ run?: string; workflow?: string }>;
        return kept.map((one) => one.run ?? one.workflow ?? '').join('\n') === want;
      },
      [FAVORITES_KEY, want.join('\n')] as const,
      { timeout: WAIT_MS },
    )
    .catch(() => undefined);
  const kept = await keptOf(page);
  if (kept.join() !== want.join()) throw new Refused(`${assertion}: this browser keeps ${want.join(', ') || 'none'} — it keeps ${kept.join(', ') || 'none'}`);
}

/** The star in `scope` that stars the thing named `name`. */
const starIn = (scope: Locator, name: string): Locator => scope.getByRole('button', { name: `Star ${name}`, exact: true });
/** The header of the run's own page. */
const headerOf = (page: Page): Locator => page.locator('article header');
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

/**
 * The Runs page has no star; the run starred on its own page's header is under Favorites by its title, a link to its page, its star
 * reads pressed, and Runs lists it under Favorites too.
 */
async function fromItsPage(page: Page): Promise<void> {
  await visit(page, '/runs');
  await expectKept(page, [], 'with none kept');
  await expectCount(page.locator('[data-runs-page]').getByRole('button', { name: /^Star / }), 0, 'the Runs page has no star');
  await visit(page, `/runs/${RUN.id}`);
  await starIn(headerOf(page), RUN.title).click();
  await expectKept(page, [RUN.id], "starred on its page's header, the run is kept");
  await expectStar(starIn(headerOf(page), RUN.title), true, "its page's header");
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
  await expectKept(page, [], 'the run taken off');
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
  await expectKept(page, [RUN.id, FLOW], 'the run, then the workflow, in the order starred');
  await settled(page);
  await photograph(page, path.join(OUT, `favorites-both-${await themeOf(page)}.png`));
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
  await expectKept(page, [FLOW], 'taken off in its bar');
  await star.click();
  await expectKept(page, [FLOW, RUN.id], 'starred again, it joins the end');
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
    await expectStar(starIn(flowCard(other), FLOW), true, 'another page reads the same favourites');
    await starIn(flowCard(page), FLOW).click();
    await expectStar(starIn(flowCard(other), FLOW), false, 'and sees the workflow taken off here, without a reload');
    if (problems().length) throw new Refused(`the other page did nothing it must not: ${problems().join('; ')}`);
  } finally {
    await other.close();
  }
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
    await visit(blocked, new URL(`/runs/${RUN.id}`, page.url()).href);
    await expectStar(starIn(headerOf(blocked), RUN.title), false, 'with storage refused, nothing is starred');
    await starIn(headerOf(blocked), RUN.title).click();
    await expectStar(starIn(headerOf(blocked), RUN.title), true, 'a star pressed there holds for the page');
    if (problems().length) throw new Refused(`refused storage breaks nothing: ${problems().join('; ')}`);
  } finally {
    await blocked.close();
  }
}

export default {
  /**
   * The stars: a run starred on its page's header, Runs having no star of its own; then its card on the floor, its page's header and
   * its bar, and a workflow on its card, each pressed again to take it off; this browser keeps them in the order starred; another page
   * sees a change; refused storage stars nothing kept, and a star pressed holds for the page. The favourites are taken back.
   */
  name: 'favorites',
  route: '/runs',
  expect: async (page) => {
    try {
      await fromItsPage(page);
      await onItsCardAndPage(page);
      await fromTheFloorThenAWorkflow(page);
      await fromItsBar(page);
      await inAnotherPage(page);
      await refused(page);
    } finally {
      await page.evaluate((key) => localStorage.removeItem(key), FAVORITES_KEY);
      await visit(page, '/runs');
    }
  },
} satisfies PageSpec;
