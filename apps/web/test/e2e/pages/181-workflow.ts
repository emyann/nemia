import fs from 'node:fs';
import path from 'node:path';
import { cancelledAt, nextVisit, photograph, themeOf } from '../board.ts';
import { expectCount, expectInside, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { DIAMOND, DIAMOND_RUNS, FACTORIES, FAKE, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The agent the page writes into the checkout's `workflows/agents/` for FACTORIES' `hiring` to hire into `dev`'s `review`. */
const REVIEWER = 'reviewer-e2e';

export default {
  /**
   * A workflow's page, the checkout's `dev`: its README whole, the workflow level's instruction; its graph; its steps a row each, in the
   * order a run runs them — its own words, its agent linked, its skills, a link to its page — and a start. The start form enables Start
   * once there is a brief, and offers to wait on every run on its repository, each by where it stands: a run waiting on a run called off
   * has filed nothing, and never will without you, so it is not finished. Start is not pressed here, as a run started would be on every
   * page visited after this one; in a page of its own, whose one refusal is the point, a start that waits on a run called off is refused
   * in `afterRefusal`'s words beside the form, and nothing is written: naming no factory, it is made in FACTORIES' `hiring`, the one that
   * holds the checkout, hiring for it the agents that let `dev` start, taken back after. Each step's page opens from its row, and from a
   * double click on its block on the graph. The repository's has no Build nor Remove, and says why; a folder the loader refuses shows its
   * refusal and its README, with no graph and no start; and one of yours has Build and Remove.
   */
  name: 'workflow',
  route: `/workflows/repo/${WORKFLOWS.good.name}`,
  expect: async (page) => {
    const { good, broken, yours } = WORKFLOWS;
    await expectVisible(page.locator('h1', { hasText: new RegExp(`^${good.name}$`) }), `the page is ${good.name}'s`);
    await expectVisible(page.getByText('this repository', { exact: true }), `${good.name} is marked as the repository's`);
    const readme = page.getByRole('region', { name: 'README' });
    await expectVisible(readme.getByText(good.description, { exact: true }), 'the README, its first paragraph');
    await expectVisible(readme.getByText(good.more, { exact: true }), 'and the rest of it: the README whole');
    await expectVisible(
      page.locator('[data-no-builder]', { hasText: 'No builder: the board writes only yours, and nothing into this checkout.' }),
      "the repository's says why it has no builder",
    );
    await expectCount(page.getByRole('button', { name: /^(Build|Remove…)$/ }), 0, 'and has neither Build nor Remove');

    const rows = page.getByRole('list', { name: `Steps of ${good.name}` });
    const row = (step: string) => rows.locator(`[data-step-row="${step}"]`);
    await expectTexts(rows.locator('[data-step-row] > div > a'), good.steps, 'a row per step, in the order they run');
    for (const step of good.steps) {
      const href = await row(step).getByRole('link', { name: step, exact: true }).getAttribute('href');
      if (href !== `/workflows/repo/${good.name}/${step}`)
        throw new Refused(`${step}'s row links its page, /workflows/repo/${good.name}/${step} — it goes to ${href}`);
    }
    await expectVisible(row('implement').locator(`a[data-agent-link="${good.agent.name}"]`), "implement's row links its agent");
    await expectVisible(row('implement').getByText('Implement what was asked.', { exact: true }), 'and says its own words');
    await expectVisible(row('implement').locator(`[data-skill="${good.agent.skill.id}"]`), "and its agent's skill");
    await expectVisible(row('review').getByText('No agent', { exact: false }), 'review, with no agent, says so');
    await expectVisible(row('review').getByRole('heading', { name: good.review.heading }), 'and its words are drawn as markdown');

    const dev = page.locator(`article[aria-label="Workflow ${good.name}"]`);
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
    await expectCount(graph.getByText(/no session yet|^#\d/), 0, 'nor a session');
    await expectCount(graph.locator('.react-flow__edge'), 2, "the graph's two edges: implement → review, and the edge back");
    await expectVisible(
      graph.locator('.react-flow__edge[data-id="loop:review->implement"] .react-flow__edge-path'),
      "the edge back that review's loop makes",
    );
    await settled(page);
    await expectInside(graph.locator('.react-flow__node'), graph, "every step is inside the page's graph");

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
    await expectCount(
      dev.locator(`ul[aria-label="Runs to wait on"] [data-run="${FAKE.id}"]`),
      0,
      `${FAKE.id}, on another repository, is not offered`,
    );
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
    const factoryFile = path.join(store!, 'factories', `${FACTORIES.hiring.name}.json`);
    const factoryText = fs.readFileSync(factoryFile, 'utf8');
    const reviewerFile = path.join(store!, 'checkout', 'workflows', 'agents', `${REVIEWER}.md`);
    const refused = await page.context().newPage();
    try {
      fs.writeFileSync(reviewerFile, '---\ndescription: Use this when a change needs reviewing.\n---\nYou review the change.\n');
      fs.writeFileSync(
        factoryFile,
        JSON.stringify({ ...(JSON.parse(factoryText) as object), hires: { [`${good.name}/review`]: REVIEWER } }, null, 2),
      );
      const { problems } = watch(refused);
      await refused.goto(page.url(), { waitUntil: 'load' });
      await idle(refused);
      const form = refused.locator('article');
      await form.getByRole('textbox', { name: 'Start a run' }).fill('Wait on a run that was called off');
      const pick = form.locator(`ul[aria-label="Runs to wait on"] input[type="checkbox"][value="${DIAMOND.cancelled.id}"]`);
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
      fs.rmSync(reviewerFile, { force: true });
      fs.writeFileSync(factoryFile, factoryText);
    }

    await nextVisit(page, async (again) => {
      await again
        .getByRole('list', { name: `Steps of ${good.name}` })
        .getByRole('link', { name: 'review', exact: true })
        .click();
      await again.waitForURL(`**/workflows/repo/${good.name}/review`, { timeout: WAIT_MS });
      await expectVisible(again.locator('h1', { hasText: /^review$/ }), "a step's row opens the step's page");
      await again.getByRole('link', { name: `← ${good.name}` }).click();
      await again.waitForURL((url) => url.pathname === `/workflows/repo/${good.name}`, { timeout: WAIT_MS });
      await idle(again);
      const block = again.locator('.react-flow__node[data-id="implement"]');
      await expectVisible(block, "the step's page leads back to its workflow's, and its graph");
      await block.dblclick();
      await again.waitForURL(`**/workflows/repo/${good.name}/implement`, { timeout: WAIT_MS });
      await expectVisible(again.locator('h1', { hasText: /^implement$/ }), "a double click on a block on the graph opens its step's page");
      await again.goBack({ waitUntil: 'load' });
      await again.waitForURL((url) => url.pathname === `/workflows/repo/${good.name}`, { timeout: WAIT_MS });
      await idle(again);
    });

    await nextVisit(page, async (again) => {
      await again.goto(new URL(`/workflows/repo/${broken.name}`, again.url()).href, { waitUntil: 'load' });
      await idle(again);
      await expectVisible(again.getByText(broken.error), `a folder the loader refuses shows the refusal (${broken.error})`);
      await expectVisible(again.getByRole('region', { name: 'README' }).getByText('A reviewer whose after is misspelt.'), 'and its README');
      const bad = again.locator(`article[aria-label="Workflow ${broken.name}"]`);
      await expectCount(bad.getByRole('button', { name: 'Start', exact: true }), 0, 'it cannot start');
      await expectCount(bad.locator('textarea, .react-flow'), 0, 'and has no brief box and no graph');
      await photograph(again, path.join(OUT, `workflow-refused-${await themeOf(again)}.png`), { fullPage: true });

      await again.goto(new URL(`/workflows/yours/${yours.name}`, again.url()).href, { waitUntil: 'load' });
      await idle(again);
      await expectVisible(
        again.locator('article').getByText('yours', { exact: true }),
        `${yours.name}, under workflows/ in the store, is marked as yours`,
      );
      await expectVisible(again.getByRole('region', { name: 'README' }).getByText('No README'), 'one with no README says so');
      await expectCount(again.locator('.react-flow__node'), yours.steps.length, `${yours.name}'s graph has its one step`);
      await expectVisible(again.getByRole('button', { name: 'Build' }), 'one of yours has Build');
      await expectVisible(again.getByRole('button', { name: 'Remove…' }), 'and Remove');
      await expectCount(again.locator('[data-no-builder]'), 0, 'and no word of having no builder');
      await photograph(again, path.join(OUT, `workflow-yours-${await themeOf(again)}.png`), { fullPage: true });
      await again.setViewportSize({ width: 390, height: 844 });
      await again.goto(new URL(`/workflows/repo/${good.name}`, again.url()).href, { waitUntil: 'load' });
      await idle(again);
      await settled(again);
      await photograph(again, path.join(OUT, `workflow-phone-${await themeOf(again)}.png`), { fullPage: true });
    });
  },
} satisfies PageSpec;
