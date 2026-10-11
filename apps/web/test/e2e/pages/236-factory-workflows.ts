import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { AGENTS, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

const { good, yours } = WORKFLOWS;

/** The factory the page files, made from a template, on a repository that is not the checkout, its workflows in its tree. */
const TREED = 'treed';
/** The template it is made from, as `nemia factory apply` writes it into its file. */
const TEMPLATE = { source: '/drafts/team', version: '0.1.0', params: {} };
/** The workflow only its tree has, of one step. */
const OWN = { name: 'tree-only', step: 'only' };
/** What its tree's `dev` says of itself, which the checkout's does not, and its one step, which the checkout's lacks. */
const SHADOW = { description: "The tree's own dev, which shadows the checkout's.", step: 'draft' };

/** A step file with no agent, told `body`. */
const stepFile = (body: string) => `---\nharness: claude\nmodel: sonnet\nplace: git\n---\n${body}\n`;

/** Writes TREED's file and its tree; returns what takes both back. */
function written(): () => void {
  const file = path.join(store!, 'factories', `${TREED}.json`);
  const folder = path.join(store!, 'factories', TREED);
  const workflows = path.join(folder, 'tree', 'workflows');
  const put = (to: string, text: string) => {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, text);
  };
  put(
    path.join(folder, 'tree', 'factory.json'),
    `${JSON.stringify({ workflows: [good.name, OWN.name, yours.name], hires: { [`${yours.name}/${yours.steps[0]}`]: AGENTS.seeded.name } }, null, 2)}\n`,
  );
  put(path.join(workflows, good.name, 'README.md'), `${SHADOW.description}\n`);
  put(path.join(workflows, good.name, `${SHADOW.step}.md`), stepFile('Draft it.'));
  put(path.join(workflows, OWN.name, `${OWN.step}.md`), stepFile('Do the one thing.'));
  put(file, `${JSON.stringify({ repos: [path.join(store!, 'elsewhere')], template: TEMPLATE }, null, 2)}\n`);
  return () => {
    fs.rmSync(file, { force: true });
    fs.rmSync(folder, { recursive: true, force: true });
  };
}

const goto = async (page: Page, to: string): Promise<void> => {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
};

/** Refuses unless the page reaches `pathname` in the factory TREED within the wait. */
async function expectIn(page: Page, pathname: string, assertion: string): Promise<void> {
  try {
    await page.waitForURL((url) => url.pathname === pathname && url.searchParams.get('factory') === TREED, { timeout: WAIT_MS });
  } catch {
    throw new Refused(`${assertion} — the page is at ${page.url()}`);
  }
  await idle(page);
}

export default {
  /**
   * A factory's workflows are read in that factory. TREED is on a repository that is not the checkout, and its workflows are in its
   * tree: picked, the Workflows page lists what the api lists in it — its tree's `dev`, which shadows the checkout's, its `tree-only`,
   * and the one of yours it attaches — each tagged with it alone, none said to be this repository's. Its `dev` leads to the tree's
   * folder: its one step, no builder, nothing about a checkout, and why it cannot start there; a press on its step opens the bar on the
   * tree's step, whose Open lands on the step's page in the factory. One of yours it hires into still opens its builder, which drafts
   * from the list read with no factory, and starts its run in the factory. With no factory picked, the tree's workflows are not listed,
   * and `dev` is the checkout's. The factory is taken back.
   */
  name: 'factory-workflows',
  route: '/workflows',
  expect: async (page) => {
    const theme = await themeOf(page);
    const shoot = async (what: string) => {
      await settled(page);
      await photograph(page, path.join(OUT, `factory-workflows-${what}-${theme}.png`), { fullPage: true });
    };
    const cards = page.locator('section[aria-label^="Workflow "]');
    const card = (name: string) => page.locator(`section[aria-label="Workflow ${name}"]`);
    const takeBack = written();
    try {
      await goto(page, `/workflows?factory=${TREED}`);
      await expectTexts(
        cards.locator('h2'),
        [good.name, OWN.name, yours.name],
        `with ${TREED} picked, Workflows lists what the api lists in it: its tree's two, then the one of yours it attaches`,
      );
      await expectCount(page.locator('section[data-from="repo"]'), 2, "the tree's folders are listed as the factory's");
      await expectVisible(card(good.name).getByText(SHADOW.description), `${good.name}'s description is the tree's`);
      await expectTexts(cards.locator('[data-factory-tag]'), [TREED, TREED, TREED], `each tagged with ${TREED} alone`);
      await expectCount(page.locator('[data-filtered-out]'), 0, 'and the factory is not said to hold none');
      await expectCount(cards.getByText('this repository'), 0, "no card says this repository's");
      await expectVisible(card(good.name).getByText("the factory's", { exact: true }), "the tree's says the factory's");
      await shoot('list');

      await card(good.name).getByRole('link', { name: good.name, exact: true }).click();
      await expectIn(page, `/workflows/repo/${good.name}`, `${good.name}'s card leads to its page in ${TREED}`);
      const article = page.locator(`article[aria-label="Workflow ${good.name}"]`);
      const folder = path.join('factories', TREED, 'tree', 'workflows', good.name);
      await expectVisible(article.locator('[data-folder]', { hasText: folder }), `the page prints the tree's folder, ${folder}`);
      await expectTexts(article.locator('[data-step-row] > div > a'), [SHADOW.step], "its rows are the tree's one step");
      for (const step of good.steps) await expectCount(article.locator(`[data-step-row="${step}"]`), 0, `and not the checkout's ${step}`);
      await expectVisible(article.locator('[data-no-builder]'), 'it says why it has no builder');
      await expectCount(article.locator('[data-no-builder]', { hasText: 'this checkout' }), 0, 'with nothing about a checkout');
      await expectCount(article.getByRole('button', { name: 'Build', exact: true }), 0, 'and no Build');
      await expectVisible(
        article.locator('[data-why-not]', { hasText: `in the factory ${TREED}` }),
        'and, its step hired into by no one, why it cannot start there, in place of a start',
      );
      await shoot('workflow');

      await article.locator(`.react-flow__node[data-id="${SHADOW.step}"]`).click();
      const bar = page.locator(`aside[data-bar="spec:repo/${good.name}/${SHADOW.step}"]`);
      await expectVisible(bar.locator('[data-runs-on]'), "a press on the tree's step opens the bar on it, read in the factory");
      await expectCount(bar.getByText('has no step named'), 0, "and not on the checkout's workflow of the same name");
      await expectVisible(bar.getByText("the factory's"), "said to be the factory's");
      await bar.getByRole('link', { name: 'Open', exact: true }).click();
      await expectIn(page, `/workflows/repo/${good.name}/${SHADOW.step}`, "the bar's Open lands on the step's page in the factory");
      await expectVisible(page.locator('article h1', { hasText: SHADOW.step }), "and the tree's step is drawn");
      await expectVisible(page.locator('[data-from="repo"]', { hasText: "the factory's" }), "said to be the factory's too");

      await goto(page, `/workflows/yours/${yours.name}?factory=${TREED}&build=true`);
      const builder = page.locator(`section[data-builder="${yours.name}"]`);
      await expectVisible(builder, `one of yours opens its builder in ${TREED}, which hires into its step`);
      await expectCount(page.getByText('is listed with'), 0, 'drafted from the list read with no factory, so nothing is refused');
      await builder.getByRole('button', { name: 'Close', exact: true }).click();
      await expectCount(builder, 0, 'closed unsaved');
      await expectVisible(page.locator(`[data-step-hire="${yours.steps[0]}"]`), `and its row hires in ${TREED}`);
      await expectVisible(
        page.getByRole('form', { name: `Start a run of ${yours.name}` }).getByText(`in the factory ${TREED}`),
        'and its start, every step filled, runs in the factory',
      );

      await goto(page, '/workflows');
      await expectCount(card(OWN.name), 0, "with no factory picked, the tree's own workflow is not listed");
      await expectVisible(card(good.name).getByText('this repository', { exact: true }), `and ${good.name} is this repository's`);
    } finally {
      takeBack();
    }
  },
} satisfies PageSpec;
