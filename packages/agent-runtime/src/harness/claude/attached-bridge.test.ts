/**
 * The claude.ai bridge's one door (`attached-bridge.ts`): the undeclared control request read off a `query()` object, its answer
 * decoded before anything is written from it, and refused in words — never thrown — where the method is not there, where its answer
 * says something this runtime does not read, or where the request itself failed. One table: each row makes one of them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bridgeable, bridgeFailed, bridgeStateOf, bridgeUnread, enableBridge, BRIDGE_ABSENT } from './attached-bridge.ts';

/** The facts the SDK's bridge answers with, whole. */
const ANSWER = {
  session_url: 'https://claude.ai/s/cse_1',
  connect_url: 'https://claude.ai/connect/cse_1',
  environment_id: 'env-1',
  bridge_epoch: 2,
  bridge_session_id: 'cse_1',
};

/** A `query()` object whose control request answers `answer` and remembers what it was asked. */
const queryOf = (answer: unknown) => {
  const asked: unknown[] = [];
  return {
    asked,
    q: {
      enableRemoteControl: (enabled: boolean, name?: string, options?: unknown) => {
        asked.push({ enabled, name, options });
        return Promise.resolve(answer);
      },
    },
  };
};

/** The words `bridgeUnread` opens with, whatever the decoder said: what tells this refusal from the other two. */
const UNREAD = bridgeUnread('').split('(')[0];

const ROWS: { name: string; run: () => Promise<void> | void }[] = [
  {
    name: "the bridge's facts are read off the control request's answer, and a kept claude.ai session re-attached",
    run: async () => {
      const { q, asked } = queryOf(ANSWER);
      assert.equal(bridgeable(q), true);
      const bridge = await enableBridge(q, 'ae/t1/1', 'cse_earlier');
      assert.deepEqual(bridge, {
        url: ANSWER.session_url,
        connectUrl: ANSWER.connect_url,
        environmentId: ANSWER.environment_id,
        epoch: 2,
        bridgeSessionId: 'cse_1',
      });
      assert.deepEqual(asked, [{ enabled: true, name: 'ae/t1/1', options: { keepSessionOnExit: true, reattachSessionId: 'cse_earlier' } }]);
    },
  },
  {
    name: 'REFUSED: a query object with no such method leaves the session running, with why there is no bridge and no throw',
    run: async () => {
      assert.equal(bridgeable({}), false);
      assert.deepEqual(await enableBridge({}, 'ae/t1/1'), { why: BRIDGE_ABSENT });
      assert.deepEqual(await enableBridge(undefined, 'ae/t1/1'), { why: BRIDGE_ABSENT });
      assert.deepEqual(await enableBridge({ enableRemoteControl: 'not a function' }, 'ae/t1/1'), { why: BRIDGE_ABSENT });
    },
  },
  {
    name: 'REFUSED: an answer missing a field this runtime reads is no bridge, and says so rather than writing half of one',
    run: async () => {
      const { bridge_session_id: _, ...short } = ANSWER;
      const refused = await enableBridge(queryOf(short).q, 'ae/t1/1');
      assert.deepEqual(Object.keys(refused), ['why'], 'nothing of a bridge is written from it');
      assert.ok(refused.why?.startsWith(UNREAD), refused.why);
      assert.match(refused.why ?? '', /bridge_session_id/, 'naming the field it lacks');
    },
  },
  {
    name: 'REFUSED: a control request that failed is no bridge, and the session runs on',
    run: async () => {
      const q = { enableRemoteControl: () => Promise.reject(new Error('the bridge is unavailable')) };
      const refused = await enableBridge(q, 'ae/t1/1');
      assert.deepEqual(refused, { why: bridgeFailed('the bridge is unavailable') });
      assert.match(refused.why ?? '', /the bridge is unavailable/, 'naming why the request failed');
    },
  },
  {
    name: "the bridge's state is read off a system bridge_state message, and off no other",
    run: () => {
      assert.equal(bridgeStateOf({ type: 'system', subtype: 'bridge_state', state: 'connected' }), 'connected');
      assert.equal(bridgeStateOf({ type: 'system', subtype: 'init', state: 'connected' }), undefined);
      assert.equal(bridgeStateOf({ type: 'result' }), undefined);
      assert.equal(bridgeStateOf({ type: 'system', subtype: 'bridge_state', state: 7 }), undefined, 'a state that is no word says none');
      assert.equal(bridgeStateOf(null), undefined);
    },
  },
];

test('the bridge’s one door: its facts read off the control request’s answer and its stream, or why there is none, never thrown', async (t) => {
  for (const row of ROWS) await t.test(row.name, row.run);
});
