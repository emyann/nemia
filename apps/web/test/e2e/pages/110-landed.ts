import { sidebar } from '../board.ts';
import { expectCount, expectTexts, expectVisible, settled } from '../checks.ts';
import { LANDED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

export default {
  /**
   * The other side of an ending's gate: approved, run in the checkout, and the branch merged — so there is nothing left to decide. The run
   * is pruned since, its files with it: its facts say when, what it freed and what it kept, and its steps still read as they ended.
   */
  name: 'landed',
  route: `/runs/${LANDED.id}`,
  expect: async (page) => {
    await sidebar(page);
    const { ending } = LANDED;
    const section = page.locator(`article > section#step-${ending}`);

    await expectCount(
      page.locator('section[aria-label="To decide"]'),
      0,
      'a run whose ending merged it has nothing to decide: its ending answered for its own branch',
    );
    await expectCount(page.locator('section[aria-label="Waiting on you"]'), 0, 'and waits on nobody');
    await expectCount(
      page.locator('section[aria-label="Decide"]'),
      0,
      'and the Decide section says nothing: the branch is already on the base',
    );

    await expectVisible(section.getByText(LANDED.merged), `${ending} says what it did (${LANDED.merged})`);
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

    const said = /— removed 1 worktree, 1\.50 GB freed, and its files, 48\.0 MB freed; its branches and record are kept$/;
    await expectVisible(
      page.locator('article [data-fact="pruned"] [data-pruned]', { hasText: said }),
      'the run says it was pruned: when, what it removed and freed, and what it kept',
    );
    await expectVisible(section.getByText(LANDED.merged), 'and a pruned run still reads its steps as they ended');
    const shot = page.locator('article > section#step-review [data-artifact="pruned"]', { hasText: LANDED.shot });
    await expectVisible(
      shot,
      `review's ${LANDED.shot} reads as removed by a prune of its files, not drawn as a path as if it had never been made`,
    );
    await expectVisible(shot.getByText(/ — its files were removed at .+, by a prune of its files$/), 'with when, and by what');
    const moment = (await page.locator('article [data-fact="pruned"] [data-pruned] time').first().textContent())!.trim();
    await expectTexts(
      shot.locator('time'),
      [moment],
      `and says that moment as the run's pruned row does (${moment}), never as the api spells it`,
    );
    await expectCount(shot.getByText(/\d{4}-\d\d-\d\dT/), 0, 'not as an ISO time');
    await settled(page);
  },
} satisfies PageSpec;
