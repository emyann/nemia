import { sidebar, stepBar } from '../board.ts';
import { expectBeneath, expectCount, expectInside, expectVisible, settled } from '../checks.ts';
import { LOOPING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

export default {
  /**
   * A run whose review loop is out of rounds, waiting on you. Its record names a repository that is not on this machine, so the Decide
   * section says what its branch changed is not known, and the page renders. The graph the run froze: implement → review, the edge back
   * beneath the row, and review drawn as a human gate. Each step's note is on hover on the canvas and under its chip on the run's page,
   * read before a click opens the inspector, which has a heading of its own. The timeline has a row a try and a total a round;
   * implement's Details list its three rounds, each a task of its own, and round 2 selected shows its closeout with the other two
   * folded beneath.
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
      page.getByText(`Waiting on you: ${LOOPING.exhausted}`),
      `the run's page says ${LOOPING.exhausted} is waiting on you`,
    );
    const decide = page.locator('section[aria-label="Decide"]');
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
      decide.locator('[data-command="once more"] code', { hasText: `nemia round ${LOOPING.id} ${LOOPING.exhausted}` }),
      `once more: the wf round that takes ${LOOPING.exhausted}'s loop round again, as a line`,
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
      node(LOOPING.exhausted).locator(`[data-state="exhausted"][title^="rounds exhausted: "][title$="${LOOPING.notes.review}"]`, {
        hasText: 'rounds exhausted',
      }),
      `${LOOPING.exhausted}, out of rounds, is a chip that waits on a person on the graph, its note after what that means on hover, with no room under a chip`,
    );
    await expectVisible(
      node(LOOPING.exhausted).getByText('human gate'),
      `${LOOPING.exhausted}, out of rounds, is drawn as a human gate, as a step signed off blocked is`,
    );
    await expectVisible(
      node(LOOPING.exhausted).getByText('waiting on you'),
      `${LOOPING.exhausted}, out of rounds, says it is waiting on you on the graph`,
    );
    await expectCount(node('implement').getByText('waiting on you'), 0, 'implement, done on its own word, is not a human gate');
    await expectVisible(
      node('implement').locator(`[data-state="unverified"][title$="${LOOPING.notes.implement}"]`),
      `implement's chip on the graph ends its title with the round it is on (${LOOPING.notes.implement})`,
    );
    for (const name of LOOPING.steps) {
      const section = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name, exact: true }) });
      await expectVisible(
        section.locator('[data-note]', { hasText: LOOPING.notes[name] }),
        `the run's page shows ${name}'s note under its chip, where there is room (${LOOPING.notes[name]})`,
      );
    }
    const timeline = page.locator('section[aria-label="Timeline"]');
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
    await expectVisible(
      inspector.getByRole('tab', { name: 'Output', selected: true }),
      `${LOOPING.exhausted}'s inspector opens on Output: it has signed off`,
    );
    await inspector.getByRole('tab', { name: 'Details' }).click();
    await expectVisible(inspector.locator('[data-state="exhausted"]'), `the step inspector opens on a click on ${LOOPING.exhausted}`);
    await expectVisible(
      inspector.locator('[data-note]', { hasText: LOOPING.notes.review }),
      `the inspector's Details show ${LOOPING.exhausted}'s note under its chip`,
    );
    await settled(page);
    await expectInside(graph.locator('.react-flow__node'), graph.locator('.react-flow'), 'every step is on the canvas under the open bar');

    await node(LOOPING.target).click();
    const target = stepBar(page, LOOPING.id, LOOPING.target);
    const rows = target.locator('section[aria-label="Rounds"] li[data-try]');
    await expectCount(
      rows,
      3,
      `${LOOPING.target}'s Details, the tab kept from ${LOOPING.exhausted}'s inspector, list its three rounds, a row each`,
    );
    for (const [i, label] of ['round 1 · try 1', 'round 2 · try 2 (round)', 'round 3 · try 3 (round)'].entries()) {
      await expectVisible(rows.nth(i).getByText(label), `row ${i + 1} is ${label}`);
      await expectVisible(rows.nth(i).getByText(`${LOOPING.id}-implement-${i + 1}`, { exact: true }), `row ${i + 1} names its own task`);
    }
    await expectVisible(target.locator('li[data-try="3"][aria-current="true"]'), 'the current round is the one selected');
    await target.getByRole('button', { name: 'Show the closeout of round 2 · try 2 (round)' }).click();
    await expectVisible(target.locator('[data-shown-try="2"]'), 'selecting round 2 opens its closeout in the Output tab');
    await expectVisible(
      target.getByText(LOOPING.earlier[1].implement, { exact: true }),
      `round 2's summary (${LOOPING.earlier[1].implement})`,
    );
    await expectVisible(target.locator('li[data-answer]', { hasText: LOOPING.replied }), `round 2's reply, as finding → answer · why`);
    await expectCount(
      target.locator('section[aria-label="Other tries"] details:not([open])'),
      2,
      'the other two rounds are folded beneath it',
    );
    await settled(page);
  },
} satisfies PageSpec;
