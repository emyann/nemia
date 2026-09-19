import { sidebar } from '../board.ts';
import { expectBeneath, expectCount, expectInside, expectVisible, settled } from '../checks.ts';
import { LOOPING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

export default {
  name: 'loop',
  route: `/runs/${LOOPING.id}`,
  expect: async (page) => {
    await sidebar(page);
    // The folder beside the record reads as the loop the run froze: nothing has drifted, and nothing is unread.
    await expectCount(page.getByText(/no longer reads as a workflow|has changed since this run started/), 0, 'no warning about the workflow folder');
    await expectVisible(page.getByText(`Waiting on you: ${LOOPING.exhausted}`), `the run's page says ${LOOPING.exhausted} is waiting on you`);
    // Its record names a repository that is not on this machine: a branch git could not read, said, and the page renders.
    const decide = page.locator('section[aria-label="Decide"]');
    await expectVisible(decide.getByText(/^not read: git could not diff /).first(), `the Decide section says ${LOOPING.id}'s branch could not be read`);
    await expectVisible(decide.locator('[data-lesson="unknown"]'), 'the lesson chip says nobody can know, not that nothing was written');
    await expectVisible(
      decide.locator('[data-command="once more"] code', { hasText: `wf round ${LOOPING.id} ${LOOPING.exhausted}` }),
      `once more: the wf round that takes ${LOOPING.exhausted}'s loop round again, as a line`,
    );
    const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
    const node = (name: string) => graph.locator(`.react-flow__node[data-id="${name}"]`);
    await expectCount(graph.locator('.react-flow__node'), LOOPING.steps.length, `the loop's graph has a node per step (${LOOPING.steps.join(', ')})`);
    // The graph the run froze: an arrow from implement to review, and the edge back that `loop: implement` makes, under the row.
    const edge = (id: string) => graph.locator(`.react-flow__edge[data-id="${id}"]`);
    await expectCount(graph.locator('.react-flow__edge'), 2, "the loop's graph has two edges: implement → review, and the edge back");
    await expectVisible(edge('implement->review').locator('.react-flow__edge-path'), 'an arrow from implement to review');
    const back = edge(`loop:${LOOPING.exhausted}->${LOOPING.target}`);
    await expectVisible(back.locator('.react-flow__edge-path'), `the edge back from ${LOOPING.exhausted} to ${LOOPING.target}, drawn as a loop`);
    await expectVisible(back.getByText(LOOPING.round, { exact: true }), `the edge back says the round the loop is on (${LOOPING.round})`);
    await expectCount(graph.locator('.react-flow__edge animateMotion'), 0, 'out of rounds, nothing of the loop moves: no dot on either edge');
    await settled(page);
    await expectBeneath(back.locator('.react-flow__edge-path'), graph.locator('.react-flow__node'), 'the edge back runs beneath the row, under both steps');
    // On the canvas there is no room under a chip: the note follows what the state means, on hover.
    await expectVisible(
      node(LOOPING.exhausted).locator(`[data-state="exhausted"][title^="rounds exhausted: "][title$="${LOOPING.notes.review}"]`, { hasText: 'rounds exhausted' }),
      `${LOOPING.exhausted}, out of rounds, is an amber chip on the graph, its note after what that means on hover`,
    );
    // Waiting on a person, as a step signed off blocked is: drawn as a human gate. implement, done, is not one.
    await expectVisible(node(LOOPING.exhausted).getByText('human gate'), `${LOOPING.exhausted}, out of rounds, is drawn as a human gate`);
    await expectVisible(node(LOOPING.exhausted).getByText('waiting on you'), `${LOOPING.exhausted}, out of rounds, says it is waiting on you on the graph`);
    await expectCount(node('implement').getByText('waiting on you'), 0, 'implement, done on its own word, is not a human gate');
    await expectVisible(
      node('implement').locator(`[data-state="unverified"][title$="${LOOPING.notes.implement}"]`),
      `implement's chip on the graph ends its title with the round it is on (${LOOPING.notes.implement})`,
    );
    // Under the chip on the run's page, where there is room. Before a click: the inspector has a heading of its own.
    for (const name of LOOPING.steps) {
      const section = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name, exact: true }) });
      await expectVisible(section.locator('[data-note]', { hasText: LOOPING.notes[name] }), `the run's page shows ${name}'s note under its chip (${LOOPING.notes[name]})`);
    }
    // The timeline, from the tries on the record: a row for each step's try in each of the three rounds, and a total a round, then the run's.
    const timeline = page.locator('section[aria-label="Timeline"]');
    for (const name of LOOPING.steps) {
      await expectCount(timeline.locator(`tr[data-step="${name}"][data-task="session"]`), 3, `${name} has a row on the timeline for each of its three rounds`);
    }
    await expectVisible(timeline.locator('tr[data-step="implement"] td', { hasText: /^try 3 · round 3$/ }), "implement's third try is round 3's");
    await expectCount(timeline.locator('tfoot tr[data-total]'), 4, "a total for each of the loop's three rounds, and the run's");
    await node(LOOPING.exhausted).click();
    const inspector = page.locator(`aside[aria-label="Step ${LOOPING.exhausted}"]`);
    await expectVisible(inspector.locator('[data-state="exhausted"]'), `the step inspector opens on a click on ${LOOPING.exhausted}`);
    await expectVisible(inspector.locator('[data-note]', { hasText: LOOPING.notes.review }), `the inspector's Details show ${LOOPING.exhausted}'s note under its chip`);
    await settled(page);
    await expectInside(graph.locator('.react-flow__node'), graph.locator('.react-flow'), 'every step is on the canvas beside the open inspector');

    // implement, the loop's target, ran a try in each of three rounds, each a task of its own: a row a round in its Details.
    await node(LOOPING.target).click();
    const target = page.locator(`aside[aria-label="Step ${LOOPING.target}"]`);
    const rows = target.locator('section[aria-label="Rounds"] li[data-try]');
    await expectCount(rows, 3, `${LOOPING.target}'s Details list its three rounds, a row each`);
    for (const [i, label] of ['round 1 · try 1', 'round 2 · try 2 (round)', 'round 3 · try 3 (round)'].entries()) {
      await expectVisible(rows.nth(i).getByText(label), `row ${i + 1} is ${label}`);
      await expectVisible(rows.nth(i).getByText(`${LOOPING.id}-implement-${i + 1}`, { exact: true }), `row ${i + 1} names its own task`);
    }
    await expectVisible(target.locator('li[data-try="3"][aria-current="true"]'), 'the current round is the one selected');
    // Round 2 selected: the Output tab shows its closeout, its reply as `finding → answer · why`, and the other two rounds folded beneath.
    await target.getByRole('button', { name: 'Show the closeout of round 2 · try 2 (round)' }).click();
    await expectVisible(target.locator('[data-shown-try="2"]'), "selecting round 2 opens its closeout in the Output tab");
    await expectVisible(target.getByText(LOOPING.earlier[1].implement, { exact: true }), `round 2's summary (${LOOPING.earlier[1].implement})`);
    await expectVisible(target.locator('li[data-answer]', { hasText: LOOPING.replied }), `round 2's reply, as finding → answer · why`);
    await expectCount(target.locator('section[aria-label="Other tries"] details:not([open])'), 2, 'the other two rounds are folded beneath it');
    await settled(page);
  },
} satisfies PageSpec;
