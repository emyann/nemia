/**
 * `compact` from `ae` to a harness: the CLI's arguments and lines (`cli/compact.ts`), and the engine's verb (`compactVerbOf`) over
 * harnesses as the A2A seam offers them, which lists `compactSessions` only for a harness with a `compact`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Exit } from 'effect';
import { a2aOps } from '../src/a2a/index.ts';
import { RunnerError, testOps, type RunnerOps, type SessionsCompacted } from '../src/harness/index.ts';
import { compactVerbOf } from '../src/service/compact.ts';
import { compactAsked, compactLines } from '../src/cli/compact.ts';

const SAID: SessionsCompacted = {
  captures: 3,
  compacted: 2,
  before: 900,
  after: 300,
  left: [{ name: 'a.log', why: 'its worker is at work' }],
};

/** A harness through the seam: `testOps` with `compact`, which records each ask, when given. */
const seamed = (compact?: RunnerOps['compact']) => a2aOps('fake', { ...testOps(), ...(compact ? { compact } : {}) }, async () => []);

test('compact asks each harness with a compact through the seam, dry unless told yes, and skips one without', async () => {
  const asked: boolean[] = [];
  const runners = {
    claude: seamed(({ dry }) => Effect.sync(() => (asked.push(dry), SAID))),
    codex: seamed(),
  };
  assert.equal(runners.codex.compact, undefined, 'the seam offers no compact for a harness without one');
  const verb = compactVerbOf(runners);
  assert.deepEqual(await Effect.runPromise(verb()), { compacted: false, harnesses: { claude: SAID } });
  assert.deepEqual(await Effect.runPromise(verb({ yes: true })), { compacted: true, harnesses: { claude: SAID } });
  assert.deepEqual(asked, [true, false]);
});

test("a harness's failure fails compact", async () => {
  const failing = seamed(() => Effect.fail(new RunnerError({ verb: 'compact', message: 'the disk is gone' })));
  const exit = await Effect.runPromiseExit(compactVerbOf({ claude: failing })({ yes: true }));
  assert.ok(Exit.isFailure(exit));
  assert.match(String(exit.cause), /the disk is gone/);
});

test('ae compact takes --yes or nothing, and refuses any other argument with exit code 2', () => {
  assert.deepEqual(compactAsked([]), { yes: false });
  assert.deepEqual(compactAsked(['--yes']), { yes: true });
  try {
    compactAsked(['--force']);
    assert.fail('took --force');
  } catch (e) {
    const err = e as Error & { exitCode?: number };
    assert.equal(err.exitCode, 2);
    assert.equal(err.message, 'compact: takes `--yes` to rewrite, or nothing to count; it was handed --force.');
  }
});

test('ae compact says each harness its captures and bytes, and each capture left with why', () => {
  assert.deepEqual(compactLines({ compacted: false, harnesses: { claude: SAID } }), [
    'claude: 3 capture(s), 2 to rewrite: `ae compact --yes` rewrites them; 900 bytes before, 300 after',
    '  left a.log: its worker is at work',
  ]);
  assert.match(compactLines({ compacted: true, harnesses: { claude: SAID } })[0], /2 rewritten;/);
  assert.deepEqual(compactLines({ compacted: true, harnesses: {} }), ['no harness keeps less of an ended capture: nothing to compact']);
});
