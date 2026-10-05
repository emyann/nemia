/**
 * The client's way of reading the runtime: a verb of the engine read through `asked` dies, as an `Error`, of the runtime's refusal in the
 * runtime's words. `WF_ROOT` is set before the client loads, a scratch root.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { StopRefused } from 'agent-runtime/effect';
import { board } from './engine-board.ts';
import { scratch } from './scratch.ts';

process.env.WF_ROOT = scratch('wf-runtime-client-');
const { asked, engineOf, runWith } = await import('../src/runtime-client.ts');

test('a runtime refusal read through asked rejects with exit code 2, its message led by the verb', async () => {
  const e = engineOf(board().layer);
  const refused = Object.assign(e, { stop: () => Effect.fail(new StopRefused({ message: 'task t-1 has settled' })) });
  const err = await runWith(refused, asked('stop', refused.stop('t-1'))).then(
    () => assert.fail('the refusal was read as a success'),
    (e: unknown) => e as Error & { exitCode?: number },
  );
  assert.equal(err.exitCode, 2);
  assert.ok(err.message.startsWith('stop: '), err.message);
  assert.match(err.message, /task t-1 has settled/);
});

test('a failure of the runtime that is no refusal is thrown as it was, with no exit code and no verb', async () => {
  const e = engineOf(board().layer);
  const lost = new Error('the journal is gone');
  const broken = Object.assign(e, { stop: () => Effect.fail(lost as never) });
  const err = await runWith(broken, asked('stop', broken.stop('t-1'))).then(
    () => assert.fail('the failure was read as a success'),
    (e: unknown) => e as Error & { exitCode?: number },
  );
  assert.equal(err.message, 'the journal is gone');
  assert.equal(err.exitCode, undefined);
});
