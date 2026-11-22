/**
 * What the store's engine is handed of its memory settings (`storeLimits`, `storeAdmission`): the default request beside the default
 * limit, and the floor the runtime admits sessions above — `WF_MEMORY_RESERVED` where set, else the default floor of the machine's memory,
 * read through a planted total and never the machine's own. A setting refused gives the engine none of its part, as a refused limit does.
 */
import { beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { scratch } from 'test-kit/scratch';
import { settingsOf } from './config/config.store.ts';
import { storeAdmission, storeLimits } from './runtime-client.ts';
import { ASKED_PRIORITY, LANDING_MOMENTUM, MOMENTUM } from './status/status.ts';
import { NEMIA_PRIORITY } from './nemia/keep.verb.ts';

const GI = 1024 ** 3;

describe("`storeLimits`: WF_MEMORY_REQUEST is the engine's default request, beside the default limit; none where refused", () => {
  test('a request and a limit: both handed on', () =>
    assert.deepEqual(storeLimits(settingsOf({ WF_MEMORY_LIMIT: '8Gi', WF_MEMORY_REQUEST: '2560Mi' })), {
      defaultLimits: { memory: '8Gi' },
      defaultRequests: { memory: '2560Mi' },
    }));
  test('a request with no limit: the request alone', () =>
    assert.deepEqual(storeLimits(settingsOf({ WF_MEMORY_REQUEST: '2Gi' })), { defaultRequests: { memory: '2Gi' } }));
  test('no request: no default request, each task asking its limit', () =>
    assert.deepEqual(storeLimits(settingsOf({ WF_MEMORY_LIMIT: '8Gi' })), { defaultLimits: { memory: '8Gi' } }));
  test('a request refused, as no quantity or above the limit: neither the request nor the limit', () => {
    assert.deepEqual(storeLimits(settingsOf({ WF_MEMORY_LIMIT: '8Gi', WF_MEMORY_REQUEST: 'lots' })), {});
    assert.deepEqual(storeLimits(settingsOf({ WF_MEMORY_LIMIT: '2Gi', WF_MEMORY_REQUEST: '4Gi' })), {});
  });
});

describe("`storeAdmission`: the floor the engine admits above is WF_MEMORY_RESERVED, else the machine's default floor; none where refused", () => {
  let root!: string;
  beforeAll(() => {
    root = scratch('wf-admission-');
  });
  const totalOf = (bytes: number) => () => bytes;
  test('WF_MEMORY_RESERVED set: handed on as written, whatever the machine', () =>
    assert.deepEqual(storeAdmission(root, settingsOf({ WF_MEMORY_RESERVED: '3Gi' }), totalOf(64 * GI)).reserved, { memory: '3Gi' }));
  test('unset: an eighth of the planted machine, in Mi', () =>
    assert.deepEqual(storeAdmission(root, settingsOf({}), totalOf(16 * GI)).reserved, { memory: '2048Mi' }));
  test('unset on a small machine: 1 GiB at least', () =>
    assert.deepEqual(storeAdmission(root, settingsOf({}), totalOf(4 * GI)).reserved, { memory: '1024Mi' }));
  test('refused: no floor, and the ceiling and the pause kept', () => {
    const admission = storeAdmission(root, settingsOf({ WF_MEMORY_RESERVED: 'half', WF_MAX_CONCURRENT: '3' }), totalOf(16 * GI));
    assert.equal('reserved' in admission, false);
    assert.equal(admission.maxConcurrent, 3);
    assert.equal(admission.unschedulable(), false);
  });
});

describe("`storeAdmission`: the room kept for a person's turn, WF_KEPT_TURNS places and as many default asks, above `ASKED_PRIORITY`", () => {
  let root!: string;
  beforeAll(() => {
    root = scratch('wf-kept-');
  });
  const keptOf = (env: Record<string, string>) => storeAdmission(root, settingsOf(env), () => 16 * GI).keptRoom;
  test('unset: one turn, and its memory the default request', () =>
    assert.deepEqual(keptOf({ WF_MEMORY_LIMIT: '8Gi', WF_MEMORY_REQUEST: '2560Mi' }), {
      priority: ASKED_PRIORITY,
      sessions: 1,
      memory: String(2560 * 2 ** 20),
    }));
  test('two turns, no request: twice the limit', () =>
    assert.deepEqual(keptOf({ WF_KEPT_TURNS: '2', WF_MEMORY_LIMIT: '4Gi' }), { priority: ASKED_PRIORITY, sessions: 2, memory: String(8 * GI) }));
  test('no ask set: places alone', () => assert.deepEqual(keptOf({}), { priority: ASKED_PRIORITY, sessions: 1 }));
  test('0, or refused: none kept', () => {
    assert.equal(keptOf({ WF_KEPT_TURNS: '0' }), undefined);
    assert.equal(keptOf({ WF_KEPT_TURNS: 'x' }), undefined);
  });
});

test("`ASKED_PRIORITY` lies above every filing of the work and below Nemia's own session", () => {
  assert.ok(ASKED_PRIORITY > LANDING_MOMENTUM && LANDING_MOMENTUM > MOMENTUM);
  assert.ok(ASKED_PRIORITY < NEMIA_PRIORITY);
});
