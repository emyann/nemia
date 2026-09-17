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
import { expectApart, expectBeneath, expectBetween, expectCount, expectDrawn, expectInside, expectLeftOf, expectMovedWith, expectTexts, expectUncut, expectVisible, Refused, settled, WAIT_MS, watch } from './checks.ts';
import { arrivalLine, CARDS, CHECKOUT, COSTLY, DIAMOND, DIAMOND_RUNS, DRAFT_TRANSCRIPT, FAKE, GATED, HELD, INBOX, LOOPING, NEIGHBOUR, REGISTRY, SAYING, seed, seedCheckout, seedDiamond, seedFeed, seedInbox, seedWorkflows, SESSION, WORKFLOWS } from './seed.ts';
import { exitOn, launch, visitAll, type PageSpec } from './visit.ts';

const WEB = path.resolve(import.meta.dirname, '..', '..');
const REPO = path.resolve(WEB, '..', '..');
const API = path.join(REPO, 'apps', 'api');
const OUT = path.resolve(process.env.WF_ARTIFACTS || path.join(REPO, '.e2e'));

/** How long a server has to say where it listens. */
const START_MS = 30_000;

/** The menu's places, in its order: the Inbox first. */
const PLACES = ['Inbox', 'Factory', 'Runs', 'Workflows', 'Capabilities'];

/** On every page: the menu, with each of its places, in its order. */
async function sidebar(page: Page): Promise<void> {
  const menu = page.locator('[data-sidebar="sidebar"]');
  for (const place of PLACES) await expectVisible(menu.getByRole('link', { name: place }), `the sidebar has ${place}`);
  await expectTexts(menu.locator('[data-sidebar="content"] [data-sidebar="menu-button"]'), PLACES, 'the sidebar lists its places in order, the Inbox first');
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

/** A card on the Inbox page, by its name. */
const cardIn = (page: Page, name: string): Locator => page.locator(`section[aria-label="Cards"] li[data-card="${name}"]`);

/** The idea the `inbox` page files from its box, and takes back with Remove. */
const FILED = 'Give the inbox a keyboard shortcut\n\nN files a card from any page.';
/** The brief the `inbox` page starts CARDS.planned with, in place of its body. */
const STARTED = 'Cache the views between passes\n\nRead each journal once a pass; the api reads the same views.';
/** The run a record says CARDS.bare was started as, on the page that shows a card started already. */
const STARTED_AS = 'show-what-a-step-cost-on-the-e2e0';

/** What the `answer` page answers FAKE's blocked step with. */
const ANSWER = 'Keep it off the floor: a finished run is under Show finished.';

/** A folder's files, each name with its text: what a page that writes nothing leaves as it found. */
const filesIn = (dir: string): Array<[string, string]> =>
  fs.readdirSync(dir).sort().map((name) => [name, fs.statSync(path.join(dir, name)).isFile() ? fs.readFileSync(path.join(dir, name), 'utf8') : '(a folder)']);

/** A text's markdown, rendered: its `##` a heading two levels down, an h4 — the page's own are h1 and h2 — and its list, a list. */
async function expectRendered(body: Locator, text: { heading: string; items: readonly string[]; cells?: readonly string[]; code?: string }): Promise<void> {
  await expectVisible(body.getByRole('heading', { level: 4, name: text.heading }), `its ## is a heading, an h4 (${text.heading})`);
  await expectTexts(body.locator('ul > li'), text.items, `its list is a list (${text.items.join(' · ')})`);
  for (const cell of text.cells ?? []) await expectVisible(body.getByRole('cell', { name: cell, exact: true }), `its table is a table, with a cell ${cell}`);
  if (text.code) await expectVisible(body.locator('[data-language="bash"]', { hasText: text.code }), `its fenced block is the board's code block, in bash (${text.code})`);
}

/**
 * A page's key table: a row per key the api answers, in its order, each with its value — or `not set` — and what it means, as the api says it.
 * `set` is what the file sets, by key, as the seed wrote it: every other key reads `not set`.
 */
async function expectKeys(page: Page, file: Locator, api: string, set: Readonly<Record<string, string>>): Promise<void> {
  const answered = await page.request.get(new URL(api, page.url()).href);
  if (!answered.ok()) throw new Refused(`GET ${api} answers the page's keys — it answered ${answered.status()}`);
  const { keys } = (await answered.json()) as { keys: Array<{ key: string; value: string | null; meaning: string }> };
  const rows = file.locator('section[aria-label="Keys"] tr[data-key]');
  await expectCount(rows, keys.length, `a row per key (${keys.map((k) => k.key).join(', ')})`);
  const order = await rows.evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-key')));
  if (JSON.stringify(order) !== JSON.stringify(keys.map((k) => k.key))) throw new Refused(`the rows are in the package's order — ${order.join(', ')}`);
  for (const { key, value, meaning } of keys) {
    if (value !== (set[key] ?? null)) throw new Refused(`GET ${api} reads ${key} as the file sets it (${set[key] ?? 'not set'}) — it answered ${JSON.stringify(value)}`);
    const row = rows.filter({ has: page.locator(`th[scope="row"]`, { hasText: new RegExp(`^${key}$`) }) });
    await expectTexts(row.locator('[data-value]'), [value ?? 'not set'], `${key}'s value reads ${value ?? 'not set'}`);
    // The meaning is markdown: its code spans are drawn as code, so the text read has no backticks.
    await expectTexts(row.locator('[data-meaning]'), [meaning.replaceAll('`', '')], `${key}'s row says what it means, as the package does`);
  }
}

/** Source: the file as written, frontmatter included, in place of what the page renders of it — and back. */
async function expectSource(file: Locator, body: Locator, onDisk: string): Promise<void> {
  const toggle = file.getByRole('button', { name: 'Source' });
  await toggle.click();
  const source = file.locator('pre[data-source]');
  await expectVisible(source, 'Source shows the file as written');
  const shown = await source.textContent();
  const written = fs.readFileSync(onDisk, 'utf8');
  if (shown !== written) throw new Refused(`Source is the file byte for byte, frontmatter included — it shows ${JSON.stringify(shown)}, and ${onDisk} holds ${JSON.stringify(written)}`);
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') throw new Refused('Source says it is pressed while the file is shown');
  await expectCount(file.locator('section[aria-label="Keys"]'), 0, 'in place of the rendered body and the keys');
  await toggle.click();
  await expectCount(source, 0, 'pressed again, Source gives the rendered page back');
  await expectVisible(body, 'the body rendered again');
}

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
      // In flight: NEIGHBOUR, HELD, the diamond's running side and its bottom. Waiting on you: FAKE, LOOPING, COSTLY, GATED, and the run waiting on one called off.
      await expectVisible(page.getByText('4 in flight · 8 finished · 5 waiting on you'), 'the Factory counts the runs in flight, the finished, and those waiting on you');
      // A run at its gate is finished too: nothing of it moves until a person approves its step.
      await expectCount(cardOf(page, GATED.id), 0, `a run waiting at its gate is not in flight: no card on the floor by default (${GATED.id})`);
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
      // What a run cost, beside its age, once its harness priced a session of it — and nothing for a run nobody priced, which is not $0.
      await expectVisible(
        cardOf(page, COSTLY.id).locator('[data-cost]', { hasText: `· ${COSTLY.cost}` }),
        `the card of a run whose sessions were priced says what it cost beside its age (${COSTLY.cost})`,
      );
      await expectCount(card.locator('[data-cost]'), 0, "the fake run's card says no cost: none of its sessions was priced");
      // A run at its gate: its card says what is asked of you, in wf ls's words, and its step's chip is amber.
      const gated = cardOf(page, GATED.id);
      await expectVisible(
        gated.locator(`[data-need="approve"][data-step="${GATED.gated}"]`, { hasText: new RegExp(`^approve ${GATED.gated}$`) }),
        `the card of a run at its gate says approve ${GATED.gated} (${GATED.id})`,
      );
      await expectVisible(gated.locator('[data-state="awaiting-approval"]', { hasText: 'awaiting approval' }), 'and shows the step as awaiting approval, an amber chip');
      await expectVisible(gated.getByText('waiting on you', { exact: true }), 'and waits on you');
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
      // The runs in flight on top, then the rest, each newest first; in flight as the Factory counts them, which the api's id order is not.
      const rows = page.locator('li[data-in-flight]');
      await expectCount(rows, 12, 'the runs list has a row for each of the twelve runs the Factory counts');
      // Under a heading each, which says where the runs in flight end: the first finished row is newer than the last in flight.
      const flying = page.locator('section[data-group="in-flight"]');
      const finished = page.locator('section[data-group="finished"]');
      await expectCount(flying.locator('li[data-in-flight="true"]'), 4, 'the four runs in flight, as the Factory counts them, are under In flight');
      await expectCount(flying.locator('li[data-in-flight="false"]'), 0, 'and no finished run is');
      await expectCount(finished.locator('li[data-in-flight="false"]'), 8, 'the eight finished runs are under Finished');
      await expectCount(finished.locator('li[data-in-flight="true"]'), 0, 'and no run in flight is');
      await expectVisible(flying.getByRole('heading', { name: /^In flight 4 something of each still moves, newest first$/ }), 'In flight is headed with its count and its order');
      await expectVisible(
        finished.getByRole('heading', { name: /^Finished 8 nothing of these moves any more, newest first · 5 waiting on you$/ }),
        'Finished is headed with its count, its order, and how many of them wait on you, as the Factory counts them',
      );
      await expectBeneath(finished, flying, 'the finished runs are listed beneath the runs in flight');
      const listed = await rows.evaluateAll((lis) => lis.map((li) => ({
        id: li.querySelector('a[href^="/runs/"]')?.getAttribute('href')?.slice('/runs/'.length) ?? '',
        inFlight: li.getAttribute('data-in-flight') === 'true',
        at: li.querySelector('time')?.getAttribute('datetime') ?? '',
      })));
      const ordered = [...listed].sort((a, b) => Number(b.inFlight) - Number(a.inFlight) || b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
      if (listed.some((r, i) => r.id !== ordered[i]!.id)) {
        const said = (rs: typeof listed) => rs.map((r) => `${r.id} (${r.inFlight ? 'in flight' : 'not'}, ${r.at})`).join('\n    ');
        throw new Refused(`the runs list has the runs in flight first, then the rest, each newest first — it lists:\n    ${said(listed)}\n  and not:\n    ${said(ordered)}`);
      }
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
      // What a run cost, beside when it started, once a session of it was priced; a step over its budget, an amber chip with the amounts.
      const costly = page.locator('li', { has: page.locator(`a[href="/runs/${COSTLY.id}"]`) });
      await expectVisible(costly.locator('[data-cost]', { hasText: COSTLY.cost }), `the row of a run whose sessions were priced says what it cost (${COSTLY.cost})`);
      await expectVisible(
        costly.locator('[data-state="over-budget"]', { hasText: COSTLY.over.status }),
        `the row shows ${COSTLY.over.step} over its budget as an amber chip, with the amounts (${COSTLY.over.status})`,
      );
      await expectVisible(costly.getByText(`waiting on you: ${COSTLY.steps.join(', ')}`), 'and says every step past its budget waits on you');
      await expectCount(page.locator('li', { has: page.locator(`a[href="/runs/${FAKE.id}"]`) }).locator('[data-cost]'), 0, "the fake run's row says no cost: none of its sessions was priced");
      // A run at its gate: what is asked of you, as wf ls says it, and counted among the runs waiting on you above.
      const gatedRow = page.locator(`li a[href="/runs/${GATED.id}"]`);
      await expectVisible(gatedRow.locator('[data-waiting-on-you]', { hasText: new RegExp(`^waiting on you: approve ${GATED.gated}$`) }), `the row of a run at its gate says waiting on you: approve ${GATED.gated}`);
      await expectVisible(gatedRow.locator('[data-state="awaiting-approval"]', { hasText: 'awaiting approval' }), 'and shows its step as awaiting approval, an amber chip');
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
      await expectCount(page.locator('[data-from]'), 0, 'a run started with no card says it came from none');
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

      // Where the run's time went: a row per try's session and per check, each queued filed → spawned and ran spawned → ended, off the
      // engine's attempts and the filings on its feed.
      const timeline = page.locator('section[aria-label="Timeline"]');
      const exactly = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
      for (const [step, [queued, ran]] of Object.entries(FAKE.timeline.sessions)) {
        const row = timeline.locator(`tr[data-step="${step}"][data-task="session"][data-at="ended"]`);
        await expectVisible(row.locator('[data-cell="queued"]', { hasText: exactly(queued) }), `the timeline says ${step} queued ${queued} for a slot`);
        await expectVisible(row.locator('[data-cell="ran"]', { hasText: exactly(ran) }), `the timeline says ${step} ran ${ran}`);
      }
      const [checkQueued, checkRan] = FAKE.timeline.check;
      const checkRow = timeline.locator(`tr[data-step="${FAKE.refused}"][data-task="check"][data-at="ended"]`);
      await expectVisible(checkRow.locator('[data-cell="queued"]', { hasText: exactly(checkQueued) }), `${FAKE.refused}'s check queued ${checkQueued}`);
      await expectVisible(checkRow.locator('[data-cell="ran"]', { hasText: exactly(checkRan) }), `${FAKE.refused}'s check ran ${checkRan}`);
      await expectVisible(timeline.locator(`tr[data-step="${FAKE.unverified}"] [data-cell="used"]`, { hasText: FAKE.used }), `what ${FAKE.unverified}'s session used, beside its times`);
      await expectVisible(timeline.locator('tr[data-step="review"][data-at="unknown"]', { hasText: `the engine has no record of ${FAKE.id}-review` }), 'review, whose task the engine lost, is said, not timed');
      await expectCount(timeline.locator('tr[data-step="respond"]'), 0, 'respond, not filed, has no row');
      const total = timeline.locator('tr[data-total="run"]');
      for (const cell of ['queued', 'ran'] as const) {
        await expectVisible(total.locator(`[data-cell="${cell}"]`, { hasText: exactly(FAKE.timeline.run[cell]) }), `the run's total ${cell} is ${FAKE.timeline.run[cell]}`);
      }
      await expectVisible(total.locator('[data-cell="wall"]', { hasText: `wall ${FAKE.timeline.run.wall}` }), `the run's wall is ${FAKE.timeline.run.wall}: a task it cannot time`);
      await expectCount(timeline.locator('tr[data-total^="round-"]'), 0, "one round: the run's total alone");
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
    // The gate on the board: a run waiting at plan's gate, the closeout plan handed on rendered, and beside it Approve and Send back. Refused
    // first, in a page of its own whose one refusal is the point: an approval of a step that is not gated — the page read the gate, and the
    // record lost it before Approve was pressed — in the package's words beside the button, and nothing written. Then approved from the page,
    // with words: the approval's file as `wf approve` writes it, and the page reads the approval under the step. Taken back, and sent back
    // from the page: the ask as `wf retry --message` writes it. Each file is taken back, so every page after this one reads the store as seeded.
    name: 'gate',
    route: `/runs/${GATED.id}`,
    expect: async (page) => {
      await sidebar(page);
      const { id, gated } = GATED;
      const asks = path.join(store!, 'runs', `${id}.asks`);
      const recordFile = path.join(store!, 'runs', `${id}.json`);
      const seededRecord = fs.readFileSync(recordFile, 'utf8');
      const approved = (r: { request: () => { method: () => string }; url: () => string }) =>
        r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${id}/steps/${gated}/approve`;
      const retried = (r: { request: () => { method: () => string }; url: () => string }) =>
        r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${id}/steps/${gated}/retry`;
      const gateOf = (p: Page) => p.locator(`section[aria-label="The gate of ${gated}"]`);
      const wordsOf = (p: Page) => gateOf(p).getByRole('textbox', { name: `Words to approve ${gated} with, if any` });
      const approveOf = (p: Page) => gateOf(p).getByRole('button', { name: 'Approve', exact: true });

      // The banner's one line, in wf ls's words, linked to the step's section.
      const banner = page.locator('section[aria-label="Waiting on you"]');
      const line = `Waiting on you: approve ${gated} — signed off blocked, unsigned, refused by its check, waiting at its gate, out of rounds, or past its budget — wf decide ${id}`;
      await expectVisible(banner.locator(':scope > p', { hasText: line }), `the banner says ${line}`);
      await expectCount(banner.locator(':scope > p'), 1, 'in its one line');
      await expectCount(banner.locator(`a[data-approve="${gated}"][href="#step-${gated}"]`), 1, `approve ${gated} links to the step's section`);
      await expectCount(banner.locator('li'), 0, 'and lists nothing under it: the approval is no question');

      // On the graph: a human gate, saying what is asked of you.
      const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
      const node = graph.locator(`.react-flow__node[data-id="${gated}"]`);
      await expectVisible(node.locator('[data-state="awaiting-approval"]', { hasText: 'awaiting approval' }), `${gated}'s chip reads awaiting approval, amber`);
      await expectVisible(node.locator('[data-need="approve"]', { hasText: `approve ${gated}` }), `${gated} is a human gate on the graph, and says approve ${gated}`);
      await expectCount(node.getByRole('img', { name: 'running now' }), 0, 'and no spinner: nobody runs a step at its gate');

      // Its section: what it handed on, rendered, and beside it the gate, with Approve and Send back.
      const section = page.locator(`article > section#step-${gated}`);
      const handedOn = section.locator('div.grid > div', { has: page.getByRole('heading', { level: 4, name: GATED.plan.heading }) });
      await expectRendered(handedOn, { heading: GATED.plan.heading, items: GATED.plan.items });
      await expectVisible(gateOf(page), `${gated}'s section has its gate`);
      await expectLeftOf(handedOn, gateOf(page), 'the gate is beside what the step handed on');
      await expectVisible(wordsOf(page), 'a box for the words to approve with');
      if (!(await approveOf(page).isEnabled())) throw new Refused('Approve is enabled with no words: an approval needs none');
      const objection = gateOf(page).getByRole('textbox', { name: `What to change, sent back to ${gated}` });
      const sendBack = gateOf(page).getByRole('button', { name: 'Send back', exact: true });
      await expectVisible(objection, 'and the answer box that sends it back');
      if (await sendBack.isEnabled()) throw new Refused('Send back is disabled while there is no objection — it was enabled with none');
      await expectVisible(gateOf(page).getByRole('radio', { name: /^a new session/ }), 'a new session as an option to continuing its session');
      await expectVisible(section.locator('dd', { hasText: /^awaiting approval$/ }), "the step's facts say its gate awaits approval");
      const decide = page.locator('section[aria-label="Decide"]');
      await expectCount(decide.locator('section[aria-label="Answer"]'), 0, "the Decide section offers no answer of its own: the gate is the step's");
      // Its commands are the gate's, as `wf decide` prints them under the step — never `None yet: the run is still moving`.
      await expectVisible(decide.locator('[data-command="approve"] code', { hasText: new RegExp(`^wf approve ${id} ${gated}$`) }), 'the Decide section offers the approval to copy');
      await expectVisible(decide.locator('[data-command="send back"] code', { hasText: `wf retry ${id} ${gated} --message "<objection>"` }), 'and the send-back');
      await expectCount(decide.getByText('None yet: the run is still moving.'), 0, 'and does not say the run is still moving: it waits on you');
      await settled(page);
      await page.screenshot({ path: path.join(OUT, `gate-awaiting-${await themeOf(page)}.png`), fullPage: true });

      // Refused, in a page of its own: the page read plan's gate, and the record lost it — as a run started without --gate reads — before
      // Approve was pressed. The run as the page read it is held, so the button is there to press; the package refuses an approval of a step
      // that is not gated, in its words, beside the button, verbatim; the words stay in the box, and nothing is written.
      const refused = await page.context().newPage();
      try {
        const { problems } = watch(refused);
        await refused.goto(page.url(), { waitUntil: 'networkidle' });
        await expectVisible(approveOf(refused), 'Approve, on a page of its own');
        const detailPath = `/api/runs/${id}`;
        const read = await (await refused.request.get(new URL(detailPath, refused.url()).href)).text();
        await refused.route((url) => url.pathname === detailPath, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: read }));
        const { gates: _gates, ...ungated } = JSON.parse(seededRecord) as { gates?: string[] };
        fs.writeFileSync(recordFile, JSON.stringify(ungated, null, 2));
        await wordsOf(refused).fill(GATED.words);
        const [answered] = await Promise.all([refused.waitForResponse(approved, { timeout: WAIT_MS }), approveOf(refused).click()]);
        const { error } = (await answered.json()) as { error?: string };
        if (answered.status() !== 409 || !error?.startsWith(`${gated} has no gate: what waits on it is filed once it has signed off, with nobody's approval, so there is nothing to approve. ${id} is gated at no step.`)) {
          throw new Refused(`the package refuses an approval of a step that is not gated — the api answered ${answered.status()}: ${JSON.stringify(error)}`);
        }
        const refusal = gateOf(refused).locator('form[aria-label^="Approve"] [data-refused]');
        await expectVisible(refusal.getByText('Not approved. The api refused it:'), 'the refusal is shown beside Approve, not swallowed');
        const shown = await refusal.locator('p.font-mono').textContent();
        if (shown !== error) throw new Refused(`the refusal beside Approve is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`);
        if ((await wordsOf(refused).inputValue()) !== GATED.words) throw new Refused('the words stay in the box after a refusal, to approve with again');
        if (fs.existsSync(asks)) throw new Refused(`nothing is written on a refusal — ${asks} holds ${fs.readdirSync(asks, { recursive: true }).join(', ')}`);
        await settled(refused);
        await refused.screenshot({ path: path.join(OUT, `gate-refused-${await themeOf(refused)}.png`), fullPage: true });
        // The one refusal made, as the browser reports it — its answer, and the line Chromium writes to the console for one — and nothing else.
        const expected = `request answered 409: POST ${answered.url()}`;
        const seen = problems();
        const others = seen.filter((p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p));
        if (!seen.includes(expected) || others.length) throw new Refused(`the refused page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
      } finally {
        await refused.close();
        fs.writeFileSync(recordFile, seededRecord);
      }

      // Approved, with words: the api takes it through the board's proxy, and writes the approval as `wf approve` does, and nothing else.
      await expectVisible(approveOf(page), `with its gate back on the record, ${gated} waits at it once the run is read again`);
      await wordsOf(page).fill(GATED.words);
      const [response] = await Promise.all([page.waitForResponse(approved, { timeout: WAIT_MS }), approveOf(page).click()]);
      if (response.status() !== 202) throw new Refused(`the api takes the approval, through the board's proxy — it answered ${response.status()}: ${await response.text()}`);
      const took = (await response.json()) as { try?: unknown; at?: unknown; message?: unknown; file?: unknown };
      const file = path.join(asks, `approve-${gated}-1`);
      if (took.try !== 1 || typeof took.at !== 'string' || took.message !== GATED.words || took.file !== file) {
        throw new Refused(`the api answers with the try approved, when, the words and the approval's file — it answered ${JSON.stringify(took)}`);
      }
      const written = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
      if (JSON.stringify(written) !== JSON.stringify({ step: gated, try: 1, at: took.at, message: GATED.words }) || fs.readdirSync(asks).length !== 1) {
        throw new Refused(`the approval is written as wf approve writes it, and nothing else — ${asks} holds ${fs.readdirSync(asks).join(', ')}, and ${file} ${JSON.stringify(written)}`);
      }
      if (fs.readFileSync(recordFile, 'utf8') !== seededRecord) throw new Refused(`the api writes nothing of the run's record — ${recordFile} changed`);

      // The page reads the approval under the step, and nobody is waited on for it.
      const approval = section.locator(`section[aria-label="The approval of ${gated}"]`);
      await expectVisible(approval, `the approval shows under ${gated} once the run is read again`);
      const words = await approval.locator('[data-words]').textContent();
      if (words !== GATED.words) throw new Refused(`the approval's words are shown as they were written — it shows ${JSON.stringify(words)}`);
      await expectVisible(approval.locator(`time[datetime="${took.at}"]`), 'with when it was given');
      await expectCount(gateOf(page), 0, 'and the gate is gone: nothing to approve');
      await expectCount(banner, 0, 'and the banner with it: nobody is waited on');
      await expectVisible(section.locator('dd', { hasText: /^approved, try 1$/ }), "the step's facts say its gate is approved");
      await settled(page);
      await page.screenshot({ path: path.join(OUT, `gate-approved-${await themeOf(page)}.png`), fullPage: true });

      // Taken back: the gate holds again, and plan is sent back from its page, as `wf retry --message` sends it — then that is taken back too.
      fs.rmSync(asks, { recursive: true, force: true });
      await expectVisible(approveOf(page), `with the approval taken back, ${gated} waits at its gate again once the run is read again`);
      await expectCount(approval, 0, 'and its approval is gone from under it');
      await objection.fill(GATED.objection);
      const [sent] = await Promise.all([page.waitForResponse(retried, { timeout: WAIT_MS }), sendBack.click()]);
      if (sent.status() !== 202) throw new Refused(`the api takes the send-back — it answered ${sent.status()}: ${await sent.text()}`);
      const ask = path.join(asks, `retry-${gated}-2`);
      const asked = fs.existsSync(ask) ? JSON.parse(fs.readFileSync(ask, 'utf8')) : undefined;
      if (asked?.step !== gated || asked?.try !== 2 || asked?.mode !== 'nudge' || asked?.message !== GATED.objection) {
        throw new Refused(`the send-back is written as wf retry --message writes it — ${ask} holds ${JSON.stringify(asked)}`);
      }
      const note = 'try 2 asked (--nudge, with your answer) — the next tick files it';
      await expectVisible(section.locator('[data-note]', { hasText: note }), `${gated}'s section says what wf ls says of the try asked (${note})`);
      await expectCount(gateOf(page), 0, 'and offers the gate no more: it is sent back');
      await settled(page);
      await page.screenshot({ path: path.join(OUT, `gate-sent-back-${await themeOf(page)}.png`), fullPage: true });

      fs.rmSync(asks, { recursive: true, force: true });
      await expectVisible(approveOf(page), `with the send-back taken back, ${gated} waits at its gate again, and the page ends as it began`);
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
  },
  {
    // What a run cost, and steps held on their budget: the run's cost in its header, a cost column on the timeline, a step's cost of its cap on
    // its node and in the inspector, red past it — and the raises the Decide section offers, one refused in a page of its own, where it is not
    // above what was spent, in the package's words and with nothing written. Nothing is taken: every page after this one reads the store as seeded.
    name: 'cost',
    route: `/runs/${COSTLY.id}`,
    expect: async (page) => {
      await sidebar(page);
      const { over, held, asks: askingStep } = COSTLY;
      await expectCount(page.getByText(/no longer reads as a workflow|has changed since this run started/), 0, 'no warning about the workflow folder: it reads as the budgets the run froze');
      await expectVisible(page.locator('article header [data-run-cost]', { hasText: `cost ${COSTLY.cost}` }), `the run's header says what it cost (${COSTLY.cost})`);
      // Whole: implement and review did their work, and are held on implement's budget alone — the reason has to be among those the banner gives.
      const reasons = `Waiting on you: ${COSTLY.steps.join(', ')} — signed off blocked, unsigned, refused by its check, waiting at its gate, out of rounds, or past its budget — wf decide ${COSTLY.id}`;
      await expectVisible(page.locator('section[aria-label="Waiting on you"] > p', { hasText: reasons }), `the banner says every step past its budget waits on you, and why: ${reasons}`);
      await expectVisible(
        page.locator(`section[aria-label="Waiting on you"] [data-need="asks"][data-step="${askingStep.step}"]`, { hasText: `${askingStep.step} asks: ${askingStep.needs}` }),
        `the banner says what ${askingStep.step}, signed off blocked past its budget, asks`,
      );

      // On the graph: each step's word with its amounts, amber and a human gate, and what its tries cost of its cap — red past it.
      const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
      const node = (name: string) => graph.locator(`.react-flow__node[data-id="${name}"]`);
      await expectCount(graph.locator('.react-flow__node'), COSTLY.steps.length, `the run's graph has a node per step (${COSTLY.steps.join(', ')})`);
      for (const [name, status] of [[over.step, over.status], [held.step, held.status], [held.target, held.targetStatus], [askingStep.step, askingStep.status]] as const) {
        await expectVisible(node(name).locator('[data-state="over-budget"]', { hasText: status }), `${name}'s chip on the graph says ${status}, amber`);
        await expectVisible(node(name).getByText('human gate'), `${name}, past a budget, is drawn as a human gate`);
      }
      await expectVisible(node(over.step).locator('[data-cost="over"]', { hasText: over.of }), `${over.step}'s node says what its tries cost of its cap (${over.of}), red past it`);
      await expectVisible(node(held.target).locator('[data-cost="over"]', { hasText: '$2.10 of $2' }), `${held.target}'s node says what its rounds cost of its cap`);
      await expectVisible(node(askingStep.step).locator('[data-cost="over"]', { hasText: askingStep.of }), `${askingStep.step}'s node says what its session cost of its cap (${askingStep.of})`);
      await expectCount(node(held.step).locator('[data-cost]'), 0, `${held.step}, with no cap and no session priced, has no cost row: not $0`);

      // The timeline's cost column: each session's, `not measured` for the Codex sessions nobody priced, nothing for a check, and the totals.
      const timeline = page.locator('section[aria-label="Timeline"]');
      const cellsSay = async (cells: Locator, want: readonly string[], assertion: string) => {
        await expectCount(cells, want.length, assertion);
        const said = await cells.allTextContents();
        if (JSON.stringify(said) !== JSON.stringify(want)) throw new Refused(`${assertion} — it says ${JSON.stringify(said)}`);
      };
      for (const [name, costs] of Object.entries(COSTLY.sessions)) {
        await cellsSay(timeline.locator(`tr[data-step="${name}"][data-task="session"] [data-cell="cost"]`), costs, `the timeline says what each of ${name}'s sessions cost (${costs.join(', ')})`);
      }
      await cellsSay(timeline.locator(`tr[data-step="${over.step}"][data-task="check"] [data-cell="cost"]`), ['', ''], `${over.step}'s checks cost nothing, and say nothing`);
      await cellsSay(timeline.locator('tfoot tr[data-total^="round-"] [data-cell="cost"]'), COSTLY.rounds, `each round of ${held.step}'s loop says what its sessions cost (${COSTLY.rounds.join(', ')})`);
      await cellsSay(timeline.locator('tfoot tr[data-total="run"] [data-cell="cost"]'), [COSTLY.cost], `the run's total says what it cost (${COSTLY.cost})`);

      // What `wf decide` says of steps held on their budget, and the raises: tokens' with its try, review's with its round, and none of implement's own.
      const decide = page.locator('section[aria-label="Decide"]');
      await expectVisible(
        decide.locator('[data-over-budget]', { hasText: 'OVER BUDGET, waiting on you: implement ($2.10 of $2), palette ($1.50 of $1), review (held: its round would file implement again' }),
        "the Decide section says why each step past its budget is held, in wf decide's words",
      );
      await expectVisible(decide.locator('section[aria-label="Used"] dd', { hasText: 'run $7.85 measured · 2 attempts not measured' }), "and what every try of the run cost, in wf decide's words");
      const answers = decide.locator('section[aria-label="Answer"]');
      const raiseRow = (p: Page | Locator, name: string) => p.locator(`section[aria-label="Answer"] [data-offer="raise"][data-step="${name}"]`);
      const amountOf = (row: Locator, name: string) => row.getByRole('spinbutton', { name: new RegExp(`^The cap to raise ${name} to, in dollars`) });
      for (const [name, startsAt, button] of [
        [over.step, over.startsAt, 'Raise the budget and try again'], [held.step, held.startsAt, 'Raise the budget and go round again'], [askingStep.step, askingStep.startsAt, 'Raise the budget and answer'],
      ] as const) {
        const row = raiseRow(decide, name);
        await expectVisible(amountOf(row, name), `a box for the cap to raise ${name} to`);
        const value = await amountOf(row, name).inputValue();
        if (value !== startsAt) throw new Refused(`the box for ${name}'s cap starts at the first whole dollar above what was spent, ${startsAt} — it starts at ${value}`);
        await expectVisible(row.getByRole('button', { name: button }), `${name}'s row offers ${button}`);
      }
      await expectVisible(raiseRow(decide, over.step).getByRole('radio', { name: /^a new session/ }), `a new session as an option to continuing ${over.step}'s`);
      // Its check refused: its check again is a way on too, which needs no raise; and anything to tell a new session, if you like.
      await expectVisible(raiseRow(decide, over.step).getByRole('radio', { name: /^its check again/ }), `its check again as an option for ${over.step}, whose check refused`);
      await expectVisible(raiseRow(decide, over.step).getByRole('textbox', { name: `What to tell ${over.step}, if anything` }), `a box for anything to tell ${over.step}`);
      // Signed off blocked past its budget: its question on its row, and the answer beside the raise — the button waits for it, and is not pressed.
      const answering = raiseRow(decide, askingStep.step);
      await expectVisible(answering.locator('[data-asks]', { hasText: `asks: ${askingStep.needs}` }), `${askingStep.step}'s row says what it asks`);
      const answerBox = answering.getByRole('textbox', { name: `Your answer to ${askingStep.step}` });
      await expectVisible(answerBox, `an answer box for ${askingStep.step}, which asks, beside its raise`);
      const raiseAndAnswer = answering.getByRole('button', { name: 'Raise the budget and answer' });
      if (await raiseAndAnswer.isEnabled()) throw new Refused(`Raise the budget and answer is disabled while there is no answer — it was enabled with none`);
      await answerBox.fill('Warm ones.');
      if (!(await raiseAndAnswer.isEnabled())) throw new Refused('Raise the budget and answer is enabled once an answer is written — it stayed disabled');
      await answerBox.fill('');
      await expectCount(raiseRow(decide, held.step).getByRole('radio'), 0, 'a round has no mode to choose');
      await expectCount(answers.locator(`[data-step="${held.target}"]`), 0, `${held.target} has no row of its own: it goes again with ${held.step}'s round`);
      await expectVisible(decide.locator('[data-command="once more"] code', { hasText: `wf retry ${COSTLY.id} ${over.step} --budget <amount>` }), 'once more: the try with its cap raised, as a line');
      await expectVisible(decide.locator('[data-command="once more"] code', { hasText: `wf round ${COSTLY.id} ${held.step} --budget <amount>` }), 'once more: the round with its cap raised, as a line');

      // A raise not above what tokens' tries cost, in a page of its own whose one refusal is the point: the package's sentence beside the box,
      // word for word, the amount still in it, and nothing written.
      const asks = path.join(store!, 'runs', `${COSTLY.id}.asks`);
      const retried = (r: { request: () => { method: () => string }; url: () => string }) =>
        r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${COSTLY.id}/steps/${over.step}/retry`;
      const refused = await page.context().newPage();
      try {
        const { problems } = watch(refused);
        await refused.goto(page.url(), { waitUntil: 'networkidle' });
        const row = raiseRow(refused, over.step);
        const box = amountOf(row, over.step);
        await expectVisible(box, `the box for ${over.step}'s cap, on a page of its own`);
        await box.fill(String(COSTLY.refused));
        const [answered] = await Promise.all([
          refused.waitForResponse(retried, { timeout: WAIT_MS }),
          row.getByRole('button', { name: 'Raise the budget and try again' }).click(),
        ]);
        const sent = answered.request().postDataJSON() as { mode?: unknown; budget?: unknown } | null;
        if (sent?.mode !== 'nudge' || sent.budget !== COSTLY.refused) {
          throw new Refused(`the raise is sent as wf retry --budget ${COSTLY.refused} sends it, a nudge with the amount as a number — the board sent ${JSON.stringify(sent)}`);
        }
        const { error } = (await answered.json()) as { error?: string };
        const sentence = `--budget ${COSTLY.refused} is not above $4.25, what ${over.step}'s tries have cost: a try under it would read over budget again as soon as it ended.`;
        if (answered.status() !== 409 || !error?.startsWith(sentence)) {
          throw new Refused(`the package refuses a raise not above what ${over.step}'s tries cost — the api answered ${answered.status()}: ${JSON.stringify(error)}`);
        }
        await expectVisible(row.locator('[data-refused]'), 'the refusal is shown beside the box, not swallowed');
        const shown = await row.locator('[data-refused] p.font-mono').textContent();
        if (shown !== error) throw new Refused(`the refusal beside the box is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`);
        if ((await box.inputValue()) !== String(COSTLY.refused)) throw new Refused('the amount stays in the box after a refusal, to raise again');
        if (fs.existsSync(asks)) throw new Refused(`nothing is written on a refusal — ${asks} holds ${fs.readdirSync(asks, { recursive: true }).join(', ')}`);
        await settled(refused);
        await refused.screenshot({ path: path.join(OUT, `cost-refused-${await themeOf(refused)}.png`), fullPage: true });
        await refused.waitForLoadState('networkidle');
        // The one refusal made, as the browser reports it — its answer, and the line Chromium writes to the console for one — and nothing else.
        const expected = `request answered 409: POST ${answered.url()}`;
        const seen = problems();
        const others = seen.filter((p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p));
        if (!seen.includes(expected) || others.length) throw new Refused(`the refused page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
      } finally {
        await refused.close();
        fs.rmSync(asks, { recursive: true, force: true });
      }

      // tokens' Details: what its tries cost of its cap, red past it. Left open for the photograph.
      await node(over.step).click();
      const inspector = page.locator(`aside[aria-label="Step ${over.step}"]`);
      await expectVisible(inspector.locator('[data-spent="over"]', { hasText: over.of }), `the inspector's Details say what ${over.step}'s tries cost of its cap (${over.of}), red past it`);
      await expectVisible(inspector.locator('[data-state="over-budget"]', { hasText: over.status }), `and its word, ${over.status}`);
      await settled(page);
      await expectInside(graph.locator('.react-flow__node'), graph.locator('.react-flow'), 'every step is on the canvas beside the open inspector');
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
      // The effort each runs at, and its tools: what it sets, or its harness's own.
      await expectVisible(node('review').locator('dd', { hasText: new RegExp(`^${good.effort}$`) }), `review's node says the effort it runs at (${good.effort})`);
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

      await expectCount(listed(page), 3, 'a card per file in the inbox: the three the store has');
      if (JSON.stringify(await order(page)) !== JSON.stringify([bare.name, rich.name, planned.name])) {
        throw new Refused(`the cards are listed newest first — ${bare.name}, filed ${bare.filedMinutesAgo} minutes ago, then ${rich.name}, then ${planned.name} — and they were listed ${(await order(page)).join(', ')}`);
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
        await expectCount(listed(page), 4, 'the card filed is listed');
        if ((await order(page))[0] !== name) throw new Refused(`the card filed is listed first, the newest — the list is ${(await order(page)).join(', ')}`);
        await expectVisible(cardIn(page, name).locator('[data-title]', { hasText: FILED.split('\n')[0]! }), 'by its first line');
        if ((await idea.inputValue()) !== '') throw new Refused('the box is emptied once the card is filed');
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
      // Both taken back.
      const strayFile = path.join(inbox, 'notes.txt');
      const strayText = 'Not a card: notes kept beside the cards.\n';
      const folder = path.join(inbox, 'sub');
      const strays = await page.context().newPage();
      try {
        fs.writeFileSync(strayFile, strayText);
        fs.mkdirSync(folder);
        const { problems } = watch(strays);
        await strays.goto(page.url(), { waitUntil: 'networkidle' });
        const sub = cardIn(strays, 'sub/');
        await expectVisible(sub.getByText(/^sub\/: not a card/), 'a folder in the inbox is listed with why it is not a card');
        await expectCount(sub.getByRole('link'), 0, "and has no page: the api refuses the name sub/, so a link would open a refusal of what is listed");
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
        const sentence = `no card ${bare.name} in the inbox. Its cards are: ${[planned.name, rich.name].sort().join(', ')}. Start one of those — wf start ${path.join(inbox, '<name>.md')} — or park the idea first: wf inbox add "<idea>".`;
        if (answered.status() !== 404 || error !== sentence) {
          throw new Refused(`the api refuses to start a card that is not there, in the package's words — it answered ${answered.status()}: ${JSON.stringify(error)}`);
        }
        const listing = (await (await reread).json()) as Array<{ name: string }>;
        if (listing.some((e) => e.name === bare.name)) throw new Refused(`the inbox read again after the refusal no longer lists ${bare.name} — it listed ${JSON.stringify(listing.map((e) => e.name))}`);
        await refused.waitForLoadState('networkidle');
        await expectCount(item, 0, 'the card leaves the list once the inbox is read again after the refusal');
        await expectCount(listed(refused), 2, `and only ${rich.name} and ${planned.name} are listed`);
        const gone = refused.locator(`section[aria-label="Cards"] li[data-gone="${bare.name}"]`);
        await expectVisible(gone.locator('[data-refused="start"]', { hasText: 'Not started. The api refused it:' }), 'the refusal stays, where the card was listed, not swallowed with the form');
        const shown = await gone.locator('[data-refused] p.font-mono').textContent();
        if (shown !== error) throw new Refused(`the refusal in the card's place is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`);
        if (JSON.stringify(await order(refused)) !== JSON.stringify([rich.name, planned.name])) throw new Refused(`the cards listed are the inbox's — ${(await order(refused)).join(', ')}`);
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
    // A step's page, from its block on the Workflows page: what its agent is told, rendered, then every key a step may set — set or not — with
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
  seedInbox(store, checkout);
  // After the checkout's files, which its base commits.
  seedDiamond(checkout, store);
  // Over every journal the seed wrote: where the api reads when each task was filed.
  seedFeed(store);
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
