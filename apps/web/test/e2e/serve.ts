/**
 * `npm run board:serve` and `npm run board:stop`: this workspace's board, built and served for a browser to open, on ports of its own
 * against a store of its own that holds the e2e's seed (seed.ts), never the default store and never :8787 or :5173.
 *
 *     node test/e2e/serve.ts serve | stop
 *
 * One board is served a workspace, in a folder of the machine's temp directory named for the workspace's path (`folderOf`), or in
 * `BOARD_SERVE_DIR` when a test names one. Nothing is written into the workspace.
 *
 * - `serve` prints where a board already served here listens and starts nothing, when that board was built from the tree as it is now
 *   (`treeOf`, `standsFor`); a board built from another tree is ended first. Else it builds the web app into the folder (`vite build
 *   --outDir`), puts back the route tree the build regenerates (`keeping`), refuses when the workspace's `git status` changed over the
 *   build (`changedOver`), starts a holder of its own (`hold`) and prints the three lines the holder wrote (`linesOf`): the board's
 *   address, the api's, and the person's token the store keeps, which a browser pastes on the board's token page: every api route asks
 *   for one, loopback too. The look's stories are not served here: a step looks at them through `npx storybook dev -p <a port of
 *   its own>`, never `npm run storybook`, the person's on 6007 (`apps/web/CLAUDE.md`).
 * - `hold`, the holder, started by `serve` alone and detached from it: seeds the store, serves it (served.ts), writes where each listens,
 *   its pid and the tree it was built from into the folder (`served.json`), and ends by itself after `HOLD_MS` (`BOARD_HOLD_MS` in a
 *   test), sooner when `stop` asks, a server dies or a signal comes. On its way out it stops both servers by the handles it kept and
 *   removes the folder once it has served; before that it keeps `hold.log`, where it wrote its error's stack, and `serve`'s refusal
 *   (`startHolder`) quotes the log's last lines and names its path. A port the steps given a browser are refused by address
 *   (`usable`) is given back and the servers started again, `TRIES` times at most.
 * - `stop` asks the holder to end, by a file in the folder, and waits until its pid is gone. No board served here is no failure.
 *
 * Exits 1, saying what to do next, when the build fails or changes the workspace, the holder does not say where it listens, or it does
 * not go when asked.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fromNodeModules, plain, REPO, WEB } from './world.ts';

/** How long a served board is held before it ends by itself. */
const HOLD_MS = 30 * 60_000;

/** How long the build may take. */
const BUILD_MS = 5 * 60_000;

/** How long the holder has to say where it listens, and how long it has to go once asked. */
const ANSWER_MS = 90_000;

/** How often a wait here looks again. */
const PACE_MS = 200;

/** How many of the holder's last lines a refusal quotes from its log. */
const SAID_LINES = 40;

/** How many times the holder starts its servers before it gives up on a port it may use. */
const TRIES = 3;

/**
 * What the holder writes once it serves: its own pid, where the board and its api listen, the tree they were built from, and the
 * person's token its store keeps (`token`, the seed's `SEAT_TOKEN`), which signs a browser in.
 */
export type ServedBoard = { pid: number; board: string; api: string; tree: string; token: string };

/**
 * The tree of the repository `repo` as it is now, as one word: a digest of its commit, of every change to a tracked file since, and of
 * the name and content of each file git neither tracks nor ignores. Two trees that would build the same board say the same word.
 */
export function treeOf(repo: string) {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 2 ** 30 }) satisfies Buffer;
  const digest = createHash('sha256').update(git('rev-parse', 'HEAD')).update(git('diff', 'HEAD'));
  const untracked = git('ls-files', '--others', '--exclude-standard', '-z').toString().split('\0').filter(Boolean);
  for (const file of untracked) {
    digest.update(`\0${file}\0`);
    const at = path.join(repo, file);
    if (fs.statSync(at, { throwIfNoEntry: false })?.isFile()) digest.update(fs.readFileSync(at));
  }
  return digest.digest('hex').slice(0, 16);
}

/** Whether the board `served` is one to open for the tree `tree`: served, and built from that tree. */
export const standsFor = (served: ServedBoard | undefined, tree: string) => served?.tree === tree;

/**
 * Runs `run` and leaves the file `file` as it was before: put back, byte for byte, when `run` changed it, whether it returned or threw.
 *
 * @returns what `run` returned
 */
export function keeping<T>(file: string, run: () => T) {
  const kept = fs.readFileSync(file);
  try {
    return run() satisfies T;
  } finally {
    if (!fs.readFileSync(file).equals(kept)) fs.writeFileSync(file, kept);
  }
}

/** What changed between two answers of `git status --porcelain`, a line each: those `after` has that `before` had not, then those gone. */
export function changedOver(before: string, after: string) {
  const lines = (status: string) => status.split('\n').filter(Boolean) satisfies string[];
  const had = new Set(lines(before));
  const has = new Set(lines(after));
  return [
    ...lines(after).filter((line) => !had.has(line)),
    ...lines(before)
      .filter((line) => !has.has(line))
      .map((line) => `gone: ${line}`),
  ] satisfies string[];
}

/** The folder a workspace's served board lives in: under `tmp`, named for a digest of the workspace's path, one a workspace. */
export const folderOf = (workspace: string, tmp: string) =>
  path.join(tmp, `nemia-board-${createHash('sha256').update(path.resolve(workspace)).digest('hex').slice(0, 12)}`);

/** Whether the process `pid` is there. */
export function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * The board served from `folder`, or undefined: for a folder with no `served.json`, one that does not read, one that says no token,
 * as a holder older than it wrote it, and one whose holder is gone.
 */
export function servedIn(folder: string) {
  let read: unknown;
  try {
    read = JSON.parse(fs.readFileSync(path.join(folder, 'served.json'), 'utf8'));
  } catch {
    return undefined satisfies ServedBoard | undefined;
  }
  const { pid, board, api, tree, token } = (read ?? {}) as Partial<ServedBoard>;
  if (typeof pid !== 'number' || ![board, api, tree, token].every((said) => typeof said === 'string'))
    return undefined satisfies ServedBoard | undefined;
  return (alive(pid) ? ({ pid, board, api, tree, token } as ServedBoard) : undefined) satisfies ServedBoard | undefined;
}

/**
 * Whether a served board may listen on `port`: not on one whose digits open with 8787 or 5173, which a step given the browser is refused
 * by address (`mcp__playwright__browser_navigate(url:*:8787*)`), the live board's and every port that reads as one to that rule.
 */
export const usable = (port: string) => /^\d+$/.test(port) && !/^(?:8787|5173)/.test(port);

/**
 * The three lines `serve` prints: where the board listens, where its api does, and the token a browser pastes on the board's token
 * page to be read as the person.
 */
export const linesOf = (served: Pick<ServedBoard, 'board' | 'api' | 'token'>) =>
  [`board on ${served.board}`, `api on ${served.api}`, `token ${served.token}`] satisfies string[];

/** A refusal: said on stderr, exit 1. */
class Refusal extends Error {}

/** This workspace's folder: `BOARD_SERVE_DIR` when it is set, else `folderOf` the repository under the machine's temp directory. */
const folder = () => process.env.BOARD_SERVE_DIR || folderOf(REPO, os.tmpdir());

/** Resolves once `ok` answers truthy, asked every `PACE_MS`; rejects with `late()` when it has not within `ms`. */
function awaited<T>(ok: () => T | undefined | false, ms: number, late: () => string) {
  return new Promise((resolve, reject) => {
    const end = (settle: () => void) => {
      clearInterval(pace);
      clearTimeout(bound);
      settle();
    };
    const look = () => {
      try {
        const got = ok();
        if (got) end(() => resolve(got));
      } catch (err) {
        end(() => reject(err));
      }
    };
    const pace = setInterval(look, PACE_MS);
    const bound = setTimeout(() => end(() => reject(new Refusal(late()))), ms);
    look();
  }) satisfies Promise<T>;
}

/** What `git status` says of the workspace, a line a file. */
const status = () => execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * Builds the web app into `dist`, outside the workspace, and leaves the workspace as it was: the route tree the build regenerates is put
 * back (`keeping`), and a `git status` that changed over the build is refused, naming what changed (`changedOver`).
 */
function build(dist: string) {
  const before = status();
  try {
    keeping(path.join(WEB, 'src', 'routeTree.gen.ts'), () =>
      execFileSync(process.execPath, [fromNodeModules(path.join('vite', 'bin', 'vite.js')), 'build', '--outDir', dist, '--emptyOutDir'], {
        cwd: WEB,
        stdio: 'pipe',
        timeout: BUILD_MS,
      }),
    );
  } catch (err) {
    const { stdout, stderr } = err as { stdout?: Buffer; stderr?: Buffer };
    throw new Refusal(plain(`the web app did not build, so no board is served:\n${String(stdout ?? '')}${String(stderr ?? '')}`), {
      cause: err,
    });
  }
  const changed = changedOver(before, status());
  if (changed.length)
    throw new Refusal(`the build changed the workspace, which a served board never does: ${changed.join(', ')}. Put it back.`);
}

/**
 * `serve`: says where the board already served here listens when it was built from the tree as it is now; else ends the one built from
 * another tree, builds the board, starts its holder and says where that one listens.
 */
async function serve(dir: string) {
  const tree = treeOf(REPO);
  const already = servedIn(dir);
  if (already && standsFor(already, tree)) return console.log(linesOf(already).join('\n'));
  if (already) {
    console.error(`board: the board on ${already.board} was built from another tree: ending it, and building this one`);
    await ended(dir, already);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  build(path.join(dir, 'dist'));
  const served = await startHolder(dir, tree);
  console.log(linesOf(served).join('\n'));
}

/**
 * Starts the holder of the board built in `dir` from the tree `tree`, detached, under the environment `env`, and resolves with where it
 * serves once it says so in `served.json`; rejects with why when it ends before that or says nothing within `ANSWER_MS`.
 */
export async function startHolder(dir: string, tree: string, env: NodeJS.ProcessEnv = process.env) {
  const log = path.join(dir, 'hold.log');
  const out = fs.openSync(log, 'a');
  const holder = spawn(process.execPath, [import.meta.filename, 'hold'], {
    cwd: WEB,
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...env, BOARD_SERVE_DIR: dir, BOARD_SERVE_TREE: tree },
  });
  fs.closeSync(out);
  holder.unref();
  let exited: string | undefined;
  holder.on('exit', (code, signal) => (exited = signal ?? `code ${code}`));
  const said = () => {
    const lines = (fs.existsSync(log) ? plain(fs.readFileSync(log, 'utf8')).trimEnd() : '').split('\n').slice(-SAID_LINES);
    if (lines.join('').trim()) return `the last lines of ${log}:\n${lines.join('\n')}`;
    return (
      `it wrote nothing to ${log} before it ended (${exited ?? 'still running'}): a kill or a crash. ` +
      "Run `node test/e2e/serve.ts serve` again, and read the machine's memory pressure if it ends the same way."
    );
  };
  return awaited(
    () => {
      if (exited !== undefined) throw new Refusal(`the board's holder ended (${exited}) before it served: ${said()}`);
      return servedIn(dir);
    },
    ANSWER_MS,
    () => `the board's holder (pid ${holder.pid}) did not say where it listens within ${ANSWER_MS / 1000} s: ${said()}`,
  ).catch((err: unknown) => {
    if (holder.pid !== undefined && exited === undefined) holder.kill('SIGTERM');
    throw err;
  });
}

/** `hold`: seeds and serves the folder's store, says where in `served.json`, and holds until it is asked to stop or its time is up. */
async function hold(dir: string) {
  let serving = false;
  process.on('exit', () => {
    if (serving) return fs.rmSync(dir, { recursive: true, force: true });
    for (const entry of fs.readdirSync(dir).filter((entry) => entry !== 'hold.log'))
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  });
  const { serveStore, servers, startServers, stopOnTheWayOut, stopServers } = await import('./served.ts');
  const world = await import('./world.ts');
  const store = path.join(dir, 'store');
  fs.mkdirSync(store);
  stopOnTheWayOut('board');
  const dist = path.join(dir, 'dist');
  const seat = {};
  let at = await serveStore(store, seat, dist);
  const ports = () => [at.apiPort, new URL(at.base).port] satisfies string[];
  for (let tried = 1; !ports().every(usable); tried++) {
    if (tried === TRIES) throw new Error(`no port a step may open in ${TRIES} starts: the last were ${ports().join(' and ')}`);
    await stopServers();
    at = await startServers(seat, dist);
  }
  const token = world.seatToken;
  if (!token)
    throw new Error(
      'the seeded store minted no token for the person (seatToken, served.ts), so the served board would open on its token page: read what seedStore said above, and serve again',
    );
  const tree = process.env.BOARD_SERVE_TREE ?? '';
  const served: ServedBoard = {
    pid: process.pid,
    board: at.base,
    api: `http://127.0.0.1:${at.apiPort}`,
    tree,
    token,
  };
  fs.writeFileSync(path.join(dir, 'served.json.new'), `${JSON.stringify(served)}\n`);
  fs.renameSync(path.join(dir, 'served.json.new'), path.join(dir, 'served.json'));
  serving = true;
  const holdMs = Number(process.env.BOARD_HOLD_MS) || HOLD_MS;
  const gone = () => servers.some(({ child }) => child.exitCode !== null || child.signalCode !== null);
  await new Promise<void>((resolve) => {
    const end = () => {
      clearInterval(look);
      clearTimeout(bound);
      resolve();
    };
    const look = setInterval(() => (fs.existsSync(path.join(dir, 'stop')) || gone() ? end() : undefined), PACE_MS);
    const bound = setTimeout(end, holdMs);
  });
  await stopServers();
}

/** Asks the holder of the board `served` from `dir` to end, by a file in the folder, and resolves once its pid is gone. */
async function ended(dir: string, served: ServedBoard) {
  fs.writeFileSync(path.join(dir, 'stop'), '');
  await awaited(
    () => !alive(served.pid),
    ANSWER_MS,
    () => `the board's holder (pid ${served.pid}) is still there ${ANSWER_MS / 1000} s after it was asked to stop: \`kill ${served.pid}\``,
  );
}

/** `stop`: asks the holder of the board served here to end, and waits until it has; says so when none is served. */
async function stop(dir: string) {
  const served = servedIn(dir);
  if (!served) return console.log('no board is served from this workspace');
  await ended(dir, served);
  console.log(`the board on ${served.board} is stopped`);
}

const VERBS: Record<string, (dir: string) => Promise<void>> = { serve, hold, stop };

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const verb = VERBS[process.argv[2] ?? ''];
  (verb ? verb(folder()) : Promise.reject(new Refusal('usage: node test/e2e/serve.ts serve | stop'))).then(
    () => process.exit(0),
    (err: unknown) => {
      const holding = process.argv[2] === 'hold' && err instanceof Error;
      console.error(`board: ${holding ? (err.stack ?? err.message) : err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    },
  );
}
