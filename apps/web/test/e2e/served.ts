/**
 * A store served for a browser to open, as a worker of `npm run e2e` (worker.ts) and `npm run board:serve` (serve.ts) each serve one of
 * their own: seeded (`seedStore`), behind an api on a free port that ticks nothing and a `vite preview` of a built app on another
 * (`serveStore`), never on :8787 or :5173. The servers started are kept here (`servers`), and stopped by the handles kept, never by a
 * name: at once on the way out (`cleanUp`, `stopOnTheWayOut`), or waited for (`stopServers`).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  arrivalLine,
  attachedFiles,
  DRAFT_TRANSCRIPT,
  QUOTA,
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
import { API, apiEnv, fromNodeModules, heard, plain, setApiEnv, setStore, standingPass, store, WEB } from './world.ts';

/** How long a server has to say where it listens. */
const START_MS = 30_000;

/** How long a server told to stop has to go before it is killed. */
const STOP_MS = 10_000;

/** Where a served store is reached, filled in as its servers say where they listen: the api's port, and the app's address. */
export type Served = { apiPort?: string; base?: string };

export const servers: Array<{ name: string; child: ChildProcess; output: () => string }> = [];

/**
 * Each line written to the say file `file`, kept as JSON where it parses and handed to `onLine` once kept, as the session's holder reads
 * the words said to it: polled, and unreferenced, so it keeps nothing alive; it goes with the store.
 */
export function heardOn(file: string, onLine: (line: unknown) => void = () => {}): void {
  let read = 0;
  fs.watchFile(file, { interval: 50, persistent: false }, () => {
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (text.length < read) read = 0;
    const end = text.lastIndexOf('\n') + 1;
    for (const line of text
      .slice(read, end)
      .split('\n')
      .filter((l) => l.trim())) {
      let got: unknown = line;
      try {
        got = JSON.parse(line);
      } catch {}
      heard.push(got);
      onLine(got);
    }
    read = Math.max(read, end);
  });
}

/** Stop both servers and remove the store. Idempotent: `exit` runs it again after a signal did. */
export function cleanUp(): void {
  for (const { child } of servers) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
  if (store) fs.rmSync(store, { recursive: true, force: true });
  setStore(undefined);
}

/**
 * Has this process stop its servers and remove its store on its way out: on exit, and on a signal, which it then exits on with 128 + the
 * signal's number, saying `who` is stopping them.
 */
export function stopOnTheWayOut(who: string): void {
  process.on('exit', cleanUp);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      console.error(`\n${who}: ${signal} — stopping the servers`);
      cleanUp();
      process.exit(128 + os.constants.signals[signal]);
    });
  }
}

/**
 * Start `node <args>` and resolve with what `listening` captures from its output, once it prints it. Rejects when the server exits or
 * cannot start before that, or says nothing within `START_MS`; a server that dies after is seen as failed requests.
 */
export function startServer(name: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, listening: RegExp): Promise<string> {
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
export const tails = (): string =>
  servers
    .map(({ name, output }) => {
      const tail = output().trimEnd().split('\n').slice(-15).join('\n    ');
      return tail ? `\n\n  ${name} printed:\n    ${tail}` : '';
    })
    .join('');

/**
 * Seeds `root`, an empty directory, as the pages read it. The seed writes the diamond after the checkout's files, which its base commits;
 * then the run with no repository anywhere in it, newest of them all; then the feed, over every journal the seed wrote, where the api
 * reads when each task was filed. Refuses a directory that is not empty: it may be another worker's store, or a person's.
 */
export function seedStore(root: string): void {
  if (!fs.existsSync(root) || fs.readdirSync(root).length)
    throw new Error(`a store is seeded in an empty directory of its own, and ${root} is not one: whoever serves it makes one`);
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
 * First on the api's PATH is a `claude` of the store's own, so the pages are about the store, not about the sessions on this
 * machine. It answers the api's usage control request too (quota.ts), which the runtime asks through the Agent SDK: anything whose
 * first argument is a flag — the SDK's argv, never matched here, since it is the SDK's to change — it hands to the api's own stand-in
 * Claude Code, which answers the SDK as Claude Code does from the store's answer (QUOTA.file) under the request's own id, and waits on
 * its stdin as Claude Code does. With no answer in the store it ends as a claude that cannot answer would, before the stand-in is
 * reached. Another of Claude Code's verbs is a bare word, and ends well having said nothing. Returns the directory it is in.
 */
export function fakeClaude(root: string): string {
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const answer = path.join(root, QUOTA.file);
  const mode = path.join(bin, 'usage-mode');
  const calls = path.join(bin, 'calls');
  fs.writeFileSync(mode, 'answer');
  fs.writeFileSync(calls, '');
  const standIn = path.join(API, 'test', 'fixtures', 'stand-in-claude.ts');
  fs.writeFileSync(
    path.join(bin, 'claude'),
    [
      '#!/bin/sh',
      'case "$1" in',
      "  -*|'')",
      `    if [ ! -f "${answer}" ]; then echo 'claude: not signed in, the e2e took its answer away' >&2; exit 1; fi`,
      `    STANDIN_ANSWER="${answer}" STANDIN_MODE="${mode}" STANDIN_CALLS="${calls}" exec node "${standIn}" "$@" ;;`,
      'esac',
      'exit 0',
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
export const apiEnvOf = (root: string, bin: string): NodeJS.ProcessEnv => ({
  ...process.env,
  PORT: '0',
  WF_ROOT: root,
  /** The e2e's starts are made in its scratch checkout, which no factory of its store holds: they go to the default factory. */
  WF_DEFAULT_FACTORY_STARTS: '1',
  HKB_REPO: path.join(root, 'checkout'),
  CLAUDE_CONFIG_DIR: path.join(root, 'claude'),
  /** The quota asked of the e2e's claude on every read, so the quota page reads the answer it has just written. */
  HKB_QUOTA_KEEP_MS: '0',
  /** Asked again at once after an answer the usage service gave nothing for: the page that draws one reads the good answer it puts back. */
  HKB_QUOTA_BACKOFF_MS: '0',
  /** Each read waits for its own ask, however slow: at a keep of 0 no other ask answers it. */
  HKB_QUOTA_WAIT_MS: String(QUOTA_ASKS_MS),
  /** No collector, whatever the shell names: an api served for a test or a look exports nothing (`otlpOf` reads `''` as none). */
  OTEL_EXPORTER_OTLP_ENDPOINT: '',
  PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
});

/**
 * Stops every server started here by the handle kept, and resolves once each is gone: sent SIGTERM, and SIGKILL when it is still there
 * `STOP_MS` later. The list is emptied, so servers started after are the only ones kept.
 */
export async function stopServers(): Promise<void> {
  const stopping = servers.splice(0).map(
    ({ child }) =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        const kill = setTimeout(() => child.kill('SIGKILL'), STOP_MS);
        child.once('exit', () => {
          clearTimeout(kill);
          resolve();
        });
        child.kill('SIGTERM');
      }),
  );
  await Promise.all(stopping);
}

/**
 * Starts the api over the store the environment names (`apiEnv`), ticking nothing, and `vite preview` of the built app proxying `/api`
 * to it, each on a free port, and fills `seat` in as each says where it listens, answering both once they do. The app served is the
 * one built into `dist`, or into the web app's own `dist/` when none is given.
 */
export async function startServers(seat: Served, dist?: string): Promise<Required<Served>> {
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
    [vite, 'preview', '--port', '0', '--host', '127.0.0.1', ...(dist ? ['--outDir', dist] : [])],
    WEB,
    { ...process.env, HKB_API_URL: `http://127.0.0.1:${seat.apiPort}` },
    /Local:\s+(http:\/\/[^\s/]+)/,
  );
  return { apiPort: seat.apiPort, base: seat.base };
}

/**
 * Seeds `root`, an empty directory, and serves it (`startServers`). draft's say file (SAYING) is read, standing in for its holder,
 * before the api can be asked to say anything into it, and each arrival is written into draft's transcript, as a working session does
 * when it reads the words between calls. Before the api starts, a pass reads where the runs' branches stand (`standingPass`), as the
 * tick would.
 */
export async function serveStore(root: string, seat: Served, dist?: string): Promise<Required<Served>> {
  seedStore(root);
  const bin = fakeClaude(root);
  const draftTranscript = path.join(root, DRAFT_TRANSCRIPT);
  heardOn(attachedFiles(root, `ae/${SAYING.run}-${SAYING.step}/1`).say, (line) => {
    const { text } = (line ?? {}) as { text?: unknown };
    if (typeof text === 'string') fs.appendFileSync(draftTranscript, arrivalLine(text, new Date().toISOString()));
  });
  setApiEnv(apiEnvOf(root, bin));
  standingPass();
  return startServers(seat, dist);
}
