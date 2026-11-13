/**
 * What the store's engine is handed of its memory settings (`storeLimits`, `storeAdmission`): the default request beside the default
 * limit, and the floor the runtime admits sessions above — `WF_MEMORY_RESERVED` where set, else the default floor of the machine's memory,
 * read through a planted total and never the machine's own. A setting refused gives the engine none of its part, as a refused limit does.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scratch } from 'test-kit/scratch';
import { settingsOf } from './config/config.store.ts';
import { storeAdmission, storeLimits } from './runtime-client.ts';

const GI = 1024 ** 3;

test("`storeLimits`: WF_MEMORY_REQUEST is the engine's default request, beside the default limit; none where refused", async (t) => {
  await t.test('a request and a limit: both handed on', () =>
    assert.deepEqual(storeLimits(settingsOf({ WF_MEMORY_LIMIT: '8Gi', WF_MEMORY_REQUEST: '2560Mi' })), {
      defaultLimits: { memory: '8Gi' },
      defaultRequests: { memory: '2560Mi' },
    }),
  );
  await t.test('a request with no limit: the request alone', () =>
    assert.deepEqual(storeLimits(settingsOf({ WF_MEMORY_REQUEST: '2Gi' })), { defaultRequests: { memory: '2Gi' } }),
  );
  await t.test('no request: no default request, each task asking its limit', () =>
    assert.deepEqual(storeLimits(settingsOf({ WF_MEMORY_LIMIT: '8Gi' })), { defaultLimits: { memory: '8Gi' } }),
  );
  await t.test('a request refused, as no quantity or above the limit: neither the request nor the limit', () => {
    assert.deepEqual(storeLimits(settingsOf({ WF_MEMORY_LIMIT: '8Gi', WF_MEMORY_REQUEST: 'lots' })), {});
    assert.deepEqual(storeLimits(settingsOf({ WF_MEMORY_LIMIT: '2Gi', WF_MEMORY_REQUEST: '4Gi' })), {});
  });
});

test("`storeAdmission`: the floor the engine admits above is WF_MEMORY_RESERVED, else the machine's default floor; none where refused", async (t) => {
  const root = scratch('wf-admission-');
  const totalOf = (bytes: number) => () => bytes;
  await t.test('WF_MEMORY_RESERVED set: handed on as written, whatever the machine', () =>
    assert.deepEqual(storeAdmission(root, settingsOf({ WF_MEMORY_RESERVED: '3Gi' }), totalOf(64 * GI)).reserved, { memory: '3Gi' }),
  );
  await t.test('unset: an eighth of the planted machine, in Mi', () =>
    assert.deepEqual(storeAdmission(root, settingsOf({}), totalOf(16 * GI)).reserved, { memory: '2048Mi' }),
  );
  await t.test('unset on a small machine: 1 GiB at least', () =>
    assert.deepEqual(storeAdmission(root, settingsOf({}), totalOf(4 * GI)).reserved, { memory: '1024Mi' }),
  );
  await t.test('refused: no floor, and the ceiling and the pause kept', () => {
    const admission = storeAdmission(root, settingsOf({ WF_MEMORY_RESERVED: 'half', WF_MAX_CONCURRENT: '3' }), totalOf(16 * GI));
    assert.equal('reserved' in admission, false);
    assert.equal(admission.maxConcurrent, 3);
    assert.equal(admission.unschedulable(), false);
  });
});
