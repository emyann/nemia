import path from 'node:path';
import { expectKeys, expectRendered, expectSource, filesIn, sidebar, railPlace, litOf } from '../board.ts';
import { expectVisible, Refused } from '../checks.ts';
import { WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { store } from '../world.ts';

export default {
  /**
   * A step's page, from its block on the Workflows page: what it is told, rendered, then every key a step may set — set or not — with its
   * value as the loader reads it and what it means, and Source: the file as written. It writes nothing: the checkout's folder is as it was.
   */
  name: 'workflow-step',
  route: `/workflows/repo/${WORKFLOWS.good.name}/review`,
  expect: async (page) => {
    await sidebar(page);
    await expectVisible(railPlace(page, 'Workflows').and(litOf(page)), "the sidebar lights Workflows on a step's page");
    const { good } = WORKFLOWS;
    const folder = path.join(store!, 'checkout', 'workflows', good.name);
    const before = filesIn(folder);
    await expectVisible(page.locator('h1', { hasText: /^review$/ }), 'the page names the step');
    await expectVisible(page.getByText(good.name, { exact: true }), `and the workflow it is a step of (${good.name})`);
    await expectVisible(page.getByText('this repository', { exact: true }), "marked as the repository's");

    const file = page.locator('section[aria-label="The file"]');
    const body = file.locator('[data-markdown]').first();
    await expectRendered(body, good.review);
    await expectKeys(page, file, `/api/workflows/repo/${good.name}/review`, good.review.keys);
    await expectSource(file, body, path.join(folder, 'review.md'));
    if (JSON.stringify(filesIn(folder)) !== JSON.stringify(before))
      throw new Refused(`a step's page writes nothing — ${folder} changed while it was open`);
  },
} satisfies PageSpec;
