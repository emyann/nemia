/**
 * The Factory's and the inbox's reads decode the api's answers where they enter (`get`): the inbox and a card's page, what the repository
 * offers, the quota, the cap and the last pass, and the daemon: a key the board does not read is dropped, and one the api leaves out stays
 * out; a refusal of the api's stays in its words. Which keys each answer has is `test/wire.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadRefusal, UnreadAnswer } from '../src/lib/api/read.ts';
import { cardQuery, inboxQuery, type InboxCardPage, type InboxEntry } from '../src/lib/api/inbox.ts';
import { capabilitiesQuery, type Capabilities } from '../src/lib/api/capabilities.ts';
import { ceilingsQuery, type Ceilings } from '../src/lib/api/ceilings.ts';
import { clearRules, factoryRulesQuery, fireAgent, hireAgent, writeRules, type FactoryRules } from '../src/lib/api/factories.ts';
import { capabilities, cardPage, ceilings, inboxEntry, passCost, stepReach } from './factory-fixtures.ts';

/** Every read answering `body` as JSON, with `status`, for the length of the test. */
function answering(t: { after: (fn: () => void) => void }, body: unknown, status = 200) {
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  t.after(() => {
    globalThis.fetch = before;
  });
}

const readInbox = inboxQuery.queryFn as unknown as () => Promise<InboxEntry[]>;
const readCard = cardQuery('x').queryFn as unknown as () => Promise<InboxCardPage>;
const readCapabilities = capabilitiesQuery.queryFn as unknown as () => Promise<Capabilities>;
const readCeilings = ceilingsQuery.queryFn as unknown as () => Promise<Ceilings>;

/** `value` without `keys`, as an api that does not send them answers. */
const without = <T extends object>(value: T, ...keys: string[]): T =>
  Object.fromEntries(Object.entries(value).filter(([k]) => !keys.includes(k))) as T;

/** A factory's rules as the api answers them: kept in its file, with words. */
const rules: FactoryRules = {
  name: 'mill',
  file: '/home/me/.agent-workflows/factories/mill/RULES.md',
  words: 'Never push on a Friday.',
  error: null,
};

test("get, the Factory's and the inbox's reads: each decodes what the api gives, keeps out what it leaves out, drops what the board does not read, and keeps a refusal of the api's", async (t) => {
  await t.test('what the api leaves out stays out: an inbox entry never queued nor tried', async (t) => {
    answering(t, [without(inboxEntry(), 'queued', 'tried')]);
    const [entry] = await readInbox();
    assert.equal(Object.hasOwn(entry, 'queued'), false);
    assert.equal(Object.hasOwn(entry, 'tried'), false);

    answering(t, without(cardPage(), 'queued'));
    const page = await readCard();
    assert.equal(Object.hasOwn(page, 'queued'), false);
    assert.equal(Object.hasOwn(page, 'tried'), true);
  });
  await t.test(
    'a key the board does not read is dropped, not refused: on a card, on a harness of the last pass, on a step it offers',
    async (t) => {
      answering(t, [{ ...inboxEntry(), colour: 'blue' }]);
      const [entry] = await readInbox();
      assert.equal(Object.hasOwn(entry, 'colour'), false);
      assert.deepEqual(entry, inboxEntry());

      const pass = passCost();
      answering(t, ceilings({ pass: { ...pass, harnesses: { claude: { ...pass.harnesses.claude, colour: 'blue' } as never } } }));
      const read = await readCeilings();
      assert.equal(Object.hasOwn(read.pass?.harnesses.claude ?? {}, 'colour'), false);
      assert.deepEqual(read, ceilings());

      answering(t, capabilities({ steps: [{ ...stepReach(), colour: 'blue' } as never] }));
      const offered = await readCapabilities();
      assert.equal(Object.hasOwn(offered.steps[0], 'colour'), false);
      assert.deepEqual(offered, capabilities({ steps: [stepReach()] }));
    },
  );
  await t.test("a card the api refused still rejects in the api's words and status, not as an answer unread", async (t) => {
    answering(t, { error: 'no card x in the inbox' }, 404);
    const err: unknown = await readCard().then(
      () => assert.fail('a 404 was read'),
      (e: unknown) => e,
    );
    assert.ok(err instanceof ReadRefusal && !(err instanceof UnreadAnswer), String(err));
    assert.equal(err.status, 404);
    assert.equal(err.message, 'no card x in the inbox');
  });
  await t.test('the last pass reads with what it saw, and one an older tick wrote without it stays without', async (t) => {
    const seen = ceilings({ pass: passCost({ runs: 43, tasks: 3, queued: 1, admitted: 2 }) });
    answering(t, seen);
    assert.deepEqual(await readCeilings(), seen);
    answering(t, ceilings());
    assert.equal(Object.hasOwn((await readCeilings()).pass ?? {}, 'runs'), false);
  });
  await t.test("a clear's answer reads without whether a file was removed", async (t) => {
    answering(t, { ...rules, words: null, removed: true });
    assert.deepEqual(await clearRules('mill'), { ...rules, words: null }, "whether a file was removed is not the board's to read");
  });
});

test("a factory's writes: its rules, a hire and a fire, each at its own route, each name one segment", async (t) => {
  await t.test("a factory's rules are written and cleared at the factory's own route, its name one segment", async (t) => {
    const before = globalThis.fetch;
    const sent: Array<{ method: string; url: string; body: unknown }> = [];
    globalThis.fetch = async (input, init) => {
      sent.push({ method: init?.method ?? 'GET', url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify(rules), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    t.after(() => {
      globalThis.fetch = before;
    });
    await factoryRulesQuery('the mill').queryFn?.({} as never);
    await writeRules('the mill', 'Never push.');
    await clearRules('the mill');
    assert.deepEqual(sent, [
      { method: 'GET', url: '/api/factories/the%20mill/rules', body: undefined },
      { method: 'PUT', url: '/api/factories/the%20mill/rules', body: { words: 'Never push.' } },
      { method: 'DELETE', url: '/api/factories/the%20mill/rules', body: {} },
    ]);
  });
  await t.test("a hire and a fire are sent to the step's hire, the step one segment, and read back as the api answers them", async (t) => {
    const sent: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const before = globalThis.fetch;
    let answer: unknown = { file: '/f/mill.json', replaced: null };
    globalThis.fetch = async (input, init) => {
      sent.push({ url: String(input), method: init?.method, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(answer), { headers: { 'content-type': 'application/json' } });
    };
    t.after(() => {
      globalThis.fetch = before;
    });
    assert.deepEqual(await hireAgent('mill', 'build/implement', 'ada'), { file: '/f/mill.json', replaced: null });
    answer = { file: '/f/mill.json', fired: 'ada' };
    assert.deepEqual(await fireAgent('mill', 'build/implement'), { file: '/f/mill.json', fired: 'ada' });
    assert.deepEqual(sent, [
      { url: '/api/factories/mill/hires/build%2Fimplement', method: 'PUT', body: { agent: 'ada' } },
      { url: '/api/factories/mill/hires/build%2Fimplement', method: 'DELETE', body: {} },
    ]);
    answer = { file: '/f/mill.json' };
    await assert.rejects(hireAgent('mill', 'build/implement', 'ada'), (err: unknown) => {
      assert.ok(err instanceof UnreadAnswer, String(err));
      assert.ok(err.message.includes('at replaced, '), err.message);
      assert.ok(err.message.includes("read the step's page again before hiring or firing again"), err.message);
      return true;
    });
  });
});
