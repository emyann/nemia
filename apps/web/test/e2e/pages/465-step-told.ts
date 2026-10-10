import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { DIAMOND, FACTORIES, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The agent the page writes into the checkout's `workflows/agents/` for FACTORIES' `hiring` to hire into `dev`'s `review`. */
const REVIEWER = 'reviewer-e2e';

/** The run of `dev` the page writes in `hiring`, started `--after` DIAMOND's `running`, so it never files `review`. */
const RECENT = { id: 'reviews-in-a-factory-e2e47', title: 'Reviews in a factory' } as const;

const PHONE = { width: 390, height: 844 };

/** The layers a step with an agent is told, read in a factory, in the order the page draws them. */
const LAYERS = ['instructions', 'custom', 'factory', 'policy', 'task'];

/** What the rules' layer says of a step told none, read in a factory. */
const NONE_TOLD = 'This step is told none: the factory keeps none that can be told, or the step is on a remote agent';

const goto = async (page: Page, to: string): Promise<void> => {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
};

/** Refuses unless the link `selector` on the page goes to `href`. */
async function expectHref(page: Page, selector: string, href: string, what: string): Promise<void> {
  const link = page.locator(selector).first();
  await expectVisible(link, what);
  const at = await link.getAttribute('href');
  if (at !== href) throw new Refused(`${what}: it links ${href} — it links ${at}`);
}

/**
 * Plants a directory where the store keeps `factory`'s rules, which cannot be told, and reads the step's page there (`placed`) again:
 * refuses unless the page reads all the same, its rules' layer saying the step is told none and never that the factory wrote none. Takes
 * the directory back.
 */
async function untold(page: Page, placed: string, factory: string): Promise<void> {
  const folder = path.join(store!, 'factories', factory);
  const had = fs.existsSync(folder);
  fs.mkdirSync(path.join(folder, 'RULES.md'), { recursive: true });
  try {
    await goto(page, placed);
    const rules = page.locator('details[data-will-be-told] [data-layer="factory"]');
    await expectVisible(
      rules.getByText(NONE_TOLD, { exact: true }),
      'rules that cannot be told: the step is told none, and its page says so',
    );
    await expectCount(rules.getByText('None written'), 0, 'and not that the factory wrote none: its Settings keep some');
    await expectVisible(page.locator(`[data-hired="${factory}"]`), 'the listing refuses nothing: the hire still reads');
  } finally {
    fs.rmSync(had ? path.join(folder, 'RULES.md') : folder, { recursive: true, force: true });
  }
}

/**
 * Writes the hire of REVIEWER into `hiring`'s `dev/review`, as its one hire (the seeded one into `dev/implement` is refused beside the
 * step's own `agent:` line, as 181-workflow finds), the agent's file, and RECENT's record on the checkout
 * from its `main`, as `wf start` freezes one; returns what takes them back.
 */
function written(checkout: string): () => void {
  const factoryFile = path.join(store!, 'factories', `${FACTORIES.hiring.name}.json`);
  const factoryText = fs.readFileSync(factoryFile, 'utf8');
  const reviewerFile = path.join(checkout, 'workflows', 'agents', `${REVIEWER}.md`);
  const record = path.join(store!, 'runs', `${RECENT.id}.json`);
  const base = execFileSync('git', ['rev-parse', 'main'], { cwd: checkout, encoding: 'utf8' }).trim();
  fs.writeFileSync(reviewerFile, '---\ndescription: Use this when a change needs reviewing.\n---\nYou review the change.\n');
  fs.writeFileSync(
    factoryFile,
    JSON.stringify({ ...(JSON.parse(factoryText) as object), hires: { [`${WORKFLOWS.good.name}/review`]: REVIEWER } }, null, 2),
  );
  const run = {
    id: RECENT.id,
    repo: checkout,
    workspace: checkout,
    baseRef: base,
    branch: 'main',
    isolate: true,
    brief: `${RECENT.title}\n\nA run written by the step-told page, in the factory ${FACTORIES.hiring.name}.`,
    workflowDir: path.join(checkout, 'workflows', WORKFLOWS.good.name),
    workflow: [
      { name: 'implement', after: [], body: 'Implement what was asked.', harness: 'claude' },
      { name: 'review', after: ['implement'], body: 'Review it.', harness: 'claude' },
    ],
    after: [DIAMOND.running.id],
    factory: FACTORIES.hiring.name,
    createdAt: new Date().toISOString(),
    steps: { implement: { taskId: null }, review: { taskId: null } },
  };
  fs.writeFileSync(record, JSON.stringify(run, null, 2));
  return () => {
    fs.rmSync(record, { force: true });
    fs.rmSync(reviewerFile, { force: true });
    fs.writeFileSync(factoryFile, factoryText);
  };
}

/** On a phone, the step's page is photographed and no wider than the phone; then the window is put back. */
async function onPhone(page: Page): Promise<void> {
  const was = page.viewportSize();
  await page.setViewportSize(PHONE);
  try {
    await settled(page);
    const wide = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, phone: innerWidth }));
    if (wide.page > wide.phone) throw new Refused(`the step's page fits a phone — it is ${wide.page}px on ${wide.phone}px`);
    await photograph(page, path.join(OUT, `step-told-phone-${await themeOf(page)}.png`));
  } finally {
    if (was) await page.setViewportSize(was);
  }
}

export default {
  /**
   * What a step will be told, on its page, read now. With no factory picked, `dev`'s `review` says its file names no agent, and that
   * FACTORIES' `hiring` hires one into it, linked to the page in that factory; there, the hire is marked hired, and the layers are drawn
   * open, each beside where it is edited — the agent's page, its custom instructions on it, the factory's rules, none told, on the
   * factory's Settings, the step's file in the checkout — with the run of `dev` in that factory among its recent runs, not reached yet;
   * and its file reads as written, its agent row said to be the hire's. The run's step links back to the step's page in its place, and
   * its header to its workflow's. With rules planted that cannot be told, the step's page reads all the same, and says the step is told
   * none. The page writes the hire, the agent, the run and those rules, and takes them back.
   */
  name: 'step-told',
  route: `/workflows/repo/${WORKFLOWS.good.name}/review`,
  expect: async (page) => {
    const theme = await themeOf(page);
    const { good } = WORKFLOWS;
    const factory = FACTORIES.hiring.name;
    const checkout = path.join(store!, 'checkout');
    const takeBack = written(checkout);
    const step = `/workflows/repo/${good.name}/review`;
    const placed = `${step}?factory=${factory}`;
    try {
      await goto(page, step);
      await expectVisible(
        page.locator('[data-step-agent]', { hasText: 'Its file names no agent.' }),
        'with no factory: its file names none',
      );
      await expectHref(page, `a[data-hired-in="${factory}"]`, placed, `${factory} hires into it, linked to this page in ${factory}`);
      await expectCount(page.locator('[data-hired]'), 0, 'and nothing is marked hired');
      await settled(page);
      await photograph(page, path.join(OUT, `step-told-file-${theme}.png`));

      await page.locator(`a[data-hired-in="${factory}"]`).click();
      await page.waitForURL((url) => url.searchParams.get('factory') === factory);
      await idle(page);
      await expectVisible(page.locator(`[data-hired="${factory}"]`, { hasText: `hired by ${factory}` }), 'the hire, marked hired');
      const told = page.locator('details[data-will-be-told]');
      await expectVisible(told.locator('summary', { hasText: 'What it will be told' }), 'what it will be told, drawn open');
      await expectVisible(told.locator('[data-read-now]'), 'read now, and frozen when a run starts');
      await expectHref(page, '[data-home="instructions"] a', `/agents/repo/${REVIEWER}`, "the agent's instructions live on its page");
      await expectHref(page, '[data-home="custom"] a', `/agents/repo/${REVIEWER}#custom-instructions`, 'your custom instructions too');
      const rules = told.locator('[data-layer="factory"]');
      await expectVisible(
        rules.getByRole('heading', { name: "The factory's rules", exact: true }),
        'read in a factory, its rules are a layer of their own',
      );
      await expectVisible(rules.getByText(NONE_TOLD, { exact: true }), 'which says the step is told none');
      await expectHref(
        page,
        '[data-home="factory"] a',
        `/factories/${factory}/settings`,
        "the rules are written on the factory's Settings",
      );
      const order = await told.locator('[data-layer]').evaluateAll((all) => all.map((el) => el.getAttribute('data-layer')));
      if (order.join() !== LAYERS.join()) throw new Refused(`the layers are drawn ${LAYERS.join(', ')} — they are ${order.join(', ')}`);
      await expectVisible(
        page.locator('[data-home="policy"] code', { hasText: path.join(checkout, 'workflows', good.name, 'review.md') }),
        "the step's words live in its file in the checkout",
      );
      await expectVisible(told.locator('[data-layer="task"]', { hasText: 'Then the task' }), 'and the task is left to the brief');
      const file = page.locator('section[aria-label="The file"]');
      await expectVisible(file.getByText('Review the change.', { exact: true }), "the file's own words, rendered");
      await expectCount(file.getByText('You review the change.'), 0, "and not the hire's, which the loader fills the step with");
      await expectVisible(file.locator('[data-hired-row]'), "and its agent row is said to be the hire's");
      const recent = page.locator(`[data-recent-run="${RECENT.id}"]`);
      await expectVisible(recent.getByText('not reached yet'), `${RECENT.id}, among its recent runs, has not reached it yet`);
      await settled(page);
      await photograph(page, path.join(OUT, `step-told-factory-${theme}.png`));
      await onPhone(page);

      await recent.getByRole('link', { name: RECENT.title }).click();
      await page.waitForURL((url) => url.pathname === `/runs/${RECENT.id}` && url.hash === '#step-review');
      await idle(page);
      const back = `${placed}&repo=${encodeURIComponent(checkout)}`;
      await expectHref(page, '[data-step-page-link="review"]', back, "the run's step links back to the step's page, in its place");
      await expectHref(
        page,
        `article header a[data-workflow="${good.name}"]`,
        `/workflows/repo/${good.name}?factory=${factory}&repo=${encodeURIComponent(checkout)}`,
        "the run's header links its workflow's page, in its place",
      );
      await settled(page);
      await photograph(page, path.join(OUT, `step-told-run-link-${theme}.png`));

      await page.locator('[data-step-page-link="review"]').click();
      await page.waitForURL((url) => url.pathname === step && url.searchParams.get('factory') === factory);
      await idle(page);
      await expectVisible(page.locator(`[data-hired="${factory}"]`), 'back on the step, in the run’s factory');
      await expectHref(
        page,
        'article > a',
        `/workflows/repo/${good.name}?factory=${factory}&repo=${encodeURIComponent(checkout)}`,
        'whose way back to its workflow keeps the place',
      );
      await untold(page, placed, factory);
      await goto(page, step);
    } finally {
      takeBack();
    }
  },
} satisfies PageSpec;
