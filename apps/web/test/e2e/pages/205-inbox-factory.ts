import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { cardsPath, photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { FACTORIES, hiringStarts, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store, takeBackRuns } from '../world.ts';

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

/**
 * The card's start with the factory's file, as `factoryFile` holds it now, on two repositories — the checkout and FACTORIES.bare's folder
 * — first wiring its workflow to none: the start says it is not wired, naming the attach and both folder names, with no repository and no
 * Start; then wiring it to the checkout's folder name: the start says the checkout as text. Never a Repository list. The caller writes the
 * file back.
 */
async function wiredOnTwo(page: Page, factoryFile: string, theme: string): Promise<void> {
  const factory = FACTORIES.hiring.name;
  const checkout = path.join(store!, 'checkout');
  const second = path.join(store!, FACTORIES.bare);
  const found = JSON.parse(fs.readFileSync(factoryFile, 'utf8')) as object;
  const write = (workflowRepos: Record<string, string>) =>
    fs.writeFileSync(factoryFile, JSON.stringify({ ...found, repos: [checkout, second], workflowRepos }, null, 2));

  write({});
  let item = await openStart(page);
  const unwired = item.locator('[data-unwired="unwired"]');
  await expectVisible(unwired, `on two repositories with ${WORKFLOWS.good.name} wired to none, the start says it is not wired`);
  const said = ((await unwired.textContent()) ?? '').trim();
  for (const fact of [`${factory} ${WORKFLOWS.good.name} --repo`, 'checkout', FACTORIES.bare])
    if (!said.includes(fact))
      throw new Refused(`naming the attach that wires it and the folder names (${fact}) — it said ${JSON.stringify(said)}`);
  await expectCount(item.locator('[data-factory-repo]'), 0, 'with no repository to start on');
  await expectCount(item.getByRole('combobox', { name: 'Repository' }), 0, 'and no list to pick one from');
  await expectCount(item.locator(`form[aria-label="Start ${CARD}"]`), 0, 'and no Start: the api would refuse it');
  await settled(page);
  await photograph(page, path.join(OUT, `inbox-factory-unwired-${theme}.png`), { fullPage: true });

  write({ [WORKFLOWS.good.name]: 'checkout' });
  item = await openStart(page);
  await expectTexts(item.locator('[data-factory-repo]'), [checkout], `wired to checkout, the start says ${checkout} as text`);
  await expectCount(item.getByRole('combobox', { name: 'Repository' }), 0, 'never a list of the two');
  await expectCount(item.locator('[data-unwired]'), 0, 'and no longer that it is not wired');
  await settled(page);
  await photograph(page, path.join(OUT, `inbox-factory-wired-${theme}.png`), { fullPage: true });
}

export default {
  /**
   * An inbox card that names a factory (`factory:`) is started in it. Its start lists the workflows the factory offers, by name, the
   * card's preset among them, and says as text the repository the factory gives it, never a list of them: its only one; on two
   * repositories, that it is not wired, naming the attach, then, wired, the one its wiring names (`wiredOnTwo`). A workflow whose step
   * the factory hires no one into says so in the package's words, with no Start. Once the factory hires into it, the start sends
   * `?factory=` and no repository, the record names the factory and the repository its wiring gives, and the card stays in the inbox,
   * started. The card, the hires, the factory's file, the agent hired and the run are taken back.
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
      if ((await pick.inputValue()) !== WORKFLOWS.good.name)
        throw new Refused(
          `the start is preset to the workflow the card names, among those ${factory} offers — it was ${JSON.stringify(await pick.inputValue())}`,
        );
      await expectTexts(item.locator('[data-factory-repo]'), [checkout], `and says the repository ${factory} gives it, its only one`);
      await expectCount(item.getByRole('combobox', { name: 'Repository' }), 0, 'as text, never a list');
      await expectVisible(
        item.locator('[data-unfilled]', { hasText: `nemia factory hire ${factory} <agent> --step ${WORKFLOWS.good.name}/${UNFILLED}` }),
        `${WORKFLOWS.good.name}'s ${UNFILLED} has no agent in ${factory}: the start says so, and the hire that fills it`,
      );
      await expectCount(item.locator(`form[aria-label="Start ${CARD}"]`), 0, 'with no Start: the api would refuse it');
      await settled(other);
      await photograph(other, path.join(OUT, `inbox-factory-unfilled-${theme}.png`), { fullPage: true });
      await wiredOnTwo(other, factoryFile, theme);
      fs.writeFileSync(factoryFile, withHires(factoryText, {}));

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
        other.waitForResponse((r) => r.request().method() === 'POST' && cardsPath(CARD, 'start').test(new URL(r.url()).pathname), {
          timeout: WAIT_MS,
        }),
        form.getByRole('button', { name: 'Start' }).click(),
      ]);
      const sent = new URL(started.url()).searchParams;
      if (sent.get('factory') !== factory || sent.has('repo'))
        throw new Refused(`the start names the factory in its query, and no repository — it was sent to ${started.url()}`);
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
      takeBackRuns(runsDir, runsBefore);
      fs.rmSync(cardFile, { force: true });
      unhire();
      fs.writeFileSync(factoryFile, factoryText);
    }
  },
} satisfies PageSpec;
