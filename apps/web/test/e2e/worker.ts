/**
 * One worker of `npm run e2e` (run.ts starts them): a store of its own, seeded, served by an api and `vite preview` of its own, and its
 * share of the pages visited in a browser of its own, so no page's write crosses into another worker's pages.
 *
 *     node test/e2e/worker.ts --worker <i> --store <empty dir> --result <file> [--pages <name,…>] [--photos]
 *
 *  1. Seeds the store, which must be empty, with six fake runs, the first with a real repository and branch to decide on, and beside it
 *     a checkout for the api to serve (`HKB_REPO`) on the Capabilities page, and workflows in both for the Workflows page (seed.ts).
 *  2. Starts the api on a free port (`PORT=0`, reading the port it prints), ticking nothing (`--no-tick`: the pages seed the store's
 *     daemon themselves), and `vite preview` of the app run.ts built on another, proxying `/api` to it (`HKB_API_URL`, vite.config.ts):
 *     the same two processes and the same proxy as `npm run dev`, never on :8787 or :5173, so it runs beside a person's dev servers, the
 *     other workers and another worktree's e2e.
 *  3. Takes the store's fingerprint (print.ts), visits its pages in their order (visit.ts), and takes it again: a page that left a write
 *     it did not take back fails the worker, naming the files.
 *  4. Writes what it did to `--result`, as JSON: its store, the port of its api and the address of its app, what each page took, its
 *     pictures, and why it failed, or null — run.ts reads it to refuse two workers that share one (`apart`) and to rank the pages.
 *
 * Exits 1 on the first failure, after writing its result, saying why last (`exitOn`). Both servers are stopped and the store removed on
 * the way out: on success, on failure, and on a signal.
 */
import { spawn, type ChildProcess } from 'node:child_process';
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
import { fingerprint, leftOver } from './print.ts';
import type { PageTiming } from './timing.ts';
import { exitOn, launch, visitAll } from './visit.ts';
import { API, apiEnv, fromNodeModules, heard, OUT, plain, setApiEnv, setStore, standingPass, store, WEB } from './world.ts';

/** How long a server has to say where it listens. */
const START_MS = 30_000;

/** What a worker writes to its `--result` file, for run.ts. */
export type WorkerResult = {
  worker: number;
  store: string;
  apiPort?: string;
  base?: string;
  setupMs: number;
  ms: number;
  timings: PageTiming[];
  shots: string[];
  failure: string | null;
  tails: string;
};

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

/**
 * Start `node <args>` and resolve with what `listening` captures from its output, once it prints it. Rejects when the server exits or
 * cannot start before that, or says nothing within `START_MS`; a server that dies after is seen as failed requests.
 */
function startServer(name: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, listening: RegExp): Promise<string> {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let raw = '';
  const output = () => plain(raw);
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

/** Each server's last lines, for a failure. */
const tails = (): string =>
  servers
    .map(({ name, output }) => {
      const tail = output().trimEnd().split('\n').slice(-15).join('\n    ');
      return tail ? `\n\n  ${name} printed:\n    ${tail}` : '';
    })
    .join('');

/** The worker's command line: its number, its store, its result file, and the rest for `planOf`. */
function argsOf(argv: readonly string[]): { worker: number; store: string; result: string; rest: string[] } {
  const rest: string[] = [];
  const own: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (['--worker', '--store', '--result'].includes(argv[i])) own[argv[i]] = argv[++i] ?? '';
    else rest.push(argv[i]);
  }
  const worker = Number(own['--worker']);
  if (!Number.isInteger(worker) || !own['--store'] || !own['--result'])
    throw new Error('usage: node test/e2e/worker.ts --worker <i> --store <empty dir> --result <file> [--pages <name,…>] [--photos]');
  return { worker, store: own['--store'], result: own['--result'], rest };
}

/**
 * Seeds `root`, an empty directory, as the pages read it. The seed writes the diamond after the checkout's files, which its base commits;
 * then the run with no repository anywhere in it, newest of them all; then the feed, over every journal the seed wrote, where the api
 * reads when each task was filed. Refuses a directory that is not empty: it may be another worker's store, or a person's.
 */
function seedStore(root: string): void {
  if (!fs.existsSync(root) || fs.readdirSync(root).length)
    throw new Error(`a worker seeds an empty directory of its own, and ${root} is not one: run.ts makes one for each worker`);
  setStore(root);
  seed(root);
  const checkout = path.join(root, 'checkout');
  seedCheckout(checkout, path.join(API, 'test', 'fixtures', 'mcp-server.ts'));
  seedWorkflows(checkout, root);
  seedInbox(root, checkout);
  seedQueue(root, checkout);
  seedQuota(root);
  seedDiamond(checkout, root);
  seedFolder(root);
  seedFactories(root, checkout);
  seedFeed(root);
}

/**
 * First on the api's PATH is a `claude` that lists the store's sessions (REGISTRY), HELD's blocked: the engine observes claude agents on
 * every list, and the pages are about the store, not about the sessions on this machine. It answers the api's get_usage request too
 * (quota.ts), with the store's answer (QUOTA.file) under the request's id, and waits on its stdin as Claude Code does; with no answer in
 * the store, it ends as a claude that cannot answer would. Returns the directory it is in.
 */
function fakeClaude(root: string): string {
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const answer = path.join(root, QUOTA.file);
  fs.writeFileSync(
    path.join(bin, 'claude'),
    [
      '#!/bin/sh',
      `if [ "$1" = agents ]; then cat "${path.join(root, REGISTRY)}"; exit 0; fi`,
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
  return bin;
}

/**
 * The api's environment over `root`: Claude Code's transcripts are in the store (CLAUDE_CONFIG_DIR), where the engine reads a session's
 * conversation, never from this machine's.
 */
const apiEnvOf = (root: string, bin: string): NodeJS.ProcessEnv => ({
  ...process.env,
  PORT: '0',
  WF_ROOT: root,
  /** The e2e's starts are made in its scratch checkout, which no factory of its store holds: they go to the default factory. */
  WF_DEFAULT_FACTORY_STARTS: '1',
  HKB_REPO: path.join(root, 'checkout'),
  CLAUDE_CONFIG_DIR: path.join(root, 'claude'),
  /** The quota asked of the e2e's claude on every read, so the quota page reads the answer it has just written. */
  HKB_QUOTA_KEEP_MS: '0',
  /** Asked again at once after an answer the usage service gave nothing for, so the page that draws one reads the good answer it puts back. */
  HKB_QUOTA_BACKOFF_MS: '0',
  /** Each read waits for its own ask, however slow: at a keep of 0 no other ask answers it. */
  HKB_QUOTA_WAIT_MS: String(QUOTA_ASKS_MS),
  PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
});

/**
 * Seeds the store, starts the api and `vite preview` over it, and visits the worker's pages. draft's inbox (SAYING), the socket its
 * registration names, listens before the api can be asked to say anything into it, and writes each arrival into draft's transcript, as a
 * working session does when it reads the words between calls. Before the api starts, a pass reads where the runs' branches stand
 * (`standingPass`), as the tick would. `seat` is filled in as the worker learns where it serves, for the result a failure writes.
 */
async function main(seat: WorkerResult, rest: readonly string[]): Promise<void> {
  const started = performance.now();
  const plan = planOf(rest, await loadPages());
  const root = seat.store;
  seedStore(root);
  const bin = fakeClaude(root);
  const draftTranscript = path.join(root, DRAFT_TRANSCRIPT);
  await listen(path.join(root, INBOX), (line) => {
    const { session_id: sessionId, message } = (line ?? {}) as { session_id?: unknown; message?: { content?: unknown } };
    if (sessionId === SAYING.sessionId && typeof message?.content === 'string')
      fs.appendFileSync(draftTranscript, arrivalLine(message.content, new Date().toISOString()));
  });
  setApiEnv(apiEnvOf(root, bin));
  standingPass();
  const vite = fromNodeModules(path.join('vite', 'bin', 'vite.js'));
  seat.apiPort = await startServer(
    'the api',
    [path.join(API, 'src', 'main.ts'), '--no-tick'],
    API,
    apiEnv,
    /api listening on http:\/\/127\.0\.0\.1:(\d+)/,
  );
  seat.base = await startServer(
    'vite preview',
    [vite, 'preview', '--port', '0', '--host', '127.0.0.1'],
    WEB,
    { ...process.env, HKB_API_URL: `http://127.0.0.1:${seat.apiPort}` },
    /Local:\s+(http:\/\/[^\s/]+)/,
  );
  console.log(`e2e: api on :${seat.apiPort}, the built app on ${seat.base}, store ${root}, ${plan.visit.length} pages`);
  const before = fingerprint(root);
  seat.setupMs = performance.now() - started;
  const browser = await launch();
  try {
    const visited = await visitAll(browser, seat.base, plan.visit, OUT, {
      store: root,
      themes: plan.themes,
      pictured: plan.pictured,
      worker: seat.worker,
    });
    seat.timings = visited.timings;
    seat.shots = visited.shots;
  } finally {
    await browser.close();
  }
  const left = leftOver(
    before,
    fingerprint(root),
    plan.visit.map((p) => p.name),
  );
  if (left) throw new Error(`worker ${seat.worker}: ${left}`);
  seat.ms = performance.now() - started;
}

const { worker, store: root, result, rest } = argsOf(process.argv.slice(2));
const seat: WorkerResult = { worker, store: root, setupMs: 0, ms: 0, timings: [], shots: [], failure: null, tails: '' };
const write = () => fs.writeFileSync(result, `${JSON.stringify(seat)}\n`);
exitOn(
  main(seat, rest).then(write, (err: unknown) => {
    seat.failure = err instanceof Error ? err.message : String(err);
    seat.tails = tails();
    write();
    throw err;
  }),
  cleanUp,
  tails,
);
