/**
 * `nodeChild` (`test/child.ts`): the wait a test puts on a `nemia` child ends on the event it counts, or on the child's end, which fails it
 * at once with what the child said — never on a length of time. And a child is bound by its parent: the end of its stdin ends it, while a
 * program that returns still ends on its own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeChild } from './child.ts';

test('REFUSED: a child that ends before what a test waits for fails the wait at once, with its exit code, its stdout and its stderr', async () => {
  const w = nodeChild("console.log('half'); console.error('boom'); process.exit(3);", process.env);
  const wait = w.until(() => w.out().includes('never'), 'the banner');
  const after = new Promise<string>((resolve) => w.child.once('close', () => setImmediate(() => resolve('still waiting'))));
  await assert.rejects(Promise.race([wait, after]), (err: Error) => {
    assert.match(err.message, /^the banner — the child exited 3 before it; /);
    assert.match(err.message, /stdout:\nhalf\n/);
    assert.match(err.message, /stderr:\nboom\n/);
    return true;
  });
});

test('a wait resolves on what the child says, whenever it says it: no clock settles it first', async () => {
  const w = nodeChild(
    "const held = setInterval(() => {}, 1000); console.log('listening'); process.stdin.once('data', () => { console.log('ready'); clearInterval(held); });",
    process.env,
  );
  try {
    let settled = false;
    const ready = w
      .until(() => w.out().includes('ready'), 'ready')
      .finally(() => {
        settled = true;
      });
    await w.until(() => w.out().includes('listening'), 'the child listens on its stdin');
    assert.equal(settled, false, 'nothing said yet, so nothing settled');
    w.child.stdin.write('go\n');
    await ready;
    assert.equal(settled, true);
  } finally {
    w.child.kill();
  }
});

test('REFUSED: a child whose stdin ends is ended by it, before its program can do anything else, with exit code 1', async () => {
  const w = nodeChild(
    "setInterval(() => {}, 1000); process.stdin.on('end', () => setImmediate(() => process.exit(7))); console.log('up');",
    process.env,
  );
  await w.until(() => w.out().includes('up'), 'the child runs');
  w.child.stdin.end();
  assert.deepEqual(await w.closed, { code: 1, signal: null }, "ended by its stdin's end, not by its program, which would exit 7");
});

test('a program that returns ends on its own, its stdin not holding it open', async () => {
  const w = nodeChild("console.log('done');", process.env);
  await w.until(() => w.out().includes('done'), 'the program ran');
  w.child.stdin.end();
  assert.deepEqual(await w.closed, { code: 0, signal: null }, 'ended by its program, before its stdin ended it with 1');
});
