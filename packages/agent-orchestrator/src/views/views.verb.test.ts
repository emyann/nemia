/**
 * `admissionWaitOf` (views.verb.ts): why the runtime holds a queued task, off its view already read — a slot of its pool, or the memory
 * it asks and the room there is — over the runtime's stand-in, a wait planted on a task filed `queued` as the store's engine files it.
 */
import { beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import { engineOf } from '../runtime-client.ts';
import { admissionWaitOf } from './views.verb.ts';

const engine = eachTest(testEngine);
const GI = 1024 ** 3;

describe("`admissionWaitOf`: a queued task's wait as its view says it; none for a task not held, nor one not read", () => {
  let stand!: import('agent-runtime/testing').TestEngine;
  let e!: import('agent-runtime').EngineShape;
  let id!: string;
  beforeAll(async () => {
    stand = engine();
    e = engineOf(stand.layer);
    id = await Effect.runPromise(e.file({ brief: 'implement', cwd: '/tmp' }));
  });
  const viewed = async () => new Map([[id, await Effect.runPromise(e.view(id))]]);
  test('a memory wait: the need and the room', async () => {
    stand.plantWait(id, { for: 'memory', needBytes: 3 * GI, roomBytes: GI });
    assert.deepEqual(admissionWaitOf(await viewed())(id), { for: 'memory', needBytes: 3 * GI, roomBytes: GI });
  });
  test('a slot wait: the pool and its ceiling', async () => {
    stand.plantWait(id, { for: 'slot', pool: 'claude', ceiling: 4 });
    assert.deepEqual(admissionWaitOf(await viewed())(id), { for: 'slot', pool: 'claude', ceiling: 4 });
  });
  test('no wait planted, and a task with no view: none', async () => {
    stand.plantWait(id, undefined);
    assert.equal(admissionWaitOf(await viewed())(id), undefined);
    assert.equal(admissionWaitOf(new Map())(id), undefined);
  });
});
