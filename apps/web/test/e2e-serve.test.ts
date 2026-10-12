/**
 * The served board's command (`test/e2e/serve.ts`), as far as it needs no build: the folder it serves a workspace from, a holder that is
 * gone read as no board, the ports a step given the browser could not open, and the three lines it prints. The serving itself is held by
 * `test/e2e/serve.test.ts`, under `npm run e2e`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { alive, changedOver, folderOf, keeping, linesOf, servedIn, standsFor, treeOf, usable } from './e2e/serve.ts';

test('a workspace is served from one folder of its own under the temp directory, whatever way its path is written', () => {
  const one = folderOf('/w/a', '/tmp');
  assert.match(one, /^\/tmp\/nemia-board-[0-9a-f]{12}$/);
  assert.equal(folderOf('/w/a/', '/tmp'), one);
  assert.equal(folderOf('/w/b/../a', '/tmp'), one);
  assert.notEqual(folderOf('/w/b', '/tmp'), one, 'another workspace, another folder');
});

test('REFUSED: a port the steps are denied by address is not one a board is served on', () => {
  for (const port of ['8787', '5173', '51730', '51739']) assert.equal(usable(port), false, port);
  for (const port of ['41234', '18787', '15173', '8788', '5174']) assert.equal(usable(port), true, port);
  assert.equal(usable(''), false, 'no port is none to serve on');
});

test('REFUSED: a folder whose holder is gone, or whose file does not read, serves no board; a live holder does', () => {
  const dir = scratch('nemia-board-state-');
  assert.equal(servedIn(dir), undefined, 'no file');
  const ended = spawnSync(process.execPath, ['-e', ''], { stdio: 'ignore' });
  const gone = ended.pid;
  assert.equal(alive(gone), false);
  const write = (said: unknown) => fs.writeFileSync(path.join(dir, 'served.json'), JSON.stringify(said));
  const at = { board: 'http://127.0.0.1:41234', api: 'http://127.0.0.1:41235', stories: 'http://127.0.0.1:41236', tree: 'a1' };
  write({ pid: gone, ...at });
  assert.equal(servedIn(dir), undefined, 'a holder that is gone');
  write({ pid: process.pid, board: at.board });
  assert.equal(servedIn(dir), undefined, 'no api said');
  write({ pid: process.pid, board: at.board, api: at.api, stories: at.stories });
  assert.equal(servedIn(dir), undefined, 'no tree said: a board built from nobody knows what');
  write({ pid: process.pid, board: at.board, api: at.api, tree: at.tree });
  assert.equal(servedIn(dir), undefined, "no stories said: a holder from before the look's stories, to be replaced");
  fs.writeFileSync(path.join(dir, 'served.json'), '{');
  assert.equal(servedIn(dir), undefined, 'a file half written');
  write({ pid: process.pid, ...at });
  assert.deepEqual(servedIn(dir), { pid: process.pid, ...at });
});

test('serve prints the board first, its api second and the stories third, each on a line a step reads an address from', () => {
  assert.deepEqual(linesOf({ board: 'http://127.0.0.1:41234', api: 'http://127.0.0.1:41235', stories: 'http://127.0.0.1:41236' }), [
    'board on http://127.0.0.1:41234',
    'api on http://127.0.0.1:41235',
    'stories on http://127.0.0.1:41236',
  ]);
});

test('REFUSED: a board built from another tree is not the one to open: a commit, a change to a tracked file and a new file each make another', () => {
  const repo = scratch('nemia-board-tree-');
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
      cwd: repo,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  git('init', '-q');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'ignored/\n');
  fs.writeFileSync(path.join(repo, 'a.ts'), 'one\n');
  git('add', '-A');
  git('commit', '-qm', 'one');
  const seen = [treeOf(repo)];
  const next = (what: string, change: () => void) => {
    change();
    const tree = treeOf(repo);
    assert.ok(!seen.includes(tree), `${what} is another tree`);
    seen.push(tree);
  };
  assert.equal(treeOf(repo), seen[0], 'the same tree says the same word');
  next('a change to a tracked file', () => fs.writeFileSync(path.join(repo, 'a.ts'), 'two\n'));
  next('a new file', () => fs.writeFileSync(path.join(repo, 'b.ts'), 'b\n'));
  next('a new file changed', () => fs.writeFileSync(path.join(repo, 'b.ts'), 'bb\n'));
  next('a commit', () => {
    git('add', '-A');
    git('commit', '-qm', 'two');
  });
  fs.mkdirSync(path.join(repo, 'ignored'));
  fs.writeFileSync(path.join(repo, 'ignored', 'x'), 'x');
  assert.equal(treeOf(repo), seen.at(-1), 'a file git ignores is no part of the tree');
  const served = {
    pid: process.pid,
    board: 'http://127.0.0.1:41234',
    api: 'http://127.0.0.1:41235',
    stories: 'http://127.0.0.1:41236',
    tree: seen[0],
  };
  assert.equal(standsFor(served, seen[0]), true);
  assert.equal(standsFor(served, seen.at(-1)!), false, 'a board of the first tree is not one of the last');
  assert.equal(standsFor(undefined, seen[0]), false, 'no board served stands for no tree');
});

test('REFUSED: a build that changed the workspace is named by each line of git status that came or went, and one that changed nothing by none', () => {
  const before = ' M apps/web/package.json\n?? notes.md\n';
  assert.deepEqual(changedOver(before, before), []);
  assert.deepEqual(changedOver(before, `${before} M apps/web/src/routeTree.gen.ts\n?? apps/web/dist/\n`), [
    ' M apps/web/src/routeTree.gen.ts',
    '?? apps/web/dist/',
  ]);
  assert.deepEqual(changedOver(before, ' M apps/web/package.json\n'), ['gone: ?? notes.md']);
  assert.deepEqual(changedOver('', ''), []);
});

test('REFUSED: a file a build rewrote is put back byte for byte, when the build returns and when it throws', () => {
  const file = path.join(scratch('nemia-board-keep-'), 'routeTree.gen.ts');
  fs.writeFileSync(file, 'as it was\n');
  assert.equal(
    keeping(file, () => {
      fs.writeFileSync(file, 'regenerated\n');
      return 7;
    }),
    7,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'as it was\n');
  assert.throws(
    () =>
      keeping(file, () => {
        fs.writeFileSync(file, 'half written');
        throw new Error('the build failed');
      }),
    (err: Error) => err.message === 'the build failed',
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'as it was\n');
});
