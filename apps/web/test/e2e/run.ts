/**
 * `npm run e2e`: the web app, built, served against a seeded store, and looked at in a browser.
 *
 *     npm run e2e [-- [--photos] [--pages <name,…>]]
 *
 *  0. Reads its plan from its command line (`planOf`, pages.ts), refusing a flag or a page it does not know before anything else.
 *  1. Builds the web app.
 *  2. Seeds a store in a temporary WF_ROOT with six fake runs, the first with a real repository and branch to decide
 *     on, and beside it a checkout for the api to serve (`HKB_REPO`) on the Capabilities page, and workflows in both for
 *     the Workflows page (seed.ts).
 *  3. Starts the api on a free port (`PORT=0`, reading the port it prints), ticking nothing (`--no-tick`: the pages seed the store's
 *     daemon themselves), and `vite preview` on another,
 *     proxying `/api` to it (`HKB_API_URL`, vite.config.ts): the same two processes and the same proxy
 *     as `npm run dev`, never on :8787 or :5173, so it runs beside a person's dev servers and beside
 *     another worktree's e2e.
 *  4. Visits every page in pages/ in headless Chromium, in the order of their file names (pages.ts), in the dark theme: no console
 *     error, no failed request, the page in the theme asked for, and the elements the page must have. With `--pages`, every page up to
 *     the last one named; with `--photos`, in a light and then a dark theme.
 *  5. Takes no picture but a failing page's. With `--photos`, screenshots each page visited, or each `--pages` names, in each theme,
 *     with the pictures the page takes of itself, into $WF_ARTIFACTS when a run gives one — the step's files directory — and into
 *     `.e2e/` at the repository root otherwise.
 *  6. Says last how many pages passed, in which themes, and in how many seconds.
 *
 * Exits non-zero on the first failure, naming the page, the theme and the assertion, with a screenshot
 * of what the page looked like. Both servers are stopped on the way out: on success, on failure, and on a
 * signal. The assertions are made to refuse in checks.test.ts, the visiting and the exit (visit.ts) in
 * visit.test.ts, and a full-page picture of a tall page with its frame where the window was in photograph.test.ts, all of which
 * `npm run e2e` runs first.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  arrivalLine,
  DRAFT_TRANSCRIPT,
  INBOX,
  QUOTA,
  REGISTRY,
  SAYING,
  seed,
  seedCheckout,
  seedDiamond,
  seedFactories,
  seedFeed,
  seedFolder,
  seedInbox,
  seedQueue,
  seedQuota,
  seedWorkflows,
} from './seed.ts';
import { QUOTA_ASKS_MS } from './board.ts';
import { loadPages, planOf } from './pages.ts';
import { exitOn, launch, visitAll } from './visit.ts';
import { API, apiEnv, heard, OUT, setApiEnv, setStore, store, WEB } from './world.ts';

/** How long a server has to say where it listens. */
const START_MS = 30_000;

const servers: Array<{ name: string; child: ChildProcess; output: () => string }> = [];

/**
 * A Unix socket standing in for a session's inbox, as Claude Code's reads one: each connection's lines kept, as JSON where they parse,
 * nothing answered, and its end closed once the sender's is; each line is handed to `onLine` once kept. Unreferenced, so it keeps nothing
 * alive; it goes with the store.
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
        } catch {}
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

// oxlint-disable-next-line no-control-regex -- a terminal colour code starts with ESC, which is what this strips
const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * Start `node <args>` and resolve with what `listening` captures from its output, once it prints it. Rejects when the server exits or
 * cannot start before that, or says nothing within `START_MS`; a server that dies after is seen as failed requests.
 */
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
        resolve(m[1]);
      }
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
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

/**
 * The run: loads the pages and reads its plan first, so a stray in pages/ or a bad command line is refused before the build, not after
 * it; builds the app; seeds the store; starts
 * the api and `vite preview`; and visits every page. The seed writes the diamond after the checkout's files, which its base commits; then
 * the run with no repository anywhere in it, newest of them all; then the feed, over every journal the seed wrote, where the api reads
 * when each task was filed.
 *
 * First on the api's PATH is a `claude` that lists the store's sessions (REGISTRY), HELD's blocked: the engine observes claude agents on
 * every list, and the pages are about the store, not about the sessions on this machine. It answers the api's get_usage request too
 * (quota.ts), with the store's answer (QUOTA.file) under the request's id, and waits on its stdin as Claude Code does; with no answer in
 * the store, it ends as a claude that cannot answer would. Claude Code's transcripts are in the store (CLAUDE_CONFIG_DIR), where the engine
 * reads a session's conversation, never from this machine's. draft's inbox (SAYING), the socket its registration names, listens before the
 * api can be asked to say anything into it, and writes each arrival into draft's transcript, as a working session does when it reads the
 * words between calls.
 */
async function main(): Promise<void> {
  const started = performance.now();
  const pages = await loadPages();
  const plan = planOf(process.argv.slice(2), pages);
  const vite = fromNodeModules(path.join('vite', 'bin', 'vite.js'));

  console.log('e2e: building the web app');
  try {
    execFileSync(process.execPath, [vite, 'build'], { cwd: WEB, stdio: 'pipe' });
  } catch (err) {
    const { stdout, stderr } = err as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`the web app did not build:\n${String(stdout ?? '')}${String(stderr ?? '')}`.replace(ANSI, ''), { cause: err });
  }

  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-e2e-'));
  setStore(store);
  seed(store);
  const checkout = path.join(store, 'checkout');
  seedCheckout(checkout, path.join(API, 'test', 'fixtures', 'mcp-server.ts'));
  seedWorkflows(checkout, store);
  seedInbox(store, checkout);
  seedQueue(store, checkout);
  seedQuota(store);
  seedDiamond(checkout, store);
  seedFolder(store);
  seedFactories(store, checkout);
  seedFeed(store);
  const bin = path.join(store, 'bin');
  fs.mkdirSync(bin);
  const answer = path.join(store, QUOTA.file);
  fs.writeFileSync(
    path.join(bin, 'claude'),
    [
      '#!/bin/sh',
      `if [ "$1" = agents ]; then cat "${path.join(store, REGISTRY)}"; exit 0; fi`,
      'if [ "$1" != -p ]; then echo \'[]\'; exit 0; fi',
      'read -r line',
      `if [ ! -f "${answer}" ]; then echo 'claude: not signed in, the e2e took its answer away' >&2; exit 1; fi`,
      `id=$(printf '%s' "$line" | sed -n 's/.*"request_id":"\\([^"]*\\)".*/\\1/p')`,
      `sed "s/@ID@/$id/g" "${answer}"`,
      'cat > /dev/null',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  const draftTranscript = path.join(store, DRAFT_TRANSCRIPT);
  await listen(path.join(store, INBOX), (line) => {
    const { session_id: sessionId, message } = (line ?? {}) as { session_id?: unknown; message?: { content?: unknown } };
    if (sessionId === SAYING.sessionId && typeof message?.content === 'string')
      fs.appendFileSync(draftTranscript, arrivalLine(message.content, new Date().toISOString()));
  });
  setApiEnv({
    ...process.env,
    PORT: '0',
    WF_ROOT: store,
    /** The e2e's starts are made in its scratch checkout, which no factory of its store holds: they go to the default factory. */
    WF_DEFAULT_FACTORY_STARTS: '1',
    HKB_REPO: checkout,
    CLAUDE_CONFIG_DIR: path.join(store, 'claude'),
    /** The quota asked of the e2e's claude on every read, so the quota page reads the answer it has just written. */
    HKB_QUOTA_KEEP_MS: '0',
    /**
     * Asked again at once after an answer the usage service gave nothing for, so the page that draws one reads the good answer it puts
     * back.
     */
    HKB_QUOTA_BACKOFF_MS: '0',
    /** Each read waits for its own ask, however slow: at a keep of 0 no other ask answers it. */
    HKB_QUOTA_WAIT_MS: String(QUOTA_ASKS_MS),
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
  });
  const apiPort = await startServer(
    'the api',
    [path.join(API, 'src', 'main.ts'), '--no-tick'],
    API,
    apiEnv,
    /api listening on http:\/\/127\.0\.0\.1:(\d+)/,
  );
  const base = await startServer(
    'vite preview',
    [vite, 'preview', '--port', '0', '--host', '127.0.0.1'],
    WEB,
    { ...process.env, HKB_API_URL: `http://127.0.0.1:${apiPort}` },
    /Local:\s+(http:\/\/[^\s/]+)/,
  );
  console.log(`e2e: api on :${apiPort}, the built app on ${base}, store ${store}`);

  const browser = await launch();
  let shots: string[];
  try {
    shots = await visitAll(browser, base, plan.visit, OUT, { store, themes: plan.themes, pictured: plan.pictured });
  } finally {
    await browser.close();
  }
  if (shots.length) console.log(`\ne2e: the pages pictured:\n${shots.map((shot) => `  ${shot}`).join('\n')}`);
  const seconds = Math.round((performance.now() - started) / 1000);
  console.log(
    `\ne2e: ${plan.visit.length} of ${pages.length} pages passed in the ${plan.themes.join(' and ')} theme${plan.themes.length > 1 ? 's' : ''}` +
      ` in ${seconds} s`,
  );
}

exitOn(main(), cleanUp, () =>
  servers
    .map(({ name, output }) => {
      const tail = output().trimEnd().split('\n').slice(-15).join('\n    ');
      return tail ? `\n\n  ${name} printed:\n    ${tail}` : '';
    })
    .join(''),
);
