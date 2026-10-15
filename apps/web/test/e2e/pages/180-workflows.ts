import { nextVisit, sidebar, railPlace, litOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, WAIT_MS } from '../checks.ts';
import { WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

export default {
  /**
   * The Workflows page: a compact card per workflow, the checkout's and yours, each its name linked to its page, where it is read from,
   * its step count and its README's first paragraph — never the rest, which its page shows — and a folder the loader refuses with a line
   * saying so. Nothing of a workflow is drawn here: its graph, its steps and its start are on its page (`181-workflow`).
   */
  name: 'workflows',
  route: '/workflows',
  expect: async (page) => {
    await sidebar(page);
    await expectVisible(
      railPlace(page, 'Workflows').and(litOf(page)),
      'the sidebar lights Workflows on its page',
    );
    const { good, broken, yours } = WORKFLOWS;
    const card = (name: string) => page.locator(`section[aria-label="Workflow ${name}"]`);
    await expectCount(page.locator('section[aria-label^="Workflow "]'), 3, "a card per workflow: the checkout's two, and yours");

    const dev = card(good.name);
    await expectVisible(dev.getByText(good.description, { exact: true }), `${good.name} with its README's first paragraph`);
    await expectCount(dev.getByText(good.more), 0, 'and not the rest of its README, which its page shows');
    await expectVisible(dev.getByText('this repository', { exact: true }), `${good.name} is marked as the repository's`);
    await expectVisible(dev.getByText(`${good.steps.length} steps`, { exact: true }), 'and counts its steps');
    await expectCount(page.locator('article .react-flow, article textarea'), 0, 'no card draws a graph or a start: their pages do');

    const bad = card(broken.name);
    await expectVisible(bad.locator('[data-refusal]'), 'a folder the loader refuses says so on its card');
    const mine = card(yours.name);
    await expectVisible(mine.getByText('yours', { exact: true }), `${yours.name}, under workflows/ in the store, is marked as yours`);

    for (const [from, name] of [
      ['repo', good.name],
      ['repo', broken.name],
      ['yours', yours.name],
    ] as const) {
      const href = await card(name).getByRole('heading').getByRole('link').getAttribute('href');
      if (href !== `/workflows/${from}/${name}`)
        throw new Refused(`${name}'s card links its page, /workflows/${from}/${name} — it goes to ${href}`);
    }
    await nextVisit(page, async (again) => {
      await again.locator(`section[aria-label="Workflow ${good.name}"]`).getByRole('heading').getByRole('link').click();
      await again.waitForURL((url) => url.pathname === `/workflows/repo/${good.name}`, { timeout: WAIT_MS });
      await expectVisible(again.locator('h1', { hasText: new RegExp(`^${good.name}$`) }), "a card's name opens the workflow's page");
      await again.goBack({ waitUntil: 'load' });
      await again.waitForURL((url) => url.pathname === '/workflows', { timeout: WAIT_MS });
      await idle(again);
    });
  },
} satisfies PageSpec;
