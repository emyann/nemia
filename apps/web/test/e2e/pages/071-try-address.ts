import path from 'node:path';
import type { Page } from 'playwright';
import { LEDGER, openFold, partOf, photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { LOOPING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

const { target, exhausted } = LOOPING;

/** Refuses unless what `target`'s part draws is its first try's, and `exhausted`'s is still its current try's. */
async function onTryOne(page: Page, when: string): Promise<void> {
  const part = partOf(page.locator(LEDGER), target);
  const picker = part.locator(`[data-try-picker="${target}"]`);
  await expectVisible(picker.locator('[data-try="1"][data-selected]'), `${when}: try 1 is the one picked`);
  await expectVisible(
    part.locator('[data-part-said]').getByText(LOOPING.earlier[0].implement, { exact: true }),
    `${when}: its Said is try 1's (${LOOPING.earlier[0].implement})`,
  );
  await expectCount(part.locator('[data-part-gave] li[data-answer]'), 0, `${when}: and its Gave is try 1's, which replied to nothing`);
  const detail = await openFold(part, 'detail');
  await expectVisible(detail.locator('[data-shown-try="1"]'), `${when}: its Detail shows try 1`);

  const other = partOf(page.locator(LEDGER), exhausted);
  await expectVisible(
    other.locator(`[data-try-picker="${exhausted}"] [data-selected]`).getByText('(current)', { exact: false }),
    `${when}: ${exhausted} stays on its current try`,
  );
  await expectCount(
    other.locator('[data-part-said]').getByText(LOOPING.earlier[0].review, { exact: true }),
    0,
    `${when}: and draws its own current Said, not its first try's`,
  );
}

export default {
  /**
   * A try is a place of the address: on LOOPING's page, choosing try 1 in implement's picker sets `?try=implement:1`, and implement's
   * part draws that try's Said and Gave — round 1's summary, and none of round 2's replies — and its Detail shows try 1; reloading the
   * page keeps it all; and review, in its own part, stays on its current try all along.
   */
  name: 'try-address',
  route: `/runs/${LOOPING.id}`,
  expect: async (page) => {
    const part = partOf(page.locator(LEDGER), target);
    const picker = part.locator(`[data-try-picker="${target}"]`);
    await expectVisible(picker.locator('[data-try][data-selected]').getByText('(current)', { exact: false }), 'the current try is picked');
    await picker.locator('[data-try="1"]').click();
    await page.waitForURL((url) => url.searchParams.get('try') === `${target}:1`);
    await onTryOne(page, 'chosen');
    await settled(page);
    await photograph(part, path.join(OUT, `try-address-part-${await themeOf(page)}.png`));

    await page.reload({ waitUntil: 'load' });
    await idle(page);
    if (new URL(page.url()).searchParams.get('try') !== `${target}:1`)
      throw new Refused(`reloaded, the address still names try 1 — it is ${page.url()}`);
    await onTryOne(page, 'reloaded');
  },
} satisfies PageSpec;
