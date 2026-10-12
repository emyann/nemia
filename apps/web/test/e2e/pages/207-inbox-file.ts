import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page, Response } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { FACTORIES, hiringStarts, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The idea filed with no factory, then started through the Factory list of its Start. */
const UNASSIGNED = 'File an idea with no factory\n\nIt gets its factory when it is started.';
/** The idea filed into the factory picked in the address. */
const ASSIGNED = 'File an idea into a factory\n\nPicked from the list, with its workflow.';
/** The idea filed with no factory while the address keeps one factory's cards, which hides it. */
const HIDDEN = 'File an idea the filter hides';

/** A card on the Inbox page, by its name. */
const cardIn = (page: Page, name: string): Locator => page.locator(`section[aria-label="Cards"] li[data-card="${name}"]`);

/** Open `route` of the board `page` shows, and wait for its reads. */
async function open(page: Page, route: string): Promise<void> {
  await page.goto(new URL(route, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** Type `idea` into the box and press File: the request's body as it was sent, and the card's name and file once the api took it. */
async function fileFrom(page: Page, idea: string): Promise<{ sent: unknown; name: string; file: string }> {
  const box = page.locator('form[aria-label="File a card"]');
  await box.getByRole('textbox', { name: 'An idea' }).fill(idea);
  const [filed] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/inbox', { timeout: WAIT_MS }),
    box.getByRole('button', { name: 'File' }).click(),
  ]);
  if (filed.status() !== 201) throw new Refused(`the api files the card — it answered ${filed.status()}: ${await filed.text()}`);
  const { name } = (await filed.json()) as { name: string };
  return { sent: filed.request().postDataJSON() as unknown, name, file: path.join(store!, 'inbox', `${name}.md`) };
}

/** Refuses unless `sent`, a filing's body, is exactly `expected`, key for key. */
function expectSent(sent: unknown, expected: Record<string, string>, assertion: string): void {
  const keyed = (o: object) => JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  if (typeof sent !== 'object' || sent === null || keyed(sent) !== keyed(expected))
    throw new Refused(`${assertion} — it sent ${JSON.stringify(sent)}, not ${JSON.stringify(expected)}`);
}

/** Refuses unless the card's file holds exactly `text`. */
function expectFile(file: string, text: string, assertion: string): void {
  const held = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
  if (held !== text) throw new Refused(`${assertion} — ${file} holds ${JSON.stringify(held)}`);
}

/**
 * Start the card `name`, which names no factory, on a page of its own: its Start draws a Factory list and no start form; with the
 * factory picked, then its workflow, Start sends the factory and its repository in the query of `POST /api/runs`, the record names
 * the factory, the repository and the card, and the card leaves the inbox. The run is taken back.
 */
async function startUnassigned(page: Page, name: string, theme: string): Promise<void> {
  const factory = FACTORIES.hiring.name;
  const checkout = path.join(store!, 'checkout');
  const runsDir = path.join(store!, 'runs');
  const runsBefore = fs.readdirSync(runsDir).sort();
  const other = await page.context().newPage();
  try {
    const { problems } = watch(other);
    await open(other, new URL('/inbox', page.url()).href);
    const item = cardIn(other, name);
    await item.getByRole('button', { name: 'Start' }).click();
    const pick = item.getByRole('combobox', { name: 'Factory' });
    await expectVisible(pick, 'the Start of a card that names no factory asks for the factory first');
    if ((await pick.inputValue()) !== '') throw new Refused(`no factory is picked for it — the list held ${await pick.inputValue()}`);
    const form = item.locator(`form[aria-label="Start ${name}"]`);
    await expectCount(form, 0, 'and draws no start form before one is picked');
    await expectCount(item.getByRole('combobox', { name: 'Workflow' }), 0, 'nor a Workflow list');
    await pick.selectOption(factory);
    await item.getByRole('combobox', { name: 'Workflow' }).selectOption({ label: WORKFLOWS.good.name });
    await expectVisible(form.getByRole('button', { name: 'Start' }), `with ${factory} and ${WORKFLOWS.good.name} picked, the start form`);
    await settled(other);
    await photograph(other, path.join(OUT, `inbox-file-unassigned-${theme}.png`), { fullPage: true });
    const [started] = await Promise.all([
      other.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', { timeout: WAIT_MS }),
      form.getByRole('button', { name: 'Start' }).click(),
    ]);
    await expectStartedIn(started, { factory, repo: checkout, card: name });
    const { id } = (await started.json()) as { id: string };
    await other.waitForURL(`**/runs/${id}`, { timeout: WAIT_MS });
    if (fs.existsSync(path.join(store!, 'inbox', `${name}.md`))) throw new Refused(`the card leaves the inbox once its run is written`);
    await idle(other);
    const seen = problems();
    if (seen.length)
      throw new Refused(`no console error and no failed request while starting a card of no factory:\n    ${seen.join('\n    ')}`);
  } finally {
    await other.close();
    for (const file of fs.readdirSync(runsDir))
      if (!runsBefore.includes(file)) fs.rmSync(path.join(runsDir, file), { recursive: true, force: true });
  }
}

/** Refuses unless `started`, a start's answer, is a 201 whose query names `factory` and `repo`, and whose record names them and `card`. */
async function expectStartedIn(started: Response, { factory, repo, card }: { factory: string; repo: string; card: string }): Promise<void> {
  const sent = new URL(started.url()).searchParams;
  if (sent.get('factory') !== factory || sent.get('repo') !== repo)
    throw new Refused(
      `a card of no factory starts through POST /api/runs?factory=${factory}&repo=${repo} — it was sent to ${started.url()}`,
    );
  if (started.status() !== 201)
    throw new Refused(`the api starts the card in ${factory} — it answered ${started.status()}: ${await started.text()}`);
  const { id } = (await started.json()) as { id: string };
  const record = JSON.parse(fs.readFileSync(path.join(store!, 'runs', `${id}.json`), 'utf8')) as {
    factory?: string;
    repo?: string;
    from?: { inbox?: string };
  };
  const got = { factory: record.factory, repo: record.repo, from: record.from?.inbox };
  if (JSON.stringify(got) !== JSON.stringify({ factory, repo, from: card }))
    throw new Refused(`the record names the factory picked, its repository and the card — it holds ${JSON.stringify(got)}`);
}

export default {
  /**
   * The box that files a card. Its Factory list holds "No factory" and each factory whose file reads, never `default` nor `broken`,
   * with "No factory" chosen: the box then has no Workflow list and no Repository field, sends the idea alone, and the card's line says
   * it has no factory yet, with no tag. Reached with a factory in the address, the list is preset to it, its repository is said as
   * text, and a filing sends the factory and the workflow picked and no repository: the card's file names the factory, and its line
   * wears the factory's tag, linked. A card filed with no factory there is hidden by the page's filter, and the box says so. The card
   * of no factory is then started through its Start's Factory list (`startUnassigned`). The factory is made able to start its
   * workflow for the page (`hiringStarts`), since the seed leaves that workflow unread in it; that, every card and the run are taken back.
   */
  name: 'inbox-file',
  route: '/inbox',
  expect: async (page) => {
    const factory = FACTORIES.hiring.name;
    const checkout = path.join(store!, 'checkout');
    const theme = await themeOf(page);
    const box = page.locator('form[aria-label="File a card"]');
    const list = box.getByRole('combobox', { name: 'Factory' });
    const written: string[] = [];
    const unhire = hiringStarts(store!);
    try {
      await expectTexts(
        list.locator('option'),
        ['No factory: chosen at start', ...[factory, FACTORIES.bare, ...FACTORIES.others].sort()],
        `the Factory list offers no factory, then each factory that reads: never default, never ${FACTORIES.broken}`,
      );
      if ((await list.inputValue()) !== '')
        throw new Refused(`no factory is chosen until a person picks — it held ${await list.inputValue()}`);
      await expectCount(box.getByRole('combobox', { name: 'Workflow' }), 0, 'with no factory, the box has no Workflow list');
      await expectCount(box.getByRole('combobox', { name: 'Repository' }), 0, 'no Repository list');
      await expectCount(box.locator('input'), 0, 'and no field to type a path into');
      await expectVisible(
        box.locator('[data-parked]', {
          hasText: 'Parked with no factory: it gets its factory, workflow and repository when you start it.',
        }),
        'and says what no factory means',
      );
      const bare = await fileFrom(page, UNASSIGNED);
      written.push(bare.file);
      expectSent(bare.sent, { body: UNASSIGNED }, 'with no factory the box sends the idea alone');
      expectFile(bare.file, `${UNASSIGNED}\n`, 'the card has no factory:, repo: or workflow: key');
      const line = cardIn(page, bare.name);
      await expectTexts(line.locator('[data-unassigned]'), ['no factory yet'], 'its line says it has no factory yet');
      await expectCount(line.locator('[data-factory-tag]'), 0, 'and wears no tag, the default one least of all');

      await open(page, `/inbox?factory=${factory}`);
      if ((await list.inputValue()) !== factory)
        throw new Refused(`the list is preset to the factory the address names (${factory}) — it held ${await list.inputValue()}`);
      await expectTexts(box.locator('[data-factory-repo]'), [checkout], "the box says the factory's one repository as text");
      await expectCount(box.getByRole('combobox', { name: 'Repository' }), 0, 'with no Repository list');
      await expectCount(box.locator('input'), 0, 'and no field to type a path into');
      await box.getByRole('combobox', { name: 'Workflow' }).selectOption({ label: WORKFLOWS.good.name });
      await box.getByRole('textbox', { name: 'An idea' }).fill(ASSIGNED);
      await settled(page);
      await photograph(box, path.join(OUT, `inbox-file-box-${theme}.png`));
      const tagged = await fileFrom(page, ASSIGNED);
      written.push(tagged.file);
      expectSent(
        tagged.sent,
        { body: ASSIGNED, factory, workflow: WORKFLOWS.good.name, from: 'repo' },
        'in a factory the box sends the factory and the workflow picked, and no repository nobody chose',
      );
      expectFile(
        tagged.file,
        `---\nworkflow: ${WORKFLOWS.good.name}\nfactory: ${factory}\n---\n${ASSIGNED}\n`,
        'the card names its factory, and no repo:',
      );
      await expectVisible(
        cardIn(page, tagged.name).locator(`a[data-factory-tag="${factory}"][href="/factories/${factory}"]`),
        "its line wears the factory's tag, linked to its floor",
      );
      await expectCount(box.locator('[data-filed-hidden]'), 0, 'a card filed where the filter keeps it says nothing more');

      await list.selectOption('');
      const hidden = await fileFrom(page, HIDDEN);
      written.push(hidden.file);
      expectSent(hidden.sent, { body: HIDDEN }, 'back on no factory, the idea alone: nothing picked under the factory is sent');
      await expectVisible(
        box.locator('[data-filed-hidden]', { hasText: `Filed as ${hidden.name}` }),
        `a card filed with no factory while the page keeps ${factory}'s says where it went`,
      );
      await expectCount(cardIn(page, hidden.name), 0, 'since the list does not show it');
      await box.locator('[data-filed-hidden]').getByRole('link', { name: "Show every factory's" }).click();
      await page.waitForURL((url) => url.pathname === '/inbox' && !url.searchParams.has('factory'));
      await expectVisible(cardIn(page, hidden.name), 'and its link shows it');
      fs.rmSync(hidden.file, { force: true });

      await open(page, '/inbox');
      await expectCount(page.locator('section[aria-label="Cards"] [data-factory-tag="default"]'), 0, 'no card wears a default tag');
      await settled(page);
      await photograph(page, path.join(OUT, `inbox-file-lines-${theme}.png`), { fullPage: true });
      await startUnassigned(page, bare.name, theme);
    } finally {
      for (const file of written) fs.rmSync(file, { force: true });
      unhire();
    }
    await open(page, '/inbox');
  },
} satisfies PageSpec;
