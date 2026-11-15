import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectNone, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { checkoutIn, FACTORIES, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The factory the page reads. */
const FACTORY = FACTORIES.hiring.name;

/** The workflow and the agent the page reads in it, the repository's. */
const { name: WORKFLOW, agent: AGENT } = WORKFLOWS.good;

/** The factory's path. */
const AT = `/factories/${FACTORY}`;

/** Each old address, as a link of before the factory's paths wrote it, beside the path and search it reaches. */
const OLD: ReadonlyArray<[string, string]> = [
  [`/?factory=${FACTORY}`, AT],
  [`/runs?factory=${FACTORY}&l=a%3Db`, `${AT}/runs?l=a%3Db`],
  [`/inbox?factory=${FACTORY}`, `${AT}/inbox`],
  [`/workflows?factory=${FACTORY}`, `${AT}/workflows`],
  [`/workflows/repo/${WORKFLOW}?factory=${FACTORY}`, `${AT}/workflows/repo/${WORKFLOW}`],
  [`/workflows/repo/${WORKFLOW}/review?factory=${FACTORY}`, `${AT}/workflows/repo/${WORKFLOW}/review`],
  [`/capabilities?factory=${FACTORY}`, `${AT}/skills`],
  [`/agents?factory=${FACTORY}`, `${AT}/agents`],
  [`/agents/repo/${AGENT.name}?factory=${FACTORY}`, `${AT}/agents/${AGENT.name}?from=repo`],
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
  `${AT}/settings`,
];

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** The address now, its path and search. */
const here = (page: Page): string => {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}`;
};

/** Each old address reaches its page under the factory's path, its other keys kept. */
async function oldLinks(page: Page): Promise<void> {
  for (const [from, to] of OLD) {
    await visit(page, from);
    await page.waitForURL(() => here(page) === to, { timeout: WAIT_MS }).catch(() => undefined);
    if (here(page) !== to) throw new Refused(`${from} reaches ${to} — it is at ${here(page)}`);
  }
}

/** At 768 wide, no page under the factory's path lays out past its column beside the rail and the pane, nor moves the window sideways. */
async function inColumn(page: Page): Promise<void> {
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
   * `/factories/<name>/`, its other keys kept; and at 768 wide no page under the path lays out past its column. The checkout's `dev` is
   * offered in the factory for the page's length, and taken back after.
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
