/**
 * `admissionWaitOf` (views.verb.ts): why the runtime holds a queued task, off its view already read — a slot of its pool, or the memory
 * it asks and the room there is — over the runtime's stand-in, a wait planted on a task filed `queued` as the store's engine files it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import { engineOf, type TaskView } from '../runtime-client.ts';
import { admissionWaitOf } from './views.verb.ts';

const engine = eachTest(testEngine);
const GI = 1024 ** 3;

test("`admissionWaitOf`: a queued task's wait as its view says it; none for a task not held, nor one not read", async (t) => {
  const stand = engine();
  const e = engineOf(stand.layer);
  const id = await Effect.runPromise(e.file({ brief: 'implement', cwd: '/tmp' }));
  const viewed = async (): Promise<ReadonlyMap<string, TaskView>> => new Map([[id, await Effect.runPromise(e.view(id))]]);
  await t.test('a memory wait: the need and the room', async () => {
    stand.plantWait(id, { for: 'memory', needBytes: 3 * GI, roomBytes: GI });
    assert.deepEqual(admissionWaitOf(await viewed())(id), { for: 'memory', needBytes: 3 * GI, roomBytes: GI });
  });
  await t.test('a slot wait: the pool and its ceiling', async () => {
    stand.plantWait(id, { for: 'slot', pool: 'claude', ceiling: 4 });
    assert.deepEqual(admissionWaitOf(await viewed())(id), { for: 'slot', pool: 'claude', ceiling: 4 });
  });
  await t.test('no wait planted, and a task with no view: none', async () => {
    stand.plantWait(id, undefined);
    assert.equal(admissionWaitOf(await viewed())(id), undefined);
    assert.equal(admissionWaitOf(new Map())(id), undefined);
  });
});
