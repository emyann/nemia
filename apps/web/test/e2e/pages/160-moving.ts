import { sidebar } from '../board.ts';
import { expectCount, settled } from '../checks.ts';
import { NEIGHBOUR } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

export default {
  name: 'moving',
  route: `/runs/${NEIGHBOUR.id}`,
  expect: async (page) => {
    await sidebar(page);
    const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
    await expectCount(graph.locator('.react-flow__node'), NEIGHBOUR.steps.length, `the run's graph has a node per step (${NEIGHBOUR.steps.join(', ')})`);
    const edge = (id: string) => graph.locator(`.react-flow__edge[data-id="${id}"]`);
    const running = edge(NEIGHBOUR.running);
    // Counted, not seen: a straight edge's path has no height, which Playwright takes for hidden.
    await expectCount(running.locator('.react-flow__edge-path[data-state="running"]'), 1, `the edge ${NEIGHBOUR.running} runs: draft's session is at work`);
    await expectCount(running.locator('animateMotion'), 1, `a dot travels ${NEIGHBOUR.running}`);
    await expectCount(edge(NEIGHBOUR.still).locator('.react-flow__edge-path[data-state="to-come"]'), 1, `${NEIGHBOUR.still} is to come: ship will not be filed`);
    await expectCount(graph.locator('.react-flow__edge animateMotion'), 1, 'and no other edge moves');
    const legend = graph.locator('.react-flow__panel[aria-label="Legend"]');
    await expectCount(legend.locator('animateMotion'), 1, "the legend's running sample moves as the running edge does");

    // A person who asks for reduced motion, with the page open: nothing travels, and the running edge is still drawn running.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectCount(graph.locator('animateMotion'), 0, 'with reduced motion asked for, no dot travels — on an edge or in the legend');
    await expectCount(running.locator('.react-flow__edge-path[data-state="running"][marker-end]'), 1, 'the running edge keeps its colour and its arrow');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expectCount(running.locator('animateMotion'), 1, 'the dot travels again once the person no longer asks, without a reload');
    await settled(page);
  },
} satisfies PageSpec;
