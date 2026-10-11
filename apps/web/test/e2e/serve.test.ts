/**
 * `npm run board:serve` and `npm run board:stop` (serve.ts), run whole in a folder of the test's: the board built and served against a
 * store of its own holding the e2e's seed, on ports a step may open, with nothing written into the workspace; a second serve that starts
 * nothing; a stop that leaves no process and no folder; and a holder that ends by itself. Builds the web app once, so only `npm run e2e`
 * runs it.
 */
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { runningIn, scratch } from '../scratch.ts';
import { until, WAITED } from '../waits.ts';
import { alive, servedIn, usable } from './serve.ts';
import { REPO, WEB } from './world.ts';

const SERVE = path.join(import.meta.dirname, 'serve.ts');

/** The folder the board is served from, and a copy of what it built, for a holder started by hand. */
const dir = path.join(scratch('nemia-board-served-'), 'board');
const built = path.join(scratch('nemia-board-built-'), 'dist');

type Ended = { code: number | null; stdout: string; stderr: string };

/** serve.ts run to its end with `verb` on the folder `folder`, with `env` over this process's. */
async function board(verb: string, folder = dir, env: NodeJS.ProcessEnv = {}): Promise<Ended> {
  const child = spawn(process.execPath, [SERVE, verb], {
    cwd: WEB,
    env: { ...process.env, ...env, BOARD_SERVE_DIR: folder },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk));
  const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
  return { code, stdout, stderr };
}

const status = (): string =>
  execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** What the first serve printed, and the workspace's status before it. */
let first: Ended;
let statusBefore: string;

before(async () => {
  statusBefore = status();
  first = await board('serve');
  if (first.code === 0) fs.cpSync(path.join(dir, 'dist'), built, { recursive: true });
}, WAITED);

test('serve builds outside the workspace and prints a board and an api that serve the seed from a store of their own', async () => {
  assert.equal(first.code, 0, first.stderr);
  const said = /^board on (http:\/\/127\.0\.0\.1:(\d+))\napi on (http:\/\/127\.0\.0\.1:(\d+))\n$/.exec(first.stdout);
  assert.ok(said, first.stdout);
  const [, boardAt, boardPort, apiAt, apiPort] = said;
  assert.ok(usable(boardPort) && usable(apiPort), `${boardPort} and ${apiPort} are ports a step may open`);
  assert.equal(status(), statusBefore, 'the build left the workspace as it was');
  const runs = (await (await fetch(`${apiAt}/api/runs`)).json()) as { id: string; work?: string }[];
  const seeded = runs.find((run) => run.id === 'a-note-on-the-tides-e2e15');
  assert.ok(seeded, `the seed's runs are served: ${runs.map((run) => run.id).join(', ')}`);
  assert.ok(seeded.work?.startsWith(`${path.join(dir, 'store')}${path.sep}`), `${seeded.work} is in the served store`);
  assert.match(await (await fetch(`${boardAt}/`)).text(), /<title>Nemia<\/title>/);
  const through = (await (await fetch(`${boardAt}/api/runs`)).json()) as unknown[];
  assert.equal(through.length, runs.length, "the board's /api is its own api");
});

test('a second serve prints the same two lines and starts nothing', async () => {
  const running = runningIn([dir]).map((proc) => proc.pid);
  assert.ok(running.length >= 3, `the holder, the api and the preview run in the folder: ${running.join(', ')}`);
  const again = await board('serve');
  assert.equal(again.code, 0, again.stderr);
  assert.equal(again.stdout, first.stdout);
  assert.deepEqual(
    runningIn([dir]).map((proc) => proc.pid),
    running,
  );
});

test('REFUSED: a serve over a board built from another tree ends that board, builds again and serves a new one', WAITED, async (t) => {
  const old = servedIn(dir);
  assert.ok(old, 'a board is served');
  fs.writeFileSync(path.join(dir, 'served.json'), JSON.stringify({ ...old, tree: 'another-tree' }));
  const again = await board('serve');
  assert.equal(again.code, 0, again.stderr);
  assert.match(again.stderr, /was built from another tree: ending it, and building this one/);
  await until(t, () => !alive(old.pid), `the old holder ${old.pid} is gone`, { everyMs: 100 });
  const now = servedIn(dir);
  assert.ok(now && now.pid !== old.pid, 'another holder serves');
  assert.notEqual(now.tree, 'another-tree');
  assert.equal(again.stdout, `board on ${now.board}\napi on ${now.api}\n`);
  assert.match(await (await fetch(`${now.board}/`)).text(), /<title>Nemia<\/title>/);
  const same = await board('serve');
  assert.equal(same.stdout, again.stdout, 'and the tree unchanged, it is said again');
  assert.equal(servedIn(dir)?.pid, now.pid);
});

test(
  'stop ends the holder and both servers by itself and removes the folder, and a stop with no board served says so',
  WAITED,
  async (t) => {
    const holder = servedIn(dir)?.pid;
    assert.ok(holder, 'a board is served');
    const stopped = await board('stop');
    assert.equal(stopped.code, 0, stopped.stderr);
    assert.match(stopped.stdout, /^the board on http:\/\/127\.0\.0\.1:\d+ is stopped\n$/);
    await until(
      t,
      () => runningIn([dir]).length === 0,
      () => `no process in ${dir}: ${JSON.stringify(runningIn([dir]))}`,
      { everyMs: 100 },
    );
    assert.equal(fs.existsSync(dir), false, 'the folder, its store and its build are gone');
    const none = await board('stop');
    assert.deepEqual([none.code, none.stdout], [0, 'no board is served from this workspace\n']);
  },
);

test('a holder whose time is up ends by itself, stops both servers and removes its folder', WAITED, async (t) => {
  const own = path.join(scratch('nemia-board-held-'), 'board');
  fs.cpSync(built, path.join(own, 'dist'), { recursive: true });
  const held = await board('hold', own, { BOARD_HOLD_MS: '1' });
  assert.equal(held.code, 0, held.stderr + held.stdout);
  await until(
    t,
    () => runningIn([own]).length === 0,
    () => `no process in ${own}: ${JSON.stringify(runningIn([own]))}`,
    { everyMs: 100 },
  );
  assert.equal(fs.existsSync(own), false);
});
