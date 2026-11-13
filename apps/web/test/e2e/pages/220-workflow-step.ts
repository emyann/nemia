import path from 'node:path';
import { expectKeys, expectRendered, expectSource, filesIn, sidebar, railPlace, litOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused } from '../checks.ts';
import { checkoutIn, FACTORIES, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { store } from '../world.ts';

export default {
  /**
   * A step's page, from its block on the Workflows page: what it is told, rendered, then every key a step may set — set or not — with its
   * value as the loader reads it and what it means, and Source: the file as written. It writes nothing: the checkout's folder is as it was.
   * The checkout's step is read in FACTORIES' `hiring`, the factory on the checkout, made to offer `dev` and taken back after.
   */
  name: 'workflow-step',
  route: '/workflows',
  expect: async (page) => {
    const takeBack = checkoutIn(store!, [WORKFLOWS.good.name]);
    try {
      const at = `/workflows/repo/${WORKFLOWS.good.name}/review?factory=${FACTORIES.hiring.name}`;
      await page.goto(new URL(at, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      await sidebar(page);
      await expectVisible(railPlace(page, 'Workflows').and(litOf(page)), "the sidebar lights Workflows on a step's page");
      const { good } = WORKFLOWS;
      const folder = path.join(store!, 'checkout', 'workflows', good.name);
      const before = filesIn(folder);
      await expectVisible(page.locator('h1', { hasText: /^review$/ }), 'the page names the step');
      await expectVisible(page.getByText(good.name, { exact: true }), `and the workflow it is a step of (${good.name})`);
      await expectVisible(page.getByText("the factory's", { exact: true }), "marked as the factory's, read on its repository");
      await expectCount(page.getByText('this repository', { exact: true }), 0, "and not as this repository's");

      const file = page.locator('section[aria-label="The file"]');
      const body = file.locator('[data-markdown]').first();
      await expectRendered(body, good.review);
      await expectKeys(
        page,
        file,
        `/api/namespaces/${FACTORIES.hiring.name}/workflows/${good.name}/steps/review?origin=repo`,
        good.review.keys,
      );
      await expectSource(file, body, path.join(folder, 'review.md'));
      if (JSON.stringify(filesIn(folder)) !== JSON.stringify(before))
        throw new Refused(`a step's page writes nothing — ${folder} changed while it was open`);
    } finally {
      takeBack();
    }
  },
} satisfies PageSpec;
