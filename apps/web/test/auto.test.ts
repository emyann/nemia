/**
 * An agent's rules for Auto on the board: the mirror of what the api answers, which decodes the rules in force, the proposal and the
 * custom instruction (its shape held by `test/wire.test.ts`), and the writes of a confirm, sending the words the person read, and a drop,
 * with an empty body, each on its route.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { policyQuery, confirmRule, dropRule, type PolicyList } from '../src/lib/api/auto.ts';

/** The builtin rule, as the api words it. */
const DEFAULT = {
  id: 'default',
  answer: 'approve',
  when: ['recommends', 'checked', 'accepted', 'withinBudget', 'nothingOpen'],
  from: 'default',
  words: 'Approve any step unasked when all agree.',
} as const;

/** Her rules, the default in force, one rule proposed and one word kept as guidance. */
const LIST: PolicyList = {
  agent: 'nemia',
  file: '/store/auto/nemia.json',
  isDefault: true,
  rules: [DEFAULT],
  builtin: DEFAULT,
  proposed: {
    file: '/store/auto/nemia.proposed.json',
    at: '2026-10-06T12:00:00.000Z',
    rules: [{ id: 'tries', answer: 'retry', steps: ['implement'], when: ['checked'], under: 3, words: 'Try again.', confirmed: false }],
    guidance: ['answer in French'],
    stale: false,
  },
  instruction: 'Merge when all agree.',
};

/** Every call answering `body` as JSON, with `status`, for the length of the test; the calls made, by method and path. */
function answering(t: { after: (fn: () => void) => void }, body: unknown, status = 200): { method: string; path: string; body: unknown }[] {
  const before = globalThis.fetch;
  const calls: { method: string; path: string; body: unknown }[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push({
      method: init?.method ?? 'GET',
      path: String(input),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  return calls;
}

const readAuto = policyQuery('nemia').queryFn as unknown as () => Promise<PolicyList>;

test('policyQuery, confirmRule, dropRule: her rules read back as the api answers them, and a confirm and a drop sent on their routes', async (t) => {
  await t.test('her rules read back what the api answered, a key it does not read dropped', async (t) => {
    answering(t, { ...LIST, later: true });
    assert.deepEqual(await readAuto(), LIST);
    answering(t, { ...LIST, proposed: null, instruction: null });
    assert.deepEqual(await readAuto(), { ...LIST, proposed: null, instruction: null });
  });
  await t.test(
    'a confirm is a PUT sending the words read and a drop a DELETE sending an empty body, each reading the rules back',
    async (t) => {
      const calls = answering(t, LIST);
      assert.deepEqual(await confirmRule('nemia', 'tries', 'Try again.'), LIST);
      assert.deepEqual(await dropRule('nemia', 'default'), LIST);
      assert.deepEqual(calls, [
        { method: 'PUT', path: '/api/policy/nemia/rules/tries', body: { words: 'Try again.' } },
        { method: 'DELETE', path: '/api/policy/nemia/rules/default', body: {} },
      ]);
    },
  );
});
