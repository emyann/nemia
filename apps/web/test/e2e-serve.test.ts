/**
 * The served board's command (`test/e2e/serve.ts`), as far as it needs no build: the folder it serves a workspace from, a holder that is
 * gone read as no board, the ports a step given the browser could not open, and the two lines it prints. The serving itself is held by
 * `test/e2e/serve.test.ts`, under `npm run e2e`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { alive, folderOf, linesOf, servedIn, usable } from './e2e/serve.ts';

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
  const at = { board: 'http://127.0.0.1:41234', api: 'http://127.0.0.1:41235' };
  write({ pid: gone, ...at });
  assert.equal(servedIn(dir), undefined, 'a holder that is gone');
  write({ pid: process.pid, board: at.board });
  assert.equal(servedIn(dir), undefined, 'no api said');
  fs.writeFileSync(path.join(dir, 'served.json'), '{');
  assert.equal(servedIn(dir), undefined, 'a file half written');
  write({ pid: process.pid, ...at });
  assert.deepEqual(servedIn(dir), { pid: process.pid, ...at });
});

test('serve prints the board first and its api second, each on a line a step reads an address from', () => {
  assert.deepEqual(linesOf({ board: 'http://127.0.0.1:41234', api: 'http://127.0.0.1:41235' }), [
    'board on http://127.0.0.1:41234',
    'api on http://127.0.0.1:41235',
  ]);
});
