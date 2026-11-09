import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf, runPath } from '../board.ts';
import { spentOf, type LabelStats } from '../../../src/lib/api/labels.ts';
import { withSelector } from '../../../src/lib/api/selector.ts';
import { dollars } from '../../../src/lib/money.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { LANDED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The card this page files with a label, and the label it and a seeded run carry. */
const CARD = 'label-the-card-e2e0';
const LABEL = 'team=core';

/** Edits `id`'s labels through the api, as the run page's field does. */
async function labelRun(page: Page, id: string, edits: string[]): Promise<void> {
  const answered = await page.request.post(new URL(`${await runPath(page, id)}/labels`, page.url()).href, { data: { labels: edits } });
  if (answered.status() !== 200) throw new Refused(`the api labels ${id} — it answered ${answered.status()}: ${await answered.text()}`);
}

async function load(page: Page, route: string): Promise<void> {
  await page.goto(new URL(route, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

export default {
  /**
   * A card filed with `team: core` and a landed run labelled `team=core`: the Inbox and Runs filters keep them alone, a label added on the
   * card's page is written to its frontmatter and removed again, one added on the run's page is shown and removed with no reload, and
   * the label's page counts the card not started and the run landed. The card, and the run's labels file, are taken back.
   */
  name: 'labels',
  route: '/inbox',
  expect: async (page) => {
    const cardFile = path.join(store!, 'inbox', `${CARD}.md`);
    const labelsFile = path.join(store!, 'runs', `${LANDED.id}.labels`);
    const theme = await themeOf(page);
    try {
      fs.writeFileSync(cardFile, `---\nlabels:\n  team: core\n---\nLabel the card\n\nA card the label filter keeps.\n`);
      await labelRun(page, LANDED.id, [LABEL]);

      await load(page, `/inbox?l=${encodeURIComponent(LABEL)}`);
      const cards = page.locator('section[aria-label="Cards"] li[data-card]');
      await expectCount(cards, 1, `the Inbox filtered by ${LABEL} keeps the one card that carries it`);
      await expectVisible(cards.locator(`[data-label="${LABEL}"]`), 'and shows its label as a tag');
      await settled(page);
      await photograph(page, path.join(OUT, `labels-inbox-${theme}.png`), { fullPage: true });

      const field = page.getByRole('textbox', { name: 'Filter by labels' });
      await field.fill('team=nobody');
      await page.getByRole('button', { name: 'Filter' }).click();
      await page.waitForURL(/l=team%3Dnobody/, { timeout: WAIT_MS });
      await expectCount(cards, 0, 'a selector no card matches keeps none');

      await load(page, `/runs?l=${encodeURIComponent(LABEL)}`);
      await expectVisible(page.locator(`[data-run="${LANDED.id}"]`), `the Runs filtered by ${LABEL} keep the run that carries it`);
      await expectCount(page.locator('[data-run]'), 1, 'and no other');
      await settled(page);
      await photograph(page, path.join(OUT, `labels-runs-${theme}.png`), { fullPage: true });

      await load(page, `/inbox/${CARD}`);
      const edit = page.locator('[data-labels-edit]');
      await edit.getByRole('textbox', { name: 'Add a label' }).fill('size=wide');
      await edit.getByRole('button', { name: 'Add' }).click();
      await expectVisible(edit.locator('[data-label="size=wide"]'), 'a label added on the card page is shown');
      await settled(page);
      await photograph(page, path.join(OUT, `labels-card-${theme}.png`), { fullPage: true });
      if (!fs.readFileSync(cardFile, 'utf8').includes('size: wide'))
        throw new Refused(`the label added is written to the card's frontmatter — ${cardFile} holds no size: wide`);
      await edit.getByRole('button', { name: 'Remove size' }).click();
      await expectCount(edit.locator('[data-label="size=wide"]'), 0, 'and removed again');
      if (fs.readFileSync(cardFile, 'utf8').includes('size:')) throw new Refused(`the label removed leaves the card's file — ${cardFile}`);

      await load(page, `/runs/${LANDED.id}`);
      const runEdit = page.locator('[data-labels-edit]');
      await runEdit.getByRole('textbox', { name: 'Add a label' }).fill('size=wide');
      await runEdit.getByRole('button', { name: 'Add' }).click();
      await expectVisible(runEdit.locator('[data-label="size=wide"]'), 'a label added on the run page is shown with no reload');
      await settled(page);
      await photograph(page, path.join(OUT, `labels-run-${theme}.png`));
      await runEdit.getByRole('button', { name: 'Remove size' }).click();
      await expectCount(runEdit.locator('[data-label="size=wide"]'), 0, 'and removed again with no reload');

      await load(page, '/labels/team/core');
      await expectVisible(page.locator('[data-page-name]', { hasText: LABEL }), 'the label page is named by its label');
      await expectVisible(
        page.locator(`[data-section="in play"] [data-card="${CARD}"]`),
        'it lists the card no run started, which is in play',
      );
      await expectVisible(page.locator('[data-section="in play"] h2', { hasText: /^Card in play$/ }), 'one card is said in the singular');
      await expectVisible(page.locator('[data-bucket="landed"]', { hasText: '1' }), 'and counts the landed run');
      await expectVisible(page.locator('[data-section="runs"] h2', { hasText: /^Run$/ }), 'one run is said in the singular');
      await expectVisible(page.locator('[data-label-spent]'), 'and says what its runs spent, landed or not');
      const read = await page.request.get(new URL(withSelector('/api/stats', LABEL), page.url()).href);
      if (read.status() !== 200) throw new Refused(`the api gives the label's stats — it answered ${read.status()}: ${await read.text()}`);
      const stats = (await read.json()) as LabelStats;
      const figure = (tile: string) => page.locator(`[data-${tile}] [data-sticker] > span:last-child`);
      await expectTexts(figure('label-spent'), [dollars(spentOf(stats))], 'what they spent is said as every page says an amount');
      await expectTexts(
        figure('label-cost'),
        [dollars(stats.all.total.costPerLanded)],
        'and so is what a landed run cost, `—` where none landed with a cost',
      );
      await settled(page);
      await photograph(page, path.join(OUT, `labels-page-${theme}.png`), { fullPage: true });
    } finally {
      fs.rmSync(cardFile, { force: true });
      await labelRun(page, LANDED.id, ['team-']).catch(() => undefined);
      fs.rmSync(labelsFile, { force: true });
    }
  },
} satisfies PageSpec;
