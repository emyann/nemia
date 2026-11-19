/**
 * The board's holder says the person's token its seeded store minted: `startHolder` (`e2e/serve.ts`) resolves with a `token` that is
 * not empty, `served.json` keeps the same, and the api it serves takes it as a bearer where it refuses a request without one.
 *
 * A boundary test, and the real holder is its whole subject: the token is minted by the seed inside a detached process and read back
 * from the file it writes, which no stand-in models. No build is made: the board's `dist` is a page of one line, since the api is
 * what is asked.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { scratch } from 'test-kit/scratch';
import { alive, servedIn, startHolder } from './e2e/serve.ts';

test('a holder serves the token its store minted, and its api takes it', async () => {
  const dir = path.join(scratch('nemia-board-token-'), 'board');
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<!doctype html><title>board</title>\n');
  const served = await startHolder(dir, 'tree');
  try {
    assert.notEqual(served.token, '', 'the holder says a token');
    assert.equal(servedIn(dir)?.token, served.token, 'served.json keeps the token said');
    const runs = `${served.api}/api/runs`;
    assert.equal((await fetch(runs)).status, 401, 'the api asks a token');
    assert.equal((await fetch(runs, { headers: { authorization: `Bearer ${served.token}` } })).status, 200, 'and takes the one said');
  } finally {
    fs.writeFileSync(path.join(dir, 'stop'), '');
    for (let waited = 0; alive(served.pid) && waited < 30_000; waited += 200) await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(alive(served.pid), false, 'the holder ends when asked');
});
