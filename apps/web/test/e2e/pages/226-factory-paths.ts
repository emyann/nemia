import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, placeLitOf, placeOf, themeOf, type PANE_PLACES } from '../board.ts';
import { expectCount, expectNone, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { checkoutIn, FACTORIES, QUEUE, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The factory the page reads. */
const FACTORY = FACTORIES.hiring.name;

/** The workflow and the agent the page reads in it, the repository's. */
const { name: WORKFLOW, agent: AGENT } = WORKFLOWS.good;

/** The factory's path. */
const AT = `/factories/${FACTORY}`;

/**
 * Each old address, as a link of before the factory's paths wrote it, beside the path and search it reaches and the pane's place lit
 * there.
 */
const OLD: ReadonlyArray<[string, string, (typeof PANE_PLACES)[number]]> = [
  [`/?factory=${FACTORY}`, AT, 'Floor'],
  [`/runs?factory=${FACTORY}&l=a%3Db`, `${AT}/runs?l=a%3Db`, 'Runs'],
  [`/inbox?factory=${FACTORY}`, `${AT}/inbox`, 'Inbox'],
  [`/inbox/${QUEUE.first.name}`, `${AT}/inbox/${QUEUE.first.name}`, 'Inbox'],
  [`/workflows?factory=${FACTORY}`, `${AT}/workflows`, 'Workflows'],
  [`/workflows/repo/${WORKFLOW}?factory=${FACTORY}`, `${AT}/workflows/repo/${WORKFLOW}`, 'Workflows'],
  [`/workflows/repo/${WORKFLOW}/review?factory=${FACTORY}`, `${AT}/workflows/repo/${WORKFLOW}/review`, 'Workflows'],
  [`/capabilities?factory=${FACTORY}`, `${AT}/skills`, 'Skills'],
  [`/agents?factory=${FACTORY}`, `${AT}/agents`, 'Agents'],
  [`/agents/repo/${AGENT.name}?factory=${FACTORY}`, `${AT}/agents/${AGENT.name}?from=repo`, 'Agents'],
];

/** Every page under the factory's path, each place of its pane and the pages beneath them. */
const PAGES: readonly string[] = [
  AT,
  `${AT}/runs`,
  `${AT}/inbox`,
  `${AT}/workflows`,
  `${AT}/workflows/repo/${WORKFLOW}`,
  `${AT}/workflows/repo/${WORKFLOW}/review`,
  `${AT}/agents`,
  `${AT}/agents/${AGENT.name}?from=repo`,
  `${AT}/skills`,
  `${AT}/proposals`,
  `${AT}/settings`,
];

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string) {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** The address now, its path and search. */
const here = (page: Page) => {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}`;
};

/**
 * Each old address reaches its page under the factory's path, its other keys kept, with the pane drawn and its place lit; the old address
 * is replaced in the history, so Back from where it led returns to the page before it, never to it.
 */
async function oldLinks(page: Page) {
  for (const [from, to, lit] of OLD) {
    await visit(page, AT);
    await visit(page, from);
    await page.waitForURL(() => here(page) === to, { timeout: WAIT_MS }).catch(() => undefined);
    if (here(page) !== to) throw new Refused(`${from} reaches ${to} — it is at ${here(page)}`);
    await expectVisible(placeOf(page, lit).and(placeLitOf(page)), `${from} reaches its page with the pane drawn and ${lit} lit`);
    await expectCount(placeLitOf(page), 1, `and ${lit} alone lit`);
    await page.goBack({ waitUntil: 'load' });
    await page.waitForURL(() => here(page) === AT, { timeout: WAIT_MS }).catch(() => undefined);
    if (here(page) !== AT) throw new Refused(`Back from where ${from} led returns to ${AT}, the page before it — it is at ${here(page)}`);
    await idle(page);
  }
}

/** At 768 wide, no page under the factory's path lays out past its column beside the rail and the pane, nor moves the window sideways. */
async function inColumn(page: Page) {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 768, height: size?.height ?? 900 });
  try {
    for (const one of PAGES) {
      await visit(page, one);
      await expectNone(
        () =>
          page.evaluate(() => {
            const main = document.querySelector('main[data-frame-page]');
            const window = document.scrollingElement;
            if (!main || !window) return 'there is no column to measure';
            const right = Math.min(main.getBoundingClientRect().right, innerWidth);
            const past = [...document.body.querySelectorAll('*')].find((one) => one.getBoundingClientRect().right > right + 1);
            const named = past
              ? `, first ${past.tagName.toLowerCase()}.${past.className.toString().slice(0, 80)} to ${past.getBoundingClientRect().right}`
              : '';
            if (window.scrollWidth > innerWidth + 1) return `the window is ${window.scrollWidth} wide, past its ${innerWidth}${named}`;
            if (main.scrollWidth > main.clientWidth + 1) return `the column holds ${main.scrollWidth} in its ${main.clientWidth}${named}`;
            return null;
          }),
        `768 wide, ${one} lays out in its column`,
      );
    }
    await visit(page, `${AT}/runs`);
    await settled(page);
    await photograph(page, path.join(OUT, `factory-paths-runs-768-${await themeOf(page)}.png`));
  } finally {
    if (size) await page.setViewportSize(size);
  }
}

export default {
  /**
   * A factory's places under its path: every link of before the paths, `?factory=` on a store page's address, reaches its page under
   * `/factories/<name>/`, its other keys kept, with the pane drawn and its place lit, and Back returns past it; a card of the factory
   * opened at the store's `/inbox/<name>` reaches its page under the path; and at 768 wide no page under the path lays out past its
   * column. The checkout's `dev` is offered in the factory for the page's length, and taken back after.
   */
  name: 'factory-paths',
  route: AT,
  expect: async (page) => {
    const takeBack = checkoutIn(store!, [WORKFLOW]);
    try {
      await oldLinks(page);
      await inColumn(page);
    } finally {
      takeBack();
      await visit(page, AT);
    }
  },
} satisfies PageSpec;
