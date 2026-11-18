import type { Factory } from '../../../src/lib/api/factories.ts';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { factoriesAnswered, photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The factory the page gives two volumes besides the repository it works on, and one the page files with none. */
const FACTORY = FACTORIES.hiring.name;
const NONE = 'unmounted';

/** `factory` as the board draws it from the api's Factory and its lines (`factoriesAnswered`): its volumes and the line that adds one. */
async function listed(page: Page, factory: string): Promise<Factory> {
  const found = (await factoriesAnswered(page)).find((f) => f.name === factory);
  if (!found) throw new Refused(`GET /api/factories answers ${factory} — it answers no factory of that name`);
  return found;
}

/** Go to `factory`'s settings page and wait for it to settle. */
async function settingsOf(page: Page, factory: string): Promise<void> {
  await page.goto(new URL(`/factories/${factory}/settings`, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** Whether `before` is drawn before `after` in the document. */
const drawnBefore = (page: Page, before: string, after: string): Promise<boolean> =>
  page.evaluate(
    ([a, b]) => {
      const [x, y] = [document.querySelector(a), document.querySelector(b)];
      return Boolean(x && y && x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
    },
    [before, after],
  );

/**
 * The Volumes card of FACTORY, given a read-only folder and a writable one beside its repository: each path in the api's order, its
 * mark, a writable one worked on and a read-only one read, and the api's line that takes each back; drawn after the trust caution's
 * place and before the rules.
 */
async function expectListed(page: Page, ...given: string[]): Promise<void> {
  const { volumes } = await listed(page, FACTORY);
  const paths = volumes.map((v) => v.path);
  if (!given.every((p) => paths.includes(p)) || paths.length !== given.length + 1)
    throw new Refused(
      `the api answers ${FACTORY}'s volumes, ${given.join(' and ')} beside its repository — it answers ${JSON.stringify(paths)}`,
    );
  await settingsOf(page, FACTORY);
  const card = page.locator(`[data-factory-volumes="${FACTORY}"]`);
  await expectVisible(card.getByText('Volumes', { exact: true }), 'the settings page draws the Volumes card');
  const rows = card.locator('[data-factory-volume]');
  await expectCount(rows, paths.length, 'a row for each volume');
  const shown = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-factory-volume')));
  if (JSON.stringify(shown) !== JSON.stringify(paths))
    throw new Refused(`the rows are the api's volumes in its order, ${JSON.stringify(paths)} — they are ${JSON.stringify(shown)}`);
  for (const v of volumes) {
    const row = card.locator(`[data-factory-volume="${v.path}"]`);
    const mark = v.readOnly ? 'ro' : 'rw';
    await expectVisible(row.locator(`[data-volume-mark="${mark}"]`, { hasText: `:${mark}` }), `${v.path} is marked :${mark}`);
    const role = v.readOnly ? 'read' : 'worked-on';
    await expectVisible(row.locator(`[data-volume-role="${role}"]`), `${v.path}: a writable volume is worked on, a read-only one read`);
    await expectVisible(row.locator('code', { hasText: v.commands.rm }), `${v.path} shows the api's line that takes it back`);
  }
  if (!(await drawnBefore(page, `[data-factory-volumes="${FACTORY}"]`, 'section[data-factory-rules]')))
    throw new Refused('the Volumes card is drawn before the rules');
  if ((await page.locator('[data-untrusted]').count()) > 0 && !(await drawnBefore(page, '[data-untrusted]', '[data-factory-volumes]')))
    throw new Refused('the Volumes card is drawn after the trust caution');
  await settled(page);
  if ((await themeOf(page)) === 'dark') await photograph(page, path.join(OUT, 'factory-volumes-listed-dark.png'), { fullPage: true });
}

/** The card of a factory with no volume: an empty state that shows the api's line to add one. */
async function expectNone(page: Page): Promise<void> {
  const line = (await listed(page, NONE)).commands.volume;
  await settingsOf(page, NONE);
  const empty = page.locator(`[data-factory-volumes="${NONE}"] [data-no-volumes]`);
  await expectVisible(empty, 'a factory with no volume says it has none');
  await expectVisible(empty.locator('code', { hasText: line }), `and shows the api's line to add one, ${line}`);
  await expectCount(page.locator('[data-factory-volume]'), 0, 'and lists none');
}

/**
 * The form of FACTORY's card: `folder` typed, read only picked and Add pressed gives it, drawn as a row marked `:ro`; its Remove takes
 * it back, its row gone, the api answering the factory without it.
 */
async function expectAddedThenRemoved(page: Page, folder: string): Promise<void> {
  await settingsOf(page, FACTORY);
  const card = page.locator(`[data-factory-volumes="${FACTORY}"]`);
  await card.getByRole('textbox', { name: 'Path or git URL' }).fill(folder);
  await card.locator('[data-volume-form] label', { hasText: 'Read only (:ro)' }).click();
  await card.getByRole('button', { name: 'Add' }).click();
  const row = card.locator(`[data-factory-volume="${folder}"]`);
  await expectVisible(row.locator('[data-volume-mark="ro"]'), `${folder}, added through the form, is listed :ro`);
  await expectCount(card.locator('[data-volume-refused]'), 0, 'and nothing is refused');
  await row.getByRole('button', { name: `Remove ${folder}` }).click();
  await expectCount(row, 0, `${folder}, removed through its row, is listed no more`);
  await idle(page);
  if ((await listed(page, FACTORY)).volumes.some((v) => v.path === folder))
    throw new Refused(`the api answers ${FACTORY} without ${folder} once it is removed — it still answers it`);
}

export default {
  /**
   * A factory's volumes on its settings page. The page makes folders where the pictures go (`OUT`), outside the store and every
   * factory's repositories, as `nemia factory volume add` requires, and writes two into the file of FACTORIES' `hiring` beside its
   * repository as the verb writes them, one `:ro` and one `:rw`: the card lists each, in the api's order, with its mark, what it is,
   * and the line that takes it back. A third is given through the card's form, read only, and taken back by its Remove. A factory it
   * files with none shows the api's line to add one. It is pictured once, in the dark theme. The factory's file is put back, the one it
   * filed removed, then the folders, whatever happens.
   */
  name: 'factory-volumes',
  route: '/',
  expect: async (page) => {
    const factoryFile = path.join(store!, 'factories', `${FACTORY}.json`);
    const factoryText = fs.readFileSync(factoryFile, 'utf8');
    fs.mkdirSync(OUT, { recursive: true });
    const ro = fs.mkdtempSync(path.join(OUT, 'factory-volumes-ro-'));
    const rw = fs.mkdtempSync(path.join(OUT, 'factory-volumes-rw-'));
    const formed = fs.mkdtempSync(path.join(OUT, 'factory-volumes-form-'));
    const noneFile = path.join(store!, 'factories', `${NONE}.json`);
    try {
      const factory = JSON.parse(factoryText) as { volumes: unknown[] };
      const volumes = [...factory.volumes, { path: ro, readOnly: true }, { path: rw, readOnly: false }];
      fs.writeFileSync(factoryFile, `${JSON.stringify({ ...factory, volumes }, null, 2)}\n`);
      fs.writeFileSync(noneFile, `${JSON.stringify({ volumes: [] }, null, 2)}\n`);
      await expectListed(page, ro, rw);
      await expectAddedThenRemoved(page, formed);
      await expectNone(page);
    } finally {
      fs.writeFileSync(factoryFile, factoryText);
      fs.rmSync(noneFile, { force: true });
      fs.rmSync(formed, { recursive: true, force: true });
      fs.rmSync(ro, { recursive: true, force: true });
      fs.rmSync(rw, { recursive: true, force: true });
    }
  },
} satisfies PageSpec;
