/**
 * `npm run e2e`: the web app, built, served against a seeded store, and looked at in a browser.
 *
 *  1. Builds the web app.
 *  2. Seeds a store in a temporary WF_ROOT with six fake runs, the first with a real repository and branch to decide
 *     on, and beside it a checkout for the api to serve (`HKB_REPO`) on the Capabilities page, and workflows in both for
 *     the Workflows page (seed.ts).
 *  3. Starts the api on a free port (`PORT=0`, reading the port it prints) and `vite preview` on another,
 *     proxying `/api` to it (`HKB_API_URL`, vite.config.ts): the same two processes and the same proxy
 *     as `npm run dev`, never on :8787 or :5173, so it runs beside a person's dev servers and beside
 *     another worktree's e2e.
 *  4. Visits every page in PAGES in headless Chromium, in a light and a dark theme: no console error, no
 *     failed request, the page in the theme asked for, and the elements the page must have.
 *  5. Screenshots each page in each theme into $WF_ARTIFACTS when a run gives one — the step's files
 *     directory — and into `.e2e/` at the repository root otherwise.
 *
 * Exits non-zero on the first failure, naming the page, the theme and the assertion, with a screenshot
 * of what the page looked like. Both servers are stopped on the way out: on success, on failure, and on a
 * signal. The assertions are made to refuse in checks.test.ts, and the visiting and the exit (visit.ts) in
 * visit.test.ts, both of which `npm run e2e` runs first.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Locator, Page, Response } from 'playwright';
import { cancelledAt, expectKeys, expectRendered, expectSource, filesIn, nextVisit, PLACES_SAID, sidebar, themeOf } from './board.ts';
import { drawEdge } from './canvas.ts';
import { expectCount, expectInside, expectTexts, expectVisible, Refused, settled, WAIT_MS, watch } from './checks.ts';
import factory from './pages/010-factory.ts';
import factoryGate from './pages/020-factory-gate.ts';
import quota from './pages/030-quota.ts';
import factoryGateLongNames from './pages/040-factory-gate-long-names.ts';
import runs from './pages/050-runs.ts';
import run from './pages/060-run.ts';
import answer from './pages/070-answer.ts';
import held from './pages/080-held.ts';
import gate from './pages/090-gate.ts';
import decide from './pages/100-decide.ts';
import shipped from './pages/110-shipped.ts';
import session from './pages/120-session.ts';
import say from './pages/130-say.ts';
import loop from './pages/140-loop.ts';
import cost from './pages/150-cost.ts';
import moving from './pages/160-moving.ts';
import waits from './pages/170-waits.ts';
import { AGENTS, arrivalLine, CARDS, CHECKOUT, DIAMOND, DIAMOND_RUNS, DRAFT_TRANSCRIPT, FAKE, INBOX, QUEUE, QUEUED, queuedCardText, QUOTA, refusedWhy, REGISTRY, SAYING, seed, seedCheckout, seedDiamond, seedFeed, seedInbox, seedQueue, seedQuota, seedWorkflows, WORKFLOWS } from './seed.ts';
import { exitOn, launch, visitAll, type PageSpec } from './visit.ts';
import { API, apiEnv, heard, OUT, setApiEnv, setStore, store, WEB } from './world.ts';

/** How long a server has to say where it listens. */
const START_MS = 30_000;

/** The workflow the `builder` page makes, and what its two steps' agents are told. */
const BUILT = { name: 'built', plan: 'Write PLAN.md.', implement: 'Implement what PLAN.md says.' };

/** The workflow of yours the `builder` page opens a step with an agent on: `build`, whose agent is `agent`, and `other`, the agent it is moved to. */
const CREWED = { name: 'crew', agent: 'coder', other: 'critic' };

/** The schema the `builder` page pastes for an `output:`: strict, as the parser takes one. */
const PASTED = JSON.stringify({ type: 'object', properties: { risks: { type: 'array', items: { type: 'string' } } }, required: ['risks'], additionalProperties: false });

/** A schema pasted for `step`'s `output:` in its form, which is open: written beside the steps by the save, under `<step>.schema.json`. */
async function pasteSchema(builder: Locator, step: string, text: string): Promise<void> {
  const keys = builder.locator(`[data-step-form="${step}"]`);
  await expectVisible(keys, `${step}'s form, to paste a schema in`);
  await keys.locator('[data-field="output"] select').selectOption({ label: 'Paste a schema…' });
  const box = keys.getByRole('textbox', { name: 'The JSON Schema' });
  await expectVisible(box, `${step}'s output offers a box for the schema`);
  await box.fill(text);
  const file = await keys.getByRole('textbox', { name: 'Written on save as' }).inputValue();
  if (file !== `${step}.schema.json`) throw new Refused(`a schema pasted for ${step} is written beside it as ${step}.schema.json — the form says ${file}`);
}

/** A step added on a builder: its name and what it is told. */
async function addStep(builder: Locator, name: string, body: string): Promise<void> {
  await builder.getByRole('button', { name: 'Add a step' }).click();
  const form = builder.getByRole('form', { name: 'Add a step' });
  await form.getByRole('textbox', { name: 'Step name' }).fill(name);
  await form.getByRole('textbox', { name: 'What it is told' }).fill(body);
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await expectVisible(builder.locator(`.react-flow__node[data-id="${name}"]`), `the step added, ${name}, is a block on the canvas`);
}

/** A card on the Inbox page, by its name. */
const cardIn = (page: Page, name: string): Locator => page.locator(`section[aria-label="Cards"] li[data-card="${name}"]`);

/** The idea the `inbox` page files from its box, and takes back with Remove. */
const FILED = 'Give the inbox a keyboard shortcut\n\nN files a card from any page.';
/** The brief the `inbox` page starts CARDS.planned with, in place of its body. */
const STARTED = 'Cache the views between passes\n\nRead each journal once a pass; the api reads the same views.';
/** The run a record says CARDS.bare was started as, on the page that shows a card started already. */
const STARTED_AS = 'show-what-a-step-cost-on-the-e2e0';

/** The pages, and what each must have. A new page gets a line here, or the check never looks at it. */
const PAGES: PageSpec[] = [
  factory,
  factoryGate,
  quota,
  factoryGateLongNames,
  runs,
  run,
  answer,
  held,
  gate,
  decide,
  shipped,
  session,
  say,
  loop,
  cost,
  moving,
  waits,
  {
    name: 'workflows',
    route: '/workflows',
    expect: async (page) => {
      await sidebar(page);
      await expectVisible(page.locator('[data-sidebar="sidebar"] a[data-active="true"]', { hasText: 'Workflows' }), 'the sidebar lights Workflows on its page');
      const { good, broken, yours } = WORKFLOWS;
      const card = (name: string) => page.locator(`section[aria-label="Workflow ${name}"]`);
      await expectCount(page.locator('section[aria-label^="Workflow "]'), 3, "a card per workflow: the checkout's two, and yours");

      const dev = card(good.name);
      await expectVisible(dev.getByText(good.description, { exact: true }), `${good.name} with its README's first paragraph`);
      await expectVisible(dev.getByText('this repository', { exact: true }), `${good.name} is marked as the repository's`);
      const graph = dev.locator('.react-flow');
      const node = (name: string) => graph.locator(`.react-flow__node[data-id="${name}"]`);
      await expectCount(graph.locator('.react-flow__node'), good.steps.length, `${good.name}'s graph has a node per step (${good.steps.join(', ')})`);
      await expectVisible(node('implement').getByText(good.agent.runsOn, { exact: true }), `implement's node names its agent first, then what it runs on (${good.agent.runsOn})`);
      await expectVisible(node('review').getByText(good.runsOn, { exact: true }), `review's node, with no agent, says what it runs on (${good.runsOn})`);
      await expectVisible(node('implement').getByText(good.check, { exact: true }), `implement's node shows its check (${good.check})`);
      const tools = good.tools.split(', ').length;
      await expectVisible(node('review').locator(`dd[title="${good.tools}"]`, { hasText: new RegExp(`^${tools}$`) }), `review's node counts its ${tools} tools and names them on hover (${good.tools})`);
      await expectVisible(node('review').getByText(good.loop, { exact: true }), `review's node shows its loop and its rounds (${good.loop})`);
      // The effort each runs at, and its tools: what it sets, or its harness's own.
      await expectVisible(node('review').locator('dd', { hasText: new RegExp(`^${good.effort}$`) }), `review's node says the effort it runs at (${good.effort})`);
      await expectVisible(node('review').locator('dd', { hasText: new RegExp(`^${good.context}$`) }), `review's node says its context window (${good.context})`);
      await expectCount(node('implement').locator('dt', { hasText: /^context$/ }), 0, 'implement sets no window: its node has no line for one');
      await expectCount(node('implement').getByText("harness's own", { exact: true }), 2, "implement sets neither effort nor tools: its node says both are its harness's own");
      // Chips only: since B5 an edge's path carries `data-state` too, so the count is taken inside the nodes.
      await expectCount(graph.locator('.react-flow__node [data-state]'), 0, 'a step no run has started has no status chip');
      await expectCount(graph.getByText(/no attempt yet|^#\d/), 0, 'nor an attempt');
      await expectCount(graph.locator('.react-flow__edge'), 2, "the graph's two edges: implement → review, and the edge back");
      await expectVisible(graph.locator('.react-flow__edge[data-id="loop:review->implement"] .react-flow__edge-path'), "the edge back that review's loop makes");
      await settled(page);
      await expectInside(graph.locator('.react-flow__node'), graph, "every step is inside its card's graph");

      // Start is not pressed: a run started here would be on every page visited after this one, and a refusal is an answer
      // of 422, which the visit counts against the page. The api's tests start a run of a workflow, and refuse one.
      const brief = dev.getByRole('textbox', { name: 'Start a run' });
      const start = dev.getByRole('button', { name: 'Start' });
      await expectVisible(brief, `${good.name} has a box for the brief`);
      await expectVisible(start, `${good.name} has a Start button`);
      if (await start.isEnabled()) throw new Refused('Start is disabled while there is no brief — it was enabled with none');
      await brief.fill('Give the board a legend');
      if (!(await start.isEnabled())) throw new Refused('Start is enabled once a brief is written — it stayed disabled');

      // After: every run on the repository a start runs in, and none on another.
      const offered = dev.locator('ul[aria-label="Runs to wait on"] li');
      await expectCount(offered, DIAMOND_RUNS.length, `the start form offers the ${DIAMOND_RUNS.length} runs on this repository to wait on`);
      for (const run of DIAMOND_RUNS) await expectVisible(offered.filter({ hasText: run.title }).locator(`input[type="checkbox"][value="${run.id}"]`), `${run.id} is offered, by its title`);
      await expectCount(dev.locator(`[data-run="${FAKE.id}"]`), 0, `${FAKE.id}, on another repository, is not offered`);
      // Each by where it stands: a run waiting on a run called off has filed nothing, and never will without you — not finished.
      for (const [run, standing] of [
        [DIAMOND.orphan, 'waiting on you'], [DIAMOND.cancelled, 'cancelled'], [DIAMOND.bottom, 'in flight'], [DIAMOND.running, 'in flight'], [DIAMOND.top, 'finished'],
      ] as const) {
        await expectVisible(offered.filter({ hasText: run.title }).locator('[data-standing]', { hasText: new RegExp(`^${standing}$`) }), `the picker says ${run.id} is ${standing}`);
      }

      // A start that waits on a run the package will not wait on — one called off — through the board: refused in `afterRefusal`'s words,
      // beside the form, and nothing written. In a page of its own, whose one refusal is the point.
      const runsDir = path.join(store!, 'runs');
      const before = fs.readdirSync(runsDir).sort();
      const refused = await page.context().newPage();
      try {
        const { problems } = watch(refused);
        await refused.goto(page.url(), { waitUntil: 'networkidle' });
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
          throw new Refused(`the api refuses to wait on a run called off, in afterRefusal's words — it answered ${answered.status()}: ${JSON.stringify(error)}`);
        }
        await expectVisible(form.locator('[data-refused]'), 'the refusal is shown beside the form, not swallowed');
        const shown = await form.locator('[data-refused] p.font-mono').textContent();
        if (shown !== error) throw new Refused(`the refusal beside the form is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`);
        const after = fs.readdirSync(runsDir).sort();
        if (JSON.stringify(after) !== JSON.stringify(before)) throw new Refused(`nothing is written on a refusal — ${runsDir} went from ${before.length} files to ${after.length}`);
        await settled(refused);
        await refused.screenshot({ path: path.join(OUT, `start-refused-${await themeOf(refused)}.png`), fullPage: true });
        await refused.waitForLoadState('networkidle');
        // The one refusal made, as the browser reports it — its answer, and the line Chromium writes to the console for one — and nothing else.
        const expected = `request answered 422: POST ${answered.url()}`;
        const seen = problems();
        const others = seen.filter((p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 422\b/.test(p));
        if (!seen.includes(expected) || others.length) throw new Refused(`the refused page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
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

      // Each step's page, from a link under the graph — in the order a run runs them — and from its block on the graph.
      const links = (card: Locator, name: string) => card.getByRole('navigation', { name: `Steps of ${name}` }).getByRole('link');
      await expectTexts(links(dev, good.name), good.steps, `under ${good.name}'s graph, a link to each step's page, in the order they run`);
      await expectTexts(links(mine, yours.name), yours.steps, `and under ${yours.name}'s`);
      for (const step of good.steps) {
        const href = await links(dev, good.name).filter({ hasText: step }).getAttribute('href');
        if (href !== `/workflows/repo/${good.name}/${step}`) throw new Refused(`${step}'s link opens its page, /workflows/repo/${good.name}/${step} — it goes to ${href}`);
      }
      await nextVisit(page, async (again) => {
        await links(again.locator(`section[aria-label="Workflow ${good.name}"]`), good.name).filter({ hasText: 'review' }).click();
        await again.waitForURL(`**/workflows/repo/${good.name}/review`, { timeout: WAIT_MS });
        await expectVisible(again.locator('h1', { hasText: /^review$/ }), "a step's link opens the step's page");
        await again.goBack({ waitUntil: 'networkidle' });
        const block = again.locator(`section[aria-label="Workflow ${good.name}"] .react-flow__node[data-id="implement"]`);
        await expectVisible(block, 'back on the Workflows page, the graph');
        await block.click();
        await again.waitForURL(`**/workflows/repo/${good.name}/implement`, { timeout: WAIT_MS });
        await expectVisible(again.locator('h1', { hasText: /^implement$/ }), "a block on the graph opens its step's page");
      });
    },
  },
  {
    // The builder, on the store's workflows: a workflow of yours made with a first step, a step added, an edge drawn from one block to the
    // other, two keys set in the step's form, a schema pasted, saved — and the folder read back through the api and on disk — then taken back, so
    // every page after this one, in either theme, reads the store as seeded. A cycle drawn and saved, with a schema pasted beside it, is refused in a page of its own, whose one
    // refusal is the point, and nothing is written; a save of the folder changed by hand since is refused in another. The repository's workflow
    // has no builder, and says why.
    name: 'builder',
    route: '/workflows',
    expect: async (page) => {
      await sidebar(page);
      const { good, yours } = WORKFLOWS;
      const card = (p: Page, name: string) => p.locator(`section[aria-label="Workflow ${name}"]`);
      const puts = (name: string) => (r: Response) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/workflows/yours/${name}`;

      await expectVisible(card(page, good.name).locator('[data-no-builder]', { hasText: 'No builder: the board writes only yours, and nothing into this checkout.' }), `${good.name}, the repository's, says why it has no builder`);
      await expectCount(card(page, good.name).getByRole('button', { name: 'Build', exact: true }), 0, `and offers no Build`);
      await expectVisible(card(page, yours.name).getByRole('button', { name: 'Build', exact: true }), `${yours.name}, yours, offers Build`);

      // A cycle drawn and saved: refused in the package's words, shown above the canvas and on both steps it names, and nothing written.
      const mineDir = path.join(store!, 'workflows', yours.name);
      const before = filesIn(mineDir);
      const refused = await page.context().newPage();
      try {
        const { problems } = watch(refused);
        await refused.goto(page.url(), { waitUntil: 'networkidle' });
        const mine = card(refused, yours.name);
        await mine.getByRole('button', { name: 'Build', exact: true }).click();
        const builder = mine.locator(`section[data-builder="${yours.name}"]`);
        await expectVisible(builder, `Build opens ${yours.name}'s builder`);
        await addStep(builder, 'build', 'Build what PLAN.md says.');
        // A good schema pasted for build's output, beside the cycle: the save is judged whole, so the refusal writes no schema either.
        await pasteSchema(builder, 'build', PASTED);
        await drawEdge(refused, builder, 'plan', 'build');
        await drawEdge(refused, builder, 'build', 'plan');
        await expectCount(builder.locator('.react-flow__edge'), 2, 'two edges drawn, each way: build waits on plan, and plan on build');
        const [answered] = await Promise.all([
          refused.waitForResponse(puts(yours.name), { timeout: WAIT_MS }),
          builder.getByRole('button', { name: 'Save', exact: true }).click(),
        ]);
        const { error, steps } = (await answered.json()) as { error?: string; steps?: string[] };
        if (answered.status() !== 422 || error !== 'these steps wait on each other: build, plan' || JSON.stringify(steps) !== JSON.stringify(['build', 'plan'])) {
          throw new Refused(`the api refuses a cycle in the package's words, naming both steps — it answered ${answered.status()}: ${JSON.stringify({ error, steps })}`);
        }
        await expectVisible(builder.locator('[data-refused]'), 'the refusal is shown above the canvas, not swallowed');
        const shown = await builder.locator('[data-refused] p.font-mono').textContent();
        if (shown !== error) throw new Refused(`the refusal is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`);
        for (const step of ['plan', 'build']) {
          await expectVisible(builder.locator(`.react-flow__node[data-id="${step}"] [data-refused-step]`), `${step}, which the refusal names, is marked on the canvas`);
        }
        await expectVisible(builder.locator('[data-step-form] [data-refused-here]', { hasText: error }), "and in the form of the step it names, which it opens");
        await expectVisible(builder.locator('[data-unsaved]', { hasText: 'Unsaved changes' }), 'the draft is still unsaved');
        if (JSON.stringify(filesIn(mineDir)) !== JSON.stringify(before)) throw new Refused(`nothing is written on a refusal, the pasted schema included — ${mineDir} holds ${filesIn(mineDir).map(([f]) => f).join(', ')}`);
        await settled(refused);
        await refused.screenshot({ path: path.join(OUT, `builder-refused-${await themeOf(refused)}.png`), fullPage: true });

        // Nothing saved, so the draft is still there to change: an edge taken away by its button, and a loop drawn from the violet dot and
        // taken away, each taking its key with it. None of it is saved.
        await builder.getByRole('button', { name: 'Remove the edge build → plan' }).click();
        await expectCount(builder.locator('.react-flow__edge'), 1, "the edge's button takes it away, and plan no longer waits on build");
        await expectCount(builder.locator('.react-flow__node [data-refused-step]'), 2, 'the refusal stays on the steps it named until the next save');
        const buildKeys = builder.locator('[data-step-form="build"]');
        await drawEdge(refused, builder, 'build', 'plan', true);
        if ((await buildKeys.locator('[data-field="loop"] select').inputValue()) !== 'plan') throw new Refused("the loop drawn sets build's loop: plan in its form");
        if ((await buildKeys.locator('[data-field="rounds"] input').inputValue()) !== '3') throw new Refused('and its rounds, the default 3');
        await builder.getByRole('button', { name: "Remove build's loop back to plan" }).click();
        await expectCount(builder.locator('.react-flow__edge'), 1, "the loop's button takes it away");
        if ((await buildKeys.locator('[data-field="loop"] select').inputValue()) !== '' || (await buildKeys.locator('[data-field="rounds"] input').inputValue()) !== '') {
          throw new Refused("and build's loop and rounds with it");
        }
        await refused.waitForLoadState('networkidle');
        // The one refusal made, as the browser reports it — its answer, and the line Chromium writes to the console for one — and nothing else.
        const expected = `request answered 422: PUT ${answered.url()}`;
        const seen = problems();
        const others = seen.filter((p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 422\b/.test(p));
        if (!seen.includes(expected) || others.length) throw new Refused(`the refused page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
      } finally {
        await refused.close();
      }
      if (JSON.stringify(filesIn(mineDir)) !== JSON.stringify(before)) throw new Refused(`${mineDir} is as seeded after the refused page`);

      // The folder changed by hand while the builder has it open: the save is refused (409) rather than written over the change, which is kept,
      // and Read the folder again starts the draft from what the folder holds now. In a page of its own, whose one refusal is the point.
      const planFile = path.join(mineDir, 'plan.md');
      const seeded = fs.readFileSync(planFile, 'utf8');
      const byHand = seeded.replace('harness: codex\n', 'harness: codex\ncheck: test -f PLAN.md\n');
      if (byHand === seeded) throw new Refused(`${planFile} is seeded with harness: codex, for the edit by hand to add a check under`);
      const stale = await page.context().newPage();
      try {
        const { problems } = watch(stale);
        await stale.goto(page.url(), { waitUntil: 'networkidle' });
        const mine = card(stale, yours.name);
        await mine.getByRole('button', { name: 'Build', exact: true }).click();
        const builder = mine.locator(`section[data-builder="${yours.name}"]`);
        const keys = builder.locator('[data-step-form="plan"]');
        await expectVisible(keys, "plan's form, open as the builder opens");
        await keys.getByRole('textbox', { name: 'What it is told' }).fill('Write PLAN.md, briefly.');
        fs.writeFileSync(planFile, byHand);
        const [answered] = await Promise.all([
          stale.waitForResponse(puts(yours.name), { timeout: WAIT_MS }),
          builder.getByRole('button', { name: 'Save', exact: true }).click(),
        ]);
        const { error } = (await answered.json()) as { error?: string };
        if (answered.status() !== 409 || !error?.startsWith(`${mineDir} has changed since it was read at version `) || !error.includes('Nothing was written. Read the folder again')) {
          throw new Refused(`the api refuses a save of a folder changed by hand since it was read — it answered ${answered.status()}: ${JSON.stringify(error)}`);
        }
        const shown = await builder.locator('[data-refused] p.font-mono').textContent();
        if (shown !== error) throw new Refused(`the refusal is the api's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`);
        if (fs.readFileSync(planFile, 'utf8') !== byHand) throw new Refused(`the change by hand is kept, not written over — ${planFile} holds ${JSON.stringify(fs.readFileSync(planFile, 'utf8'))}`);
        const again = builder.getByRole('button', { name: 'Read the folder again' });
        await expectVisible(again, 'the refusal offers to read the folder again');
        await settled(stale);
        await stale.screenshot({ path: path.join(OUT, `builder-changed-${await themeOf(stale)}.png`), fullPage: true });
        await again.click();
        await expectCount(builder.locator('[data-refused]'), 0, 'read again, the refusal goes');
        await expectVisible(builder.locator('span', { hasText: /^Saved$/ }), 'and the draft is the folder as it is now: nothing unsaved');
        await expectVisible(builder.locator('.react-flow__node[data-id="plan"] dd', { hasText: /^test -f PLAN\.md$/ }), "plan's block shows the check written by hand");
        const body = await builder.locator('[data-step-form="plan"]').getByRole('textbox', { name: 'What it is told' }).inputValue();
        if (body !== 'Write PLAN.md.') throw new Refused(`plan's form reads the body on disk, and the change drawn is let go — it shows ${JSON.stringify(body)}`);
        await stale.waitForLoadState('networkidle');
        const expected = `request answered 409: PUT ${answered.url()}`;
        const seen = problems();
        const others = seen.filter((p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p));
        if (!seen.includes(expected) || others.length) throw new Refused(`the changed page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
      } finally {
        await stale.close();
        fs.writeFileSync(planFile, seeded);
      }

      // A step with an agent: in a page of its own, over a folder and two agents of yours written for it and taken away after, nothing saved.
      // Its form says the body is its own note, told after its agent's instructions; each key the agent gives it shows as the agent's; the
      // picker offers no agent and each agent of yours; moved to another agent, the form shows what that one gives and nothing the last gave;
      // and with no agent, the body is all it is told again.
      const { name: crew, agent, other } = CREWED;
      const crewDir = path.join(store!, 'workflows', crew);
      const agentsDir = path.join(store!, 'workflows', 'agents');
      const hadAgents = fs.existsSync(agentsDir);
      const crewed = await page.context().newPage();
      try {
        fs.mkdirSync(agentsDir, { recursive: true });
        fs.writeFileSync(path.join(agentsDir, `${agent}.md`), '---\nharness: claude\nmodel: opus\neffort: high\n---\nYou write code.\n');
        fs.writeFileSync(path.join(agentsDir, `${other}.md`), '---\nmodel: sonnet\n---\nYou review code.\n');
        fs.mkdirSync(crewDir, { recursive: true });
        fs.writeFileSync(path.join(crewDir, 'build.md'), `---\nagent: ${agent}\ncheck: npm test\n---\nMind the cache.\n`);
        const { problems } = watch(crewed);
        await crewed.goto(page.url(), { waitUntil: 'networkidle' });
        await card(crewed, crew).getByRole('button', { name: 'Build', exact: true }).click();
        const builder = card(crewed, crew).locator(`section[data-builder="${crew}"]`);
        const keys = builder.locator('[data-step-form="build"]');
        await expectVisible(keys, "build's form, open as the builder opens");
        const note = keys.getByRole('textbox', { name: 'Its own note' });
        await expectVisible(note, 'its body is its own note');
        if ((await note.inputValue()) !== 'Mind the cache.') throw new Refused(`the note is the step's own words, not its agent's — it shows ${JSON.stringify(await note.inputValue())}`);
        await expectTexts(keys.locator('[data-agent-note]'), [`Told after ${agent}'s instructions, agents/${agent}.md.`], 'and says whose instructions it is told after');
        const picker = keys.locator('[data-field="agent"] select');
        const offered = await picker.locator('option').allTextContents();
        if ((await picker.inputValue()) !== agent || JSON.stringify(offered) !== JSON.stringify(['no agent', agent, other, AGENTS.seeded.name])) {
          throw new Refused(`the picker names ${agent}, and offers no agent and each agent of yours — it offers ${JSON.stringify(offered)} on ${JSON.stringify(await picker.inputValue())}`);
        }
        const model = keys.locator('[data-field="model"] input');
        const effort = keys.locator('[data-field="effort"] select');
        const unsetEffort = effort.locator('option[value=""]');
        if ((await model.inputValue()) !== '' || (await model.getAttribute('placeholder')) !== `opus — ${agent}'s`) throw new Refused(`the model ${agent} gives it is shown as ${agent}'s, and the field is empty — it holds ${JSON.stringify(await model.inputValue())} under ${JSON.stringify(await model.getAttribute('placeholder'))}`);
        if ((await effort.inputValue()) !== '' || (await unsetEffort.textContent()) !== `high — ${agent}'s`) throw new Refused(`and the effort — it reads ${JSON.stringify(await unsetEffort.textContent())}`);
        if ((await keys.locator('[data-field="check"] input').inputValue()) !== 'npm test') throw new Refused('the check it sets itself is in its field');
        await settled(crewed);
        await crewed.screenshot({ path: path.join(OUT, `builder-agent-${await themeOf(crewed)}.png`), fullPage: true });

        await picker.selectOption(other);
        await expectTexts(keys.locator('[data-agent-note]'), [`Told after ${other}'s instructions, agents/${other}.md.`], `moved to ${other}, the note is told after ${other}'s`);
        if ((await model.getAttribute('placeholder')) !== `sonnet — ${other}'s`) throw new Refused(`moved to ${other}, the model is ${other}'s — it reads ${JSON.stringify(await model.getAttribute('placeholder'))}`);
        if ((await unsetEffort.textContent()) !== `not set — nor by ${other}`) throw new Refused(`and ${agent}'s effort is not shown as ${other}'s — it reads ${JSON.stringify(await unsetEffort.textContent())}`);
        if ((await note.inputValue()) !== 'Mind the cache.' || (await keys.locator('[data-field="check"] input').inputValue()) !== 'npm test') throw new Refused('and what the step sets itself stays');

        await picker.selectOption('');
        await expectCount(keys.locator('[data-agent-note]'), 0, 'with no agent, nothing is told before its body');
        await expectVisible(keys.getByRole('textbox', { name: 'What it is told' }), 'and its body is all it is told');
        await crewed.waitForLoadState('networkidle');
        if (problems().length) throw new Refused(`the agent's page saw nothing refused — it saw:\n    ${problems().join('\n    ')}`);
      } finally {
        await crewed.close();
        fs.rmSync(crewDir, { recursive: true, force: true });
        fs.rmSync(hadAgents ? path.join(agentsDir, `${agent}.md`) : agentsDir, { recursive: true, force: true });
        if (hadAgents) fs.rmSync(path.join(agentsDir, `${other}.md`), { force: true });
      }

      // A workflow made, built and saved.
      const { name, plan, implement } = BUILT;
      const made = path.join(store!, 'workflows', name);
      try {
        await page.getByRole('button', { name: 'New workflow' }).click();
        const form = page.getByRole('form', { name: 'New workflow' });
        await form.getByRole('textbox', { name: 'Workflow name' }).fill(name);
        await form.getByRole('textbox', { name: 'First step' }).fill('plan');
        await form.getByRole('textbox', { name: 'What it is told' }).fill(plan);
        const [created] = await Promise.all([
          page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/workflows/yours', { timeout: WAIT_MS }),
          form.getByRole('button', { name: 'Make it' }).click(),
        ]);
        if (created.status() !== 201) throw new Refused(`the api makes the workflow — it answered ${created.status()}: ${await created.text()}`);
        if (JSON.stringify(filesIn(made)) !== JSON.stringify([['plan.md', `${plan}\n`]])) throw new Refused(`the new folder is its first step — ${made} holds ${JSON.stringify(filesIn(made))}`);

        const builder = card(page, name).locator(`section[data-builder="${name}"]`);
        await expectVisible(builder, 'the workflow made opens in its builder');
        await expectVisible(builder.locator('span', { hasText: /^Saved$/ }), 'with nothing unsaved');
        await addStep(builder, 'implement', implement);
        await expectVisible(builder.locator('[data-unsaved]', { hasText: 'Unsaved changes' }), 'a step added is marked unsaved on the card');
        await expectVisible(builder.locator('.react-flow__node[data-id="implement"] [data-unsaved-step]'), 'and on its block');
        await expectCount(builder.locator('.react-flow__node[data-id="plan"] [data-unsaved-step]'), 0, 'and not on the step it did not change');

        await drawEdge(page, builder, 'plan', 'implement');
        await expectCount(builder.locator('.react-flow__edge[data-id="plan->implement"]'), 1, 'the edge drawn from plan to implement');
        await expectVisible(builder.getByRole('button', { name: 'Remove the edge plan → implement' }), 'with a button that takes it away');

        await builder.locator('.react-flow__node[data-id="implement"]').click();
        const keys = builder.locator('[data-step-form="implement"]');
        await expectVisible(keys, "implement's form, once its block is clicked");
        await expectVisible(keys.locator('[data-field="after"] input[type="checkbox"]:checked'), 'whose after has plan, as the edge drew it');
        await keys.locator('[data-field="effort"] select').selectOption('high');
        await keys.locator('[data-field="check"] input').fill('npm test');
        await expectVisible(builder.locator('.react-flow__node[data-id="implement"] dd', { hasText: /^npm test$/ }), 'the block shows the check set in its form');
        await pasteSchema(builder, 'implement', PASTED);

        const [saved] = await Promise.all([
          page.waitForResponse(puts(name), { timeout: WAIT_MS }),
          builder.getByRole('button', { name: 'Save', exact: true }).click(),
        ]);
        if (saved.status() !== 200) throw new Refused(`the api saves the folder — it answered ${saved.status()}: ${await saved.text()}`);
        await expectVisible(builder.locator('span', { hasText: /^Saved$/ }), 'once saved, nothing is unsaved');
        await expectCount(builder.locator('[data-unsaved-step]'), 0, 'on any block');
        await expectVisible(builder.locator('[data-saved]', { hasText: 'wrote implement.md, implement.schema.json; left plan.md as it was' }), 'and the card says what was written, the pasted schema with it');
        if ((await keys.locator('[data-field="output"] select').inputValue()) !== 'implement.schema.json') throw new Refused("once saved, implement's output names the schema beside it, as the folder lists it");

        // Read back through the api, as a start would read it, and on disk.
        const answered = await page.request.get(new URL('/api/workflows', page.url()).href);
        const listing = ((await answered.json()) as Array<{ name: string; from: string; steps: Array<{ name: string; spec: Record<string, unknown>; body: string }>; graph: { edges: unknown[] }; error: string | null }>)
          .find((w) => w.name === name && w.from === 'yours');
        const read = listing && { error: listing.error, steps: listing.steps.map((s) => [s.name, s.spec.after, s.spec.effort, s.spec.check, s.spec.output, s.body]), edges: listing.graph.edges };
        const want = { error: null, steps: [['plan', [], null, null, null, plan], ['implement', ['plan'], 'high', 'npm test', 'implement.schema.json', implement]], edges: [{ from: 'plan', to: 'implement', kind: 'after' }] };
        if (JSON.stringify(read) !== JSON.stringify(want)) throw new Refused(`GET /api/workflows reads the folder as it was built — it read ${JSON.stringify(read)}`);
        const files = [['implement.md', `---\nafter: plan\neffort: high\ncheck: npm test\noutput: implement.schema.json\n---\n${implement}\n`], ['implement.schema.json', `${PASTED}\n`], ['plan.md', `${plan}\n`]];
        if (JSON.stringify(filesIn(made)) !== JSON.stringify(files)) throw new Refused(`the folder's files are the steps as built — ${made} holds ${JSON.stringify(filesIn(made))}`);
        const stepPage = await page.request.get(new URL(`/api/workflows/yours/${name}/implement`, page.url()).href);
        const { source } = (await stepPage.json()) as { source?: string };
        if (source !== files[0]![1]) throw new Refused(`the step's page reads implement.md as written — it read ${JSON.stringify(source)}`);
        await settled(page);
        await page.screenshot({ path: path.join(OUT, `builder-saved-${await themeOf(page)}.png`), fullPage: true });
      } finally {
        fs.rmSync(made, { recursive: true, force: true });
      }
    },
  },
  {
    // The inbox: the seeded cards, newest first; a card filed from the box, then removed with its Remove; a card's start form, preset from the
    // card; and, each in a page of its own, a card started — which opens its run's page — a card started already, an empty inbox, and a start
    // refused because the card is gone. Every write is taken back, so every page after this one, in either theme, reads the store as seeded.
    name: 'inbox',
    route: '/inbox',
    expect: async (page) => {
      await sidebar(page);
      await expectVisible(page.locator('[data-sidebar="sidebar"] a[data-active="true"]', { hasText: 'Inbox' }), 'the sidebar lights Inbox on its page');
      const { planned, bare, rich } = CARDS;
      const inbox = path.join(store!, 'inbox');
      const checkout = path.join(store!, 'checkout');
      const runsDir = path.join(store!, 'runs');
      const listed = (p: Page) => p.locator('section[aria-label="Cards"] li[data-card]');
      const order = (p: Page) => listed(p).evaluateAll((items) => items.map((item) => item.getAttribute('data-card')));

      // The queued cards were filed before the rest, the first queued first: newest first, they are listed last, the last filed first.
      const queuedByFiling = [QUEUE.third, QUEUE.refused, QUEUE.first].map((c) => c.name);
      await expectCount(listed(page), 3 + QUEUED.length, `a card per file in the inbox: the ${3 + QUEUED.length} the store has`);
      if (JSON.stringify(await order(page)) !== JSON.stringify([bare.name, rich.name, planned.name, ...queuedByFiling])) {
        throw new Refused(`the cards are listed newest first — ${bare.name}, filed ${bare.filedMinutesAgo} minutes ago, then ${rich.name}, then ${planned.name}, then ${queuedByFiling.join(', ')} — and they were listed ${(await order(page)).join(', ')}`);
      }
      for (const card of [planned, bare, rich]) {
        const item = cardIn(page, card.name);
        await expectVisible(item.locator('[data-title]', { hasText: card.title }), `${card.name} is listed by its first line (${card.title})`);
        await expectVisible(item.locator(`[data-title] a[href="/inbox/${card.name}"]`, { hasText: card.title }), `and its first line opens its page (/inbox/${card.name})`);
        await expectCount(item.getByText(card.body.split('\n\n')[1]!), 0, `and its first line alone: the rest of its body is the brief its start is prefilled with`);
        await expectVisible(item.getByRole('button', { name: 'Start' }), `${card.name} offers Start`);
        await expectVisible(item.getByRole('button', { name: 'Remove' }), `${card.name} offers Remove`);
      }
      await expectVisible(cardIn(page, planned.name).locator(`[data-workflow="${planned.workflow}"]`, { hasText: planned.workflow }), `${planned.name} names its workflow (${planned.workflow})`);
      await expectCount(cardIn(page, bare.name).locator('[data-workflow]'), 0, `${bare.name} names no workflow, and shows none`);

      // The queue: each queued card says its place and when it was queued, and offers Unqueue, not Queue; the card whose start the tick
      // refused says why, and that it stays queued. A card that names a workflow and is not queued offers Queue; one that names none does not.
      await expectTexts(page.locator('section[aria-label="Cards"] h2 [data-queue-count]'), [`· ${QUEUED.length} queued`], 'the cards are counted with how many are queued');
      for (const [i, card] of QUEUED.entries()) {
        const item = cardIn(page, card.name);
        await expectTexts(item.locator('[data-queued]'), [`queued · ${PLACES_SAID[i]}`], `${card.name} says its place in the queue (queued · ${PLACES_SAID[i]})`);
        await expectVisible(item.locator('time[data-queued-at]'), 'and when it was queued');
        await expectVisible(item.getByRole('button', { name: 'Unqueue' }), 'and offers Unqueue');
        await expectCount(item.getByRole('button', { name: 'Queue', exact: true }), 0, 'and not Queue: it is queued');
      }
      const refusedTry = cardIn(page, QUEUE.refused.name).locator('[data-tried="refused"]');
      await expectVisible(refusedTry.getByText(refusedWhy(store!, checkout), { exact: false }), `${QUEUE.refused.name}, whose start the tick refused, says why in the package's words`);
      await expectVisible(refusedTry.getByText('It stays queued', { exact: false }), 'and that it stays queued');
      await expectCount(cardIn(page, QUEUE.first.name).locator('[data-tried]'), 0, 'a card the tick has not tried says nothing of a try');
      for (const card of [planned, rich]) {
        await expectVisible(cardIn(page, card.name).getByRole('button', { name: 'Queue', exact: true }), `${card.name}, which names a workflow, offers Queue`);
      }
      await expectCount(cardIn(page, bare.name).getByRole('button', { name: 'Queue', exact: true }), 0, `${bare.name}, which names no workflow, offers no Queue`);

      // Filed from the box, with a workflow and the repository it is prefilled with — the api's own — then removed with its Remove.
      const box = page.locator('form[aria-label="File a card"]');
      const idea = box.getByRole('textbox', { name: 'An idea' });
      const fileIt = box.getByRole('button', { name: 'File' });
      await expectVisible(idea, 'the box has a field for the idea');
      if (await fileIt.isEnabled()) throw new Refused('File is disabled while there is no idea — it was enabled with none');
      const repository = box.getByRole('textbox', { name: 'Repository' });
      if ((await repository.inputValue()) !== checkout) throw new Refused(`the repository is the api's own until a person changes it (${checkout}) — it was ${JSON.stringify(await repository.inputValue())}`);
      await idea.fill(FILED);
      await box.getByRole('combobox', { name: 'Workflow' }).selectOption({ label: WORKFLOWS.good.name });
      const [filed] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/inbox', { timeout: WAIT_MS }),
        fileIt.click(),
      ]);
      if (filed.status() !== 201) throw new Refused(`the api files the card, through the board's proxy — it answered ${filed.status()}: ${await filed.text()}`);
      const { name } = (await filed.json()) as { name: string };
      const written = path.join(inbox, `${name}.md`);
      try {
        const text = fs.existsSync(written) ? fs.readFileSync(written, 'utf8') : undefined;
        const card = `---\nworkflow: ${WORKFLOWS.good.name}\nrepo: ${checkout}\n---\n${FILED}\n`;
        if (text !== card) throw new Refused(`the card is written as wf inbox add writes it, with its workflow and repository — ${written} holds ${JSON.stringify(text)}`);
        await expectCount(listed(page), 4 + QUEUED.length, 'the card filed is listed');
        if ((await order(page))[0] !== name) throw new Refused(`the card filed is listed first, the newest — the list is ${(await order(page)).join(', ')}`);
        await expectVisible(cardIn(page, name).locator('[data-title]', { hasText: FILED.split('\n')[0]! }), 'by its first line');
        if ((await idea.inputValue()) !== '') throw new Refused('the box is emptied once the card is filed');

        // Queued from its button, behind the three queued already, then taken off the queue with Unqueue, both through the proxy: the card
        // written as wf inbox queue writes it, and back as it was.
        const fresh = cardIn(page, name);
        const [queued] = await Promise.all([
          page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/inbox/${name}/queue`, { timeout: WAIT_MS }),
          fresh.getByRole('button', { name: 'Queue', exact: true }).click(),
        ]);
        if (queued.status() !== 200) throw new Refused(`the api queues the card, through the board's proxy — it answered ${queued.status()}: ${await queued.text()}`);
        const { queued: at, place } = (await queued.json()) as { queued: string; place: number };
        if (place !== QUEUED.length + 1) throw new Refused(`the card queued is behind the ${QUEUED.length} queued already — the api placed it ${place}`);
        const queuedText = fs.readFileSync(written, 'utf8');
        if (queuedText !== queuedCardText({ workflow: WORKFLOWS.good.name, body: FILED }, at, checkout)) {
          throw new Refused(`the card is written as wf inbox queue writes it, queued: last — ${written} holds ${JSON.stringify(queuedText)}`);
        }
        await expectTexts(fresh.locator('[data-queued]'), [`queued · ${PLACES_SAID[QUEUED.length]}`], `the card says its place once queued (queued · ${PLACES_SAID[QUEUED.length]})`);
        await expectCount(fresh.getByRole('button', { name: 'Queue', exact: true }), 0, 'and offers Queue no more');
        const [unqueued] = await Promise.all([
          page.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/inbox/${name}/queue`, { timeout: WAIT_MS }),
          fresh.getByRole('button', { name: 'Unqueue' }).click(),
        ]);
        if (unqueued.status() !== 200) throw new Refused(`the api takes the card off the queue, through the board's proxy — it answered ${unqueued.status()}: ${await unqueued.text()}`);
        await expectCount(fresh.locator('[data-queued]'), 0, 'Unqueue takes the card off the queue');
        await expectVisible(fresh.getByRole('button', { name: 'Queue', exact: true }), 'and it offers Queue again');
        if (fs.readFileSync(written, 'utf8') !== card) throw new Refused(`and the card is written as it was filed — ${written} holds ${JSON.stringify(fs.readFileSync(written, 'utf8'))}`);
        const [dropped] = await Promise.all([
          page.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/inbox/${name}`, { timeout: WAIT_MS }),
          cardIn(page, name).getByRole('button', { name: 'Remove' }).click(),
        ]);
        if (dropped.status() !== 200) throw new Refused(`the api drops the card, through the board's proxy — it answered ${dropped.status()}: ${await dropped.text()}`);
        await expectCount(cardIn(page, name), 0, 'Remove takes the card off the list');
        if (fs.existsSync(written)) throw new Refused(`and out of the inbox — ${written} is still there`);
      } finally {
        fs.rmSync(written, { force: true });
      }

      // Queued and taken off the queue from its buttons, a card that is not the newest: it keeps its place in the list and the time it was
      // filed, and its file its mtime — a queue is no edit of the idea — and it is written back as it was. Put back all the same.
      {
        const file = path.join(inbox, `${planned.name}.md`);
        const [text, mtime] = [fs.readFileSync(file, 'utf8'), fs.statSync(file).mtimeMs];
        const item = cardIn(page, planned.name);
        const filedTime = item.locator('time[title="When its file was last written"]');
        const shownAs = async () => ({ order: await order(page), filedAt: await filedTime.getAttribute('datetime'), shown: await filedTime.textContent() });
        const before = await shownAs();
        if (before.order.indexOf(planned.name) === 0) throw new Refused(`${planned.name} is not the newest card, so a move would show — it is listed first`);
        const unmoved = async (when: string) => {
          const now = await shownAs();
          if (JSON.stringify(now) !== JSON.stringify(before)) {
            throw new Refused(`${when}, ${planned.name} keeps its place and its filing time — it was ${JSON.stringify(before)}, and is ${JSON.stringify(now)}`);
          }
          if (fs.statSync(file).mtimeMs !== mtime) throw new Refused(`${when}, ${file} keeps its mtime — it was ${new Date(mtime).toISOString()}, and is ${fs.statSync(file).mtime.toISOString()}`);
        };
        try {
          const [queued] = await Promise.all([
            page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/inbox/${planned.name}/queue`, { timeout: WAIT_MS }),
            item.getByRole('button', { name: 'Queue', exact: true }).click(),
          ]);
          if (queued.status() !== 200) throw new Refused(`the api queues ${planned.name} — it answered ${queued.status()}: ${await queued.text()}`);
          await expectTexts(item.locator('[data-queued]'), [`queued · ${PLACES_SAID[QUEUED.length]}`], `${planned.name} says its place once queued (queued · ${PLACES_SAID[QUEUED.length]})`);
          await page.waitForLoadState('networkidle');
          await unmoved('queued');
          await settled(page);
          await page.screenshot({ path: path.join(OUT, `inbox-queued-${await themeOf(page)}.png`), fullPage: true });
          const [unqueued] = await Promise.all([
            page.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/inbox/${planned.name}/queue`, { timeout: WAIT_MS }),
            item.getByRole('button', { name: 'Unqueue' }).click(),
          ]);
          if (unqueued.status() !== 200) throw new Refused(`the api takes ${planned.name} off the queue — it answered ${unqueued.status()}: ${await unqueued.text()}`);
          await expectCount(item.locator('[data-queued]'), 0, `Unqueue takes ${planned.name} off the queue`);
          await page.waitForLoadState('networkidle');
          await unmoved('taken off the queue');
          if (fs.readFileSync(file, 'utf8') !== text) throw new Refused(`${planned.name} is written back as it was — ${file} holds ${JSON.stringify(fs.readFileSync(file, 'utf8'))}`);
        } finally {
          fs.writeFileSync(file, text);
          fs.utimesSync(file, new Date(mtime), new Date(mtime));
        }
      }

      // A card's start form: the workflow preset from the card, the brief prefilled from its body, and the runs to wait on.
      const plannedItem = cardIn(page, planned.name);
      await plannedItem.getByRole('button', { name: 'Start' }).click();
      const workflowPick = plannedItem.getByRole('combobox', { name: 'Workflow' });
      await expectVisible(workflowPick, `Start opens ${planned.name}'s start form`);
      const presetLabel = await workflowPick.locator('option:checked').textContent();
      if (presetLabel !== planned.workflow) throw new Refused(`the workflow is preset from the card (${planned.workflow}) — it was ${JSON.stringify(presetLabel)}`);
      const startForm = plannedItem.locator(`form[aria-label="Start ${planned.name}"]`);
      const brief = startForm.getByRole('textbox', { name: 'Brief' });
      if ((await brief.inputValue()) !== planned.body) throw new Refused(`the brief is prefilled from the card's body — it was ${JSON.stringify(await brief.inputValue())}`);
      await expectCount(startForm.locator('ul[aria-label="Runs to wait on"] li'), DIAMOND_RUNS.length, `the start form offers the ${DIAMOND_RUNS.length} runs on its repository to wait on`);
      await expectVisible(startForm.getByRole('button', { name: 'Start' }), 'and a Start button');
      await settled(page);
      await page.screenshot({ path: path.join(OUT, `inbox-start-${await themeOf(page)}.png`), fullPage: true });
      await plannedItem.getByRole('button', { name: 'Close' }).click();
      await expectCount(startForm, 0, 'Close folds the start form away');

      // Started, in a page of its own: the brief as edited, posted with the card; the run's page opens; the record carries where it came from,
      // and the card has left the inbox. Taken back: the record removed, and the card written again as it was.
      const cardFile = path.join(inbox, `${planned.name}.md`);
      const cardText = fs.readFileSync(cardFile, 'utf8');
      const cardTime = fs.statSync(cardFile).mtime;
      const runsBefore = fs.readdirSync(runsDir).sort();
      const starting = await page.context().newPage();
      try {
        const { problems } = watch(starting);
        await starting.goto(page.url(), { waitUntil: 'networkidle' });
        const item = cardIn(starting, planned.name);
        await item.getByRole('button', { name: 'Start' }).click();
        const form = item.locator(`form[aria-label="Start ${planned.name}"]`);
        await form.getByRole('textbox', { name: 'Brief' }).fill(STARTED);
        const [started] = await Promise.all([
          starting.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', { timeout: WAIT_MS }),
          form.getByRole('button', { name: 'Start' }).click(),
        ]);
        if (started.status() !== 201) throw new Refused(`the api starts the card, through the board's proxy — it answered ${started.status()}: ${await started.text()}`);
        const { id, removed } = (await started.json()) as { id: string; removed: boolean };
        if (removed !== true) throw new Refused(`the api says the card left the inbox — it answered removed: ${removed}`);
        await starting.waitForURL(`**/runs/${id}`, { timeout: WAIT_MS });
        await expectVisible(starting.locator('h1', { hasText: id }), `the start opens the run's page (${id})`);
        await expectVisible(
          starting.locator(`[data-from="${planned.name}"]`, { hasText: new RegExp(`^from inbox card ${planned.name}$`) }),
          `and the run's page says, under the brief, the card it came from, as wf decide does (from inbox card ${planned.name})`,
        );
        const record = JSON.parse(fs.readFileSync(path.join(runsDir, `${id}.json`), 'utf8')) as { from?: { inbox?: string }; brief?: string; workflowDir?: string; repo?: string };
        const expected = { from: { inbox: planned.name }, brief: STARTED, workflowDir: path.join(checkout, 'workflows', WORKFLOWS.good.name), repo: checkout };
        const got = { from: record.from, brief: record.brief, workflowDir: record.workflowDir, repo: record.repo };
        if (JSON.stringify(got) !== JSON.stringify(expected)) throw new Refused(`the record is the card's start — it holds ${JSON.stringify(got)}, and should hold ${JSON.stringify(expected)}`);
        if (fs.existsSync(cardFile)) throw new Refused(`the card leaves the inbox once its run is written — ${cardFile} is still there`);
        await starting.waitForLoadState('networkidle');
        const seen = problems();
        if (seen.length) throw new Refused(`no console error and no failed request while starting a card — ${seen.length} seen:\n    ${seen.join('\n    ')}`);
      } finally {
        await starting.close();
        for (const file of fs.readdirSync(runsDir)) if (!runsBefore.includes(file)) fs.rmSync(path.join(runsDir, file), { recursive: true, force: true });
        if (!fs.existsSync(cardFile)) {
          fs.writeFileSync(cardFile, cardText);
          fs.utimesSync(cardFile, cardTime, cardTime);
        }
      }

      // Started, and its card could not be removed — the inbox read-only — in a page of its own: the run is written and the page stays, the
      // card says it was started as that run with the api's why, word for word, once the inbox is read again too, and offers Start no more.
      // Taken back: the inbox writable again, the record removed. Not as root, which removes a file from a read-only folder all the same.
      if (process.getuid?.() === 0) {
        console.log('e2e: inbox — a start whose card cannot be removed is not looked at as root, which removes it all the same');
      } else {
        const keptRuns = fs.readdirSync(runsDir).sort();
        const kept = await page.context().newPage();
        try {
          const { problems } = watch(kept);
          await kept.goto(page.url(), { waitUntil: 'networkidle' });
          const item = cardIn(kept, planned.name);
          await item.getByRole('button', { name: 'Start' }).click();
          const form = item.locator(`form[aria-label="Start ${planned.name}"]`);
          await expectVisible(form.getByRole('button', { name: 'Start' }), `Start opens ${planned.name}'s start form`);
          // Waited on from before the start, so the read its answer asks for is not missed: nothing else on the page reads the inbox again.
          const reread = kept.waitForResponse((r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/inbox', { timeout: WAIT_MS });
          fs.chmodSync(inbox, 0o555);
          const [started] = await Promise.all([
            kept.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', { timeout: WAIT_MS }),
            form.getByRole('button', { name: 'Start' }).click(),
          ]);
          const answer = (await started.json()) as { id?: string; removed?: boolean; why?: string };
          if (started.status() !== 201 || answer.removed !== false || !answer.why?.startsWith(`${cardFile} could not be removed — `)) {
            throw new Refused(`the api starts a card it cannot remove, and says so — it answered ${started.status()}: ${JSON.stringify(answer)}`);
          }
          // Once the inbox has been read again, which names the run: the form gone, the why still there.
          const listing = (await (await reread).json()) as Array<{ name: string; startedAs: string[] }>;
          if (JSON.stringify(listing.find((e) => e.name === planned.name)?.startedAs) !== JSON.stringify([answer.id])) {
            throw new Refused(`the inbox read again names the run the card was started as — it listed ${JSON.stringify(listing)}`);
          }
          await kept.waitForLoadState('networkidle');
          await expectVisible(item.locator(`[data-started-as] a[href="/runs/${answer.id}"]`), `the card says it was started as ${answer.id}, linked to the run`);
          const why = await item.locator('[data-started-as] [data-kept]').textContent();
          if (why !== answer.why) throw new Refused(`the card says why it was not removed, in the api's words — it shows ${JSON.stringify(why)}, and the api said ${JSON.stringify(answer.why)}`);
          await expectCount(item.getByRole('button', { name: 'Start' }), 0, 'and offers no Start: started again, the idea would run twice');
          await expectCount(item.locator('[data-start-card]'), 0, 'its start form is gone');
          if (new URL(kept.url()).pathname !== '/inbox') throw new Refused(`the page stays on the inbox — it went to ${kept.url()}`);
          if (!fs.existsSync(cardFile)) throw new Refused(`the card is still in the inbox — ${cardFile} is gone`);
          await settled(kept);
          await kept.screenshot({ path: path.join(OUT, `inbox-kept-${await themeOf(kept)}.png`), fullPage: true });
          await kept.waitForLoadState('networkidle');
          const seen = problems();
          if (seen.length) throw new Refused(`no console error and no failed request on a start whose card stayed — ${seen.length} seen:\n    ${seen.join('\n    ')}`);
        } finally {
          await kept.close();
          fs.chmodSync(inbox, 0o755);
          for (const file of fs.readdirSync(runsDir)) if (!keptRuns.includes(file)) fs.rmSync(path.join(runsDir, file), { recursive: true, force: true });
        }
      }

      // A card a run's record already names — started, its removal failed — in a page of its own: linked to its run, Remove only. Taken back.
      const startedRecord = path.join(runsDir, `${STARTED_AS}.json`);
      const already = await page.context().newPage();
      try {
        fs.writeFileSync(startedRecord, JSON.stringify({
          id: STARTED_AS, repo: checkout, workspace: checkout, baseRef: 'HEAD', branch: 'main', isolate: true, brief: bare.body,
          workflowDir: path.join(checkout, 'workflows', WORKFLOWS.good.name), workflow: [], steps: {}, createdAt: new Date().toISOString(), from: { inbox: bare.name },
        }, null, 2));
        const { problems } = watch(already);
        await already.goto(page.url(), { waitUntil: 'networkidle' });
        const item = cardIn(already, bare.name);
        await expectVisible(item.locator(`[data-started-as] a[href="/runs/${STARTED_AS}"]`), `a card a record names says it was started as ${STARTED_AS}, linked to the run`);
        await expectCount(item.getByRole('button', { name: 'Start' }), 0, 'and offers no Start: started again, the idea would run twice');
        await expectVisible(item.getByRole('button', { name: 'Remove' }), 'and offers Remove');
        await settled(already);
        await already.screenshot({ path: path.join(OUT, `inbox-started-as-${await themeOf(already)}.png`), fullPage: true });
        await already.waitForLoadState('networkidle');
        const seen = problems();
        if (seen.length) throw new Refused(`no console error and no failed request on a card started already — ${seen.length} seen:\n    ${seen.join('\n    ')}`);
      } finally {
        await already.close();
        fs.rmSync(startedRecord, { force: true });
      }

      // A card about another repository that names `dev`, which the api's repository has too, in a page of its own: a start of it from the
      // command line looks for `dev` in the card's repository, so the form presets none of the api's workflows, says whose `dev` the card
      // means, and offers no Start until one is picked. The card written by hand, and taken back.
      const elsewhere = path.join(store!, 'hkb-v2');
      const elsewhereName = 'a-card-about-another-repo-e2e0';
      const elsewhereFile = path.join(inbox, `${elsewhereName}.md`);
      const other = await page.context().newPage();
      try {
        fs.writeFileSync(elsewhereFile, `---\nworkflow: ${WORKFLOWS.good.name}\nrepo: ${elsewhere}\n---\nA card about another repository\n`);
        const { problems } = watch(other);
        await other.goto(page.url(), { waitUntil: 'networkidle' });
        const item = cardIn(other, elsewhereName);
        await item.getByRole('button', { name: 'Start' }).click();
        const pick = item.getByRole('combobox', { name: 'Workflow' });
        await expectVisible(pick, `Start opens ${elsewhereName}'s start form`);
        if ((await pick.inputValue()) !== '') {
          throw new Refused(`a card about ${elsewhere} that names ${WORKFLOWS.good.name} presets none of the api's workflows — it preset ${JSON.stringify(await pick.inputValue())}`);
        }
        await expectVisible(
          item.locator('[data-unlisted]', { hasText: `The card names ${WORKFLOWS.good.name}, a workflow of ${elsewhere}, and the workflows here are ${checkout}'s` }),
          'and says whose workflow the card names',
        );
        await expectCount(item.locator(`form[aria-label="Start ${elsewhereName}"]`), 0, 'with no Start until one is picked');
        await settled(other);
        await other.screenshot({ path: path.join(OUT, `inbox-elsewhere-${await themeOf(other)}.png`), fullPage: true });
        await other.waitForLoadState('networkidle');
        const seen = problems();
        if (seen.length) throw new Refused(`no console error and no failed request on a card about another repository — ${seen.length} seen:\n    ${seen.join('\n    ')}`);
      } finally {
        await other.close();
        fs.rmSync(elsewhereFile, { force: true });
      }

      // What is in the inbox besides cards, in a page of its own: a stray file and a folder, each listed with why it is not a card. The file's
      // name opens its page — its refusal and the file as written — and the folder, whose name `sub/` the api refuses, has no page to open.
      // Beside them a card and a stray file of one name, `notes.md` and `notes`: /inbox/notes is the card's, so the stray opens nothing.
      // All taken back.
      const strayFile = path.join(inbox, 'notes.txt');
      const strayText = 'Not a card: notes kept beside the cards.\n';
      const folder = path.join(inbox, 'sub');
      const namedFile = path.join(inbox, 'notes');
      const namedCard = path.join(inbox, 'notes.md');
      const strays = await page.context().newPage();
      try {
        fs.writeFileSync(strayFile, strayText);
        fs.mkdirSync(folder);
        fs.writeFileSync(namedFile, 'Not a card: notes beside the card of that name.\n');
        fs.writeFileSync(namedCard, 'Notes, as a card\n');
        const { problems } = watch(strays);
        await strays.goto(page.url(), { waitUntil: 'networkidle' });
        const sub = cardIn(strays, 'sub/');
        await expectVisible(sub.getByText(/^sub\/: not a card/), 'a folder in the inbox is listed with why it is not a card');
        await expectCount(sub.getByRole('link'), 0, "and has no page: the api refuses the name sub/, so a link would open a refusal of what is listed");
        // A stray file and a card of one name: both listed as `notes`, and the page the name opens is the card's, so only the card is linked.
        const named = cardIn(strays, 'notes');
        await expectCount(named, 2, 'a card and a stray file of one name are both listed, under that name');
        const namedStray = named.filter({ hasText: 'notes: not a card' });
        await expectVisible(namedStray, 'the stray is listed with why it is not a card');
        await expectCount(namedStray.getByRole('link'), 0, 'and has no page: /inbox/notes is notes.md, so a link would open the card\'s page under the stray\'s name');
        await expectVisible(named.filter({ has: strays.locator('[data-title]') }).locator('a[href="/inbox/notes"]', { hasText: 'Notes, as a card' }), 'and the card of that name keeps the page, which is the one the api reads');

        const notes = cardIn(strays, 'notes.txt');
        await expectVisible(notes.getByText(/^notes\.txt: not a card/), 'a stray file is listed with why it is not a card');
        await notes.getByRole('link', { name: 'notes.txt' }).click();
        await strays.waitForURL('**/inbox/notes.txt', { timeout: WAIT_MS });
        await expectVisible(strays.getByText(/^notes\.txt: not a card/), "the stray file's page says why it is not a card");
        await expectCount(strays.locator('section[aria-label="Keys"]'), 0, 'and lays out no keys');
        await strays.getByRole('button', { name: 'Source' }).click();
        const shown = await strays.locator('pre[data-source]').textContent();
        if (shown !== strayText) throw new Refused(`the stray file's Source is the file as written — it shows ${JSON.stringify(shown)}`);
        await settled(strays);
        await strays.screenshot({ path: path.join(OUT, `inbox-strays-${await themeOf(strays)}.png`), fullPage: true });
        await strays.waitForLoadState('networkidle');
        const seen = problems();
        if (seen.length) throw new Refused(`no console error and no failed request with a stray file and a folder in the inbox — ${seen.length} seen:\n    ${seen.join('\n    ')}`);
      } finally {
        await strays.close();
        fs.rmSync(strayFile, { force: true });
        fs.rmSync(folder, { recursive: true, force: true });
        fs.rmSync(namedFile, { force: true });
        fs.rmSync(namedCard, { force: true });
      }

      // An empty inbox, in a page of its own: every card set aside, and put back.
      const aside = path.join(store!, 'inbox-aside');
      const empty = await page.context().newPage();
      try {
        fs.renameSync(inbox, aside);
        const { problems } = watch(empty);
        await empty.goto(page.url(), { waitUntil: 'networkidle' });
        await expectVisible(
          empty.locator('[data-empty]', { hasText: 'The inbox is empty. File an idea in the box above, or from the command line: wf inbox add "<idea>".' }),
          'an empty inbox says how to file a card, here and with wf inbox add',
        );
        await expectVisible(empty.locator('form[aria-label="File a card"]'), 'and still has the box');
        await settled(empty);
        await empty.screenshot({ path: path.join(OUT, `inbox-empty-${await themeOf(empty)}.png`), fullPage: true });
        await empty.waitForLoadState('networkidle');
        const seen = problems();
        if (seen.length) throw new Refused(`no console error and no failed request on an empty inbox — ${seen.length} seen:\n    ${seen.join('\n    ')}`);
      } finally {
        await empty.close();
        if (fs.existsSync(aside)) {
          fs.rmSync(inbox, { recursive: true, force: true });
          fs.renameSync(aside, inbox);
        }
      }

      /** Waited on from before the answer, so the read of the inbox the answer asks for is not missed. */
      const rereadOf = (p: Page) => p.waitForResponse((r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/inbox', { timeout: WAIT_MS });
      /** That a page saw the one refusal it made, as the browser reports it — its answer, and the line Chromium writes to the console for one — and nothing else. */
      const onlyRefusal = (p: Page, seen: string[], answered: Response) => {
        const expected = `request answered ${answered.status()}: ${answered.request().method()} ${answered.url()}`;
        const chromium = new RegExp(`^console error: Failed to load resource: the server responded with a status of ${answered.status()}\\b`);
        const others = seen.filter((problem) => problem !== expected && !chromium.test(problem));
        if (!seen.includes(expected) || others.length) throw new Refused(`the refused page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
      };

      // Refused, in a page of its own whose one refusal is the point: the card dropped behind the page's back — `wf inbox rm` in a terminal —
      // after its start form opened. The inbox is read again after the answer, so the card leaves the list, and the package's sentence stays,
      // word for word, in the card's place; no run written; the card put back.
      const bareFile = path.join(inbox, `${bare.name}.md`);
      const bareAside = path.join(store!, `${bare.name}.md.aside`);
      const refused = await page.context().newPage();
      try {
        const { problems } = watch(refused);
        await refused.goto(page.url(), { waitUntil: 'networkidle' });
        const item = cardIn(refused, bare.name);
        await item.getByRole('button', { name: 'Start' }).click();
        const pick = item.getByRole('combobox', { name: 'Workflow' });
        await expectVisible(pick, `Start opens ${bare.name}'s start form`);
        if ((await pick.inputValue()) !== '') throw new Refused(`a card that names no workflow is preset to none — it was ${JSON.stringify(await pick.inputValue())}`);
        await expectCount(item.locator(`form[aria-label="Start ${bare.name}"]`), 0, 'and has no Start until one is picked');
        await pick.selectOption({ label: WORKFLOWS.good.name });
        const form = item.locator(`form[aria-label="Start ${bare.name}"]`);
        const bareBrief = form.getByRole('textbox', { name: 'Brief' });
        await expectVisible(bareBrief, 'a workflow picked, the brief and Start');
        if ((await bareBrief.inputValue()) !== bare.body) throw new Refused(`the brief is prefilled from the card's body — it was ${JSON.stringify(await bareBrief.inputValue())}`);
        const before = fs.readdirSync(runsDir).sort();
        fs.renameSync(bareFile, bareAside);
        const reread = rereadOf(refused);
        const [answered] = await Promise.all([
          refused.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', { timeout: WAIT_MS }),
          form.getByRole('button', { name: 'Start' }).click(),
        ]);
        const { error } = (await answered.json()) as { error?: string };
        const sentence = `no card ${bare.name} in the inbox. Its cards are: ${[planned.name, rich.name, ...queuedByFiling].sort().join(', ')}. Start one of those — wf start ${path.join(inbox, '<name>.md')} — or park the idea first: wf inbox add "<idea>".`;
        if (answered.status() !== 404 || error !== sentence) {
          throw new Refused(`the api refuses to start a card that is not there, in the package's words — it answered ${answered.status()}: ${JSON.stringify(error)}`);
        }
        const listing = (await (await reread).json()) as Array<{ name: string }>;
        if (listing.some((e) => e.name === bare.name)) throw new Refused(`the inbox read again after the refusal no longer lists ${bare.name} — it listed ${JSON.stringify(listing.map((e) => e.name))}`);
        await refused.waitForLoadState('networkidle');
        await expectCount(item, 0, 'the card leaves the list once the inbox is read again after the refusal');
        await expectCount(listed(refused), 2 + QUEUED.length, `and only ${rich.name}, ${planned.name} and the queued cards are listed`);
        const gone = refused.locator(`section[aria-label="Cards"] li[data-gone="${bare.name}"]`);
        await expectVisible(gone.locator('[data-refused="start"]', { hasText: 'Not started. The api refused it:' }), 'the refusal stays, where the card was listed, not swallowed with the form');
        const shown = await gone.locator('[data-refused] p.font-mono').textContent();
        if (shown !== error) throw new Refused(`the refusal in the card's place is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`);
        if (JSON.stringify(await order(refused)) !== JSON.stringify([rich.name, planned.name, ...queuedByFiling])) throw new Refused(`the cards listed are the inbox's — ${(await order(refused)).join(', ')}`);
        const after = fs.readdirSync(runsDir).sort();
        if (JSON.stringify(after) !== JSON.stringify(before)) throw new Refused(`nothing is written on a refusal — ${runsDir} went from ${before.length} files to ${after.length}`);
        await settled(refused);
        await refused.screenshot({ path: path.join(OUT, `inbox-refused-${await themeOf(refused)}.png`), fullPage: true });
        await refused.waitForLoadState('networkidle');
        onlyRefusal(refused, problems(), answered);
      } finally {
        await refused.close();
        if (fs.existsSync(bareAside)) fs.renameSync(bareAside, bareFile);
      }

      // Remove refused, in a page of its own: the card dropped behind the page's back before its Remove was clicked — a 404. As a start's: the
      // card leaves the list once the inbox is read again, the package's sentence stays in its place, and Dismiss takes that away. Put back.
      const plannedAside = path.join(store!, `${planned.name}.md.aside`);
      const unremoved = await page.context().newPage();
      try {
        const { problems } = watch(unremoved);
        await unremoved.goto(page.url(), { waitUntil: 'networkidle' });
        const item = cardIn(unremoved, planned.name);
        await expectVisible(item.getByRole('button', { name: 'Remove' }), `${planned.name} offers Remove`);
        fs.renameSync(cardFile, plannedAside);
        const reread = rereadOf(unremoved);
        const [answered] = await Promise.all([
          unremoved.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/inbox/${planned.name}`, { timeout: WAIT_MS }),
          item.getByRole('button', { name: 'Remove' }).click(),
        ]);
        const { error } = (await answered.json()) as { error?: string };
        if (answered.status() !== 404 || !error?.startsWith(`no card ${planned.name} in the inbox.`)) {
          throw new Refused(`the api refuses to drop a card that is not there, in the package's words — it answered ${answered.status()}: ${JSON.stringify(error)}`);
        }
        await reread;
        await unremoved.waitForLoadState('networkidle');
        await expectCount(item, 0, 'the card leaves the list once the inbox is read again after the refusal');
        const gone = unremoved.locator(`section[aria-label="Cards"] li[data-gone="${planned.name}"]`);
        await expectVisible(gone.locator('[data-refused="remove"]', { hasText: 'Not removed. The api refused it:' }), 'the refusal stays, where the card was listed');
        const shown = await gone.locator('[data-refused] p.font-mono').textContent();
        if (shown !== error) throw new Refused(`the refusal in the card's place is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`);
        await expectVisible(gone.locator('[data-title]', { hasText: planned.title }), 'with the first line of the card it was about');
        await settled(unremoved);
        await unremoved.screenshot({ path: path.join(OUT, `inbox-remove-refused-${await themeOf(unremoved)}.png`), fullPage: true });
        await gone.getByRole('button', { name: 'Dismiss' }).click();
        await expectCount(gone, 0, 'Dismiss takes the refusal of a card that is gone away');
        await unremoved.waitForLoadState('networkidle');
        onlyRefusal(unremoved, problems(), answered);
      } finally {
        await unremoved.close();
        if (fs.existsSync(plannedAside)) fs.renameSync(plannedAside, cardFile);
      }

      // Start refused with a 409, in a page of its own: a run started the card behind the page's back — its removal failed — after its form
      // opened. The inbox read again lists the card as started, so its form goes, and the package's sentence stays on the card. Taken back.
      const conflicted = await page.context().newPage();
      try {
        const { problems } = watch(conflicted);
        await conflicted.goto(page.url(), { waitUntil: 'networkidle' });
        const item = cardIn(conflicted, planned.name);
        await item.getByRole('button', { name: 'Start' }).click();
        const form = item.locator(`form[aria-label="Start ${planned.name}"]`);
        await expectVisible(form.getByRole('button', { name: 'Start' }), `Start opens ${planned.name}'s start form`);
        fs.writeFileSync(startedRecord, JSON.stringify({
          id: STARTED_AS, repo: checkout, workspace: checkout, baseRef: 'HEAD', branch: 'main', isolate: true, brief: planned.body,
          workflowDir: path.join(checkout, 'workflows', WORKFLOWS.good.name), workflow: [], steps: {}, createdAt: new Date().toISOString(), from: { inbox: planned.name },
        }, null, 2));
        const before = fs.readdirSync(runsDir).sort();
        const reread = rereadOf(conflicted);
        const [answered] = await Promise.all([
          conflicted.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', { timeout: WAIT_MS }),
          form.getByRole('button', { name: 'Start' }).click(),
        ]);
        const { error } = (await answered.json()) as { error?: string };
        if (answered.status() !== 409 || !error?.includes(STARTED_AS)) {
          throw new Refused(`the api refuses to start a card a run was started from, naming the run — it answered ${answered.status()}: ${JSON.stringify(error)}`);
        }
        await reread;
        await conflicted.waitForLoadState('networkidle');
        await expectVisible(item.locator(`[data-started-as] a[href="/runs/${STARTED_AS}"]`), `the card, read again, says it was started as ${STARTED_AS}`);
        await expectCount(item.locator('[data-start-card]'), 0, 'its start form is gone: it may not start again');
        await expectVisible(item.locator('[data-refused="start"]', { hasText: 'Not started. The api refused it:' }), 'and the refusal stays, on the card');
        const shown = await item.locator('[data-refused] p.font-mono').textContent();
        if (shown !== error) throw new Refused(`the refusal on the card is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`);
        const after = fs.readdirSync(runsDir).sort();
        if (JSON.stringify(after) !== JSON.stringify(before)) throw new Refused(`nothing is written on a refusal — ${runsDir} went from ${before.length} files to ${after.length}`);
        await settled(conflicted);
        await conflicted.screenshot({ path: path.join(OUT, `inbox-conflict-${await themeOf(conflicted)}.png`), fullPage: true });
        await conflicted.waitForLoadState('networkidle');
        onlyRefusal(conflicted, problems(), answered);
      } finally {
        await conflicted.close();
        fs.rmSync(startedRecord, { force: true });
      }

      // Queue refused with a 409, in a page of its own whose one refusal is the point: the card queued behind the page's back — from another tab
      // of the board, through the api, which this page's watch does not see — after the page listed it. The inbox read again says it is queued,
      // offers Unqueue, and lists it where it was; the package's sentence stays on the card, word for word. Taken back: the card written, and
      // dated, as it was.
      const plannedText = fs.readFileSync(cardFile, 'utf8');
      const plannedTime = fs.statSync(cardFile).mtime;
      const requeued = await page.context().newPage();
      try {
        const { problems } = watch(requeued);
        await requeued.goto(page.url(), { waitUntil: 'networkidle' });
        const item = cardIn(requeued, planned.name);
        const queueIt = item.getByRole('button', { name: 'Queue', exact: true });
        await expectVisible(queueIt, `${planned.name} offers Queue`);
        const listedBefore = await order(requeued);
        const elsewhere = await fetch(new URL(`/api/inbox/${planned.name}/queue`, requeued.url()), { method: 'POST', headers: { 'content-type': 'application/json' } });
        const { queued: behind } = (await elsewhere.json()) as { queued?: string };
        if (elsewhere.status !== 200 || !behind) throw new Refused(`another tab queues ${planned.name} through the api — it answered ${elsewhere.status}`);
        if (fs.readFileSync(cardFile, 'utf8') !== queuedCardText(planned, behind, checkout)) throw new Refused(`the card is queued behind the page's back — ${cardFile} holds ${JSON.stringify(fs.readFileSync(cardFile, 'utf8'))}`);
        const reread = rereadOf(requeued);
        const [answered] = await Promise.all([
          requeued.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/inbox/${planned.name}/queue`, { timeout: WAIT_MS }),
          queueIt.click(),
        ]);
        const { error } = (await answered.json()) as { error?: string };
        const place = QUEUED.length + 1;
        const sentence = `${planned.name}.md: already queued, at ${behind}, ${place} in the queue's order: the tick starts it when its turn comes and a run slot is free. To queue it again, take it back first: wf inbox queue ${planned.name} --off.`;
        if (answered.status() !== 409 || error !== sentence) {
          throw new Refused(`the api refuses to queue a card queued already, in the package's words — it answered ${answered.status()}: ${JSON.stringify(error)}`);
        }
        await reread;
        await requeued.waitForLoadState('networkidle');
        await expectTexts(item.locator('[data-queued]'), [`queued · ${PLACES_SAID[place - 1]}`], `the card, read again, says it is queued, in its place (queued · ${PLACES_SAID[place - 1]})`);
        await expectVisible(item.getByRole('button', { name: 'Unqueue' }), 'and offers Unqueue in place of Queue');
        if (JSON.stringify(await order(requeued)) !== JSON.stringify(listedBefore)) {
          throw new Refused(`the card, queued elsewhere, is listed where it was — ${listedBefore.join(', ')} — and the list is ${(await order(requeued)).join(', ')}`);
        }
        await expectVisible(item.locator('[data-refused="queue"]', { hasText: 'Not queued. The api refused it:' }), 'and the refusal stays, on the card');
        const shown = await item.locator('[data-refused] p.font-mono').textContent();
        if (shown !== error) throw new Refused(`the refusal on the card is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`);
        await settled(requeued);
        await requeued.screenshot({ path: path.join(OUT, `inbox-queue-refused-${await themeOf(requeued)}.png`), fullPage: true });
        await requeued.waitForLoadState('networkidle');
        onlyRefusal(requeued, problems(), answered);
      } finally {
        await requeued.close();
        fs.writeFileSync(cardFile, plannedText);
        fs.utimesSync(cardFile, plannedTime, plannedTime);
      }
      await settled(page);
    },
  },
  {
    // A card's page: its body rendered — a heading, a list, a table, a code block, a line of raw HTML shown as text, a link that opens in a
    // new tab and a `javascript:` one that is only its words — then its keys, each with what it means as the api says it, and Source: the
    // file as written, frontmatter included. It writes nothing: the inbox is as it was.
    name: 'card',
    route: `/inbox/${CARDS.rich.name}`,
    expect: async (page) => {
      await sidebar(page);
      await expectVisible(page.locator('[data-sidebar="sidebar"] a[data-active="true"]', { hasText: 'Inbox' }), "the sidebar lights Inbox on a card's page");
      const { rich } = CARDS;
      const inbox = path.join(store!, 'inbox');
      const before = filesIn(inbox);
      await expectVisible(page.locator('h1', { hasText: rich.name }), `the page names the card (${rich.name})`);
      await expectVisible(page.getByRole('link', { name: '← Inbox' }), 'and leads back to the Inbox');

      const file = page.locator('section[aria-label="The file"]');
      const body = file.locator('[data-markdown]').first();
      await expectRendered(body, rich);
      await expectVisible(body.getByText(rich.html, { exact: true }), 'the line of raw HTML, shown as the text it is');
      await expectCount(body.locator('b, img, script'), 0, 'and no element made of it');
      await expectVisible(body.getByText(rich.unsafe, { exact: true }), 'a javascript: link, shown as its words');
      await expectCount(page.locator('a[href^="javascript:" i]'), 0, 'and no link on the page runs script');
      const link = body.getByRole('link', { name: rich.link.text });
      await expectVisible(link, `a link, as a link (${rich.link.text})`);
      const [href, target, rel] = await Promise.all([link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel')]);
      if (href !== rich.link.href || target !== '_blank' || !rel?.split(' ').includes('noreferrer')) {
        throw new Refused(`a link opens in a new tab and gives the page it opens nothing of this one — href ${href}, target ${target}, rel ${rel}`);
      }

      await expectKeys(page, file, `/api/inbox/${rich.name}`, { workflow: rich.workflow });
      await expectSource(file, body, path.join(inbox, `${rich.name}.md`));
      if (JSON.stringify(filesIn(inbox)) !== JSON.stringify(before)) throw new Refused(`a card's page writes nothing — ${inbox} changed while it was open`);
    },
  },
  {
    // A step's page, from its block on the Workflows page: what it is told, rendered, then every key a step may set — set or not — with
    // its value as the loader reads it and what it means, and Source: the file as written. It writes nothing: the checkout's folder is as it was.
    name: 'workflow-step',
    route: `/workflows/repo/${WORKFLOWS.good.name}/review`,
    expect: async (page) => {
      await sidebar(page);
      await expectVisible(page.locator('[data-sidebar="sidebar"] a[data-active="true"]', { hasText: 'Workflows' }), "the sidebar lights Workflows on a step's page");
      const { good } = WORKFLOWS;
      const folder = path.join(store!, 'checkout', 'workflows', good.name);
      const before = filesIn(folder);
      await expectVisible(page.locator('h1', { hasText: /^review$/ }), "the page names the step");
      await expectVisible(page.getByText(good.name, { exact: true }), `and the workflow it is a step of (${good.name})`);
      await expectVisible(page.getByText('this repository', { exact: true }), "marked as the repository's");

      const file = page.locator('section[aria-label="The file"]');
      const body = file.locator('[data-markdown]').first();
      await expectRendered(body, good.review);
      await expectKeys(page, file, `/api/workflows/repo/${good.name}/review`, good.review.keys);
      await expectSource(file, body, path.join(folder, 'review.md'));
      if (JSON.stringify(filesIn(folder)) !== JSON.stringify(before)) throw new Refused(`a step's page writes nothing — ${folder} changed while it was open`);
    },
  },
  {
    // The agents beside the workflows: yours, which the board writes, and the repository's, read-only, each with the nodes that name it, linked.
    // The repository's `implementer` read, and the node that names it followed to its step's page, which links back; `scribe`'s form read with
    // its result schema; an agent made, edited and removed, each on disk as the package writes it. And, in a page of its own, a removal refused
    // because a node still names the agent. Every write is taken back, so the next visit, in either theme, reads the store as seeded.
    name: 'agents',
    route: '/agents',
    expect: async (page) => {
      await sidebar(page);
      await expectVisible(page.locator('[data-sidebar="sidebar"] a[data-active="true"]', { hasText: 'Agents' }), 'the sidebar lights Agents on its page');
      const { good } = WORKFLOWS;
      const { seeded, made, naming } = AGENTS;
      const agentsDir = path.join(store!, 'workflows', 'agents');
      const before = filesIn(agentsDir);
      const card = (p: Page, from: string, name: string) => p.locator(`section[data-agent="${name}"][data-from="${from}"]`);
      const agentPath = (from: string, name: string) => `/agents/${from}/${name}`;

      const yours = page.locator('section[aria-label="Yours"]');
      const theirs = page.locator('section[aria-label="This repository"]');
      await expectCount(yours.locator('section[data-agent]'), 1, `yours lists one agent, ${seeded.name}`);
      await expectCount(theirs.locator('section[data-agent]'), 1, `the repository's lists one, ${good.agent.name}`);
      const scribe = card(page, 'yours', seeded.name);
      await expectVisible(scribe.getByText(seeded.description, { exact: true }), `${seeded.name} with its description`);
      await expectVisible(scribe.locator('dd', { hasText: /^sonnet$/ }), 'and the keys it sets');
      await expectTexts(scribe.locator('[data-used-by]'), ['No node names it yet.'], `and that no node names ${seeded.name}`);
      const implementer = card(page, 'repo', good.agent.name);
      const node = implementer.locator(`[data-used-by] a[data-node="${good.name}/implement"]`);
      await expectVisible(node, `${good.agent.name} links the node that names it, ${good.name} › implement`);
      if ((await node.getAttribute('href')) !== `/workflows/repo/${good.name}/implement`) throw new Refused(`the node's link is its step's page — it is ${await node.getAttribute('href')}`);

      // The repository's agent, read-only: every field read and none written, no Save, and how to start one of yours from it.
      await implementer.getByRole('link', { name: good.agent.name, exact: true }).click();
      await page.waitForURL((url) => url.pathname === agentPath('repo', good.agent.name), { timeout: WAIT_MS });
      const repoForm = page.locator(`form[data-agent-form="${good.agent.name}"]`);
      await expectVisible(repoForm, `${good.agent.name}'s form`);
      if ((await repoForm.getByRole('textbox', { name: 'Model' }).inputValue()) !== 'opus') throw new Refused(`${good.agent.name}'s model reads opus, as its file sets it`);
      for (const field of ['Name', 'Model', 'Instructions']) {
        if ((await repoForm.getByRole('textbox', { name: field }).getAttribute('readonly')) === null) throw new Refused(`the repository's agent is read-only: its ${field} is not`);
      }
      await expectCount(repoForm.getByRole('button', { name: 'Save' }), 0, 'and it offers no Save');
      await expectCount(page.getByRole('button', { name: 'Remove…' }), 0, 'nor Remove');
      await expectVisible(page.locator('[data-read-only]', { hasText: `cp ${path.join(store!, 'checkout', 'workflows', 'agents', `${good.agent.name}.md`)} ~/.agent-workflows/workflows/agents/` }), 'and says how to start one of yours from it');
      const file = page.locator('section[aria-label="The file"]');
      await file.getByRole('button', { name: 'Source' }).click();
      const shown = await file.locator('pre[data-source]').textContent();
      const onDisk = fs.readFileSync(path.join(store!, 'checkout', 'workflows', 'agents', `${good.agent.name}.md`), 'utf8');
      if (shown !== onDisk) throw new Refused(`Source is the agent's file byte for byte — it shows ${JSON.stringify(shown)}`);
      await file.getByRole('button', { name: 'Source' }).click();
      await settled(page);
      await page.screenshot({ path: path.join(OUT, `agents-repo-${await themeOf(page)}.png`), fullPage: true });

      // Its node, followed: the step's page names the agent attached to it, linked back.
      await page.locator(`[data-used-by] a[data-node="${good.name}/implement"]`).click();
      await page.waitForURL((url) => url.pathname === `/workflows/repo/${good.name}/implement`, { timeout: WAIT_MS });
      const back = page.locator(`[data-step-agent] a[data-agent-link="${good.agent.name}"]`);
      await expectVisible(back, `implement's page names its agent, ${good.agent.name}, as a link`);
      await back.click();
      await page.waitForURL((url) => url.pathname === agentPath('repo', good.agent.name), { timeout: WAIT_MS });

      // Yours: scribe's form, its result schema read from the file its output: names.
      await page.goto(new URL(agentPath('yours', seeded.name), page.url()).href, { waitUntil: 'networkidle' });
      const scribeForm = page.locator(`form[data-agent-form="${seeded.name}"]`);
      await expectVisible(scribeForm, `${seeded.name}'s form`);
      if ((await scribeForm.getByRole('textbox', { name: 'File' }).inputValue()) !== seeded.keys.output) throw new Refused(`${seeded.name}'s result schema is ${seeded.keys.output}`);
      if ((await scribeForm.getByRole('textbox', { name: 'Its fields' }).inputValue()) !== `${seeded.schema}\n`) throw new Refused(`and its fields are the schema's text — it shows ${JSON.stringify(await scribeForm.getByRole('textbox', { name: 'Its fields' }).inputValue())}`);
      const instructions = await scribeForm.getByRole('textbox', { name: 'Instructions' }).inputValue();
      if (instructions.trim() !== seeded.body) throw new Refused(`and its instructions are its body — they read ${JSON.stringify(instructions)}`);
      await expectVisible(scribeForm.getByRole('button', { name: 'Save' }), 'yours offers Save');
      if (!(await scribeForm.getByRole('button', { name: 'Save' }).isDisabled())) throw new Refused('Save waits for a change');

      // Made: the form, filled, creates agents/<name>.md as the package writes it, and opens its page.
      const madeFile = path.join(agentsDir, `${made.name}.md`);
      try {
        await page.goto(new URL('/agents', page.url()).href, { waitUntil: 'networkidle' });
        await page.getByRole('link', { name: 'New agent' }).click();
        await page.waitForURL((url) => url.pathname === '/agents/new', { timeout: WAIT_MS });
        const form = page.getByRole('form', { name: 'New agent' });
        await form.getByRole('textbox', { name: 'Name' }).fill(made.name);
        await form.getByRole('textbox', { name: 'Description' }).fill(made.description);
        await form.getByRole('textbox', { name: 'Model' }).fill(made.model);
        await form.getByRole('textbox', { name: 'Instructions' }).fill(made.body);
        await settled(page);
        await page.screenshot({ path: path.join(OUT, `agents-new-${await themeOf(page)}.png`), fullPage: true });
        const [created] = await Promise.all([
          page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/agents/yours', { timeout: WAIT_MS }),
          form.getByRole('button', { name: 'Create agent' }).click(),
        ]);
        if (created.status() !== 201) throw new Refused(`the api makes the agent — it answered ${created.status()}: ${await created.text()}`);
        await page.waitForURL((url) => url.pathname === agentPath('yours', made.name), { timeout: WAIT_MS });
        const written = `---\ndescription: ${made.description}\nmodel: ${made.model}\n---\n${made.body}\n`;
        if (!fs.existsSync(madeFile) || fs.readFileSync(madeFile, 'utf8') !== written) throw new Refused(`agents/${made.name}.md is written as the package writes an agent — it holds ${fs.existsSync(madeFile) ? JSON.stringify(fs.readFileSync(madeFile, 'utf8')) : 'nothing'}`);

        // Edited: its model changed and saved, against the version it was read at.
        const madeForm = page.locator(`form[data-agent-form="${made.name}"]`);
        await expectVisible(madeForm, `the page of ${made.name}, made`);
        await madeForm.getByRole('textbox', { name: 'Model' }).fill(made.edited);
        const [saved] = await Promise.all([
          page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/agents/yours/${made.name}`, { timeout: WAIT_MS }),
          madeForm.getByRole('button', { name: 'Save' }).click(),
        ]);
        if (saved.status() !== 200) throw new Refused(`the api saves the agent — it answered ${saved.status()}: ${await saved.text()}`);
        const edited = written.replace(`model: ${made.model}`, `model: ${made.edited}`);
        if (fs.readFileSync(madeFile, 'utf8') !== edited) throw new Refused(`the edit is on disk — agents/${made.name}.md holds ${JSON.stringify(fs.readFileSync(madeFile, 'utf8'))}`);
        await expectVisible(madeForm.getByRole('button', { name: 'Save', disabled: true }), 'once saved, the form is the agent as it now reads, and Save waits again');
        await settled(page);
        await page.screenshot({ path: path.join(OUT, `agents-edit-${await themeOf(page)}.png`), fullPage: true });

        // Removed: asked twice, then gone from disk and from the list.
        await page.getByRole('button', { name: 'Remove…' }).click();
        const [removed] = await Promise.all([
          page.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/agents/yours/${made.name}`, { timeout: WAIT_MS }),
          page.locator('[data-remove-asks]').getByRole('button', { name: 'Remove', exact: true }).click(),
        ]);
        if (removed.status() !== 200) throw new Refused(`the api removes the agent — it answered ${removed.status()}: ${await removed.text()}`);
        await page.waitForURL((url) => url.pathname === '/agents', { timeout: WAIT_MS });
        await expectCount(card(page, 'yours', made.name), 0, `${made.name} is gone from the list`);
      } finally {
        fs.rmSync(madeFile, { force: true });
      }

      // Refused, in a page of its own whose one refusal is the point: scribe removed while a node of yours names it. The package's sentence,
      // word for word, with the node linked, and nothing removed.
      const namingDir = path.join(store!, 'workflows', naming);
      fs.mkdirSync(namingDir, { recursive: true });
      fs.writeFileSync(path.join(namingDir, 'write.md'), `---\nagent: ${seeded.name}\n---\nWrite the notes.\n`);
      const refused = await page.context().newPage();
      try {
        const { problems } = watch(refused);
        await refused.goto(new URL(agentPath('yours', seeded.name), page.url()).href, { waitUntil: 'networkidle' });
        await expectVisible(refused.locator(`[data-used-by] a[data-node="${naming}/write"]`), `${seeded.name} is attached to ${naming} › write`);
        await refused.getByRole('button', { name: 'Remove…' }).click();
        const [answered] = await Promise.all([
          refused.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/agents/yours/${seeded.name}`, { timeout: WAIT_MS }),
          refused.locator('[data-remove-asks]').getByRole('button', { name: 'Remove', exact: true }).click(),
        ]);
        const { error, users } = (await answered.json()) as { error?: string; users?: string[] };
        if (answered.status() !== 409 || !error?.startsWith(`agents/${seeded.name}.md is named by a step beside it — ${naming}/write — `) || JSON.stringify(users) !== JSON.stringify([`${naming}/write`])) {
          throw new Refused(`the package refuses to remove an agent a node names — the api answered ${answered.status()}: ${JSON.stringify({ error, users })}`);
        }
        const alert = refused.locator('[data-agent-refused]');
        await expectVisible(alert, 'the refusal is shown, not swallowed');
        const said = await alert.locator('p.font-mono').textContent();
        if (said !== error) throw new Refused(`the refusal is the package's sentence, verbatim — it shows ${JSON.stringify(said)}`);
        await expectVisible(alert.locator(`a[data-node="${naming}/write"]`), 'with the node that names it, linked');
        if (JSON.stringify(filesIn(agentsDir)) !== JSON.stringify(before)) throw new Refused(`nothing is removed on a refusal — ${agentsDir} changed`);
        await settled(refused);
        await refused.screenshot({ path: path.join(OUT, `agents-refused-${await themeOf(refused)}.png`), fullPage: true });
        await refused.waitForLoadState('networkidle');
        const expected = `request answered 409: DELETE ${answered.url()}`;
        const seen = problems();
        const others = seen.filter((p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p));
        if (!seen.includes(expected) || others.length) throw new Refused(`the refused page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
      } finally {
        // Removed before the page closes: the list, focused again, reads the store once more, and must read it as seeded.
        fs.rmSync(namingDir, { recursive: true, force: true });
        await refused.close();
      }
      await page.reload({ waitUntil: 'networkidle' });
      await expectTexts(card(page, 'yours', seeded.name).locator('[data-used-by]'), ['No node names it yet.'], `back on the list, no node names ${seeded.name} again`);
      if (JSON.stringify(filesIn(agentsDir)) !== JSON.stringify(before)) throw new Refused(`the page puts the store back — ${agentsDir} holds ${filesIn(agentsDir).map(([n]) => n).join(', ')}`);
    },
  },
  {
    name: 'capabilities',
    route: '/capabilities',
    expect: async (page) => {
      await sidebar(page);
      await expectVisible(page.locator('[data-sidebar="sidebar"] a[data-active="true"]', { hasText: 'Capabilities' }), 'the sidebar lights Capabilities on its page');
      const { skill, bareSkill, agent, server, missing, denied, asked } = CHECKOUT;
      const section = (title: string) => page.locator(`section[aria-label="${title}"]`);
      for (const [title, count] of [['Skills', 2], ['Agents', 1], ['MCP servers', 2], ['Denied', denied.length], ['Asks', asked.length]] as const) {
        await expectVisible(section(title).locator('h2 [data-count]', { hasText: new RegExp(`^${count}$`) }), `the ${title} section counts ${count}`);
      }

      const skills = section('Skills');
      await expectVisible(skills.getByText(skill.name, { exact: true }), `the skill in .claude/skills/${skill.dir} by the name its frontmatter gives (${skill.name})`);
      await expectVisible(skills.getByText(skill.description, { exact: true }), `${skill.name} with its description`);
      await expectVisible(skills.getByText(`.claude/skills/${skill.dir}/SKILL.md`, { exact: true }), `${skill.name} with where it was read from`);
      await expectVisible(skills.getByText(bareSkill, { exact: true }), `a SKILL.md without frontmatter, listed by its directory (${bareSkill})`);
      const agents = section('Agents');
      await expectVisible(agents.getByText(agent.description, { exact: true }), `the agent ${agent.name} with its description`);
      await expectVisible(agents.getByText(`.claude/agents/${agent.file}`, { exact: true }), `${agent.name} with where it was read from`);

      const listing = page.locator(`li[aria-label="MCP server ${server.name}"]`);
      await expectVisible(listing.getByText('enabled', { exact: true }), `${server.name} reads as enabled by the settings`);
      for (const tool of server.tools) {
        await expectVisible(listing.locator('li').getByText(tool, { exact: true }), `${server.name} lists ${tool}, as the server itself answered tools/list`);
      }
      await expectVisible(listing.getByText(server.said, { exact: true }), 'a tool with the first line of its description');
      await expectCount(listing.getByText(server.secondLine), 0, 'and only its first line');
      await expectVisible(listing.locator(`li[data-denied="${server.denied}"]`, { hasText: 'denied' }), `the tool ${server.denied} refuses is marked denied`);
      await expectVisible(listing.getByText('.mcp.json', { exact: true }).first(), `${server.name} with where it was read from`);
      await expectVisible(
        page.locator(`li[aria-label="MCP server ${missing.name}"]`).getByText(`there is no command \`${missing.command}\``),
        `a server whose command does not exist shows its error on its entry (${missing.name}), and the page still renders`,
      );

      const rules = section('Denied');
      for (const rule of denied) await expectVisible(rules.getByText(rule, { exact: true }), `the denied list has ${rule}`);
      await expectVisible(rules.getByText(`refuses ${server.name} · wipe`), `the denied list says which listed tool ${server.denied} refuses`);
      // The settings' ask rules, listed for the repository as its deny rules are — whether or not a step reads them.
      const asks = section('Asks');
      for (const rule of asked) await expectVisible(asks.getByText(rule, { exact: true }), `the ask list has ${rule}`);
      await expectVisible(asks.getByText('.claude/settings.json', { exact: true }), 'with where it was read from');

      // What each step gets: the checkout's dev — review fenced to its tools in dontAsk, implement on the harness's own set — and yours, on Codex.
      const { good, yours } = WORKFLOWS;
      const steps = section('What each step gets');
      await expectVisible(steps.locator('h2 [data-count]', { hasText: /^3$/ }), "a row for each step of each workflow that reads: dev's two, and yours");
      const review = steps.locator(`li[data-step="${good.name}/review"]`);
      const declared = good.tools.split(', ');
      for (const tool of declared) await expectVisible(review.locator(`[data-tool="${tool}"]`), `review has ${tool}, which its tools: names`);
      await expectCount(review.locator('[data-tool]'), declared.length, `review has exactly the tools it declares (${good.tools})`);
      await expectCount(review.locator('[data-measured]'), 0, 'and no measured set: it declares its own');
      for (const command of CHECKOUT.allowed.map((rule) => rule.slice('Bash('.length, -1))) {
        await expectVisible(review.locator(`[data-bash="${command}"]`), `review, in dontAsk, shows the Bash command the settings allow (${command})`);
      }
      // Claude Code's read-only commands ask for no rule, in dontAsk too: the page says so, and claims no denial of them.
      await expectVisible(
        review.getByText("In dontAsk, a command that asks is denied without a prompt unless a rule allows it. Claude Code's read-only commands do not ask:"),
        'review, in dontAsk, says a command that asks is denied — not every command no rule allows',
      );
      await expectCount(page.getByText(/a command no rule allows is denied/), 0, 'and nowhere that a command no rule allows is denied, which the read-only commands are not');
      await expectVisible(review.locator('[data-read-only="ls"]:not([data-documented]):not([data-denied])'), 'review runs ls without a rule, as measured');
      await expectVisible(review.locator('[data-read-only="wc"][data-documented]:not([data-denied])'), 'and wc, as the docs name it, marked not measured');
      await expectVisible(review.locator('[data-read-only="find"][data-denied="Bash(find:*)"]'), 'and not find, which the settings deny (Bash(find:*))');
      const [ask] = CHECKOUT.asked;
      await expectVisible(review.locator(`[data-read-only="cat"][data-asks="${ask}"][data-denied="${ask}"]`), `nor cat, which the settings make ask (${ask}), and dontAsk denies`);
      await expectVisible(
        review.locator('[data-read-only-taken]', { hasText: `cat asks, by ${ask} (.claude/settings.json), which dontAsk denies` }),
        'review says why cat is struck, beside the commands',
      );
      await expectVisible(review.locator(`[data-ask-rule="${ask}"]`), `review lists the ask rule that holds for it (${ask})`);
      await expectVisible(
        review.locator('[data-read-only-measured="2026-09-15"]', { hasText: /were measured on 2026-09-15 with 2\.1\.272 \(.+\): that day, under that day's settings/ }),
        'with the day and version the read-only commands were measured on, as a measurement of that day',
      );
      await expectVisible(review.locator('[data-mcp-tool="echo"][data-not-allowed]'), "review's server tool no rule allows is marked: dontAsk denies it without a prompt");
      await expectVisible(review.locator(`[data-mcp-tool="wipe"][data-denied="${server.denied}"]`), `review's server tool the settings deny is marked denied (${server.denied})`);
      const implement = steps.locator(`li[data-step="${good.name}/implement"]`);
      await expectVisible(implement.locator('[data-measured="2026-09-14"]', { hasText: '2.1.270' }), "implement has the harness's own set, with the date and version it was measured on");
      await expectVisible(implement.locator('[data-tool="WebFetch"]:not([data-inferred])'), 'a tool the measurement named is shown as measured (WebFetch)');
      for (const tool of ['Edit', 'Bash']) await expectVisible(implement.locator(`[data-tool="${tool}"][data-inferred]`), `a tool no unfenced measurement named is marked inferred (${tool})`);
      await expectVisible(implement.locator(`[data-removed="${good.disallow}"]`), `implement's disallow: takes ${good.disallow} from it`);
      await expectCount(implement.locator(`[data-tool="${good.disallow}"]`), 0, `and ${good.disallow} is not among its tools`);
      await expectVisible(implement.locator(`[data-skill="${skill.name}"]`), `implement, with Skill, can load the repository's skill (${skill.name})`);
      await expectVisible(implement.locator('[data-read-only="grep"]:not([data-documented])'), 'implement, in no mode, runs the read-only commands without a rule too (grep)');
      await expectVisible(implement.locator(`[data-read-only="cat"][data-asks="${ask}"]:not([data-denied])`), `and cat asks there (${ask}), which no mode but dontAsk denies`);
      const codexed = steps.locator(`li[data-step="${yours.name}/${yours.steps[0]}"]`);
      await expectVisible(codexed.locator('[data-not-claimed]', { hasText: /was not measured.*reads no \.claude\/settings\.json/ }), `yours, on Codex, claims no tool it was not measured to have, and no rule of settings it does not read`);
      await expectCount(codexed.locator('[data-tool], [data-bash], [data-allowed], [data-read-only], [data-ask-rule]'), 0, 'and shows none, nor a read-only command it was not measured to run, nor an ask rule of settings it does not read');
    },
  },
];

// ─── the servers, and stopping them ─────────────────────────────────────────

const servers: Array<{ name: string; child: ChildProcess; output: () => string }> = [];

/**
 * A Unix socket standing in for a session's inbox, as Claude Code's reads one: each connection's lines kept, as JSON where they parse, nothing
 * answered, and its end closed once the sender's is; each line is handed to `onLine` once kept. Unreferenced, so it keeps nothing alive; it goes
 * with the store.
 */
function listen(socket: string, onLine: (line: unknown) => void = () => {}): Promise<void> {
  const server = net.createServer({ allowHalfOpen: true }, (connection) => {
    let got = '';
    connection.setEncoding('utf8');
    connection.on('data', (chunk) => (got += chunk));
    connection.on('end', () => {
      for (const line of got.split('\n').filter((l) => l.trim())) {
        let read: unknown = line;
        try {
          read = JSON.parse(line);
        } catch {
          // Kept as it came.
        }
        heard.push(read);
        onLine(read);
      }
      connection.end();
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socket, () => {
      server.unref();
      resolve();
    });
  });
}

/** Stop both servers and remove the store. Idempotent: `exit` runs it again after a signal did. */
function cleanUp(): void {
  for (const { child } of servers) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
  if (store) fs.rmSync(store, { recursive: true, force: true });
  setStore(undefined);
}
process.on('exit', cleanUp);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    console.error(`\ne2e: ${signal} — stopping the servers`);
    cleanUp();
    process.exit(128 + os.constants.signals[signal]);
  });
}

const ANSI = /\x1b\[[0-9;]*m/g;

/** Start `node <args>` and resolve with what `listening` captures from its output, once it prints it. */
function startServer(name: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, listening: RegExp): Promise<string> {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let raw = '';
  const output = () => raw.replace(ANSI, '');
  servers.push({ name, child, output });
  return new Promise((resolve, reject) => {
    const fail = (why: string) => {
      clearTimeout(timer);
      reject(new Error(`${name} ${why}. What it printed:\n${output() || '(nothing)'}`));
    };
    const timer = setTimeout(() => fail(`did not say where it listens within ${START_MS / 1000} s`), START_MS);
    const read = (chunk: Buffer) => {
      raw += chunk.toString();
      const m = listening.exec(output());
      if (m) {
        clearTimeout(timer);
        resolve(m[1]!);
      }
    };
    child.stdout!.on('data', read);
    child.stderr!.on('data', read);
    // After it resolved, a rejection is a no-op; a server that dies mid-run shows as failed requests.
    child.on('exit', (code, signal) => fail(`exited (${signal ?? `code ${code}`}) before it was listening`));
    child.on('error', (err) => fail(`could not start: ${err.message}`));
  });
}

/** A package's file, from the nearest node_modules above the web app — where a worktree's link leads. */
function fromNodeModules(file: string): string {
  for (let dir = WEB; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', file);
    if (fs.existsSync(candidate)) return candidate;
    if (dir === path.dirname(dir)) throw new Error(`no node_modules/${file} above ${WEB}. Run \`npm install\` in the repository.`);
  }
}

// ─── the run ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const vite = fromNodeModules(path.join('vite', 'bin', 'vite.js'));

  console.log('e2e: building the web app');
  try {
    execFileSync(process.execPath, [vite, 'build'], { cwd: WEB, stdio: 'pipe' });
  } catch (err) {
    const { stdout, stderr } = err as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`the web app did not build:\n${String(stdout ?? '')}${String(stderr ?? '')}`.replace(ANSI, ''));
  }

  // A string from here on, and the same store the pages read off world.ts.
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-e2e-'));
  setStore(store);
  seed(store);
  const checkout = path.join(store, 'checkout');
  seedCheckout(checkout, path.join(API, 'test', 'fixtures', 'mcp-server.ts'));
  seedWorkflows(checkout, store);
  seedInbox(store, checkout);
  seedQueue(store, checkout);
  seedQuota(store);
  // After the checkout's files, which its base commits.
  seedDiamond(checkout, store);
  // Over every journal the seed wrote: where the api reads when each task was filed.
  seedFeed(store);
  // A `claude` that lists the store's sessions (REGISTRY) — HELD's, blocked — first on the api's PATH. The engine observes `claude
  // agents` on every list; the pages are about the store, not about the sessions on this machine. And where Claude Code keeps its
  // transcripts, in the store (CLAUDE_CONFIG_DIR): the engine reads a session's conversation from there, never from this machine's.
  const bin = path.join(store, 'bin');
  fs.mkdirSync(bin);
  // It answers the api's get_usage request too (quota.ts), with the store's answer (QUOTA.file) under the request's id, and waits on its stdin
  // as Claude Code does; with no answer in the store, it ends as a claude that cannot answer would.
  const answer = path.join(store, QUOTA.file);
  fs.writeFileSync(path.join(bin, 'claude'), [
    '#!/bin/sh',
    `if [ "$1" = agents ]; then cat "${path.join(store, REGISTRY)}"; exit 0; fi`,
    'if [ "$1" != -p ]; then echo \'[]\'; exit 0; fi',
    'read -r line',
    `if [ ! -f "${answer}" ]; then echo 'claude: not signed in, the e2e took its answer away' >&2; exit 1; fi`,
    `id=$(printf '%s' "$line" | sed -n 's/.*"request_id":"\\([^"]*\\)".*/\\1/p')`,
    `sed "s/@ID@/$id/g" "${answer}"`,
    'cat > /dev/null',
    '',
  ].join('\n'), { mode: 0o755 });

  // draft's inbox (SAYING): the socket its registration names, listening before the api can be asked to say anything into it.
  // And, as a working session does when it reads the words between calls, the stand-in writes their arrival into draft's transcript.
  const draftTranscript = path.join(store, DRAFT_TRANSCRIPT);
  await listen(path.join(store, INBOX), (line) => {
    const { session_id: sessionId, message } = (line ?? {}) as { session_id?: unknown; message?: { content?: unknown } };
    if (sessionId === SAYING.sessionId && typeof message?.content === 'string') fs.appendFileSync(draftTranscript, arrivalLine(message.content, new Date().toISOString()));
  });
  setApiEnv({
    ...process.env, PORT: '0', WF_ROOT: store, HKB_REPO: checkout, CLAUDE_CONFIG_DIR: path.join(store, 'claude'),
    // The quota asked of the e2e's claude on every read, so the quota page reads the answer it has just written.
    HKB_QUOTA_KEEP_MS: '0',
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
  });
  const apiPort = await startServer('the api', [path.join(API, 'src', 'main.ts')], API, apiEnv, /api listening on http:\/\/127\.0\.0\.1:(\d+)/);
  const base = await startServer('vite preview', [vite, 'preview', '--port', '0', '--host', '127.0.0.1'], WEB,
    { ...process.env, HKB_API_URL: `http://127.0.0.1:${apiPort}` },
    /Local:\s+(http:\/\/[^\s/]+)/);
  console.log(`e2e: api on :${apiPort}, the built app on ${base}, store ${store}`);

  const browser = await launch();
  let shots: string[];
  try {
    shots = await visitAll(browser, base, PAGES, OUT);
  } finally {
    await browser.close();
  }

  console.log(`\ne2e: every page passed in both themes. Read the screenshots before you sign off:`);
  for (const shot of shots) console.log(`  ${shot}`);
}

exitOn(main(), cleanUp, () =>
  servers
    .map(({ name, output }) => {
      const tail = output().trimEnd().split('\n').slice(-15).join('\n    ');
      return tail ? `\n\n  ${name} printed:\n    ${tail}` : '';
    })
    .join(''),
);
