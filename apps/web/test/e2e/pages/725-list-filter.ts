import path from 'node:path';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, WAIT_MS } from '../checks.ts';
import { AGENTS, WORKFLOWS } from '../seed.ts';
import type { Page } from 'playwright';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** Waits for the address's filter, `?q=`, to be `q`, or to be gone for `undefined`, refusing past the wait. */
async function addressHolds(page: Page, q: string | undefined, assertion: string): Promise<void> {
  await page
    .waitForURL((url) => (url.searchParams.get('q') ?? undefined) === q, { timeout: WAIT_MS })
    .catch(() => {
      throw new Refused(`${assertion}: the address is ${page.url()}`);
    });
}

/** Opens `route` on the board the page is on, and waits for its reads. */
async function open(page: Page, route: string): Promise<void> {
  await page.goto(new URL(route, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

export default {
  /**
   * The whole lists filter by the kit's search bar, kept in the address. On the Library, typing keeps what matches by name or
   * description, in any case, writes it to the address as `?q=`, and a reload keeps it; the Agents page, opened with a filter, lists the
   * agent it keeps; the Workflows page, opened with one that keeps nothing, says so, and Clear the filter brings the list back and takes
   * `?q=` off the address.
   */
  name: 'list-filter',
  route: '/library',
  expect: async (page) => {
    const { seeded, made } = AGENTS;
    const theme = await themeOf(page);

    const field = page.getByRole('searchbox', { name: 'Filter the library' });
    await expectVisible(field, "the Library's filter");
    await field.pressSequentially('NOTES');
    await addressHolds(page, 'NOTES', 'what is typed is kept in the address');
    const agent = page.locator(`[data-library-item="Agent.${seeded.name}"]`);
    await expectVisible(agent, `${seeded.name} kept, its description holding "notes"`);
    await expectCount(page.locator(`[data-library-item="Skill.${made.skill.id}"]`), 0, `${made.skill.id} filtered out`);
    await photograph(page.locator('[data-library-page]'), path.join(OUT, `list-filter-library-${theme}.png`));
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    await expectVisible(agent, 'the filter survives a reload');
    await expectCount(page.locator(`[data-library-item="Skill.${made.skill.id}"]`), 0, 'and still keeps the skill out');
    if ((await field.inputValue()) !== 'NOTES')
      throw new Refused(`the field holds the address's filter: it holds ${await field.inputValue()}`);

    await open(page, `/agents?q=${seeded.name.slice(0, 4)}`);
    await expectVisible(page.locator(`[data-agent="${seeded.name}"]`), `the Agents page, filtered, lists ${seeded.name}`);
    await photograph(page.locator('article').first(), path.join(OUT, `list-filter-agents-${theme}.png`));

    await open(page, '/workflows?q=zzz');
    const nothing = page.locator('[data-nothing-matches]');
    await expectVisible(nothing, 'a filter that keeps no workflow says nothing matches');
    await expectCount(page.locator('section[aria-label^="Workflow "]'), 0, 'and draws no card');
    await photograph(page.locator('article').first(), path.join(OUT, `list-filter-nothing-${theme}.png`));
    await nothing.getByRole('button', { name: 'Clear the filter' }).click();
    await addressHolds(page, undefined, 'Clear the filter takes ?q= off the address');
    await expectVisible(page.locator(`section[aria-label="Workflow ${WORKFLOWS.yours.name}"]`), 'and brings the list back');
  },
} satisfies PageSpec;
