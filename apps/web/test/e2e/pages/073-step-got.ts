import fs from 'node:fs';
import path from 'node:path';
import type { Locator } from 'playwright';
import { fed, openFold, partOf, photograph, themeOf } from '../board.ts';
import { expectVisible, idle, Refused, settled } from '../checks.ts';
import { SHAPED, writeShaped } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The sources Got draws a line for, in the one order it draws them, of those SHAPED's `build` was told by. */
const SOURCES = ['you', 'step', 'check', 'other-run'];

/** The line of `got` from `source`, opened to what it said. */
const opened = (got: Locator, source: string): Promise<Locator> => openFold(got.locator(`li[data-got="${source}"]`), `got-${source}`);

export default {
  /**
   * What a step got, a line a source: SHAPED's `build`, told under the headings the run writes, draws in its Got a line from you (what
   * was asked for), one from `plan` named by the packet the graph's edge carries from `plan` to it, in the edge's own words, one from
   * `plan`'s check, and one from the run it was handed as context, with what that run was asked and how it was handed; each in that
   * order, and each opening to what it said. The run is written for the visit and taken back.
   */
  name: 'step-got',
  route: '/runs',
  expect: async (page) => {
    const written = writeShaped(store!);
    const { id, giver, step } = SHAPED;
    try {
      await page.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const got = partOf(page, step).locator('[data-part-got]');
      await expectVisible(got, `${step}'s part draws what it got`);
      const drawn = await got.locator('li[data-got]').evaluateAll((all) => all.map((li) => li.getAttribute('data-got')));
      const seen = drawn.filter((source) => source !== null && SOURCES.includes(source));
      if (seen.join() !== SOURCES.join())
        throw new Refused(`Got draws a line from ${SOURCES.join(', ')}, in that order — it draws ${drawn.join(', ')}`);

      const you = await opened(got, 'you');
      await expectVisible(you.getByText(SHAPED.asked), 'the line from you says what was asked for');

      const edge = page.locator(
        `section[aria-label="The run's steps as a graph"] button[data-packet="${giver}"][data-packet-to="${step}"]`,
      );
      await expectVisible(edge, `the graph's edge from ${giver} to ${step} carries its packet`);
      const named = (await edge.textContent())?.trim() ?? '';
      const chip = got.locator(`li[data-got="step"] [data-packet="${giver}"]`);
      await expectVisible(chip, `the line from ${giver} is named by its packet`);
      const said = (await chip.textContent())?.trim() ?? '';
      if (said !== named) throw new Refused(`the line names the packet as the graph's edge does (${named}) — it says ${said}`);
      const handed = await opened(got, 'step');
      await expectVisible(handed.getByText(SHAPED.handed), `and opens to what ${giver} handed it`);
      await expectVisible(handed.getByRole('link', { name: `What ${giver} gave` }), `with a link to what ${giver} gave`);

      const check = await opened(got, 'check');
      await expectVisible(check.locator('[data-slot="collapsible-trigger"]', { hasText: `From the check of ${giver}` }), 'a check line');
      await expectVisible(check.getByText('The check passed', { exact: false }), "that opens to the check's verdict");

      const other = await opened(got, 'other-run');
      await expectVisible(
        other.locator('[data-slot="collapsible-trigger"]', { hasText: `From the run ${SHAPED.other.id}` }),
        'a line from the other run',
      );
      await expectVisible(other.getByText(`asked: ${SHAPED.other.asked}`, { exact: false }), 'saying what it was asked');
      await expectVisible(other.getByText('handed read', { exact: false }), 'and that it was handed as context');
      await settled(page);
      await photograph(got, path.join(OUT, `step-got-lines-${await themeOf(page)}.png`));
    } finally {
      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      for (const file of written) fs.rmSync(file, { recursive: true, force: true });
      fed(id, 'removed');
    }
  },
} satisfies PageSpec;
