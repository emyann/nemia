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
import workflows from './pages/180-workflows.ts';
import builder from './pages/190-builder.ts';
import inbox from './pages/200-inbox.ts';
import card from './pages/210-card.ts';
import workflowStep from './pages/220-workflow-step.ts';
import agents from './pages/230-agents.ts';
import capabilities from './pages/240-capabilities.ts';
import { arrivalLine, DRAFT_TRANSCRIPT, INBOX, QUOTA, REGISTRY, SAYING, seed, seedCheckout, seedDiamond, seedFeed, seedInbox, seedQueue, seedQuota, seedWorkflows } from './seed.ts';
import { exitOn, launch, visitAll, type PageSpec } from './visit.ts';
import { API, apiEnv, heard, OUT, setApiEnv, setStore, store, WEB } from './world.ts';

/** How long a server has to say where it listens. */
const START_MS = 30_000;

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
  workflows,
  builder,
  inbox,
  card,
  workflowStep,
  agents,
  capabilities,
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
