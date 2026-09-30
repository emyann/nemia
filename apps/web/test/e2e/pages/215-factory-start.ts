import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { FACTORIES, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The brief the page starts its run with. */
const BRIEF = 'Start a run from the floor of its factory';
/** The step of `dev` whose file names no agent, which leaves the workflow unfilled in a factory until it hires into it. */
const UNFILLED = 'review';
/** The agent the page writes into the checkout's `workflows/agents/` for the factory to hire into `review`. */
const REVIEWER = 'reviewer-e2e';

/** The factory's file `text` with `hires` in place of the seed's. */
const withHires = (text: string, hires: Record<string, string>): string =>
  JSON.stringify({ ...(JSON.parse(text) as object), hires }, null, 2);

/** Open the header's start on a fresh load of the floor, and the sheet it opens. */
async function openStart(page: Page): Promise<Locator> {
  await page.goto(page.url(), { waitUntil: 'load' });
  await idle(page);
  await page.locator('header').getByRole('button', { name: 'Start a run' }).click();
  const sheet = page.getByRole('dialog', { name: `Start a run in ${FACTORIES.hiring.name}` });
  await expectVisible(sheet, "the header's Start a run opens a sheet naming the factory");
  return sheet;
}

export default {
  /**
   * A run is started from a factory's floor: the header's Start a run opens a sheet on the factory's one repository, fixed, listing the
   * workflows it offers there with its hires. A workflow whose step the factory hires no one into says so in the package's words and
   * cannot be picked. Once the factory hires into it, it is picked, and the start sends `?factory=` and `?repo=`: the record names both.
   * The hires, the agent hired and the run are taken back.
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
      let sheet = await openStart(other);
      await expectVisible(sheet.locator('[data-repo]', { hasText: `On ${checkout}` }), "on the factory's one repository, fixed");
      const row = sheet.locator(`[data-workflow="repo:${workflow}"]`);
      await expectVisible(
        row.locator('[data-why-not]', { hasText: `wf factory hire ${factory} <agent> --step ${workflow}/${UNFILLED}` }),
        `${workflow}'s ${UNFILLED} has no agent in ${factory}: its row says so, and the hire that fills it`,
      );
      if (!(await row.getByRole('radio').isDisabled())) throw new Refused(`${workflow} cannot be picked while it is unfilled`);
      await expectCount(sheet.locator('form[aria-label^="Start a run of"]'), 0, 'with no Start: the api would refuse it');
      await settled(other);
      await photograph(other, path.join(OUT, `factory-start-unfilled-${theme}.png`));
      await sheet.getByRole('button', { name: 'Close' }).click();
      await expectCount(sheet, 0, 'Close closes the sheet');

      fs.writeFileSync(reviewerFile, '---\ndescription: Use this when a change needs reviewing.\n---\nYou review the change.\n');
      fs.writeFileSync(factoryFile, withHires(factoryText, { [`${workflow}/${UNFILLED}`]: REVIEWER }));
      sheet = await openStart(other);
      await expectCount(
        sheet.locator(`[data-workflow="repo:${workflow}"] [data-why-not]`),
        0,
        `hired into ${UNFILLED}, ${workflow} can start`,
      );
      await sheet.locator(`[data-workflow="repo:${workflow}"] label`).click();
      const form = sheet.locator(`form[aria-label="Start a run of ${workflow}"]`);
      await expectVisible(form, `picked, ${workflow} offers its start`);
      await expectVisible(form.getByText(`in the factory ${factory}`, { exact: false }), `which says the run runs in ${factory}`);
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
      await expectVisible(sheet.locator(`[data-started="${id}"]`), `the sheet says ${id} started, and links to it`);
      const record = JSON.parse(fs.readFileSync(path.join(runsDir, `${id}.json`), 'utf8')) as { factory?: string; repo?: string };
      if (record.factory !== factory || record.repo !== checkout)
        throw new Refused(
          `the record names ${factory} and ${checkout} — it holds ${JSON.stringify({ factory: record.factory, repo: record.repo })}`,
        );
      await idle(other);
      await settled(other);
      await photograph(other, path.join(OUT, `factory-start-${theme}.png`));
      const seen = problems();
      if (seen.length)
        throw new Refused(
          `no console error and no failed request while starting a run from a floor — ${seen.length} seen:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await other.close();
      for (const file of fs.readdirSync(runsDir))
        if (!runsBefore.includes(file)) fs.rmSync(path.join(runsDir, file), { recursive: true, force: true });
      fs.rmSync(reviewerFile, { force: true });
      fs.writeFileSync(factoryFile, factoryText);
    }
  },
} satisfies PageSpec;
