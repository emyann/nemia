/**
 * `npm run e2e`: the web app, built, served against a seeded store, and looked at in a browser.
 *
 *  1. Builds the web app.
 *  2. Seeds a store in a temporary WF_ROOT with one fake run (seed.ts).
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
import type { Page } from 'playwright';
import { expectCount, expectInside, expectVisible, settled } from './checks.ts';
import { FAKE, seed } from './seed.ts';
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

/** The pages, and what each must have. A new page gets a line here, or the check never looks at it. */
const PAGES: PageSpec[] = [
  {
    name: 'factory',
    route: '/',
    expect: async (page) => {
      await sidebar(page);
      await expectVisible(page.locator('.react-flow'), 'the Factory canvas');
      const card = page.locator(`.react-flow__node[data-id="${FAKE.id}"]`);
      await expectVisible(card, `the fake run's card on the Factory (${FAKE.id})`);
      await expectVisible(card.getByText(FAKE.title), `the card says what was asked (${FAKE.title})`);
      await settled(page);
      await expectInside(card, page.locator('.react-flow'), 'the card is on the floor');
    },
  },
  {
    name: 'runs',
    route: '/runs',
    expect: async (page) => {
      await sidebar(page);
      const row = page.locator(`li a[href="/runs/${FAKE.id}"]`);
      await expectVisible(row, `the runs list has a row for ${FAKE.id}`);
      await expectVisible(row.getByText(`waiting on you: ${FAKE.blocked}`), `the row says ${FAKE.blocked} is waiting on you`);
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
