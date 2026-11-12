import fs from 'node:fs';
import path from 'node:path';
import type { Page, Response } from 'playwright';
import { cardsPath, photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FACTORIES, hiringStarts, noFactories, onSeveralRepos, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The idea filed in a factory on several repositories with no workflow picked. */
const NOWHERE = 'File an idea in a factory on two repositories\n\nIts workflow, and so its repository, is chosen at start.';
/** The idea filed there with its workflow picked, which the factory wires to one of them. */
const SOMEWHERE = 'File an idea on a workflow its factory wires\n\nThe factory says where it runs; the card names no repository.';

/** Open `route` of the board `page` shows, and wait for its reads. */
async function open(page: Page, route: string): Promise<void> {
  await page.goto(new URL(route, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** A filing's body as it was sent, its factory read back from the namespace its path names (none for `default`), as the box chose it. */
function sentOf(filed: Response): unknown {
  const namespace = new URL(filed.url()).pathname.split('/')[3];
  const body = filed.request().postDataJSON() as Record<string, unknown>;
  return namespace === 'default' ? body : { ...body, factory: namespace };
}

/** Type `idea` into the box and press File: the request's body as it was sent, and the card's file once the api took it. */
async function fileFrom(page: Page, idea: string): Promise<{ sent: unknown; file: string }> {
  const box = page.locator('form[aria-label="File a card"]');
  await box.getByRole('textbox', { name: 'An idea' }).fill(idea);
  const [filed] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && cardsPath().test(new URL(r.url()).pathname), { timeout: WAIT_MS }),
    box.getByRole('button', { name: 'File' }).click(),
  ]);
  if (filed.status() !== 201) throw new Refused(`the api files the card — it answered ${filed.status()}: ${await filed.text()}`);
  const {
    metadata: { name },
  } = (await filed.json()) as { metadata: { name: string } };
  return { sent: sentOf(filed), file: path.join(store!, 'inbox', `${name}.md`) };
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
 * The box under a factory on several repositories: no Repository list, ever; its workflows offered by name with none picked, and the
 * repository said as the workflow's to decide; a filing that sends the factory alone. Then its workflow picked while the factory wires it
 * to none: the box says it is not wired, naming the attach; wired to the checkout's folder, the box says the checkout as text, and a filing
 * sends the factory and the workflow, never a repository nor an origin. Both cards and the factory's file are taken back.
 */
async function severalRepos(page: Page, theme: string): Promise<void> {
  const factory = FACTORIES.hiring.name;
  const checkout = path.join(store!, 'checkout');
  const unhire = hiringStarts(store!);
  const { back } = onSeveralRepos(store!);
  const file = path.join(store!, 'factories', `${factory}.json`);
  const written: string[] = [];
  try {
    await open(page, `/inbox?factory=${factory}`);
    const box = page.locator('form[aria-label="File a card"]');
    const workflows = box.getByRole('combobox', { name: 'Workflow' });
    await expectCount(box.getByRole('combobox', { name: 'Repository' }), 0, `${factory}, on two repositories, offers no list of them`);
    await expectTexts(
      workflows.locator('option'),
      ['None: chosen at start', WORKFLOWS.good.name],
      `and its workflows by name, none picked, with no repository to pick first`,
    );
    if (!(await workflows.isEnabled())) throw new Refused('the Workflow list waits for nothing — it was disabled');
    await expectCount(box.locator('[data-needs-repo]'), 0, 'and never asks for a repository');
    await expectCount(box.locator('[data-factory-repo]'), 1, "the repository is said as text, the workflow's to decide");
    await settled(page);
    await photograph(box, path.join(OUT, `inbox-file-places-none-${theme}.png`));
    const nowhere = await fileFrom(page, NOWHERE);
    written.push(nowhere.file);
    expectFiled(
      nowhere,
      { body: NOWHERE, factory },
      `---\nfactory: ${factory}\n---\n${NOWHERE}\n`,
      'with no workflow picked the box sends the factory alone, and the card names no repo:',
    );

    await workflows.selectOption({ label: WORKFLOWS.good.name });
    const unwired = box.locator('[data-unwired="unwired"]');
    await expectVisible(unwired, `${WORKFLOWS.good.name} picked, wired to neither, the box says it is not wired`);
    const said = ((await unwired.textContent()) ?? '').trim();
    if (!said.includes(`${factory} ${WORKFLOWS.good.name} --repo`))
      throw new Refused(`naming the attach that wires it — it said ${JSON.stringify(said)}`);
    await settled(page);
    await photograph(box, path.join(OUT, `inbox-file-places-unwired-${theme}.png`));

    const found = JSON.parse(fs.readFileSync(file, 'utf8')) as object;
    fs.writeFileSync(file, JSON.stringify({ ...found, workflowRepos: { [WORKFLOWS.good.name]: 'checkout' } }, null, 2));
    await open(page, `/inbox?factory=${factory}`);
    await workflows.selectOption({ label: WORKFLOWS.good.name });
    await expectTexts(box.locator('[data-factory-repo]'), [checkout], `wired to checkout, the box says ${checkout} as text`);
    await expectCount(box.getByRole('combobox', { name: 'Repository' }), 0, 'never a list of the two');
    await box.getByRole('textbox', { name: 'An idea' }).fill(SOMEWHERE);
    await settled(page);
    await photograph(box, path.join(OUT, `inbox-file-places-picked-${theme}.png`));
    const somewhere = await fileFrom(page, SOMEWHERE);
    written.push(somewhere.file);
    expectFiled(
      somewhere,
      { body: SOMEWHERE, factory, workflow: WORKFLOWS.good.name },
      `---\nworkflow: ${WORKFLOWS.good.name}\nfactory: ${factory}\n---\n${SOMEWHERE}\n`,
      'a workflow picked, the box sends it by its name, never a repository nor an origin, and the card names no repo:',
    );
  } finally {
    for (const card of written) fs.rmSync(card, { force: true });
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

/**
 * The box while the factories are on their way, on a visit of its own whose read of them is held, at a factory's address: it says it is
 * reading them, beside the one choice, and never that the store has none; let go, the list fills and is preset to the address's factory.
 */
async function reading(page: Page, theme: string): Promise<void> {
  const factory = FACTORIES.hiring.name;
  const other = await page.context().newPage();
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await other.route(
      (url) => url.pathname === '/api/factories',
      async (route) => {
        await held;
        await route.continue();
      },
    );
    await other.goto(new URL(`/inbox?factory=${factory}`, page.url()).href, { waitUntil: 'load' });
    const box = other.locator('form[aria-label="File a card"]');
    const list = box.getByRole('combobox', { name: 'Factory' });
    await expectTexts(
      box.locator('[data-reading-factories]'),
      ['Reading the factories…'],
      'while the factories are held, the box says it reads them',
    );
    await expectTexts(list.locator('option'), ['No factory: chosen at start'], 'beside a list that holds the one choice so far');
    await expectCount(box.locator('[data-no-factory]'), 0, 'and never says the store has no factory: it does not know yet');
    await settled(other);
    await photograph(box, path.join(OUT, `inbox-file-places-reading-${theme}.png`));
    release();
    await expectCount(box.locator('[data-reading-factories]'), 0, 'let go, the line goes');
    await idle(other);
    if ((await list.inputValue()) !== factory)
      throw new Refused(`and the list is preset to the factory the address names (${factory}) — it held ${await list.inputValue()}`);
  } finally {
    release();
    await other.close();
  }
}

export default {
  /**
   * The box that files a card, in the two states the seed does not hold: a factory on several repositories (`severalRepos`), and a
   * store with no factory to offer (`noFactory`), each rewriting the store's factories and putting them back; and, between them, the
   * box while the factories are still being read (`reading`). Then the page is read again.
   */
  name: 'inbox-file-places',
  route: '/inbox',
  expect: async (page) => {
    const theme = await themeOf(page);
    await severalRepos(page, theme);
    await reading(page, theme);
    await noFactory(page, theme);
    await open(page, '/inbox');
  },
} satisfies PageSpec;
