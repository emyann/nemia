import fs from 'node:fs';
import path from 'node:path';
import type { Locator } from 'playwright';
import { cancelledAt, nextVisit, photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectInside, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { DIAMOND, DIAMOND_RUNS, FAKE, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * The Workflows page: a card per workflow, the checkout's and yours, each with its graph, and a folder the loader refuses with its
   * refusal. The start form enables Start once there is a brief, and offers to wait on every run on its repository, each by where it
   * stands: a run waiting on a run called off has filed nothing, and never will without you, so it is not finished. Start is not pressed
   * here, as a run started would be on every page visited after this one; in a page of its own, whose one refusal is the point, a start
   * that waits on a run called off is refused in `afterRefusal`'s words beside the form, and nothing is written. Each step's page opens
   * from a link under the graph, in the order a run runs them, and from a double click on its block on the graph.
   */
  name: 'workflows',
  route: '/workflows',
  expect: async (page) => {
    await sidebar(page);
    await expectVisible(
      page.locator('[data-sidebar="sidebar"] a[data-active="true"]', { hasText: 'Workflows' }),
      'the sidebar lights Workflows on its page',
    );
    const { good, broken, yours } = WORKFLOWS;
    const card = (name: string) => page.locator(`section[aria-label="Workflow ${name}"]`);
    await expectCount(page.locator('section[aria-label^="Workflow "]'), 3, "a card per workflow: the checkout's two, and yours");

    const dev = card(good.name);
    await expectVisible(dev.getByText(good.description, { exact: true }), `${good.name} with its README's first paragraph`);
    await expectVisible(dev.getByText('this repository', { exact: true }), `${good.name} is marked as the repository's`);
    const graph = dev.locator('.react-flow');
    const node = (name: string) => graph.locator(`.react-flow__node[data-id="${name}"]`);
    await expectCount(
      graph.locator('.react-flow__node'),
      good.steps.length,
      `${good.name}'s graph has a node per step (${good.steps.join(', ')})`,
    );
    await expectVisible(
      node('implement').getByText(good.agent.runsOn, { exact: true }),
      `implement's node names its agent first, then what it runs on (${good.agent.runsOn})`,
    );
    await expectVisible(
      node('review').getByText(good.runsOn, { exact: true }),
      `review's node, with no agent, says what it runs on (${good.runsOn})`,
    );
    await expectVisible(node('implement').getByText(good.check, { exact: true }), `implement's node shows its check (${good.check})`);
    const tools = good.tools.split(', ').length;
    await expectVisible(
      node('review').locator(`dd[title="${good.tools}"]`, { hasText: new RegExp(`^${tools}$`) }),
      `review's node counts its ${tools} tools and names them on hover (${good.tools})`,
    );
    await expectVisible(node('review').getByText(good.loop, { exact: true }), `review's node shows its loop and its rounds (${good.loop})`);
    await expectVisible(
      node('review').locator('dd', { hasText: new RegExp(`^${good.effort}$`) }),
      `review's node says the effort it runs at (${good.effort})`,
    );
    await expectVisible(
      node('review').locator('dd', { hasText: new RegExp(`^${good.context}$`) }),
      `review's node says its context window (${good.context})`,
    );
    await expectCount(
      node('implement').locator('dt', { hasText: /^context$/ }),
      0,
      'implement sets no window: its node has no line for one',
    );
    await expectCount(
      node('implement').getByText("harness's own", { exact: true }),
      2,
      "implement sets neither effort nor tools: its node says both are its harness's own",
    );
    await expectCount(
      graph.locator('.react-flow__node [data-state]'),
      0,
      "a step no run has started has no status chip, counted inside the nodes: an edge's path carries data-state too",
    );
    await expectCount(graph.getByText(/no attempt yet|^#\d/), 0, 'nor an attempt');
    await expectCount(graph.locator('.react-flow__edge'), 2, "the graph's two edges: implement → review, and the edge back");
    await expectVisible(
      graph.locator('.react-flow__edge[data-id="loop:review->implement"] .react-flow__edge-path'),
      "the edge back that review's loop makes",
    );
    await settled(page);
    await expectInside(graph.locator('.react-flow__node'), graph, "every step is inside its card's graph");

    const brief = dev.getByRole('textbox', { name: 'Start a run' });
    const start = dev.getByRole('button', { name: 'Start' });
    await expectVisible(brief, `${good.name} has a box for the brief`);
    await expectVisible(start, `${good.name} has a Start button`);
    if (await start.isEnabled()) throw new Refused('Start is disabled while there is no brief — it was enabled with none');
    await brief.fill('Give the board a legend');
    if (!(await start.isEnabled())) throw new Refused('Start is enabled once a brief is written — it stayed disabled');

    const offered = dev.locator('ul[aria-label="Runs to wait on"] li');
    await expectCount(offered, DIAMOND_RUNS.length, `the start form offers the ${DIAMOND_RUNS.length} runs on this repository to wait on`);
    for (const run of DIAMOND_RUNS)
      await expectVisible(
        offered.filter({ hasText: run.title }).locator(`input[type="checkbox"][value="${run.id}"]`),
        `${run.id} is offered, by its title`,
      );
    await expectCount(dev.locator(`[data-run="${FAKE.id}"]`), 0, `${FAKE.id}, on another repository, is not offered`);
    for (const [run, standing] of [
      [DIAMOND.orphan, 'waiting on you'],
      [DIAMOND.cancelled, 'cancelled'],
      [DIAMOND.bottom, 'in flight'],
      [DIAMOND.running, 'in flight'],
      [DIAMOND.top, 'finished'],
    ] as const) {
      await expectVisible(
        offered.filter({ hasText: run.title }).locator('[data-standing]', { hasText: new RegExp(`^${standing}$`) }),
        `the picker says ${run.id} is ${standing}`,
      );
    }

    const runsDir = path.join(store!, 'runs');
    const before = fs.readdirSync(runsDir).sort();
    const refused = await page.context().newPage();
    try {
      const { problems } = watch(refused);
      await refused.goto(page.url(), { waitUntil: 'load' });
      await idle(refused);
      const form = refused.locator(`section[aria-label="Workflow ${good.name}"]`);
      await form.getByRole('textbox', { name: 'Start a run' }).fill('Wait on a run that was called off');
      const pick = form.locator(`input[type="checkbox"][value="${DIAMOND.cancelled.id}"]`);
      await expectVisible(pick, `${DIAMOND.cancelled.id} is offered to wait on`);
      await pick.check();
      const [answered] = await Promise.all([
        refused.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', { timeout: WAIT_MS }),
        form.getByRole('button', { name: 'Start' }).click(),
      ]);
      const { error } = (await answered.json()) as { error?: string };
      const sentence = `--after ${DIAMOND.cancelled.id}: ${DIAMOND.cancelled.id} was cancelled at ${cancelledAt()}, and a cancelled run never ships, so this run would wait for ever. Start it without --after ${DIAMOND.cancelled.id}.`;
      if (answered.status() !== 422 || error !== sentence) {
        throw new Refused(
          `the api refuses to wait on a run called off, in afterRefusal's words — it answered ${answered.status()}: ${JSON.stringify(error)}`,
        );
      }
      await expectVisible(form.locator('[data-refused]'), 'the refusal is shown beside the form, not swallowed');
      const shown = await form.locator('[data-refused] p.font-mono').textContent();
      if (shown !== error)
        throw new Refused(
          `the refusal beside the form is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`,
        );
      const after = fs.readdirSync(runsDir).sort();
      if (JSON.stringify(after) !== JSON.stringify(before))
        throw new Refused(`nothing is written on a refusal — ${runsDir} went from ${before.length} files to ${after.length}`);
      await settled(refused);
      await photograph(refused, path.join(OUT, `start-refused-${await themeOf(refused)}.png`), { fullPage: true });
      await idle(refused);
      const expected = `request answered 422: POST ${answered.url()}`;
      const seen = problems();
      const others = seen.filter(
        (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 422\b/.test(p),
      );
      if (!seen.includes(expected) || others.length)
        throw new Refused(
          `the refused page saw its one refusal as the browser reports it (its answer, and the line Chromium writes to the console for one) and nothing else — it saw:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await refused.close();
    }

    const bad = card(broken.name);
    await expectVisible(bad.getByText(broken.error), `a folder the loader refuses shows the refusal (${broken.error})`);
    await expectCount(bad.getByRole('button', { name: 'Start' }), 0, 'a folder the loader refuses cannot start');
    await expectCount(bad.locator('textarea, .react-flow'), 0, 'and has no brief box and no graph');

    const mine = card(yours.name);
    await expectVisible(mine.getByText('yours', { exact: true }), `${yours.name}, under workflows/ in the store, is marked as yours`);
    await expectCount(mine.locator('.react-flow__node'), yours.steps.length, `${yours.name}'s graph has its one step`);

    const links = (card: Locator, name: string) => card.getByRole('navigation', { name: `Steps of ${name}` }).getByRole('link');
    await expectTexts(links(dev, good.name), good.steps, `under ${good.name}'s graph, a link to each step's page, in the order they run`);
    await expectTexts(links(mine, yours.name), yours.steps, `and under ${yours.name}'s`);
    for (const step of good.steps) {
      const href = await links(dev, good.name).filter({ hasText: step }).getAttribute('href');
      if (href !== `/workflows/repo/${good.name}/${step}`)
        throw new Refused(`${step}'s link opens its page, /workflows/repo/${good.name}/${step} — it goes to ${href}`);
    }
    await nextVisit(page, async (again) => {
      await links(again.locator(`section[aria-label="Workflow ${good.name}"]`), good.name)
        .filter({ hasText: 'review' })
        .click();
      await again.waitForURL(`**/workflows/repo/${good.name}/review`, { timeout: WAIT_MS });
      await expectVisible(again.locator('h1', { hasText: /^review$/ }), "a step's link opens the step's page");
      await again.goBack({ waitUntil: 'load' });
      await idle(again);
      const block = again.locator(`section[aria-label="Workflow ${good.name}"] .react-flow__node[data-id="implement"]`);
      await expectVisible(block, 'back on the Workflows page, the graph');
      await block.dblclick();
      await again.waitForURL(`**/workflows/repo/${good.name}/implement`, { timeout: WAIT_MS });
      await expectVisible(again.locator('h1', { hasText: /^implement$/ }), "a double click on a block on the graph opens its step's page");
    });
  },
} satisfies PageSpec;
