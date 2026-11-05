import path from 'node:path';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, settled } from '../checks.ts';
import { ROUTED, seedRouted } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * A routed run's page, the run written by the page and taken back (`seedRouted`): its condition drawn as one, its routes listed with the
   * one it took marked and the one it ends on said; the route edges it did not take thin and faint, the one it took drawn whole; the node
   * it passed by reading `skipped`, sunk into the floor; and its workflow node reading `sent`, linked to the card it filed. Then its
   * workflow, a folder of yours written beside it: the condition and the workflow node drawn as such, its route edges labelled. It ends
   * back on the Workflows page, the run and the folder taken back, which the runner's own picture shows.
   */
  name: 'run-routed',
  route: '/workflows',
  expect: async (page) => {
    const back = seedRouted(store!);
    try {
      await page.goto(new URL(`/runs/${ROUTED.id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
      const node = (name: string) => graph.locator(`.react-flow__node[data-id="${name}"]`);
      await expectCount(
        graph.locator('.react-flow__node'),
        6,
        'the routed run has a node per step, its condition and workflow node among them',
      );
      await expectVisible(node(ROUTED.condition).locator('[data-node-kind="condition"]'), `${ROUTED.condition} is drawn as a condition`);
      await expectVisible(
        node(ROUTED.condition).locator(`[data-route="${ROUTED.taken}"][data-taken]`),
        `${ROUTED.condition} marks the route it took, ${ROUTED.taken}`,
      );
      await expectVisible(
        node(ROUTED.condition).locator(`[data-route="${ROUTED.ends[0]}"]`, { hasText: '(ends)' }),
        `and says the run ends on ${ROUTED.ends[0]}`,
      );
      await expectVisible(node(ROUTED.skipped).locator('[data-skipped]'), `${ROUTED.skipped}'s node is drawn passed by`);
      await expectVisible(
        node(ROUTED.skipped).locator('[data-state="skipped"]', { hasText: 'skipped' }),
        `${ROUTED.skipped} reads skipped`,
      );
      await expectVisible(
        node(ROUTED.workflowNode).locator('[data-node-kind="workflow"]', { hasText: `files a card for ${ROUTED.workflow}` }),
        `${ROUTED.workflowNode} is drawn as a workflow node naming ${ROUTED.workflow}`,
      );
      await expectVisible(
        node(ROUTED.workflowNode).locator('[data-state="sent"]', { hasText: 'sent' }),
        `${ROUTED.workflowNode} reads sent`,
      );
      await expectVisible(
        node(ROUTED.workflowNode).locator(`[data-sent] a[href="/inbox/${ROUTED.card}"]`, { hasText: ROUTED.card }),
        `${ROUTED.workflowNode} links to the card it filed, ${ROUTED.card}`,
      );
      await expectCount(
        graph.locator('.react-flow__edge path[data-untaken]'),
        1,
        `the one route edge not taken, into ${ROUTED.skipped}, is drawn faint`,
      );
      await settled(page);
      await photograph(graph, path.join(OUT, `run-routed-graph-${await themeOf(page)}.png`));
      await photograph(page, path.join(OUT, `run-routed-page-${await themeOf(page)}.png`), { fullPage: true });

      await page.goto(new URL(`/workflows/yours/${ROUTED.folder}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const folder = page.locator('.react-flow__node');
      await expectVisible(
        page.locator(`.react-flow__node[data-id="${ROUTED.condition}"] [data-node-kind="condition"]`),
        `the workflow draws ${ROUTED.condition} as a condition`,
      );
      await expectVisible(
        page.locator(`.react-flow__node[data-id="${ROUTED.condition}"] [data-route="${ROUTED.ends[0]}"]`, { hasText: '(ends)' }),
        `with the route it ends on, ${ROUTED.ends[0]}, said`,
      );
      await expectVisible(
        page.locator(`.react-flow__node[data-id="${ROUTED.workflowNode}"] [data-node-kind="workflow"]`, {
          hasText: `files a card for ${ROUTED.workflow}`,
        }),
        `and ${ROUTED.workflowNode} as a workflow node naming ${ROUTED.workflow}`,
      );
      await expectCount(folder, 6, 'a node per step of the workflow');
      await expectVisible(page.locator('.react-flow__edge-text', { hasText: 'backend' }), 'a route edge is labelled with its route');
      await settled(page);
      await photograph(page, path.join(OUT, `run-routed-workflow-${await themeOf(page)}.png`), { fullPage: true });
    } finally {
      back();
    }
    await page.goto(new URL('/workflows', page.url()).href, { waitUntil: 'load' });
    await idle(page);
  },
} satisfies PageSpec;
