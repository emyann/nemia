/**
 * `npm run e2e`: the web app, built, served against a seeded store, and looked at in a browser.
 *
 *  1. Builds the web app.
 *  2. Seeds a store in a temporary WF_ROOT with two fake runs (seed.ts).
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
import { expectApart, expectCount, expectInside, expectMovedWith, expectVisible, Refused, settled, watch } from './checks.ts';
import { FAKE, NEIGHBOUR, seed } from './seed.ts';
import { exitOn, launch, visitAll, type PageSpec } from './visit.ts';

const WEB = path.resolve(import.meta.dirname, '..', '..');
const REPO = path.resolve(WEB, '..', '..');
const API = path.join(REPO, 'apps', 'api');
const OUT = path.resolve(process.env.WF_ARTIFACTS || path.join(REPO, '.e2e'));

/** How long a server has to say where it listens. */
const START_MS = 30_000;

/** On every page: the menu, with both of its places. */
async function sidebar(page: Page): Promise<void> {
  const menu = page.locator('[data-sidebar="sidebar"]');
  await expectVisible(menu.getByRole('link', { name: 'Factory' }), 'the sidebar has Factory');
  await expectVisible(menu.getByRole('link', { name: 'Runs' }), 'the sidebar has Runs');
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
      await expectVisible(beside, `the run in flight has its card on the Factory (${NEIGHBOUR.id})`);
      await settled(page);

      // The fake run stopped at a refused check, and at a step signed off blocked: finished, not in flight.
      // Its followers read `waiting`, and will for ever; they do not keep it on the floor.
      await expectCount(card, 0, `a run whose check refused is finished, not in flight: no card on the floor by default (${FAKE.id})`);
      await expectVisible(page.getByText('1 in flight · 1 finished · 1 waiting on you'), 'the Factory counts it finished, and waiting on you');
      await showFinished(page);
      await expectVisible(card, `the fake run's card, once finished runs are shown (${FAKE.id})`);
      await expectVisible(card.getByText(/^started .+ ago$/), 'the card reads finished: when it started, not a clock still counting');
      await expectVisible(card.getByText(FAKE.title), `the card says what was asked (${FAKE.title})`);
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
      for (const name of FAKE.steps) await expectVisible(step(name), `the open run draws ${name}`);
      await expectVisible(step(FAKE.blocked).getByText('waiting on you'), `${FAKE.blocked} is drawn as a human gate on the Factory`);
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
    },
  },
  {
    name: 'run',
    route: `/runs/${FAKE.id}`,
    expect: async (page) => {
      await sidebar(page);
      const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
      await expectCount(graph.locator('.react-flow__node'), FAKE.steps.length, `the run's graph has a node per step (${FAKE.steps.join(', ')})`);
      for (const step of FAKE.steps) await expectVisible(graph.locator(`.react-flow__node[data-id="${step}"]`), `the graph has ${step}`);
      await expectVisible(graph.locator(`.react-flow__node[data-id="${FAKE.blocked}"]`).getByText('waiting on you'), `${FAKE.blocked} is drawn as a human gate`);
      await expectVisible(graph.locator(`.react-flow__node[data-id="${FAKE.refused}"] [data-state="failed-check"]`), `${FAKE.refused}'s refused check is a red chip on the run's graph`);
      await expectVisible(page.locator('section[aria-label="Check"]').getByText(FAKE.said), `the run's page shows how ${FAKE.refused}'s check's output ended`);
      await graph.locator('.react-flow__node[data-id="review"]').click();
      await expectVisible(page.locator('aside[aria-label="Step review"]'), 'the step inspector opens on a click on review');
      // The canvas narrows for the inspector and fits itself again; judged once it has.
      await settled(page);
      await expectInside(graph.locator('.react-flow__node'), graph.locator('.react-flow'), 'every step is on the canvas beside the open inspector');
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
  // A `claude` that sees no sessions, first on the api's PATH. The engine observes `claude agents` on every
  // list; the pages are about the store, not about the sessions on this machine.
  const bin = path.join(store, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'claude'), "#!/bin/sh\necho '[]'\n", { mode: 0o755 });

  const apiPort = await startServer('the api', [path.join(API, 'src', 'main.ts')], API,
    { ...process.env, PORT: '0', WF_ROOT: store, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` },
    /api listening on http:\/\/localhost:(\d+)/);
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
