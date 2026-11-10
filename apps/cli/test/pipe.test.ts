/**
 * A verb's whole output reaches a pipe before `nemia` exits. A pipe holds 64 KiB; what a verb prints past that waits in the process
 * until the reader drains it, and a bin that called `process.exit` as soon as the verb answered dropped the tail (`nemia ls -o wide |
 * awk` lost 219 of 321 lines). The reader here drains nothing until the child has exited or a short while has passed, whichever is
 * first: a bin that exits on a full pipe has exited by then, and one that waits for its streams is still there to be read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { servedStore, write, type Said } from './served.ts';

const BIN = path.join(import.meta.dirname, '..', 'bin');
const CARDS = 1500;
const LONG = 'x'.repeat(80);
const name = (i: number) => `card-${String(i).padStart(4, '0')}-${LONG}`;

const store = await servedStore('nemia-cli-pipe-', (root) => {
  for (let i = 0; i < CARDS; i++) write(path.join(root, 'inbox', `${name(i)}.md`), `Card ${i}, ${LONG}.\n`);
});
test.after(() => store.stop());

/** Each line's first word, the card a row names: the reads are compared by it, since a time cell may read differently a second later. */
const firstWords = (out: string) => out.split('\n').map((line) => line.split(' ')[0]);

/** The bin `bin` run with `argv`, its stdout read through a pipe left full until the child exits or `holdMs` has passed. */
const slowlyRead = (argv: readonly string[], bin = 'nemia', holdMs = 1000): Promise<Said> =>
  new Promise((resolve, reject) => {
    const run = spawn(process.execPath, [path.join(BIN, `${bin}.ts`), ...argv], { env: store.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    run.stdout.pause();
    const drain = () => {
      clearTimeout(held);
      run.stdout.on('data', (chunk) => (out += chunk));
      run.stdout.resume();
    };
    const held = setTimeout(drain, holdMs);
    run.once('exit', drain);
    run.stderr.on('data', (chunk) => (err += chunk));
    run.on('error', reject);
    run.on('close', (code) => resolve({ code, out, err }));
  });

test('`nemia inbox --all` and `wf inbox --all`, longer than a pipe holds, reach a slow reader whole, with exit 0', async () => {
  const eager = await store.nemia(['inbox', '--all']);
  assert.equal(eager.code, 0, eager.err);
  assert.ok(Buffer.byteLength(eager.out) > 2 * 64 * 1024, `the output outgrows a pipe: ${Buffer.byteLength(eager.out)} bytes`);
  for (const bin of ['nemia', 'wf']) {
    const slow = await slowlyRead(['inbox', '--all'], bin);
    assert.equal(slow.code, 0, slow.err);
    assert.deepEqual(firstWords(slow.out), firstWords(eager.out), `every line reached ${bin}'s slow reader`);
    assert.equal(slow.out.trimEnd().split('\n').at(-1), eager.out.trimEnd().split('\n').at(-1), 'down to the last line');
    assert.match(slow.out, new RegExp(`^${name(CARDS - 1)} `, 'm'), 'the last card is there');
  }
});

test('a refusal read through a slow pipe keeps its exit code and its words', async () => {
  const refused = await slowlyRead(['get', 'no-such-resource']);
  assert.equal(refused.code, 2);
  assert.match(refused.err, /nemia explain/);
});
