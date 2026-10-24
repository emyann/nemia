import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { FACTORIES, hiringStarts, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The card this page files for the factory, and starts there. */
const CARD = 'hire-the-reviewer-in-the-factory-e2e0';
/** Its first line, and the brief its start is prefilled with. */
const BODY = 'Hire the reviewer in the factory\n\nA card that names its factory, started from the Inbox.';
/** The step of `dev` whose file names no agent, which leaves the workflow unfilled in a factory until it hires into it. */
const UNFILLED = 'review';

/**
 * The factory's file `text` with `hires` in place of the seed's, whose hire into `dev/implement`, a step whose file names its agent, leaves
 * `dev` unread in the factory.
 */
const withHires = (text: string, hires: Record<string, string>): string =>
  JSON.stringify({ ...(JSON.parse(text) as object), hires }, null, 2);

/** A card on the Inbox page, by its name. */
const cardIn = (page: Page, name: string): Locator => page.locator(`section[aria-label="Cards"] li[data-card="${name}"]`);

/** Open the card's start on a fresh load of the Inbox. */
async function openStart(page: Page): Promise<Locator> {
  await page.goto(page.url(), { waitUntil: 'load' });
  await idle(page);
  const item = cardIn(page, CARD);
  await item.getByRole('button', { name: 'Start' }).click();
  return item;
}

export default {
  /**
   * An inbox card that names a factory (`factory:`) is started in it. Its start lists the workflows the factory offers on its one
   * repository, read with its hires, the card's preset among them; a workflow whose step the factory hires no one into says so in the
   * package's words, with no Start. Once the factory hires into it, the start sends `?factory=` and `?repo=`, the record names the factory,
   * and the card stays in the inbox, started. The card, the hires, the agent hired and the run are taken back.
   */
  name: 'inbox-factory',
  route: '/inbox',
  expect: async (page) => {
    const inbox = path.join(store!, 'inbox');
    const runsDir = path.join(store!, 'runs');
    const checkout = path.join(store!, 'checkout');
    const factory = FACTORIES.hiring.name;
    const factoryFile = path.join(store!, 'factories', `${factory}.json`);
    const factoryText = fs.readFileSync(factoryFile, 'utf8');
    const cardFile = path.join(inbox, `${CARD}.md`);
    const runsBefore = fs.readdirSync(runsDir).sort();
    const theme = await themeOf(page);
    const other = await page.context().newPage();
    let unhire = (): void => {};
    try {
      fs.writeFileSync(factoryFile, withHires(factoryText, {}));
      fs.writeFileSync(cardFile, `---\nworkflow: ${WORKFLOWS.good.name}\nfactory: ${factory}\n---\n${BODY}\n`);
      const { problems } = watch(other);
      await other.goto(page.url(), { waitUntil: 'load' });
      let item = await openStart(other);
      const pick = item.getByRole('combobox', { name: 'Workflow' });
      await expectVisible(pick, `Start opens ${CARD}'s start form`);
      if ((await pick.inputValue()) !== `repo:${WORKFLOWS.good.name}`)
        throw new Refused(
          `the start is preset to the workflow the card names, among those ${factory} offers — it was ${JSON.stringify(await pick.inputValue())}`,
        );
      await expectVisible(
        item.getByText(`The workflows the factory ${factory} offers on ${checkout}, with its hires.`),
        'and says whose workflows they are, and on which repository',
      );
      await expectVisible(
        item.locator('[data-unfilled]', { hasText: `nemia factory hire ${factory} <agent> --step ${WORKFLOWS.good.name}/${UNFILLED}` }),
        `${WORKFLOWS.good.name}'s ${UNFILLED} has no agent in ${factory}: the start says so, and the hire that fills it`,
      );
      await expectCount(item.locator(`form[aria-label="Start ${CARD}"]`), 0, 'with no Start: the api would refuse it');
      await settled(other);
      await photograph(other, path.join(OUT, `inbox-factory-unfilled-${theme}.png`), { fullPage: true });

      unhire = hiringStarts(store!);
      item = await openStart(other);
      const form = item.locator(`form[aria-label="Start ${CARD}"]`);
      await expectVisible(form, `hired into ${UNFILLED}, the card's start offers Start`);
      await expectVisible(
        form.getByText(`in the factory ${factory}`, { exact: false }),
        `and says the run runs in the factory (${factory})`,
      );
      await settled(other);
      await photograph(other, path.join(OUT, `inbox-factory-start-${theme}.png`), { fullPage: true });
      const [started] = await Promise.all([
        other.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', { timeout: WAIT_MS }),
        form.getByRole('button', { name: 'Start' }).click(),
      ]);
      const sent = new URL(started.url()).searchParams;
      if (sent.get('factory') !== factory || sent.get('repo') !== checkout)
        throw new Refused(`the start names the factory and its repository in its query — it was sent to ${started.url()}`);
      if (started.status() !== 201)
        throw new Refused(`the api starts the card in ${factory} — it answered ${started.status()}: ${await started.text()}`);
      const { id } = (await started.json()) as { id: string };
      await other.waitForURL(`**/runs/${id}`, { timeout: WAIT_MS });
      const record = JSON.parse(fs.readFileSync(path.join(runsDir, `${id}.json`), 'utf8')) as {
        factory?: string;
        repo?: string;
        from?: { inbox?: string };
      };
      const got = { factory: record.factory, repo: record.repo, from: record.from?.inbox };
      const expected = { factory, repo: checkout, from: CARD };
      if (JSON.stringify(got) !== JSON.stringify(expected))
        throw new Refused(
          `the record is the card's start in ${factory} — it holds ${JSON.stringify(got)}, not ${JSON.stringify(expected)}`,
        );
      if (!fs.existsSync(cardFile)) throw new Refused(`the card stays in the inbox once its run is written — ${cardFile} is gone`);
      await idle(other);
      const seen = problems();
      if (seen.length)
        throw new Refused(
          `no console error and no failed request while starting a card in a factory — ${seen.length} seen:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await other.close();
      for (const file of fs.readdirSync(runsDir))
        if (!runsBefore.includes(file)) fs.rmSync(path.join(runsDir, file), { recursive: true, force: true });
      fs.rmSync(cardFile, { force: true });
      unhire();
      fs.writeFileSync(factoryFile, factoryText);
    }
  },
} satisfies PageSpec;
