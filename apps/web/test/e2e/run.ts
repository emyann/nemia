/**
 * `npm run e2e`: the web app, built, served against a seeded store, and looked at in a browser.
 *
 *  1. Builds the web app.
 *  2. Seeds a store in a temporary WF_ROOT with four fake runs, the first with a real repository and branch to decide
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
import os from 'node:os';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { expectApart, expectBeneath, expectCount, expectDrawn, expectInside, expectMovedWith, expectVisible, Refused, settled, WAIT_MS, watch } from './checks.ts';
import { CHECKOUT, FAKE, HELD, LOOPING, NEIGHBOUR, REGISTRY, seed, seedCheckout, seedWorkflows, SESSION, WORKFLOWS } from './seed.ts';
import { exitOn, launch, visitAll, type PageSpec } from './visit.ts';

const WEB = path.resolve(import.meta.dirname, '..', '..');
const REPO = path.resolve(WEB, '..', '..');
const API = path.join(REPO, 'apps', 'api');
const OUT = path.resolve(process.env.WF_ARTIFACTS || path.join(REPO, '.e2e'));

/** How long a server has to say where it listens. */
const START_MS = 30_000;

/** On every page: the menu, with each of its places. */
async function sidebar(page: Page): Promise<void> {
  const menu = page.locator('[data-sidebar="sidebar"]');
  await expectVisible(menu.getByRole('link', { name: 'Factory' }), 'the sidebar has Factory');
  await expectVisible(menu.getByRole('link', { name: 'Runs' }), 'the sidebar has Runs');
  await expectVisible(menu.getByRole('link', { name: 'Workflows' }), 'the sidebar has Workflows');
  await expectVisible(menu.getByRole('link', { name: 'Capabilities' }), 'the sidebar has Capabilities');
}

/** Finished runs on the Factory's floor too. Off by default, on every visit. */
async function showFinished(page: Page): Promise<void> {
  const toggle = page.getByRole('switch', { name: 'Show finished' });
  await expectVisible(toggle, 'the Factory has a Show finished switch');
  await toggle.click();
}

/** The fake run on the Factory: its card, its step nodes, and both together. */
function onTheFloor(page: Page): { card: Locator; steps: Locator; run: Locator; step: (name: string) => Locator } {
  const card = `.react-flow__node[data-id="${FAKE.id}"]`;
  const steps = `.react-flow__node[data-id^="${FAKE.id}/"]`;
  return {
    card: page.locator(card),
    steps: page.locator(steps),
    run: page.locator(`${card}, ${steps}`),
    step: (name) => page.locator(`.react-flow__node[data-id="${FAKE.id}/${name}"]`),
  };
}

/**
 * Another visit to `page`'s address in the same browser, so what this browser kept, checked by `check` and
 * watched as the page itself is. A page of its own rather than a reload: a reload cuts off an in-flight
 * refetch, which the watch would rightly count as a failed request.
 */
async function nextVisit(page: Page, check: (again: Page) => Promise<void>): Promise<void> {
  const again = await page.context().newPage();
  try {
    const { problems } = watch(again);
    await again.goto(page.url(), { waitUntil: 'networkidle' });
    await check(again);
    await again.waitForLoadState('networkidle');
    const seen = problems();
    if (seen.length) throw new Refused(`no console error and no failed request on the next visit — ${seen.length} seen:\n    ${seen.join('\n    ')}`);
  } finally {
    await again.close();
  }
}

/** The theme a page is in, as its browser prefers it: what names a photograph taken beside the visit's own. */
const themeOf = (page: Page): Promise<string> => page.evaluate(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

/** What the `answer` page answers FAKE's blocked step with. */
const ANSWER = 'Keep it off the floor: a finished run is under Show finished.';

/** The pages, and what each must have. A new page gets a line here, or the check never looks at it. */
const PAGES: PageSpec[] = [
  {
    name: 'factory',
    route: '/',
    expect: async (page) => {
      await sidebar(page);
      const floor = page.locator('.react-flow');
      await expectVisible(floor, 'the Factory canvas');
      const { card, steps, run, step } = onTheFloor(page);
      const beside = page.locator(`.react-flow__node[data-id="${NEIGHBOUR.id}"]`);
      // The review's case: a run `assess` calls failed, with a session of it still running, is in flight.
      await expectVisible(beside, `a failed run whose session still runs is in flight: its card is on the Factory by default (${NEIGHBOUR.id})`);
      await expectVisible(beside.getByText(/since it started$/), 'its card counts the time since it started, as a card in flight does');
      // A run whose session the harness blocked is in flight too: its card names the harness. What the session said last is on the
      // run's page, which reads it: the list reads no conversation.
      await expectVisible(
        page.locator(`.react-flow__node[data-id="${HELD.id}"] [data-need="harness"][data-step="${HELD.blocked}"]`, { hasText: new RegExp(`^${HELD.blocked} is blocked by the harness$`) }),
        `the card of a run whose session the harness blocked says so — not needs-human alone (${HELD.id})`,
      );
      await settled(page);

      // The fake run stopped at a refused check, and at a step signed off blocked: finished, not in flight.
      // Its followers read `waiting`, and will for ever; they do not keep it on the floor.
      await expectCount(card, 0, `a run whose check refused is finished, not in flight: no card on the floor by default (${FAKE.id})`);
      // So is the loop out of rounds: it waits on a person, and nothing of it moves.
      await expectVisible(page.getByText('2 in flight · 2 finished · 2 waiting on you'), 'the Factory counts both finished, and waiting on you');
      await showFinished(page);
      await expectVisible(
        page.locator(`.react-flow__node[data-id="${LOOPING.id}"] [data-state="exhausted"][title$="${LOOPING.notes.review}"]`, { hasText: 'rounds exhausted' }),
        `the loop's card shows ${LOOPING.exhausted} out of rounds as an amber chip, its note after what that means on hover (${LOOPING.id})`,
      );
      await expectVisible(card, `the fake run's card, once finished runs are shown (${FAKE.id})`);
      await expectVisible(card.getByText(/^started .+ ago$/), 'the card reads finished: when it started, not a clock still counting');
      await expectVisible(card.getByText(FAKE.title), `the card says what was asked (${FAKE.title})`);
      await expectVisible(
        card.locator(`[data-need="asks"][data-step="${FAKE.blocked}"]`, { hasText: `${FAKE.blocked} asks: ${SESSION.closeout.needs}` }),
        `the card says what ${FAKE.blocked}, signed off blocked, asks (${SESSION.closeout.needs})`,
      );
      await expectVisible(card.locator(`a[href="/runs/${FAKE.id}"]`), "the card's title links to the run's page");
      await expectVisible(card.locator('[data-state="failed-check"]', { hasText: 'failed ✗ check (exit 1)' }), `the card shows ${FAKE.refused}'s refused check as a red chip`);

      // Laid out again, oldest first: the fake run's card in the first cell, and the other run's in the cell beside it.
      await page.getByRole('button', { name: 'Reset layout' }).click();
      await settled(page);
      await expectInside(card, floor, 'the card is on the floor');
      await expectCount(steps, 0, 'a closed card draws no step');

      // A click on the card, away from its title's link, unfolds the run's graph beside it — over the cell
      // the other run's card is in, which moves aside.
      await card.locator('time').click();
      await expectCount(steps, FAKE.steps.length, `the card opens into a node per step (${FAKE.steps.join(', ')})`);
      await expectVisible(card.getByText(FAKE.touched, { exact: true }), `the open card of a run waiting on you says what its branch touched (${FAKE.touched})`);
      for (const name of FAKE.steps) await expectVisible(step(name), `the open run draws ${name}`);
      await expectVisible(step(FAKE.blocked).getByText('waiting on you'), `${FAKE.blocked} is drawn as a human gate on the Factory`);
      await expectVisible(step(FAKE.blocked).locator('[data-need="asks"]', { hasText: `asks: ${SESSION.closeout.needs}` }), `${FAKE.blocked}'s node on the Factory says what it asks`);
      await expectVisible(
        step(FAKE.refused).locator('[data-state="failed-check"]', { hasText: 'failed ✗ check (exit 1)' }),
        `${FAKE.refused}, whose check refused, has a red chip`,
      );
      await expectVisible(
        step(FAKE.unverified).locator('[data-state="unverified"]', { hasText: 'unverified · done' }),
        `${FAKE.unverified}, signed off with no check, is marked unverified, not done`,
      );
      for (const first of FAKE.first) {
        await expectCount(page.locator(`.react-flow__edge[data-id="${FAKE.id}/->${first}"]`), 1, `one dashed edge from the card into ${first}`);
      }
      await expectCount(page.locator('.react-flow__edge'), FAKE.edges + FAKE.first.length, "the run's edges, and the card's into each first step");
      await expectCount(
        page.locator(`.react-flow__edge[data-id^="${FAKE.id}/"] animateMotion`),
        0,
        `no dot travels the fake run's edges: nothing moves into ${FAKE.blocked}, a human gate, nor into ${FAKE.refused}, whose check refused`,
      );
      await expectVisible(card.getByRole('button', { name: 'Hide steps' }), "the open card's chevron hides the steps");
      await expectApart(beside, run, 'the card beside it moves out from under the unfolded graph');
      await settled(page);
      await expectInside(run, floor, 'the open run, card and steps, is brought onto the screen');

      // Remembered in this browser: the next visit finds the run open.
      await nextVisit(page, async (again) => {
        // Finished runs are shown by asking, on every visit; which runs are open is what this browser kept.
        await showFinished(again);
        await expectCount(onTheFloor(again).steps, FAKE.steps.length, 'the run is still open on the next visit');
      });

      // Collapse all folds it away, and the chevron opens it again.
      await page.getByRole('button', { name: 'Collapse all' }).click();
      await expectCount(steps, 0, 'Collapse all folds the graph away');
      await card.getByRole('button', { name: 'Show steps' }).click();
      await expectCount(steps, FAKE.steps.length, "the card's chevron unfolds it again");

      // Dragged, the card takes its steps with it. Dropped on the other run's card, it stays where it landed,
      // and the card under it moves aside on the drop — not on whatever changes the floor next.
      await settled(page);
      const [from, onto, grip] = [await card.boundingBox(), await beside.boundingBox(), await card.locator('time').boundingBox()];
      if (!from || !onto || !grip) throw new Refused("the cards to drag and drop onto — one of them is not on the page");
      await expectMovedWith(steps, card, async () => {
        const [x, y] = [grip.x + grip.width / 2, grip.y + grip.height / 2];
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + onto.x - from.x, y + onto.y - from.y, { steps: 12 });
        await page.mouse.up();
      }, "the open run's steps move with its card when it is dragged");
      await expectCount(steps, FAKE.steps.length, 'a drop is not a click: the run is still open');
      await expectApart(beside, run, 'the card the open run was dropped on moves out from under it');

      // Reset layout closes every run as it lays the floor out again, here and on the next visit.
      await page.getByRole('button', { name: 'Reset layout' }).click();
      await expectCount(steps, 0, 'Reset layout folds the graph away');
      await expectVisible(card.getByRole('button', { name: 'Show steps' }), "after a reset the card's chevron shows the steps");
      await nextVisit(page, async (again) => {
        const next = onTheFloor(again);
        await showFinished(again);
        // The chevron reads the open runs this browser kept as the page mounts, before any step is read.
        await expectVisible(next.card.getByRole('button', { name: 'Show steps' }), 'the next visit after a reset finds the run closed');
        await expectCount(next.steps, 0, 'the next visit after a reset draws no step');
      });

      // Open again; a click on a step opens its inspector beside the floor, the run's title above the step's name.
      await card.getByRole('button', { name: 'Show steps' }).click();
      await expectCount(steps, FAKE.steps.length, 'the chevron unfolds the run again after a reset');
      await expectApart(beside, run, 'the card beside it moves aside again');
      await step('review').click();
      const inspector = page.locator('aside[aria-label="Step review"]');
      await expectVisible(inspector, 'the step inspector opens on a click on review');
      await expectVisible(inspector.getByText(FAKE.title), 'the inspector names the run the step is in');
      // The floor narrows for the inspector and brings the run back into view; judged once it has.
      await settled(page);
      await expectInside(run, floor, 'the run is on the floor beside the open inspector');

      // The step whose check refused: its Details say what the check ran, what it exited with, and how its output ended.
      await step(FAKE.refused).click();
      const check = page.locator(`aside[aria-label="Step ${FAKE.refused}"] section[aria-label="Check"]`);
      await expectVisible(check.getByText(FAKE.check, { exact: true }), `the inspector of ${FAKE.refused} shows its check's command (${FAKE.check})`);
      await expectVisible(check.getByText('exit 1', { exact: true }), `the inspector of ${FAKE.refused} shows what its check exited with`);
      await expectVisible(check.getByText(FAKE.said), `the inspector of ${FAKE.refused} shows the last lines of its check's output`);
      await settled(page);
      await expectInside(run, floor, `the run is on the floor beside ${FAKE.refused}'s inspector`);

      // The run beside it opened too: a dot travels the one edge into a step at work, and no other edge on the floor moves.
      await beside.locator('time').click();
      const moving = page.locator(`.react-flow__edge[data-id="${NEIGHBOUR.id}/${NEIGHBOUR.running}"]`);
      await expectCount(moving.locator('.react-flow__edge-path[data-state="running"]'), 1, `the edge ${NEIGHBOUR.running} on the Factory runs: draft's session is at work`);
      await expectCount(moving.locator('animateMotion'), 1, `a dot travels ${NEIGHBOUR.running} on the Factory`);
      await expectCount(page.locator('.react-flow__edge animateMotion'), 1, 'and no other edge on the floor moves');
      await expectCount(page.locator('.react-flow__panel[aria-label="Legend"] animateMotion'), 1, "the Factory's legend shows the running edge moving as it moves");
      await settled(page);
    },
  },
  {
    name: 'runs',
    route: '/runs',
    expect: async (page) => {
      await sidebar(page);
      const row = page.locator(`li a[href="/runs/${FAKE.id}"]`);
      await expectVisible(row, `the runs list has a row for ${FAKE.id}`);
      await expectVisible(row.getByText(`waiting on you: ${FAKE.waitingOnYou.join(', ')}`), `the row says ${FAKE.waitingOnYou.join(' and ')} are waiting on you`);
      await expectVisible(row.locator('[data-state="failed-check"]', { hasText: 'failed ✗ check (exit 1)' }), `the row shows ${FAKE.refused}'s refused check as a red chip`);
      // Beside the run's link, not inside it: a link inside a link is not HTML.
      await expectVisible(
        page.locator('li', { has: page.locator(`a[href="/runs/${FAKE.id}"]`) }).locator(`a[href="/workflows"][data-workflow="${FAKE.workflow}"]`),
        `the row names the workflow the run was started from (${FAKE.workflow}), linked to the Workflows page`,
      );
      await expectCount(row.locator('a'), 0, "the run's link has no link inside it");
      const loop = page.locator(`li a[href="/runs/${LOOPING.id}"]`);
      await expectVisible(loop.getByText(`waiting on you: ${LOOPING.exhausted}`), `the runs list says ${LOOPING.exhausted}, out of rounds, is waiting on you`);
      await expectVisible(
        loop.locator(`[data-state="exhausted"][title$="${LOOPING.notes.review}"]`, { hasText: 'rounds exhausted' }),
        `the row shows ${LOOPING.exhausted} as an amber chip, its note after what that means on hover`,
      );
    },
  },
  {
    name: 'run',
    route: `/runs/${FAKE.id}`,
    expect: async (page) => {
      await sidebar(page);
      await expectVisible(
        page.locator(`article header a[href="/workflows"][data-workflow="${FAKE.workflow}"]`),
        `the run's header names its workflow (${FAKE.workflow}), linked to the Workflows page`,
      );
      const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
      await expectCount(graph.locator('.react-flow__node'), FAKE.steps.length, `the run's graph has a node per step (${FAKE.steps.join(', ')})`);
      for (const step of FAKE.steps) await expectVisible(graph.locator(`.react-flow__node[data-id="${step}"]`), `the graph has ${step}`);
      await expectVisible(graph.locator(`.react-flow__node[data-id="${FAKE.blocked}"]`).getByText('waiting on you'), `${FAKE.blocked} is drawn as a human gate`);
      // What it waits for, as its closeout gave it: on its node, and in the banner at the top of the page.
      await expectVisible(
        graph.locator(`.react-flow__node[data-id="${FAKE.blocked}"] [data-need="asks"]`, { hasText: `asks: ${SESSION.closeout.needs}` }),
        `${FAKE.blocked}'s node says what it asks (${SESSION.closeout.needs})`,
      );
      await expectVisible(
        page.locator(`section[aria-label="Waiting on you"] [data-need="asks"][data-step="${FAKE.blocked}"]`, { hasText: `${FAKE.blocked} asks: ${SESSION.closeout.needs}` }),
        `the banner says what ${FAKE.blocked} asks`,
      );
      await expectVisible(graph.locator(`.react-flow__node[data-id="${FAKE.refused}"] [data-state="failed-check"]`), `${FAKE.refused}'s refused check is a red chip on the run's graph`);
      await expectVisible(page.locator('section[aria-label="Check"]').getByText(FAKE.said), `the run's page shows how ${FAKE.refused}'s check's output ended`);
      await expectCount(graph.locator('.react-flow__edge animateMotion'), 0, `no dot travels the run's edges: nothing moves into ${FAKE.refused}, whose check refused`);

      // What `wf decide` shows, between the banner and the canvas, read out of the run's real repository.
      await expectVisible(
        page.locator(`article > header + section[aria-label="Decide"] + section[aria-label="The run's steps as a graph"]`),
        'the Decide section sits between the header and the canvas',
      );
      const decide = page.locator('section[aria-label="Decide"]');
      await expectVisible(decide.locator(`[data-touched="${FAKE.branch}"]`), `the Decide section reads the run's result branch (${FAKE.branch})`);
      for (const group of ['(root)', 'apps/web']) {
        await expectVisible(decide.locator(`[data-group="${group}"] [data-bar]`), `a row for ${group}, with its +/− bar`);
      }
      for (const file of FAKE.agentFacing) {
        await expectVisible(decide.locator('[data-chip="agent-facing"][title="the next agent reads this"]', { hasText: file }), `${file} is an agent-facing chip`);
      }
      for (const file of FAKE.checkAffecting) {
        await expectVisible(decide.locator('[data-chip="check-affecting"][title="could make its check pass"]', { hasText: file }), `${file} is a check-affecting chip`);
      }
      await expectVisible(decide.locator('[data-lesson="written"]', { hasText: FAKE.lesson }), `the lesson chip says what the run wrote (${FAKE.lesson})`);
      // Each check-affecting file folded, until a person opens it: then a coloured diff, cut where the api cut it.
      await expectCount(decide.locator('details[open]'), 0, 'every check-affecting diff is folded until opened');
      const capped = decide.locator(`details[data-diff="${FAKE.capped}"]`);
      await capped.locator('summary').click();
      await expectVisible(capped.locator('[data-line="hunk"]'), `${FAKE.capped}'s diff opens on a click, a hunk's header in it`);
      await expectVisible(capped.locator('[data-line="added"]'), `${FAKE.capped}'s diff shows its added lines`);
      await expectVisible(capped.locator('[data-cut]', { hasText: /^\d+ more lines — wf decide prints all$/ }), `${FAKE.capped}'s diff is capped, and says so`);
      const manifest = decide.locator('details[data-diff="package.json"]');
      await manifest.locator('summary').click();
      await expectVisible(manifest.locator('[data-line="removed"]'), "package.json's diff shows the line it removed");
      await expectCount(manifest.locator('[data-cut]'), 0, "package.json's diff is shown whole");
      await expectVisible(decide.locator('section[aria-label="Used"] dd', { hasText: 'not measured' }), 'the run total says not measured, since not every step was');
      // The commands as lines to copy, and nothing that runs one.
      await expectVisible(decide.locator('[data-command="ship it"] code', { hasText: `merge --no-ff ${FAKE.branch}` }), 'ship it: the merge, as a line');
      await expectVisible(decide.locator('[data-command="drop it"] code', { hasText: `branch -D ${FAKE.branch}` }), 'drop it: the branch deleted, as a line');
      await expectVisible(decide.locator('[data-command="once more"] code', { hasText: `wf retry ${FAKE.id} ${FAKE.refused}` }), `once more: ${FAKE.refused} tried again, as a line`);
      await expectCount(decide.locator('button[data-copy]'), await decide.locator('[data-command]').count(), 'a copy button beside each command');
      await expectCount(decide.locator('section[aria-label="Commands"] button:not([data-copy])'), 0, 'no button among the commands but one that copies');
      // Before them, the answers: a box for the step that asks, and Try again for the step whose check refused, its check again an option.
      const answers = decide.locator('section[aria-label="Answer"]');
      const answer = answers.locator(`[data-offer="answer"][data-step="${FAKE.blocked}"]`);
      await expectVisible(answer.getByRole('textbox', { name: `Your answer to ${FAKE.blocked}` }), `an answer box for ${FAKE.blocked}, which asks`);
      await expectVisible(answer.getByRole('button', { name: 'Answer and continue' }), 'and its button');
      await expectVisible(answer.getByRole('radio', { name: /^a new session/ }), 'a new session as an option to the nudge');
      const again = answers.locator(`[data-offer="try-again"][data-step="${FAKE.refused}"]`);
      await expectVisible(again.getByRole('button', { name: 'Try again' }), `Try again for ${FAKE.refused}, whose check refused`);
      await expectVisible(again.getByRole('radio', { name: /^its check again/ }), 'its check run again as an option');
      await expectCount(decide.locator('button:not([data-copy])'), await answers.locator('button').count(), "every other button in the Decide section is an answer's");

      // What a step consumed, in its section and in the inspector's Details, in `wf decide`'s words.
      const tokens = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name: FAKE.unverified, exact: true }) });
      await expectVisible(tokens.locator('dd', { hasText: FAKE.used }), `${FAKE.unverified}'s section says what its session used (${FAKE.used})`);
      // The mode each session runs in, filed with none: its harness's choice, marked default — never "the harness's own".
      await expectVisible(
        tokens.locator('[data-mark="default"]', { hasText: 'workspace-write · default' }),
        `${FAKE.unverified}'s spec says the sandbox its Codex session runs in (workspace-write · default)`,
      );
      const blocked = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name: FAKE.blocked, exact: true }) });
      await expectVisible(blocked.locator('[data-mark="default"]', { hasText: 'auto · default' }), `${FAKE.blocked}'s spec says the mode its Claude Code session runs in (auto · default)`);
      await graph.locator(`.react-flow__node[data-id="${FAKE.unverified}"]`).click();
      const inspected = page.locator(`aside[aria-label="Step ${FAKE.unverified}"]`);
      await expectVisible(inspected.locator('dd', { hasText: FAKE.used }), `the inspector's Details say what ${FAKE.unverified} used`);

      await graph.locator('.react-flow__node[data-id="review"]').click();
      await expectVisible(page.locator('aside[aria-label="Step review"]'), 'the step inspector opens on a click on review');
      // The canvas narrows for the inspector and fits itself again; judged once it has.
      await settled(page);
      await expectInside(graph.locator('.react-flow__node'), graph.locator('.react-flow'), 'every step is on the canvas beside the open inspector');

      // implement's Activity: the tail of its session's conversation, folded as its page folds it, and the way to that page.
      await graph.locator(`.react-flow__node[data-id="${SESSION.step}"]`).click();
      const inspector = page.locator(`aside[aria-label="Step ${SESSION.step}"]`);
      await inspector.getByRole('tab', { name: 'Activity' }).click();
      await expectVisible(inspector.locator('[data-turn="tools"]', { hasText: SESSION.folded }), `${SESSION.step}'s Activity tab draws its conversation, the calls folded into one line (${SESSION.folded})`);
      await expectVisible(inspector.locator('section[aria-label="Closeout"]'), `${SESSION.step}'s Activity tab ends with its closeout`);
      await expectVisible(inspector.locator(`a[href="/runs/${FAKE.id}/steps/${SESSION.step}"]`, { hasText: 'Open the session' }), `${SESSION.step}'s Activity tab links to its session's page`);
      await settled(page);

      // tokens' Output: the image it named drawn inline, opening full-size in a new tab; its text file a link; a path on its
      // branch as it gave it. Left open for the photograph.
      await graph.locator(`.react-flow__node[data-id="${FAKE.unverified}"]`).click();
      const output = page.locator(`aside[aria-label="Step ${FAKE.unverified}"]`);
      await output.getByRole('tab', { name: 'Output' }).click();
      const palette = output.locator(`img[alt="${FAKE.artifacts.image}"]`);
      await expectDrawn(palette, `${FAKE.unverified}'s Output tab draws the image it named inline (${FAKE.artifacts.image})`);
      // `has` is queried inside each link, so from the page: `palette` starts at the inspector, which no link is around.
      const full = output.locator('a[target="_blank"]', { has: page.locator(`img[alt="${FAKE.artifacts.image}"]`) });
      await expectCount(full, 1, `${FAKE.artifacts.image} is inside a link that opens it in a new tab`);
      await expectVisible(output.locator('a[target="_blank"]', { hasText: FAKE.artifacts.text }), `the text file it named is a link (${FAKE.artifacts.text})`);
      await expectVisible(output.getByText(FAKE.artifacts.path, { exact: true }), `a path on its branch is shown as it gave it (${FAKE.artifacts.path})`);
      await expectDrawn(
        page.locator(`article > section [aria-label="Artifacts"] img[alt="${FAKE.artifacts.image}"]`),
        `${FAKE.unverified}'s section on the run's page draws the image too`,
      );
      // As the api serves it, through the proxy the page reads it by: a PNG, never cached.
      const served = await page.request.get(new URL((await full.getAttribute('href')) ?? '', page.url()).href);
      const headers = served.headers();
      if (served.status() !== 200 || headers['content-type'] !== 'image/png' || headers['cache-control'] !== 'no-store') {
        throw new Refused(`the api serves ${FAKE.artifacts.image} as a PNG, never cached — it answered ${served.status()}, ${headers['content-type']}, cache-control ${headers['cache-control']}`);
      }
      // Opened full-size: a tab of its own, which draws it under the api's sandboxing policy.
      const [tab] = await Promise.all([page.context().waitForEvent('page'), full.click()]);
      try {
        await tab.waitForLoadState();
        await expectDrawn(tab.locator('img'), `${FAKE.artifacts.image} opens full-size in a tab of its own`);
      } finally {
        await tab.close();
      }
      await settled(page);
    },
  },
  {
    // The board's second write: an answer refused, shown in the package's words, and then one taken, asked for through the api, with the
    // step's row saying what `wf ls` says. Each file is taken back, so every page after this one, in either theme, reads the store as seeded.
    name: 'answer',
    route: `/runs/${FAKE.id}`,
    expect: async (page) => {
      await sidebar(page);
      const retried = (r: { request: () => { method: () => string }; url: () => string }) =>
        r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${FAKE.id}/steps/${FAKE.blocked}/retry`;
      const asks = path.join(store!, 'runs', `${FAKE.id}.asks`);
      const file = path.join(asks, `retry-${FAKE.blocked}-2`);

      // Refused first, in a page of its own whose one refusal is the point. A file already at the name try 2's ask goes under, which
      // `wf retry` did not write: no tick honours it, so the step still waits on you and its box is there — and the package refuses to
      // write over it. Its sentence must be beside the box, word for word, the answer still in the box, and nothing written.
      fs.mkdirSync(asks, { recursive: true });
      fs.writeFileSync(file, '{}\n');
      const refused = await page.context().newPage();
      try {
        const { problems } = watch(refused);
        await refused.goto(page.url(), { waitUntil: 'networkidle' });
        const refusedRow = refused.locator(`section[aria-label="Answer"] [data-step="${FAKE.blocked}"]`);
        const refusedBox = refusedRow.getByRole('textbox', { name: `Your answer to ${FAKE.blocked}` });
        await expectVisible(refusedBox, `the answer box for ${FAKE.blocked}, with a file that is no ask at its try's name`);
        await refusedBox.fill(ANSWER);
        const [answered] = await Promise.all([
          refused.waitForResponse(retried, { timeout: WAIT_MS }),
          refusedRow.getByRole('button', { name: 'Answer and continue' }).click(),
        ]);
        const { error } = (await answered.json()) as { error?: string };
        if (answered.status() !== 409 || !error?.startsWith(`try 2 of ${FAKE.blocked} is already asked for`)) {
          throw new Refused(`the package refuses to write over the file at try 2's name — the api answered ${answered.status()}: ${JSON.stringify(error)}`);
        }
        await expectVisible(refusedRow.locator('[data-refused]'), 'the refusal is shown beside the box, not swallowed');
        const shown = await refusedRow.locator('[data-refused] p.font-mono').textContent();
        if (shown !== error) throw new Refused(`the refusal beside the box is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`);
        if ((await refusedBox.inputValue()) !== ANSWER) throw new Refused('the answer stays in the box after a refusal, to send again');
        const there = fs.readdirSync(asks);
        if (there.length !== 1 || fs.readFileSync(file, 'utf8') !== '{}\n') throw new Refused(`nothing is written on a refusal — ${asks} holds ${there.join(', ')}`);
        await settled(refused);
        await refused.screenshot({ path: path.join(OUT, `answer-refused-${await themeOf(refused)}.png`), fullPage: true });
        await refused.waitForLoadState('networkidle');
        // The one refusal made, as the browser reports it — its answer, and the line Chromium writes to the console for one — and nothing else.
        const expected = `request answered 409: POST ${answered.url()}`;
        const seen = problems();
        const others = seen.filter((p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p));
        if (!seen.includes(expected) || others.length) throw new Refused(`the refused page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
      } finally {
        await refused.close();
        fs.rmSync(file, { force: true });
      }

      const decide = page.locator('section[aria-label="Decide"]');
      const row = decide.locator(`section[aria-label="Answer"] [data-step="${FAKE.blocked}"]`);
      const box = row.getByRole('textbox', { name: `Your answer to ${FAKE.blocked}` });
      await expectVisible(box, `the answer box for ${FAKE.blocked}`);
      const send = row.getByRole('button', { name: 'Answer and continue' });
      if (await send.isEnabled()) throw new Refused('Answer and continue is disabled while there is no answer — it was enabled with none');
      await box.fill(ANSWER);
      const [response] = await Promise.all([
        page.waitForResponse(retried, { timeout: WAIT_MS }),
        send.click(),
      ]);
      if (response.status() !== 202) throw new Refused(`the api takes the answer, through the board's proxy — it answered ${response.status()}: ${await response.text()}`);

      const note = 'try 2 asked (--nudge, with your answer) — the next tick files it';
      await expectVisible(decide.locator(`[data-offer="asked"][data-step="${FAKE.blocked}"] [data-note]`, { hasText: note }), `the step's row says what wf ls says once the run is read again (${note})`);
      const section = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name: FAKE.blocked, exact: true }) });
      await expectVisible(section.locator('[data-note]', { hasText: note }), `${FAKE.blocked}'s section says it too`);
      await expectCount(page.locator(`section[aria-label="Waiting on you"] [data-step="${FAKE.blocked}"]`), 0, 'and the banner no longer names it: nobody waits on you for it');
      // The ask is the package's file, as `wf retry` writes it: the api wrote nothing else.
      const written = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
      if (written?.mode !== 'nudge' || written?.message !== ANSWER) {
        throw new Refused(`the ask is written as wf retry writes it, with the answer — ${file} holds ${JSON.stringify(written)}`);
      }
      await settled(page);
      await page.screenshot({ path: path.join(OUT, `answer-asked-${await themeOf(page)}.png`), fullPage: true });

      fs.rmSync(asks, { recursive: true, force: true });
      await expectVisible(box, `with the ask taken back, ${FAKE.blocked} waits on you again, and its box is back once the run is read again`);
    },
  },
  {
    name: 'held',
    route: `/runs/${HELD.id}`,
    expect: async (page) => {
      await sidebar(page);
      const said = `blocked by the harness: ${HELD.line}`;
      const banner = page.locator('section[aria-label="Waiting on you"]');
      const need = banner.locator(`[data-need="harness"][data-step="${HELD.blocked}"]`);
      await expectVisible(need.getByText(`${HELD.blocked} is ${said}`), 'the banner names the harness, and what the session said last');
      await expectCount(banner.getByText(/^Waiting on you:/), 0, "nobody is waiting on you in the package's words: the step asked nothing");

      // No button that asks for a try the package refuses — a try of a session that has not ended reads running — but what the board cannot
      // do, and the two commands that can: stop the session, then try it again.
      const unblock = need.locator('[data-unblock]');
      await expectVisible(unblock.getByText(/^The board cannot continue it: its session has not ended/), 'the banner says the board cannot continue the session, and why');
      await expectVisible(unblock.locator('li code', { hasText: `ae stop ${HELD.id}-${HELD.blocked}` }), "the command that stops the session's task, in wf's engine store");
      await expectVisible(unblock.locator('li code', { hasText: `wf retry ${HELD.id} ${HELD.blocked}` }), 'and the one that tries it again once it stopped');
      await expectCount(banner.locator('button:not([data-copy])'), 0, 'nothing in the banner but buttons that copy: the board runs neither');
      await expectCount(page.locator('section[aria-label="Decide"]'), 0, 'no Decide section: nothing to decide while the run runs, and no try the package would take');

      const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
      const node = graph.locator(`.react-flow__node[data-id="${HELD.blocked}"]`);
      await expectVisible(node.locator('[data-state="needs-human"]', { hasText: 'needs-human' }), "the step's chip is the engine's word, needs-human");
      await expectVisible(node.locator('[data-need="harness"]', { hasText: said }), 'its node says the harness blocked it, and what the session said last');
      await expectCount(node.getByText('waiting on you'), 0, 'and is no human gate: nothing was asked of a person');
      await settled(page);
    },
  },
  {
    name: 'session',
    route: `/runs/${FAKE.id}/steps/${SESSION.step}`,
    expect: async (page) => {
      await sidebar(page);
      const top = page.locator('header[aria-label="The step"]');
      await expectVisible(top.getByRole('heading', { level: 1, name: SESSION.step, exact: true }), 'the page is headed by the step');
      await expectVisible(top.locator('[data-state="blocked"]', { hasText: 'succeeded · BLOCKED' }), "the step's chip, at the top");
      await expectVisible(top.locator(`a[href="/runs/${FAKE.id}"]`, { hasText: FAKE.title }), 'a link back to the run, by what it asked');
      await expectCount(top.locator('[data-following]'), 0, 'a settled task is read once, not followed');

      const talk = page.getByRole('region', { name: "The step's conversation" });
      await expectVisible(talk, 'the conversation');
      const [box, window] = [await talk.boundingBox(), page.viewportSize()];
      if (!box || !window || Math.abs(box.y + box.height - window.height) > 2) {
        throw new Refused(`the conversation takes the page's height — it ends at ${box ? Math.round(box.y + box.height) : 'nothing'} px, the window at ${window?.height} px`);
      }
      await expectVisible(talk.locator('[data-turn="said"][data-role="user"]', { hasText: 'Implement what was asked.' }), 'the prompt, said by the user');

      const fold = talk.locator('[data-turn="tools"]');
      await expectCount(fold, 1, 'one fold: the calls with nothing said between them');
      const line = fold.getByRole('button', { name: SESSION.folded });
      await expectVisible(line, `folded into one line in Claude Code web's words: ${SESSION.folded}`);
      await expectVisible(fold.getByText('1 failed', { exact: true }), 'the line says one of its calls failed');
      await expectCount(fold.locator('[data-turn="tool"]'), 0, 'folded: its calls are behind the line');
      await line.click();
      await expectCount(fold.locator('[data-turn="tool"]'), SESSION.calls, `opened: each of its ${SESSION.calls} calls`);
      await expectVisible(fold.locator('[data-turn="tool"][data-tool="Bash"] [data-tool-state="error"]'), 'the call that failed says so on its line');
      await expectVisible(fold.locator('[data-turn="thinking"]', { hasText: 'Thought, with no text kept' }), 'a thought between two calls rides in the fold, and says no text was kept');
      await expectCount(talk.locator('[data-turn="tool"][data-tool="Edit"]'), 1, 'a lone call after words is drawn as itself');

      await expectCount(talk.getByText(SESSION.thought), 0, 'a thought is folded: its text is not drawn');
      await talk.locator('[data-turn="thinking"]').first().getByRole('button', { name: 'Thought', exact: true }).click();
      await expectVisible(talk.getByText(SESSION.thought), 'opened, its text is');
      await expectVisible(talk.locator('[data-turn="said"][data-role="assistant"] li', { hasText: SESSION.listed }), "the session's words, drawn from their markdown");
      await expectVisible(talk.locator('[data-turn="system"]', { hasText: SESSION.system }), 'a system line, quietly');

      const closeout = talk.locator('section[aria-label="Closeout"]');
      await expectVisible(closeout.locator('[data-outcome="blocked"]'), 'the closeout, named, with its outcome');
      await expectVisible(closeout.getByText(SESSION.closeout.needs), 'and what it needs');
      await expectCount(page.getByRole('link', { name: /Claude Code web/ }), 0, 'no link to Claude Code web: nothing the engine reads carries a URL for a session');
      await expectCount(page.locator('main textarea, main input'), 0, 'read-only: nothing to type into');

      // Photographed from its start, as a reader scrolls up to it: the prompt, the thought opened, and the fold's line opened
      // over its calls. The scroller opens at the end, so a photograph taken where the checks left it shows only the closeout.
      await talk.hover();
      await page.mouse.wheel(0, -100_000);
      const scrolled = () => talk.evaluate((element) => element.scrollTop);
      for (const until = Date.now() + WAIT_MS; (await scrolled()) > 0 && Date.now() < until; ) await new Promise((resolve) => setTimeout(resolve, 100));
      if ((await scrolled()) > 0) throw new Refused(`the conversation scrolls up to its start for the photograph — it stopped ${await scrolled()} px down`);
      await expectInside(talk.locator('[data-turn="said"][data-role="user"]'), talk, 'the prompt is in view for the photograph');
      await expectInside(line, talk, `the fold's line (${SESSION.folded}) is in view for the photograph`);
    },
  },
  {
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
      // Round 2 selected: the Output tab shows its closeout, its reply as `finding → answer (why)`, and the other two rounds folded beneath.
      await target.getByRole('button', { name: 'Show the closeout of round 2 · try 2 (round)' }).click();
      await expectVisible(target.locator('[data-shown-try="2"]'), "selecting round 2 opens its closeout in the Output tab");
      await expectVisible(target.getByText(LOOPING.earlier[1].implement, { exact: true }), `round 2's summary (${LOOPING.earlier[1].implement})`);
      await expectVisible(target.locator('li[data-answer]', { hasText: LOOPING.replied }), `round 2's reply, as finding → answer (why)`);
      await expectCount(target.locator('section[aria-label="Other tries"] details:not([open])'), 2, 'the other two rounds are folded beneath it');
      await settled(page);
    },
  },
  {
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
  },
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
      for (const step of good.steps) await expectVisible(node(step).getByText(good.runsOn, { exact: true }), `${step}'s node says what it runs on (${good.runsOn})`);
      await expectVisible(node('implement').getByText(good.check, { exact: true }), `implement's node shows its check (${good.check})`);
      const tools = good.tools.split(', ').length;
      await expectVisible(node('review').locator(`dd[title="${good.tools}"]`, { hasText: new RegExp(`^${tools}$`) }), `review's node counts its ${tools} tools and names them on hover (${good.tools})`);
      await expectVisible(node('review').getByText(good.loop, { exact: true }), `review's node shows its loop and its rounds (${good.loop})`);
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

      const bad = card(broken.name);
      await expectVisible(bad.getByText(broken.error), `a folder the loader refuses shows the refusal (${broken.error})`);
      await expectCount(bad.getByRole('button', { name: 'Start' }), 0, 'a folder the loader refuses cannot start');
      await expectCount(bad.locator('textarea, .react-flow'), 0, 'and has no brief box and no graph');

      const mine = card(yours.name);
      await expectVisible(mine.getByText('yours', { exact: true }), `${yours.name}, under workflows/ in the store, is marked as yours`);
      await expectCount(mine.locator('.react-flow__node'), yours.steps.length, `${yours.name}'s graph has its one step`);
    },
  },
  {
    name: 'capabilities',
    route: '/capabilities',
    expect: async (page) => {
      await sidebar(page);
      await expectVisible(page.locator('[data-sidebar="sidebar"] a[data-active="true"]', { hasText: 'Capabilities' }), 'the sidebar lights Capabilities on its page');
      const { skill, bareSkill, agent, server, missing, denied } = CHECKOUT;
      const section = (title: string) => page.locator(`section[aria-label="${title}"]`);
      for (const [title, count] of [['Skills', 2], ['Agents', 1], ['MCP servers', 2], ['Denied', denied.length]] as const) {
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
    },
  },
];

// ─── the servers, and stopping them ─────────────────────────────────────────

const servers: Array<{ name: string; child: ChildProcess; output: () => string }> = [];
let store: string | undefined;

/** Stop both servers and remove the store. Idempotent: `exit` runs it again after a signal did. */
function cleanUp(): void {
  for (const { child } of servers) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
  if (store) fs.rmSync(store, { recursive: true, force: true });
  store = undefined;
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

  store = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-e2e-'));
  seed(store);
  const checkout = path.join(store, 'checkout');
  seedCheckout(checkout, path.join(API, 'test', 'fixtures', 'mcp-server.ts'));
  seedWorkflows(checkout, store);
  // A `claude` that lists the store's sessions (REGISTRY) — HELD's, blocked — first on the api's PATH. The engine observes `claude
  // agents` on every list; the pages are about the store, not about the sessions on this machine. And where Claude Code keeps its
  // transcripts, in the store (CLAUDE_CONFIG_DIR): the engine reads a session's conversation from there, never from this machine's.
  const bin = path.join(store, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\nif [ "$1" = agents ]; then cat "${path.join(store, REGISTRY)}"; else echo '[]'; fi\n`, { mode: 0o755 });

  const apiPort = await startServer('the api', [path.join(API, 'src', 'main.ts')], API,
{
      ...process.env, PORT: '0', WF_ROOT: store, HKB_REPO: checkout, CLAUDE_CONFIG_DIR: path.join(store, 'claude'),
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
    },
    /api listening on http:\/\/127\.0\.0\.1:(\d+)/);
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
