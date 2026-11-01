import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, startOf, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { FACTORIES, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store, takeBackRuns } from '../world.ts';

/** The brief the page starts its run with. */
const BRIEF = 'Start a run from the floor of its factory';
/** The step of `dev` whose file names no agent, which leaves the workflow unfilled in a factory until it hires into it. */
const UNFILLED = 'review';
/** The agent the page writes into the checkout's `workflows/agents/` for the factory to hire into `review`. */
const REVIEWER = 'reviewer-e2e';

/** The factory's file `text` with `hires` in place of the seed's. */
const withHires = (text: string, hires: Record<string, string>): string =>
  JSON.stringify({ ...(JSON.parse(text) as object), hires }, null, 2);

/** Open the sidebar's start on a fresh load of the floor, and the floating bar it opens. */
async function openStart(page: Page): Promise<Locator> {
  await page.goto(page.url(), { waitUntil: 'load' });
  await idle(page);
  await startOf(page).click();
  const bar = page.getByRole('complementary', { name: `Start a run in ${FACTORIES.hiring.name}` });
  await expectVisible(bar, "the sidebar's Start a run opens the floating bar naming the factory");
  return bar;
}

/** Picks `workflow` in the bar, and the start it offers. */
async function pickWorkflow(bar: Locator, workflow: string): Promise<Locator> {
  await bar.locator(`[data-workflow="repo:${workflow}"] label`).click();
  const form = bar.locator(`form[aria-label="Start a run of ${workflow}"]`);
  await expectVisible(form, `picked, ${workflow} offers its start`);
  return form;
}

/** A half-typed brief is not lost to one Escape: the first leaves its field, the brief kept and the bar open; the second closes the bar. */
async function keptOnEscape(page: Page, bar: Locator, form: Locator): Promise<void> {
  const brief = form.getByRole('textbox');
  await brief.fill(BRIEF);
  await page.keyboard.press('Escape');
  await idle(page);
  if (!new URL(page.url()).searchParams.has('bar'))
    throw new Refused(`Escape in a field that holds text leaves the bar open — ${page.url()}`);
  await expectVisible(bar, 'Escape in a field that holds text leaves the bar open');
  if ((await brief.inputValue()) !== BRIEF)
    throw new Refused(`and keeps the brief typed — it holds ${JSON.stringify(await brief.inputValue())}`);
  if (await brief.evaluate((el) => el === document.activeElement)) throw new Refused('and leaves the field');
  await page.keyboard.press('Escape');
  await expectCount(bar, 0, 'a second Escape closes the bar');
}

export default {
  /**
   * A run is started from a factory's floor: the sidebar's Start a run opens the floating bar on the factory's one repository, fixed,
   * listing the workflows it offers there with its hires. A workflow whose step the factory hires no one into says so in the package's
   * words and cannot be picked. Once the factory hires into it, it is picked; Escape in its brief leaves the field and keeps the brief,
   * and a second Escape closes the bar. Picked again, the start sends `?factory=` and `?repo=`: the record names both. The hires, the
   * agent hired and the run are taken back.
   */
  name: 'factory-start',
  route: `/factories/${FACTORIES.hiring.name}`,
  expect: async (page) => {
    const runsDir = path.join(store!, 'runs');
    const checkout = path.join(store!, 'checkout');
    const factory = FACTORIES.hiring.name;
    const workflow = WORKFLOWS.good.name;
    const factoryFile = path.join(store!, 'factories', `${factory}.json`);
    const factoryText = fs.readFileSync(factoryFile, 'utf8');
    const reviewerFile = path.join(checkout, 'workflows', 'agents', `${REVIEWER}.md`);
    const runsBefore = fs.readdirSync(runsDir).sort();
    const theme = await themeOf(page);
    const other = await page.context().newPage();
    try {
      fs.writeFileSync(factoryFile, withHires(factoryText, {}));
      const { problems } = watch(other);
      await other.goto(page.url(), { waitUntil: 'load' });
      let bar = await openStart(other);
      await expectVisible(bar.locator('[data-repo]', { hasText: `On ${checkout}` }), "on the factory's one repository, fixed");
      const row = bar.locator(`[data-workflow="repo:${workflow}"]`);
      await expectVisible(
        row.locator('[data-why-not]', { hasText: `nemia factory hire ${factory} <agent> --step ${workflow}/${UNFILLED}` }),
        `${workflow}'s ${UNFILLED} has no agent in ${factory}: its row says so, and the hire that fills it`,
      );
      if (!(await row.getByRole('radio').isDisabled())) throw new Refused(`${workflow} cannot be picked while it is unfilled`);
      await expectCount(bar.locator('form[aria-label^="Start a run of"]'), 0, 'with no Start: the api would refuse it');
      await settled(other);
      await photograph(other, path.join(OUT, `factory-start-unfilled-${theme}.png`));
      await bar.getByRole('button', { name: 'Close' }).click();
      await expectCount(bar, 0, 'Close closes the bar');

      fs.writeFileSync(reviewerFile, '---\ndescription: Use this when a change needs reviewing.\n---\nYou review the change.\n');
      fs.writeFileSync(factoryFile, withHires(factoryText, { [`${workflow}/${UNFILLED}`]: REVIEWER }));
      bar = await openStart(other);
      await expectCount(
        bar.locator(`[data-workflow="repo:${workflow}"] [data-why-not]`),
        0,
        `hired into ${UNFILLED}, ${workflow} can start`,
      );
      let form = await pickWorkflow(bar, workflow);
      await expectVisible(form.getByText(`in the factory ${factory}`, { exact: false }), `which says the run runs in ${factory}`);
      await keptOnEscape(other, bar, form);
      bar = await openStart(other);
      form = await pickWorkflow(bar, workflow);
      await form.getByRole('textbox').fill(BRIEF);
      const [started] = await Promise.all([
        other.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', { timeout: WAIT_MS }),
        form.getByRole('button', { name: 'Start' }).click(),
      ]);
      const sent = new URL(started.url()).searchParams;
      if (sent.get('factory') !== factory || sent.get('repo') !== checkout)
        throw new Refused(`the start names the factory and its repository in its query — it was sent to ${started.url()}`);
      if (started.status() !== 201)
        throw new Refused(`the api starts the run in ${factory} — it answered ${started.status()}: ${await started.text()}`);
      const { id } = (await started.json()) as { id: string };
      await expectVisible(bar.locator(`[data-started="${id}"]`), `the bar says ${id} started, and links to it`);
      const record = JSON.parse(fs.readFileSync(path.join(runsDir, `${id}.json`), 'utf8')) as { factory?: string; repo?: string };
      if (record.factory !== factory || record.repo !== checkout)
        throw new Refused(
          `the record names ${factory} and ${checkout} — it holds ${JSON.stringify({ factory: record.factory, repo: record.repo })}`,
        );
      await idle(other);
      await settled(other);
      await photograph(other, path.join(OUT, `factory-start-started-${theme}.png`));
      const seen = problems();
      if (seen.length)
        throw new Refused(
          `no console error and no failed request while starting a run from a floor — ${seen.length} seen:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await other.close();
      takeBackRuns(runsDir, runsBefore);
      fs.rmSync(reviewerFile, { force: true });
      fs.writeFileSync(factoryFile, factoryText);
    }
  },
} satisfies PageSpec;
