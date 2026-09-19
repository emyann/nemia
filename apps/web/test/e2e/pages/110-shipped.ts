import { sidebar } from '../board.ts';
import { expectCount, expectVisible, settled } from '../checks.ts';
import { SHIPPED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

export default {
  // The other side of an ending's gate: approved, run in the checkout, and the branch merged — so there is nothing left to decide.
  name: 'shipped',
  route: `/runs/${SHIPPED.id}`,
  expect: async (page) => {
    await sidebar(page);
    const { id, ending } = SHIPPED;
    const section = page.locator(`article > section#step-${ending}`);

    // Nothing to decide, and nobody waited on: its ending answered for its own branch.
    await expectCount(page.locator('section[aria-label="To decide"]'), 0, 'a run whose ending merged it has nothing to decide');
    await expectCount(page.locator('section[aria-label="Waiting on you"]'), 0, 'and waits on nobody');
    await expectCount(page.locator('section[aria-label="Decide"]'), 0, 'and the Decide section says nothing: the branch is already on the base');

    // The ending step: what it did, and its gate approved. Its approval filed it — nothing follows it to be handed anything.
    await expectVisible(section.getByText(SHIPPED.merged), `${ending} says what it did (${SHIPPED.merged})`);
    await expectVisible(section.locator('dd', { hasText: /^main$/ }), `and its facts say it ran in the repository's own checkout`);
    await expectVisible(section.locator('dd', { hasText: /^approved, try 1$/ }), 'and that its gate is approved');
    const approval = section.locator(`section[aria-label="The approval of ${ending}"]`);
    await expectVisible(
      approval.getByText('your approval filed it, and the step is handed it as the terms it acts on'),
      `the approval under ${ending} says it filed the step, not that a step after the gate was handed anything`,
    );
    await expectVisible(approval.locator('[data-words="none"]'), 'and that it was given with no words');
    await expectCount(page.getByText('every step after the gate'), 0, 'nothing on the page says a step follows the gate: none does');
    await expectCount(section.locator(`section[aria-label="The gate of ${ending}"]`), 0, 'and there is no gate to act at: it is approved');
    await settled(page);
  },
} satisfies PageSpec;
