import { cancelledAt, sidebar } from '../board.ts';
import { expectCount, expectVisible, settled } from '../checks.ts';
import { DIAMOND } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

export default {
  /** A run that waits on a run that was called off: its page says what `wf decide` says of it, and offers nothing else. */
  name: 'waits',
  route: `/runs/${DIAMOND.orphan.id}`,
  expect: async (page) => {
    await sidebar(page);
    const { cancelled, orphan } = DIAMOND;
    const banner = page.locator('section[aria-label="Waiting on runs"][data-on-you="true"]');
    await expectVisible(
      banner.getByText(DIAMOND.words.orphan, { exact: true }),
      `the page says what wf ls says of ${orphan.id}: ${DIAMOND.words.orphan}`,
    );
    const advice = `${cancelled.id} was cancelled at ${cancelledAt()}, and a cancelled run never ships — yours to resolve: nemia cancel ${orphan.id}, or start the work again without --after ${cancelled.id}`;
    await expectVisible(banner.locator('[data-advice]', { hasText: advice }), 'and what wf decide leaves you to do, word for word');
    await expectVisible(banner.locator(`a[href="/runs/${cancelled.id}"]`), `${cancelled.id} is linked to its page`);
    await expectVisible(
      page.locator('[data-fact="started"] dd', { hasText: /^not yet$/ }),
      `${orphan.id} has not started, whatever time has passed since it was created: nothing of it is filed`,
    );
    await expectCount(
      page.locator('section[aria-label="Decide"]'),
      0,
      'no Decide section: nothing of the run is filed, and wf decide offers nothing else',
    );
    const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
    await expectVisible(
      graph.locator('.react-flow__node[data-id="implement"] [data-state="waiting"]', { hasText: 'to come' }),
      "its root's chip is waiting, in a person's word: to come",
    );
    await settled(page);
  },
} satisfies PageSpec;
