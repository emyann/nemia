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
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { expectApart, expectBeneath, expectBetween, expectCount, expectDrawn, expectInside, expectLeftOf, expectMovedWith, expectUncut, expectVisible, Refused, settled, WAIT_MS, watch } from './checks.ts';
import { arrivalLine, CHECKOUT, DIAMOND, DIAMOND_RUNS, DRAFT_TRANSCRIPT, FAKE, HELD, INBOX, LOOPING, NEIGHBOUR, REGISTRY, SAYING, seed, seedCheckout, seedDiamond, seedWorkflows, SESSION, WORKFLOWS } from './seed.ts';
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

/** A run's card on the Factory, and the edge from one card into another (`after`). */
const cardOf = (page: Page, id: string): Locator => page.locator(`.react-flow__node[data-id="${id}"]`);
const cardsOf = (page: Page, ...ids: string[]): Locator => page.locator(ids.map((id) => `.react-flow__node[data-id="${id}"]`).join(', '));
const edgeOf = (page: Page, from: string, to: string): Locator => page.locator(`.react-flow__edge[data-id="after:${from}->${to}"]`);

/** The diamond's cards laid out as a diamond: every run left of each run that waits on it, and its top and bottom level with the middle of its sides. */
async function expectDiamond(page: Page, when: string): Promise<void> {
  const { top, shipped, running, bottom } = DIAMOND;
  await settled(page);
  await expectLeftOf(cardOf(page, top.id), cardsOf(page, shipped.id, running.id), `${when}: the top is left of both sides, which wait on it`);
  await expectLeftOf(cardsOf(page, shipped.id, running.id), cardOf(page, bottom.id), `${when}: both sides are left of the bottom, which waits on them`);
  await expectApart(cardOf(page, shipped.id), cardOf(page, running.id), `${when}: the two sides are laid out apart`);
  await expectBetween(cardsOf(page, top.id, bottom.id), cardOf(page, shipped.id), cardOf(page, running.id), `${when}: the top and the bottom are level with the middle of the two sides`);
}

/** When the run DIAMOND calls off was cancelled, as `wf cancel` wrote it beside its record. */
const cancelledAt = (): string => fs.readFileSync(path.join(store!, 'runs', `${DIAMOND.cancelled.id}.cancelled`), 'utf8').trim();

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

      // The diamond, drawn as a graph of cards: an edge from each run a card waits on into it, parents left of children, and the two
      // sides level about the middle. Its top and its shipped side are finished, and on the floor all the same: a run in flight waits on each.
      const { top, shipped, running, bottom, cancelled, orphan } = DIAMOND;
      for (const run of [top, shipped, running, bottom]) await expectVisible(cardOf(page, run.id), `the diamond's card ${run.id} is on the floor by default`);
      for (const run of [top, shipped]) {
        await expectVisible(cardOf(page, run.id).getByText(/^started .+ ago$/), `${run.id}, shipped, is drawn finished — on the floor because a run in flight waits on it`);
      }
      for (const run of [cancelled, orphan]) {
        await expectCount(cardOf(page, run.id), 0, `${run.id} is not on the floor by default: ${orphan.id} waits on a run called off, and nothing of either moves`);
      }
      // Counted, not seen: an edge whose ends are level is a path with no height, which Playwright takes for hidden.
      for (const [from, to, state] of [[top, shipped, 'done'], [top, running, 'done'], [shipped, bottom, 'to-come'], [running, bottom, 'to-come']] as const) {
        await expectCount(
          edgeOf(page, from.id, to.id).locator(`.react-flow__edge-path[data-state="${state}"]`),
          1,
          `an edge from ${from.id} into ${to.id}, ${state === 'done' ? 'solid: that run has started' : 'dashed: that run waits'}`,
        );
      }
      await expectCount(page.locator('.react-flow__edge[data-id^="after:"]'), 4, 'the four edges of the diamond, and no other edge between cards');
      await expectDiamond(page, 'on the default floor');
      // What each card waits on, in `wf ls`'s word: the bottom on the side still running alone, and not on you.
      await expectVisible(
        cardOf(page, bottom.id).locator('[data-waiting="on-runs"]', { hasText: DIAMOND.words.bottom }),
        `the bottom's card says ${DIAMOND.words.bottom}: the side that shipped is waited on no more`,
      );
      await expectCount(cardOf(page, bottom.id).getByText('waiting on you', { exact: true }), 0, 'and does not wait on you: the side it waits on may still ship');
      // Its root's chip, beside the step's name, is cut short in the card; the name is not, and neither leaves the card.
      await expectUncut(cardOf(page, bottom.id).locator('ul[aria-label="Steps"] li > span:first-child'), "the bottom card's step name is whole beside its root's waiting on chip");
      await expectInside(cardOf(page, bottom.id).locator('ul[aria-label="Steps"] [data-state="waiting"]'), cardOf(page, bottom.id), "and the chip stays inside the card");
      for (const run of [top, shipped, running]) await expectCount(cardOf(page, run.id).locator('[data-waiting]'), 0, `${run.id} waits on no run`);
      await expectCount(page.locator('.react-flow__panel[aria-label="Legend"] [data-sample="cards"]'), 1, "the Factory's legend draws the edge between two cards");
      // Photographed as a person first finds it: the page's own photograph is taken at the end, after a graph unfolded over the diamond.
      await settled(page);
      await page.screenshot({ path: path.join(OUT, `factory-diamond-${await themeOf(page)}.png`), fullPage: true });

      // The fake run stopped at a refused check, and at a step signed off blocked: finished, not in flight.
      // Its followers read `waiting`, and will for ever; they do not keep it on the floor.
      await expectCount(card, 0, `a run whose check refused is finished, not in flight: no card on the floor by default (${FAKE.id})`);
      // So is the loop out of rounds: it waits on a person, and nothing of it moves.
      // In flight: NEIGHBOUR, HELD, the diamond's running side and its bottom. Waiting on you: FAKE, LOOPING, and the run waiting on one called off.
      await expectVisible(page.getByText('4 in flight · 6 finished · 3 waiting on you'), 'the Factory counts the runs in flight, the finished, and those waiting on you');
      await showFinished(page);
      // The run called off, and the one that waits on it: for ever, so on you, and its card names the run it waits on and why.
      await expectVisible(
        cardOf(page, orphan.id).locator('[data-waiting="on-you"]', { hasText: DIAMOND.words.orphan }),
        `${orphan.id}'s card says ${DIAMOND.words.orphan}, amber`,
      );
      await expectVisible(cardOf(page, orphan.id).getByText('waiting on you', { exact: true }), `${orphan.id} waits on you`);
      await expectCount(edgeOf(page, cancelled.id, orphan.id).locator('.react-flow__edge-path[data-state="to-come"]'), 1, `a dashed edge from ${cancelled.id} into ${orphan.id}`);
      await settled(page);
      await expectLeftOf(cardOf(page, cancelled.id), cardOf(page, orphan.id), `${cancelled.id} is left of ${orphan.id}, which waits on it`);
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
      await expectCount(page.locator(`.react-flow__edge[data-id^="${FAKE.id}/"]`), FAKE.edges + FAKE.first.length, "the run's edges, and the card's into each first step");
      await expectCount(page.locator('.react-flow__edge'), FAKE.edges + FAKE.first.length + 5, 'and beside them only the five edges between cards');
      await expectCount(
        page.locator(`.react-flow__edge[data-id^="${FAKE.id}/"] animateMotion`),
        0,
        `no dot travels the fake run's edges: nothing moves into ${FAKE.blocked}, a human gate, nor into ${FAKE.refused}, whose check refused`,
      );
      await expectVisible(card.getByRole('button', { name: 'Hide steps' }), "the open card's chevron hides the steps");
      await expectApart(beside, run, 'the card beside it moves out from under the unfolded graph');
      // The graph unfolds over some of the diamond's cards and not others: they move aside together, and still read as a diamond.
      await expectDiamond(page, "with the fake run's graph unfolded over the diamond");
      for (const card of DIAMOND_RUNS) await expectApart(cardOf(page, card.id), run, `${card.id} moves out from under the unfolded graph`);
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
      // Another graph unfolded, over whichever of the diamond's cards it reaches: still a diamond, and the run called off still left of the run waiting on it.
      await expectDiamond(page, "with the run beside it unfolded too");
      await expectLeftOf(cardOf(page, DIAMOND.cancelled.id), cardOf(page, DIAMOND.orphan.id), `${DIAMOND.cancelled.id} is still left of ${DIAMOND.orphan.id}`);
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
      await expectVisible(
        page.locator(`li a[href="/runs/${DIAMOND.bottom.id}"] [data-state="waiting"]`, { hasText: DIAMOND.words.bottom }),
        `the row of a run waiting on a run says so on its root, as wf ls does (${DIAMOND.words.bottom}), a waiting chip`,
      );
      // A run waiting on a run called off waits on you, as the Factory counts it: the row says so, in wf ls's words.
      const orphanRow = page.locator(`li a[href="/runs/${DIAMOND.orphan.id}"]`);
      await expectVisible(
        orphanRow.locator('[data-waiting-on-you]', { hasText: `waiting on you: ${DIAMOND.cancelled.id} was cancelled at ${cancelledAt()}, and a cancelled run never ships — yours to resolve: wf cancel ${DIAMOND.orphan.id}` }),
        `the row of ${DIAMOND.orphan.id}, waiting on a run called off, says it waits on you, and what is yours to resolve`,
      );
      await expectCount(page.locator(`li a[href="/runs/${DIAMOND.bottom.id}"] [data-waiting-on-you]`), 0, `${DIAMOND.bottom.id}, waiting on a run that may still ship, does not wait on you`);
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
      // write over it, naming the file and saying it is not an ask (`strayAsk`). Its sentence must be beside the box, word for word,
      // the answer still in the box, and nothing written.
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
        if (answered.status() !== 409 || !error?.startsWith(`try 2 of ${FAKE.blocked} cannot be asked for: `) || !error.includes('it is not an ask')) {
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
    // The board continues a session the harness blocked, as `wf retry` does: refused first, in a page of its own, in the package's words
    // beside the button; then taken — the ask written, and what the tick does with it said in the banner and in the Decide section. The ask
    // is taken back, so every page after this one, in either theme, reads the store as seeded.
    name: 'held',
    route: `/runs/${HELD.id}`,
    expect: async (page) => {
      await sidebar(page);
      const said = `blocked by the harness: ${HELD.line}`;
      const banner = page.locator('section[aria-label="Waiting on you"]');
      const need = banner.locator(`[data-need="harness"][data-step="${HELD.blocked}"]`);
      await expectVisible(need.getByText(`${HELD.blocked} is ${said}`), 'the banner names the harness, and what the session said last');
      await expectCount(banner.getByText(/^Waiting on you:/), 0, "nobody is waiting on you in the package's words: the step asked nothing");

      const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
      const node = graph.locator(`.react-flow__node[data-id="${HELD.blocked}"]`);
      await expectVisible(node.locator('[data-state="needs-human"]', { hasText: 'needs-human' }), "the step's chip is the engine's word, needs-human");
      await expectVisible(node.locator('[data-need="harness"]', { hasText: said }), 'its node says the harness blocked it, and what the session said last');
      await expectCount(node.getByText('waiting on you'), 0, 'and is no human gate: nothing was asked of a person');

      const retried = (r: { request: () => { method: () => string }; url: () => string }) =>
        r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${HELD.id}/steps/${HELD.blocked}/retry`;
      const asks = path.join(store!, 'runs', `${HELD.id}.asks`);
      const file = path.join(asks, `retry-${HELD.blocked}-2`);
      // The tick stops the session, never the api: the engine's journal of the step's task stays as seeded, refused or taken.
      const journal = path.join(store!, 'engine', 'tasks', `${HELD.id}-${HELD.blocked}.jsonl`);
      const seeded = fs.readFileSync(journal, 'utf8');

      // Refused first, in a page of its own whose one refusal is the point, as the `answer` page makes one: a file at try 2's ask name that
      // `wf retry` did not write, which the package will not write over (`strayAsk`). Its sentence must be beside the button, word for word,
      // and nothing written.
      fs.mkdirSync(asks, { recursive: true });
      fs.writeFileSync(file, '{}\n');
      const refused = await page.context().newPage();
      try {
        const { problems } = watch(refused);
        await refused.goto(page.url(), { waitUntil: 'networkidle' });
        const refusedNeed = refused.locator(`section[aria-label="Waiting on you"] [data-need="harness"][data-step="${HELD.blocked}"]`);
        const refusedButton = refusedNeed.getByRole('button', { name: 'Continue' });
        await expectVisible(refusedButton, `Continue for ${HELD.blocked}, with a file that is no ask at its try's name`);
        const [answered] = await Promise.all([
          refused.waitForResponse(retried, { timeout: WAIT_MS }),
          refusedButton.click(),
        ]);
        const { error } = (await answered.json()) as { error?: string };
        if (answered.status() !== 409 || !error?.startsWith(`try 2 of ${HELD.blocked} cannot be asked for: `) || !error.includes('it is not an ask')) {
          throw new Refused(`the package refuses to write over the file at try 2's name — the api answered ${answered.status()}: ${JSON.stringify(error)}`);
        }
        await expectVisible(refusedNeed.locator('[data-refused]'), 'the refusal is shown beside Continue, not swallowed');
        const shown = await refusedNeed.locator('[data-refused] p.font-mono').textContent();
        if (shown !== error) throw new Refused(`the refusal beside Continue is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`);
        await expectVisible(refusedButton, 'and Continue stays, to press again');
        const there = fs.readdirSync(asks);
        if (there.length !== 1 || fs.readFileSync(file, 'utf8') !== '{}\n') throw new Refused(`nothing is written on a refusal — ${asks} holds ${there.join(', ')}`);
        if (fs.readFileSync(journal, 'utf8') !== seeded) throw new Refused(`nothing is stopped on a refusal — ${journal} changed`);
        await settled(refused);
        await refused.screenshot({ path: path.join(OUT, `held-refused-${await themeOf(refused)}.png`), fullPage: true });
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

      // Continue, where the commands to copy were: a nudge, and a box for anything to tell it that may stay empty. No Decide section yet:
      // nothing to decide while the run runs, and no try asked.
      const button = need.getByRole('button', { name: 'Continue' });
      await expectVisible(button, 'the banner offers Continue for a session the harness blocked');
      await expectVisible(need.getByRole('textbox', { name: `What to tell ${HELD.blocked}, if anything` }), 'and a box for anything to tell it');
      if (!(await button.isEnabled())) throw new Refused('Continue is enabled with nothing written: a nudge needs no message');
      await expectCount(banner.locator('[data-copy], [data-unblock]'), 0, 'no command to copy: the board continues the session itself');
      await expectCount(page.locator('section[aria-label="Decide"]'), 0, 'no Decide section before the try is asked: nothing to decide while the run runs');

      const [response] = await Promise.all([
        page.waitForResponse(retried, { timeout: WAIT_MS }),
        button.click(),
      ]);
      if (response.status() !== 202) throw new Refused(`the api takes Continue, through the board's proxy — it answered ${response.status()}: ${await response.text()}`);
      const took = (await response.json()) as { try?: unknown; file?: unknown; stopFirst?: unknown };
      if (took.try !== 2 || took.file !== file || took.stopFirst !== true) {
        throw new Refused(`the api answers with the try, its ask file and the package's stopFirst — it answered ${JSON.stringify(took)}`);
      }
      // The ask is the package's file, as `wf retry` writes a nudge with nothing said; the api stopped nothing.
      const written = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
      if (written?.step !== HELD.blocked || written?.try !== 2 || written?.mode !== 'nudge' || 'message' in written) {
        throw new Refused(`the ask is written as wf retry writes a nudge — ${file} holds ${JSON.stringify(written)}`);
      }
      if (fs.readFileSync(journal, 'utf8') !== seeded) throw new Refused(`the api stops no session, the tick does — ${journal} changed`);

      const note = 'try 2 asked (--nudge) — stopping its blocked session, then the tick files it';
      await expectVisible(need.locator('[data-note]', { hasText: note }), `the banner says the session is stopped, then the try filed, in wf ls's words (${note})`);
      await expectCount(need.getByRole('button', { name: 'Continue' }), 0, 'and offers Continue no more: the try is asked');
      const decide = page.locator('section[aria-label="Decide"]');
      await expectVisible(decide.locator(`[data-offer="asked"][data-step="${HELD.blocked}"] [data-note]`, { hasText: note }), 'the Decide section is drawn, as for any run with a try asked, and says it too');
      const section = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name: HELD.blocked, exact: true }) });
      await expectVisible(section.locator('[data-note]', { hasText: note }), `and ${HELD.blocked}'s own section`);
      await settled(page);
      await page.screenshot({ path: path.join(OUT, `held-asked-${await themeOf(page)}.png`), fullPage: true });

      fs.rmSync(asks, { recursive: true, force: true });
      await expectVisible(need.getByRole('button', { name: 'Continue' }), 'with the ask taken back, Continue is back once the run is read again');
      await expectCount(page.locator('section[aria-label="Decide"]'), 0, 'and the Decide section goes with the try');
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
      // The conversation takes the page's height down to the prompt box, and the box ends the window.
      const prompt = page.locator(`section[aria-label="Say something to ${SESSION.step}"]`);
      await expectVisible(prompt, 'a prompt box below the conversation');
      const [box, below, window] = [await talk.boundingBox(), await prompt.boundingBox(), page.viewportSize()];
      if (!box || !below || !window || Math.abs(box.y + box.height - below.y) > 2 || Math.abs(below.y + below.height - window.height) > 2) {
        throw new Refused(
          `the conversation takes the page's height down to the prompt box, which ends the window — the conversation ends at ${box ? Math.round(box.y + box.height) : 'nothing'} px, ` +
            `the box spans ${below ? `${Math.round(below.y)}–${Math.round(below.y + below.height)}` : 'nothing'} px, the window ends at ${window?.height} px`,
        );
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
      // Its session has ended: the box is closed, with the reason and where to go instead, and nobody said anything to it.
      const field = prompt.getByRole('textbox', { name: `What to say to ${SESSION.step}'s session` });
      await expectVisible(field, 'the prompt box, closed');
      if (await field.isEnabled()) throw new Refused(`the prompt box is disabled for a step whose session has ended (${SESSION.step} settled)`);
      if (await prompt.getByRole('button', { name: 'Send' }).isEnabled()) throw new Refused('and so is Send');
      await expectVisible(
        prompt.locator('[data-closed]', { hasText: `${SESSION.step}'s session has ended, so there is nobody to say anything to. To tell the step something, answer it or try it again from the run page` }),
        'with why, and where to go instead',
      );
      await expectCount(talk.locator('[data-turn="told"]'), 0, 'nobody said anything to it: no turn of yours');
      await expectCount(page.locator('main input, main textarea:not([disabled])'), 0, 'nothing else to type into');

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
    // The steering channel: words said to draft's running session from its page, through the api, to the session's inbox and onto its record,
    // where the step's detail and `wf decide` read them back. Then, in a page of its own whose one refusal is the point, words sent after the
    // session ended while the page still showed it running: refused in the package's words under the box, and nothing said or journalled. The
    // page follows a live session, whose stream never finishes (`follows`). The writes are taken back — draft's task journal and its conversation as
    // seeded — so every page after this one, in either theme, reads the store as it was.
    name: 'say',
    route: `/runs/${SAYING.run}/steps/${SAYING.step}`,
    follows: true,
    expect: async (page) => {
      await sidebar(page);
      const journal = path.join(store!, 'engine', 'tasks', `${SAYING.run}-${SAYING.step}.jsonl`);
      const seeded = fs.readFileSync(journal, 'utf8');
      const conversation = path.join(store!, DRAFT_TRANSCRIPT);
      const seededConversation = fs.readFileSync(conversation, 'utf8');
      const sayRoute = `/api/runs/${SAYING.run}/steps/${SAYING.step}/say`;
      const said = (r: { request: () => { method: () => string }; url: () => string }) => r.request().method() === 'POST' && new URL(r.url()).pathname === sayRoute;
      const boxOf = (p: Page, state = '') => p.locator(`section${state ? `[data-say="${state}"]` : ''}[aria-label="Say something to ${SAYING.step}"]`);
      const fieldOf = (p: Page) => boxOf(p).getByRole('textbox', { name: `What to say to ${SAYING.step}'s session` });
      const sendOf = (p: Page) => boxOf(p).getByRole('button', { name: 'Send' });
      try {
        const top = page.locator('header[aria-label="The step"]');
        await expectVisible(top.getByRole('heading', { level: 1, name: SAYING.step, exact: true }), 'the page is headed by the step');
        await expectVisible(top.locator('[data-following]'), 'a session in flight is followed live');
        const talk = page.getByRole('region', { name: "The step's conversation" });
        await expectVisible(talk.locator('[data-turn="said"][data-role="assistant"]', { hasText: SAYING.line }), "the session's words so far");

        // Open, with nothing to send; then the words, sent.
        await expectVisible(boxOf(page, 'open'), 'the prompt box is open for a session in flight');
        if (await sendOf(page).isEnabled()) throw new Refused('Send is disabled while there is nothing to send');
        await fieldOf(page).fill(SAYING.words);
        const before = heard.length;
        const [response] = await Promise.all([page.waitForResponse(said, { timeout: WAIT_MS }), sendOf(page).click()]);
        if (response.status() !== 202) throw new Refused(`the api takes the words, through the board's proxy — it answered ${response.status()}: ${await response.text()}`);
        const entry = (await response.json()) as { at?: unknown; attempt?: unknown; text?: unknown };
        if (typeof entry.at !== 'string' || entry.attempt !== 1 || entry.text !== SAYING.words || Object.keys(entry).length !== 3) {
          throw new Refused(`the api answers with the engine's entry, { at, attempt, text } — it answered ${JSON.stringify(entry)}`);
        }
        const inbox = JSON.stringify({ type: 'user', session_id: SAYING.sessionId, message: { role: 'user', content: SAYING.words } });
        for (const until = Date.now() + WAIT_MS; heard.length === before && Date.now() < until; ) await new Promise((resolve) => setTimeout(resolve, 50));
        if (heard.length !== before + 1 || JSON.stringify(heard.at(-1)) !== inbox) {
          throw new Refused(`the words reached the session's inbox once, as given — it heard ${JSON.stringify(heard.slice(before))}`);
        }
        const detail = (await (await page.request.get(new URL(`/api/runs/${SAYING.run}`, page.url()).href)).json()) as { steps: Array<{ name: string; said?: unknown }> };
        const onRecord = detail.steps.find((s) => s.name === SAYING.step)?.said;
        if (JSON.stringify(onRecord) !== JSON.stringify([entry])) {
          throw new Refused(`the step's detail carries what was said, off the engine's journal — it carries ${JSON.stringify(onRecord)}`);
        }
        const told = talk.locator('[data-turn="told"]', { hasText: SAYING.words });
        await expectVisible(told, 'the words, a turn of their own in the conversation');
        await expectVisible(told.getByText('You said, while it ran'), 'marked as yours, said while the session ran');
        // The session reads them between calls and writes their arrival into its transcript (`arrivalLine`), which the page follows: the words are
        // drawn once, as what was said, and the session's own line for them is not drawn beside it.
        await expectVisible(told.locator('[data-arrived]', { hasText: 'in its conversation' }), "the turn says the words are in the session's conversation, once its transcript shows them");
        await expectCount(talk.locator('[data-turn="system"]', { hasText: SAYING.words }), 0, "no system line with the words: the session's record of their arrival is the turn");
        await expectCount(talk.getByText(SAYING.words, { exact: true }), 1, 'the words are drawn once');
        if ((await fieldOf(page).inputValue()) !== '') throw new Refused('the box is emptied once the words are said');
        await expectVisible(top.locator('[data-note]', { hasText: 'said to 1×' }), "the step's note says it was said to, in wf ls's words");

        // `wf decide`, on the same store: the words under the step, with when they were said, as data.
        let decided: string;
        try {
          decided = execFileSync(process.execPath, [path.join(REPO, 'packages', 'agent-workflows', 'bin', 'wf.ts'), 'decide', SAYING.run], { encoding: 'utf8', env: apiEnv, stdio: 'pipe' });
        } catch (err) {
          const { stdout, stderr } = err as { stdout?: string; stderr?: string };
          throw new Refused(`wf decide ${SAYING.run} runs on the e2e's store — it failed:\n${stdout ?? ''}${stderr ?? ''}`);
        }
        const lines = [`    said to try 1, at ${entry.at}:`, '    ```text', `    ${SAYING.words}`, '    ```'].join('\n');
        if (!decided.includes(`\n  ${SAYING.step}\n`) || !decided.includes(lines)) throw new Refused(`wf decide prints what was said under ${SAYING.step}, fenced — it printed:\n${decided}`);
        await settled(page);
        await page.screenshot({ path: path.join(OUT, `say-said-${await themeOf(page)}.png`), fullPage: true });

        // Refused, in a page of its own: draft's session ends while the page still shows it running — the run as the page read it is held, as a
        // read a moment before the end would be — and the words sent then are refused in the package's words, under the box, verbatim.
        const refused = await page.context().newPage();
        try {
          const { problems } = watch(refused);
          await refused.goto(page.url(), { waitUntil: 'load' });
          await expectVisible(boxOf(refused, 'open'), 'the prompt box, open, on a page of its own');
          const detailPath = `/api/runs/${SAYING.run}`;
          const read = await (await refused.request.get(new URL(detailPath, refused.url()).href)).text();
          await refused.route((url) => url.pathname === detailPath, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: read }));
          const end = new Date().toISOString();
          fs.appendFileSync(journal, [
            { kind: 'ended', at: end, attempt: 1, sessionId: `ae/${SAYING.run}-${SAYING.step}/1`, nativeId: SAYING.sessionId, observed: 'done', reason: 'harness' },
            { kind: 'settled', at: end, outcome: 'succeeded' },
          ].map((event) => `${JSON.stringify(event)}\n`).join(''));
          const journalled = fs.readFileSync(journal, 'utf8');
          const heardBefore = heard.length;
          await fieldOf(refused).fill(SAYING.words);
          const [answered] = await Promise.all([refused.waitForResponse(said, { timeout: WAIT_MS }), sendOf(refused).click()]);
          const { error } = (await answered.json()) as { error?: string };
          const sentence = `${SAYING.step} is not running: try 1's task settled \`succeeded\`, so no session of it is there to hear anything.`;
          if (answered.status() !== 409 || !error?.startsWith(sentence)) {
            throw new Refused(`the package refuses words for a step whose session ended — the api answered ${answered.status()}: ${JSON.stringify(error)}`);
          }
          await expectVisible(boxOf(refused).locator('[data-refused]'), 'the refusal is shown under the box, not swallowed');
          const shown = await boxOf(refused).locator('[data-refused] p.font-mono').textContent();
          if (shown !== error) throw new Refused(`the refusal under the box is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`);
          if ((await fieldOf(refused).inputValue()) !== SAYING.words) throw new Refused('the words stay in the box after a refusal, to send again');
          if (heard.length !== heardBefore) throw new Refused(`nothing reaches the inbox on a refusal — it heard ${JSON.stringify(heard.slice(heardBefore))}`);
          if (fs.readFileSync(journal, 'utf8') !== journalled) throw new Refused(`nothing is journalled on a refusal — ${journal} changed`);
          await settled(refused);
          await refused.screenshot({ path: path.join(OUT, `say-refused-${await themeOf(refused)}.png`), fullPage: true });
          // The one refusal made, as the browser reports it — its answer, and the line Chromium writes to the console for one — and nothing else.
          const expected = `request answered 409: POST ${answered.url()}`;
          const seen = problems();
          const others = seen.filter((p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p));
          if (!seen.includes(expected) || others.length) throw new Refused(`the refused page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
        } finally {
          await refused.close();
        }
        // The page following draft sees its session end and stops following, before its conversation is taken back from under the stream.
        await expectCount(top.locator('[data-following]'), 0, 'the page following draft stops following once its session has ended');
      } finally {
        // Taken back: draft's task and its conversation as seeded — at work, told nothing, and nothing arrived.
        fs.writeFileSync(journal, seeded);
        fs.writeFileSync(conversation, seededConversation);
      }
      // Read again, the run has draft at work once more, and the box is open.
      await expectVisible(boxOf(page, 'open'), 'with the writes taken back, the box is open again once the run is read again');
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
    // A run that waits on a run that was called off: its page says what `wf decide` says of it, and offers nothing else.
    name: 'waits',
    route: `/runs/${DIAMOND.orphan.id}`,
    expect: async (page) => {
      await sidebar(page);
      const { cancelled, orphan } = DIAMOND;
      const banner = page.locator('section[aria-label="Waiting on runs"][data-on-you="true"]');
      await expectVisible(banner.getByText(DIAMOND.words.orphan, { exact: true }), `the page says what wf ls says of ${orphan.id}: ${DIAMOND.words.orphan}`);
      const advice = `${cancelled.id} was cancelled at ${cancelledAt()}, and a cancelled run never ships — yours to resolve: wf cancel ${orphan.id}, or start the work again without --after ${cancelled.id}`;
      await expectVisible(banner.locator('[data-advice]', { hasText: advice }), 'and what wf decide leaves you to do, word for word');
      await expectVisible(banner.locator(`a[href="/runs/${cancelled.id}"]`), `${cancelled.id} is linked to its page`);
      await expectCount(page.locator('section[aria-label="Decide"]'), 0, 'no Decide section: nothing of the run is filed, and wf decide offers nothing else');
      const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
      await expectVisible(
        graph.locator('.react-flow__node[data-id="implement"] [data-state="waiting"]', { hasText: DIAMOND.words.orphan }),
        "its root's chip is waiting, in wf ls's words",
      );
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
/** The environment the api runs in — its store, its `claude`, where sessions register — for a `wf` a page runs on the same store. */
let apiEnv: NodeJS.ProcessEnv = {};
/** Every line draft's stand-in inbox (SAYING, INBOX) has been sent, in order: what the `say` page holds its words to. */
const heard: unknown[] = [];

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
  // After the checkout's files, which its base commits.
  seedDiamond(checkout, store);
  // A `claude` that lists the store's sessions (REGISTRY) — HELD's, blocked — first on the api's PATH. The engine observes `claude
  // agents` on every list; the pages are about the store, not about the sessions on this machine. And where Claude Code keeps its
  // transcripts, in the store (CLAUDE_CONFIG_DIR): the engine reads a session's conversation from there, never from this machine's.
  const bin = path.join(store, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\nif [ "$1" = agents ]; then cat "${path.join(store, REGISTRY)}"; else echo '[]'; fi\n`, { mode: 0o755 });

  // draft's inbox (SAYING): the socket its registration names, listening before the api can be asked to say anything into it.
  // And, as a working session does when it reads the words between calls, the stand-in writes their arrival into draft's transcript.
  const draftTranscript = path.join(store, DRAFT_TRANSCRIPT);
  await listen(path.join(store, INBOX), (line) => {
    const { session_id: sessionId, message } = (line ?? {}) as { session_id?: unknown; message?: { content?: unknown } };
    if (sessionId === SAYING.sessionId && typeof message?.content === 'string') fs.appendFileSync(draftTranscript, arrivalLine(message.content, new Date().toISOString()));
  });
  apiEnv = {
    ...process.env, PORT: '0', WF_ROOT: store, HKB_REPO: checkout, CLAUDE_CONFIG_DIR: path.join(store, 'claude'),
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
  };
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
