import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { AGENTS, FACTORIES, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The factory the page writes, on the checkout, offering WORKFLOWS' workflow of yours and the repository's `dev`, and hiring no one. */
const FACTORY = 'hirer-e2e';

/** The agent of yours the page makes through New agent, hired as it is made. */
const MADE = { name: 'minute-taker-e2e', description: 'Use this when a plan needs its minutes.', body: 'You take the minutes.' } as const;

const PHONE = { width: 390, height: 844 };

const goto = async (page: Page, to: string): Promise<void> => {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
};

/** Writes FACTORY's file; returns what takes it back, with MADE's file if the page made it. */
function written(): () => void {
  const factoryFile = path.join(store!, 'factories', `${FACTORY}.json`);
  const madeFile = path.join(store!, 'workflows', 'agents', `${MADE.name}.md`);
  fs.writeFileSync(
    factoryFile,
    JSON.stringify({ repos: [path.join(store!, 'checkout')], workflows: [WORKFLOWS.yours.name, WORKFLOWS.good.name] }, null, 2),
  );
  return () => {
    fs.rmSync(madeFile, { force: true });
    fs.rmSync(factoryFile, { force: true });
  };
}

/** Picks `agent` in the hire's picker on the step's page, and hires it; refuses unless FACTORY then hires it, with Fire. */
async function hire(page: Page, agent: string): Promise<void> {
  await page.locator('[data-hire-picker]').click();
  await page.getByRole('option', { name: new RegExp(`^${agent}`) }).click();
  await page.locator('[data-hire]').click();
  await expectVisible(
    page.locator(`[data-fire="${agent}"]:not([disabled])`),
    `${FACTORY} hires ${agent}, with Fire, once its reads are back`,
  );
}

/** Fires the agent hired, and refuses unless the picker is back. */
async function fire(page: Page, agent: string): Promise<void> {
  await page.locator(`[data-fire="${agent}"]`).click();
  await expectVisible(page.locator('[data-hire-picker]'), `${agent} fired, the picker is back`);
  await expectCount(page.locator('[data-fire]'), 0, 'and nothing is hired');
}

/** On a phone, the step's page is photographed and no wider than the phone; then the window is put back. */
async function onPhone(page: Page): Promise<void> {
  const was = page.viewportSize();
  await page.setViewportSize(PHONE);
  try {
    await settled(page);
    const wide = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, phone: innerWidth }));
    if (wide.page > wide.phone) throw new Refused(`the step's page fits a phone — it is ${wide.page}px on ${wide.phone}px`);
    await photograph(page, path.join(OUT, `step-hire-phone-${await themeOf(page)}.png`));
  } finally {
    if (was) await page.setViewportSize(was);
  }
}

export default {
  /**
   * Hiring into a step on the board. In a factory the page writes, offering `mine`, its workflow page's row of `plan` offers the agents
   * of yours to hire, and New agent; on the step's page, `scribe` is picked and hired, then fired; New agent opens the creator saying it
   * hires what it makes into `mine/plan`, and once made, the page is back on the step, the new agent hired. In the default factory the
   * step says why none is hired, with no picker; `pipao`, which does not offer `dev`, says so on `dev`'s page; and the repository's
   * `dev` says, in the factory written, how a new agent is added to it. The page takes back the factory and the agent.
   */
  name: 'step-hire',
  route: `/workflows/yours/${WORKFLOWS.yours.name}/plan`,
  expect: async (page) => {
    const theme = await themeOf(page);
    const { yours, good } = WORKFLOWS;
    const step = `/workflows/yours/${yours.name}/plan`;
    const takeBack = written();
    try {
      await expectVisible(page.locator('[data-hire-refused]'), 'in the default factory, why no agent is hired, said in place');
      await expectCount(page.locator('[data-hire-picker]'), 0, 'and no picker');

      await goto(page, `/workflows/yours/${yours.name}?factory=${FACTORY}`);
      const row = page.locator('[data-step-hire="plan"]');
      await expectVisible(row.locator('[data-hire-picker]'), "the workflow page's row of plan offers a picker");
      await expectVisible(row.locator('[data-new-agent]'), 'and New agent');
      await settled(page);
      await photograph(page, path.join(OUT, `step-hire-workflow-${theme}.png`));

      await goto(page, `${step}?factory=${FACTORY}`);
      await hire(page, AGENTS.seeded.name);
      await expectVisible(page.locator(`[data-hired="${FACTORY}"]`), 'and the step is marked hired');
      await expectCount(page.locator('[data-new-agent]'), 0, 'with no New agent beside the one hired');
      await settled(page);
      await photograph(page, path.join(OUT, `step-hire-hired-${theme}.png`));
      await onPhone(page);
      await fire(page, AGENTS.seeded.name);
      await settled(page);
      await photograph(page, path.join(OUT, `step-hire-picker-${theme}.png`));

      await page.locator('[data-new-agent]').click();
      await page.waitForURL((url) => url.pathname === '/agents/new' && url.searchParams.get('factory') === FACTORY, { timeout: WAIT_MS });
      await idle(page);
      await expectVisible(page.locator(`[data-hire-into="${yours.name}/plan"]`), 'the creator says it hires what it makes into the step');
      const form = page.getByRole('form', { name: 'New agent' });
      await form.getByRole('textbox', { name: 'Name' }).fill(MADE.name);
      await form.getByRole('textbox', { name: 'Description' }).fill(MADE.description);
      await form.getByRole('textbox', { name: 'Model' }).fill(AGENTS.made.model);
      await form.getByRole('textbox', { name: 'Instructions' }).fill(MADE.body);
      await settled(page);
      await photograph(page, path.join(OUT, `step-hire-new-agent-${theme}.png`), { fullPage: true });
      await form.getByRole('button', { name: 'Create agent' }).click();
      await page.waitForURL((url) => url.pathname === step && url.searchParams.get('factory') === FACTORY, { timeout: WAIT_MS });
      await idle(page);
      await expectVisible(page.locator(`[data-fire="${MADE.name}"]:not([disabled])`), 'back on the step, the agent made is hired into it');
      await fire(page, MADE.name);

      await goto(page, `/workflows/repo/${good.name}?factory=${FACTORIES.bare}`);
      await expectVisible(page.locator(`[data-not-offered="${FACTORIES.bare}"]`), `${FACTORIES.bare} does not offer ${good.name}, said`);
      await expectCount(page.locator('[data-step-hire]'), 0, 'and its rows offer no hire');
      await goto(page, `/workflows/repo/${good.name}/review?factory=${FACTORY}`);
      await expectVisible(page.locator('[data-new-agent-repo]'), "the repository's step says how a new agent is added to it");
      await expectCount(page.locator('[data-new-agent]'), 0, 'and offers no New agent');
      await settled(page);
      await photograph(page, path.join(OUT, `step-hire-repo-${theme}.png`));
      await goto(page, step);
    } finally {
      takeBack();
    }
  },
} satisfies PageSpec;
