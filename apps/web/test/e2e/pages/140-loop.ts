import { openFold, partOf, sidebar, stepBar } from '../board.ts';
import { expectBeneath, expectCount, expectInside, expectVisible, settled } from '../checks.ts';
import { LOOPING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

export default {
  /**
   * A run whose review loop is out of rounds, waiting on you. Its record names a repository that is not on this machine, so the Decide
   * section says what its branch changed is not known, and the page renders. The graph the run froze: implement → review, the edge back
   * beneath the row, and review drawn as a human gate. Each step's note is on hover on the canvas and under its chip on the run's page,
   * read before a click opens the inspector, which has a heading of its own. The timeline (a receipt) has a row a try and a total a round;
   * implement's try picker lists its three tries by round, the current one picked, and try 2 picked shows round 2's closeout in its
   * Said and Gave and names its own task in its Detail, the address keeping the choice.
   */
  name: 'loop',
  route: `/runs/${LOOPING.id}`,
  expect: async (page) => {
    await sidebar(page);
    await expectCount(
      page.getByText(/no longer reads as a workflow|has changed since this run started/),
      0,
      'no warning about the workflow folder: it reads as the loop the run froze, with nothing drifted and nothing unread',
    );
    await expectVisible(
      page.locator(`section[aria-label="Asks of you"] li[data-step="${LOOPING.exhausted}"]`),
      `the run's page says ${LOOPING.exhausted} is waiting on you, in the asks at its top`,
    );
    const decide = (await openFold(page.locator('[data-asks]'), 'decide')).locator('section[aria-label="Decide"]');
    await expectVisible(
      decide.getByText(/^what this run changed is not known: /).first(),
      `the Decide section says what ${LOOPING.id}'s branch changed is not known: its record names a repository not on this machine`,
    );
    await expectVisible(decide.locator('[data-lesson="unknown"]'), 'the lesson chip says nobody can know, not that nothing was written');
    await expectVisible(
      decide.locator('section[aria-label="In full"]').getByText(/^what this run changed is not known: /),
      'the check-affecting files in full say they are not known, in the sentence alone',
    );
    await expectVisible(
      decide.locator('[data-command="once more"] code', { hasText: `nemia retry ${LOOPING.id} ${LOOPING.exhausted} --round` }),
      `once more: the nemia retry --round that takes ${LOOPING.exhausted}'s loop round again, as a line`,
    );
    const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
    const node = (name: string) => graph.locator(`.react-flow__node[data-id="${name}"]`);
    await expectCount(
      graph.locator('.react-flow__node'),
      LOOPING.steps.length,
      `the loop's graph has a node per step (${LOOPING.steps.join(', ')})`,
    );
    const edge = (id: string) => graph.locator(`.react-flow__edge[data-id="${id}"]`);
    await expectCount(graph.locator('.react-flow__edge'), 2, "the loop's graph has two edges: implement → review, and the edge back");
    await expectVisible(edge('implement->review').locator('.react-flow__edge-path'), 'an arrow from implement to review');
    const back = edge(`loop:${LOOPING.exhausted}->${LOOPING.target}`);
    await expectVisible(
      back.locator('.react-flow__edge-path'),
      `the edge back from ${LOOPING.exhausted} to ${LOOPING.target}, drawn as a loop`,
    );
    await expectVisible(back.getByText(LOOPING.round, { exact: true }), `the edge back says the round the loop is on (${LOOPING.round})`);
    await expectCount(
      graph.locator('.react-flow__edge animateMotion'),
      0,
      'out of rounds, nothing of the loop moves: no dot on either edge',
    );
    await settled(page);
    await expectBeneath(
      back.locator('.react-flow__edge-path'),
      graph.locator('.react-flow__node'),
      'the edge back runs beneath the row, under both steps',
    );
    await expectVisible(
      node(LOOPING.exhausted).locator(`[data-state="exhausted"][title$="${LOOPING.notes.review}"]`, {
        hasText: 'waits on you',
      }),
      `${LOOPING.exhausted}, out of rounds, is a chip that waits on a person on the graph, its note after what that means on hover, with no room under a chip`,
    );
    await expectVisible(
      node(LOOPING.exhausted).getByText('human gate'),
      `${LOOPING.exhausted}, out of rounds, is drawn as a human gate, as a step signed off blocked is`,
    );
    await expectVisible(
      node(LOOPING.exhausted).locator('[data-gate-band]', { hasText: 'waits on you' }),
      `${LOOPING.exhausted}, out of rounds, says in its band that it waits on you on the graph`,
    );
    await expectCount(node('implement').locator('[data-gate-band]'), 0, 'implement, done on its own word, is not a human gate');
    await expectVisible(
      node('implement').locator(`[data-state="unverified"][title$="${LOOPING.notes.implement}"]`),
      `implement's chip on the graph ends its title with the round it is on (${LOOPING.notes.implement})`,
    );
    for (const name of LOOPING.steps) {
      const detail = await openFold(partOf(page, name), 'detail');
      await expectVisible(
        detail.locator('[data-note]', { hasText: LOOPING.notes[name] }),
        `the run's page shows ${name}'s note in its part's Detail, where there is room (${LOOPING.notes[name]})`,
      );
    }
    const timeline = (await openFold(page.locator('section[aria-label="Receipts"]'), 'timeline')).locator('section[aria-label="Timeline"]');
    for (const name of LOOPING.steps) {
      await expectCount(
        timeline.locator(`tr[data-step="${name}"][data-task="session"]`),
        3,
        `${name} has a row on the timeline for each of its three rounds`,
      );
    }
    await expectVisible(
      timeline.locator('tr[data-step="implement"] td', { hasText: /^try 3 · round 3$/ }),
      "implement's third try is round 3's",
    );
    await expectCount(timeline.locator('tfoot tr[data-total]'), 4, "a total for each of the loop's three rounds, and the run's");
    await node(LOOPING.exhausted).click();
    const inspector = stepBar(page, LOOPING.id, LOOPING.exhausted);
    await expectVisible(inspector.locator('[data-part-said]'), `${LOOPING.exhausted}'s inspector draws what it said: it has signed off`);
    await expectVisible(
      inspector.locator('[data-step-tag]', { hasText: /^waits on you$/i }),
      `the step inspector opens on a click on ${LOOPING.exhausted}, its tag saying it waits on you`,
    );
    await expectVisible(
      (await openFold(partOf(inspector, LOOPING.exhausted), 'detail')).locator('[data-note]', { hasText: LOOPING.notes.review }),
      `the inspector's Detail shows ${LOOPING.exhausted}'s note`,
    );
    await settled(page);
    await expectInside(graph.locator('.react-flow__node'), graph.locator('.react-flow'), 'every step is on the canvas under the open bar');

    await node(LOOPING.target).click();
    const target = stepBar(page, LOOPING.id, LOOPING.target);
    const picker = target.locator(`[data-try-picker="${LOOPING.target}"]`);
    const rows = picker.locator('[data-try]');
    await expectCount(rows, 3, `${LOOPING.target}'s try picker, in its part in the bar, lists its three tries`);
    for (const [i, label] of ['try 1', 'try 2', 'try 3 (current)'].entries()) {
      await expectVisible(
        picker.locator(`[data-round="${i + 1}"] [data-try="${i + 1}"]`, { hasText: label }),
        `round ${i + 1} holds ${label}`,
      );
    }
    await expectVisible(picker.locator('[data-try="3"][data-selected]'), 'the current try is the one picked');
    await picker.locator('[data-try="2"]').click();
    await target.page().waitForURL((url) => url.searchParams.get('try') === `${LOOPING.target}:2`);
    await expectVisible(picker.locator('[data-try="2"][data-selected]'), 'try 2 picked, the address keeping it (?try=)');
    const said = target.locator('[data-part-said]');
    await expectVisible(
      said.getByText(LOOPING.earlier[1].implement, { exact: true }),
      `its Said is round 2's summary (${LOOPING.earlier[1].implement})`,
    );
    await expectVisible(
      target.locator('[data-part-gave] li[data-answer]', { hasText: LOOPING.replied }),
      `and its Gave round 2's reply, as finding → answer · why`,
    );
    const detail = await openFold(partOf(target, LOOPING.target), 'detail');
    const shown = detail.locator('[data-shown-try="2"]');
    await expectVisible(shown.getByText('round 2 · try 2 (round)'), "its Detail's try shown is round 2's");
    await expectVisible(shown.getByText(`${LOOPING.id}-implement-2`, { exact: true }), 'which names its own task');
    await settled(page);
  },
} satisfies PageSpec;
