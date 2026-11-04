import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The factory the page gives two volumes, and one the seed gives none. */
const FACTORY = FACTORIES.hiring.name;
const NONE = FACTORIES.bare;

/** A factory's volumes and its line that adds one, as `GET /api/factories` answers them. */
type Listed = { name: string; volumes: { path: string; readOnly: boolean; commands: { rm: string } }[]; commands: { volume: string } };

/** `factory` as the api answers it. */
async function listed(page: Page, factory: string): Promise<Listed> {
  const answer = await page.request.get(new URL('/api/factories', page.url()).href);
  const found = ((await answer.json()) as Listed[]).find((f) => f.name === factory);
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
 * The Volumes card of FACTORY, given a read-only folder and a writable one: each path in the api's order, its mark, the caveat on the
 * writable one alone, and the api's line that takes each back; drawn after the trust caution's place and before the rules.
 */
async function expectListed(page: Page, ro: string, rw: string): Promise<void> {
  const { volumes } = await listed(page, FACTORY);
  const paths = volumes.map((v) => v.path);
  if (JSON.stringify([...paths].sort()) !== JSON.stringify([ro, rw].sort()))
    throw new Refused(`the api answers ${FACTORY}'s two volumes, ${ro} and ${rw} — it answers ${JSON.stringify(paths)}`);
  await settingsOf(page, FACTORY);
  const card = page.locator(`[data-factory-volumes="${FACTORY}"]`);
  await expectVisible(card.getByText('Volumes', { exact: true }), 'the settings page draws the Volumes card');
  const rows = card.locator('[data-factory-volume]');
  await expectCount(rows, 2, 'a row for each volume');
  const shown = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-factory-volume')));
  if (JSON.stringify(shown) !== JSON.stringify(paths))
    throw new Refused(`the rows are the api's volumes in its order, ${JSON.stringify(paths)} — they are ${JSON.stringify(shown)}`);
  for (const v of volumes) {
    const row = card.locator(`[data-factory-volume="${v.path}"]`);
    const mark = v.readOnly ? 'ro' : 'rw';
    await expectVisible(row.locator(`[data-volume-mark="${mark}"]`, { hasText: `:${mark}` }), `${v.path} is marked :${mark}`);
    await expectCount(row.locator('[data-volume-caveat]'), v.readOnly ? 0 : 1, `${v.path}: the caveat on a writable volume alone`);
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

export default {
  /**
   * A factory's volumes on its settings page, read-only. The page makes two folders where the pictures go (`OUT`), outside the store and
   * every factory's repositories, as `nemia factory volume add` requires, and writes them into the file of FACTORIES' `hiring` as the
   * verb writes them, one `:ro` and one `:rw`: the card lists each, in the api's order, with its mark, the caveat on the writable one,
   * and the line that takes it back. A factory with none shows the api's line to add one. It is pictured once, in the dark theme. The
   * factory's file is put back, then the folders removed, whatever happens.
   */
  name: 'factory-volumes',
  route: '/',
  expect: async (page) => {
    const factoryFile = path.join(store!, 'factories', `${FACTORY}.json`);
    const factoryText = fs.readFileSync(factoryFile, 'utf8');
    fs.mkdirSync(OUT, { recursive: true });
    const ro = fs.mkdtempSync(path.join(OUT, 'factory-volumes-ro-'));
    const rw = fs.mkdtempSync(path.join(OUT, 'factory-volumes-rw-'));
    try {
      const factory = JSON.parse(factoryText) as Record<string, unknown>;
      const volumes = [
        { path: ro, readOnly: true },
        { path: rw, readOnly: false },
      ];
      fs.writeFileSync(factoryFile, `${JSON.stringify({ ...factory, volumes }, null, 2)}\n`);
      await expectListed(page, ro, rw);
      await expectNone(page);
    } finally {
      fs.writeFileSync(factoryFile, factoryText);
      fs.rmSync(ro, { recursive: true, force: true });
      fs.rmSync(rw, { recursive: true, force: true });
    }
  },
} satisfies PageSpec;
