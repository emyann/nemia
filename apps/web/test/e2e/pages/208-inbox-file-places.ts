import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FACTORIES, hiringStarts, noFactories, onSeveralRepos, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The idea filed in a factory on several repositories with none picked. */
const NOWHERE = 'File an idea in a factory on two repositories\n\nIts repository is chosen at start.';
/** The idea filed there with a repository and its workflow picked. */
const SOMEWHERE = 'File an idea on one of its repositories\n\nPicked from the list, with a workflow read there.';

/** Open `route` of the board `page` shows, and wait for its reads. */
async function open(page: Page, route: string): Promise<void> {
  await page.goto(new URL(route, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** Type `idea` into the box and press File: the request's body as it was sent, and the card's file once the api took it. */
async function fileFrom(page: Page, idea: string): Promise<{ sent: unknown; file: string }> {
  const box = page.locator('form[aria-label="File a card"]');
  await box.getByRole('textbox', { name: 'An idea' }).fill(idea);
  const [filed] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/inbox', { timeout: WAIT_MS }),
    box.getByRole('button', { name: 'File' }).click(),
  ]);
  if (filed.status() !== 201) throw new Refused(`the api files the card — it answered ${filed.status()}: ${await filed.text()}`);
  const { name } = (await filed.json()) as { name: string };
  return { sent: filed.request().postDataJSON() as unknown, file: path.join(store!, 'inbox', `${name}.md`) };
}

/** Refuses unless `sent`, a filing's body, is exactly `expected`, key for key, and the card's `file` holds exactly `text`. */
function expectFiled(filed: { sent: unknown; file: string }, expected: Record<string, string>, text: string, assertion: string): void {
  const keyed = (o: object) => JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  if (typeof filed.sent !== 'object' || filed.sent === null || keyed(filed.sent) !== keyed(expected))
    throw new Refused(`${assertion} — it sent ${JSON.stringify(filed.sent)}, not ${JSON.stringify(expected)}`);
  const held = fs.readFileSync(filed.file, 'utf8');
  if (held !== text) throw new Refused(`${assertion} — ${filed.file} holds ${JSON.stringify(held)}`);
}

/**
 * The box under a factory on several repositories: a Repository list with none chosen, no workflow to pick until one is, and a filing
 * that sends no repository; then, a repository picked, its workflows read there, and a filing that sends it. Both cards are taken back.
 */
async function severalRepos(page: Page, theme: string): Promise<void> {
  const factory = FACTORIES.hiring.name;
  const checkout = path.join(store!, 'checkout');
  const unhire = hiringStarts(store!);
  const { second, back } = onSeveralRepos(store!);
  const written: string[] = [];
  try {
    await open(page, `/inbox?factory=${factory}`);
    const box = page.locator('form[aria-label="File a card"]');
    const repos = box.getByRole('combobox', { name: 'Repository' });
    const workflows = box.getByRole('combobox', { name: 'Workflow' });
    await expectTexts(
      repos.locator('option'),
      ['None: chosen at start', checkout, second],
      `${factory}, on two repositories, offers them in a list, none first`,
    );
    if ((await repos.inputValue()) !== '')
      throw new Refused(`no repository is chosen until a person picks — it held ${await repos.inputValue()}`);
    await expectCount(box.locator('[data-factory-repo]'), 0, 'and says none as text');
    await expectVisible(
      box.locator('[data-needs-repo]', { hasText: `Pick a repository to choose among the workflows ${factory} offers on it.` }),
      'the box says a repository comes before a workflow',
    );
    if (await workflows.isEnabled()) throw new Refused('the Workflow list waits for a repository — it was enabled with none picked');
    await settled(page);
    await photograph(box, path.join(OUT, `inbox-file-places-none-${theme}.png`));
    const nowhere = await fileFrom(page, NOWHERE);
    written.push(nowhere.file);
    expectFiled(
      nowhere,
      { body: NOWHERE, factory },
      `---\nfactory: ${factory}\n---\n${NOWHERE}\n`,
      'with no repository picked the box sends the factory alone, and the card names no repo:',
    );

    await repos.selectOption(checkout);
    await expectCount(box.locator('[data-needs-repo]'), 0, 'a repository picked, the line asking for one goes');
    await expectTexts(
      workflows.locator('option'),
      ['None: chosen at start', WORKFLOWS.good.name],
      `and the workflows ${factory} offers on it are read`,
    );
    await workflows.selectOption({ label: WORKFLOWS.good.name });
    await box.getByRole('textbox', { name: 'An idea' }).fill(SOMEWHERE);
    await settled(page);
    await photograph(box, path.join(OUT, `inbox-file-places-picked-${theme}.png`));
    const somewhere = await fileFrom(page, SOMEWHERE);
    written.push(somewhere.file);
    expectFiled(
      somewhere,
      { body: SOMEWHERE, factory, workflow: WORKFLOWS.good.name, from: 'repo', repo: checkout },
      `---\nworkflow: ${WORKFLOWS.good.name}\nrepo: ${checkout}\nfactory: ${factory}\n---\n${SOMEWHERE}\n`,
      'with a repository picked the box sends it, and the card names it',
    );
  } finally {
    for (const file of written) fs.rmSync(file, { force: true });
    back();
    unhire();
  }
}

/** The box in a store with no factory on file: the one choice, no factory, and the line that files one, in the api's words. */
async function noFactory(page: Page, theme: string): Promise<void> {
  const back = noFactories(store!);
  try {
    await open(page, '/inbox');
    const box = page.locator('form[aria-label="File a card"]');
    await expectTexts(
      box.getByRole('combobox', { name: 'Factory' }).locator('option'),
      ['No factory: chosen at start'],
      'with no factory on file, the Factory list holds the one choice',
    );
    const line = box.locator('[data-no-factory]');
    await expectVisible(line, 'and the box says the store has no factory yet');
    const said = ((await line.textContent()) ?? '').trim();
    if (!/^The store has no factory yet: file one with \S.*\.$/.test(said))
      throw new Refused(`with the line that files one — it said ${JSON.stringify(said)}`);
    await expectCount(box.locator('[data-reading-factories]'), 0, 'once the factories are read, it no longer says it reads them');
    await settled(page);
    await photograph(box, path.join(OUT, `inbox-file-places-no-factory-${theme}.png`));
  } finally {
    back();
  }
}

export default {
  /**
   * The box that files a card, in the two states the seed does not hold: a factory on several repositories (`severalRepos`), and a
   * store with no factory to offer (`noFactory`). Each rewrites the store's factories and puts them back, then the page is read again.
   */
  name: 'inbox-file-places',
  route: '/inbox',
  expect: async (page) => {
    const theme = await themeOf(page);
    await severalRepos(page, theme);
    await noFactory(page, theme);
    await open(page, '/inbox');
  },
} satisfies PageSpec;
