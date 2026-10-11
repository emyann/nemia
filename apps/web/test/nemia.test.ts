/**
 * Nemia on the board: her session's state judged from the orchestrator's facts (`sessionOf`), kept while any factory is above Manual, the
 * levels picked among and the one a fresh session is asked at, a factory's level in words, her spend in words, and the mirror of what
 * the api answers of her, which decodes her level and memory and refuses an answer it does not read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadRefusal, UnreadAnswer } from '../src/lib/api/read.ts';
import {
  levelQuery,
  nemiaFactQuery,
  nemiaMemoryQuery,
  type FactoryLevel,
  type NemiaLevel,
  type NemiaMemory,
} from '../src/lib/api/nemia.ts';
import { clockWord } from '../src/lib/quota.ts';
import { factoryWords, freshLevel, LEVELS, PRUNE_WORDS, RAISE_STRETCHES, raisesOver, sessionOf, spendWords } from '../src/lib/nemia.ts';

/** Where she is, as the api answers it: off, never set, unless `over` says otherwise. */
const nemiaLevel = (over: Partial<NemiaLevel> = {}): NemiaLevel => ({
  level: 'manual',
  since: null,
  task: null,
  phase: null,
  sessionId: null,
  reach: [],
  bridge: null,
  stopped: false,
  spend: null,
  allows: [],
  factories: [],
  trust: null,
  ...over,
});

/** A factory at Manual by default, the store's, raised to Semi-auto until 18:00 UTC. */
const raised: FactoryLevel = {
  factory: 'mill',
  level: 'semi-auto',
  default: 'manual',
  own: null,
  raise: { level: 'semi-auto', until: '2026-10-05T18:00:00.000Z' },
};

/** Her session up: Semi-auto, filed and reached. */
const up = nemiaLevel({
  level: 'semi-auto',
  since: '2026-10-05T12:00:00.000Z',
  task: 'nemia-1',
  phase: 'running',
  sessionId: '0123456789abcdef',
  reach: ['attach 01234567', 'https://example.test/code/session_0123'],
  bridge: { url: 'https://example.test/code/session_0123', why: null },
});

test('her session reads off with no task, not filed with no phase, starting while nothing reaches it, and up once something does', () => {
  assert.equal(sessionOf(nemiaLevel()).kind, 'off');
  assert.equal(sessionOf(nemiaLevel({ level: 'semi-auto', task: 'nemia-1' })).kind, 'not-filed');
  assert.equal(sessionOf({ ...up, reach: [], sessionId: null }).kind, 'starting');
  assert.equal(sessionOf(up).kind, 'up');
  assert.match(sessionOf(nemiaLevel({ level: 'semi-auto', task: 'nemia-1' })).words, /^Not filed yet: the keeper files her session/);
});

test('her session not filed while her folder is not trusted reads untrusted, waiting on a person to trust it, and off whatever her trust', () => {
  const waiting = nemiaLevel({ level: 'semi-auto', task: 'nemia-1', trust: "cd '/store/nemia' && claude" });
  assert.equal(sessionOf(waiting).kind, 'untrusted');
  assert.match(
    sessionOf(waiting).words,
    /^Waiting on your trust: the keeper files her session at its next beat once her folder is trusted\.$/,
  );
  assert.equal(sessionOf({ ...waiting, level: 'manual', task: null }).kind, 'off');
  assert.equal(
    sessionOf({ ...up, trust: "cd '/store/nemia' && claude" }).kind,
    'up',
    'a phase read is a session filed, whatever the trust',
  );
});

test('Manual asked of a session still reached reads leaving, and off once nothing reaches it', () => {
  assert.equal(sessionOf({ ...up, level: 'manual' }).kind, 'leaving');
  assert.equal(sessionOf({ ...up, level: 'manual', reach: [] }).kind, 'off');
});

test('REFUSED to read leaving: a factory raised above Manual keeps her session up with the store at Manual; its raise ended, leaving', () => {
  assert.equal(sessionOf({ ...up, level: 'manual', factories: [raised] }).kind, 'up');
  const ended: FactoryLevel = { ...raised, level: 'manual', raise: null };
  assert.equal(sessionOf({ ...up, level: 'manual', factories: [ended] }).kind, 'leaving');
});

test("a factory's words name a raise's end and the default after it, else whose default it is", () => {
  const now = new Date('2026-10-05T12:00:00.000Z');
  assert.equal(
    factoryWords(raised, false, now),
    `Raised until ${clockWord(new Date('2026-10-05T18:00:00.000Z'), now)}, then Manual (the store's).`,
  );
  assert.equal(
    factoryWords({ ...raised, level: 'semi-auto', own: 'semi-auto', default: 'semi-auto', raise: null }, false, now),
    'Semi-auto by default (its own).',
  );
  assert.equal(
    factoryWords({ ...raised, factory: 'default', level: 'manual', raise: null }, true, now),
    "Manual by default (the store's level, for runs in no factory).",
  );
});

test('each stretch a raise is offered for is digits and a unit the api reads, up to a week', () => {
  for (const word of RAISE_STRETCHES) assert.match(word, /^([1-9]\d*[mh]|[1-7]d)$/, word);
});

test('a session stopped from outside reads stopped, even while something still reaches it', () => {
  assert.equal(sessionOf({ ...up, stopped: true }).kind, 'stopped');
  assert.equal(sessionOf({ ...up, stopped: true, reach: [] }).kind, 'stopped');
  assert.match(sessionOf({ ...up, stopped: true }).words, /stopped from outside/i);
});

test('the phase is never read: any word there judges the same', () => {
  for (const phase of ['running', 'settled', 'whatever']) assert.equal(sessionOf({ ...up, phase }).kind, 'up', phase);
});

test('the levels are picked among lowest first, and a fresh session keeps her level above Manual, Semi-auto from Manual', () => {
  assert.deepEqual([...LEVELS], ['manual', 'semi-auto', 'auto']);
  assert.equal(freshLevel('auto'), 'auto', 'a fresh session at Auto stays at Auto');
  assert.equal(freshLevel('semi-auto'), 'semi-auto');
  assert.equal(freshLevel('manual'), 'semi-auto');
});

test('a factory is raised to each level over its default, lowest first, and to none over Auto', () => {
  assert.deepEqual([...raisesOver('manual')], ['semi-auto', 'auto']);
  assert.deepEqual([...raisesOver('semi-auto')], ['auto']);
  assert.equal(raisesOver('auto').length, 0);
});

test('her spend says one session or several, and names the unmeasured ones only when there are some', () => {
  assert.equal(spendWords({ usd: 0.5, measured: 1, unmeasured: 0 }), 'Spent $0.50 over 1 session ended; her open one counts once it ends.');
  assert.equal(
    spendWords({ usd: 2, measured: 2, unmeasured: 1 }),
    'Spent $2.00 over 2 sessions ended, 1 not measured; her open one counts once it ends.',
  );
  assert.equal(
    spendWords({ usd: 0.004, measured: 1, unmeasured: 0 }),
    'Spent $0.004 over 1 session ended; her open one counts once it ends.',
    'a spend under a cent keeps three figures',
  );
});

test('the prune words send a person to her, and spell no command', () => {
  assert.match(PRUNE_WORDS, /ask her/);
  assert.doesNotMatch(PRUNE_WORDS, /\bnemia [a-z]+/);
});

/** Every read answering `body` as JSON, with `status`, for the length of the test. */
function answering(t: { after: (fn: () => void) => void }, body: unknown, status = 200) {
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  t.after(() => {
    globalThis.fetch = before;
  });
}

const readLevel = levelQuery.queryFn as unknown as () => Promise<NemiaLevel>;
const readMemory = nemiaMemoryQuery.queryFn as unknown as () => Promise<NemiaMemory>;
const readFact = nemiaFactQuery('style').queryFn as unknown as () => Promise<NemiaMemory>;

test('her level reads back what the api answered, a key it does not read dropped', async (t) => {
  answering(t, { ...up, spend: { usd: 1, measured: 1, unmeasured: 0 }, allows: ['Bash(ls)'], later: true });
  assert.deepEqual(await readLevel(), { ...up, spend: { usd: 1, measured: 1, unmeasured: 0 }, allows: ['Bash(ls)'] });
});

test("each factory's level reads back; REFUSED: a factory at a level the board has no word for, and a row with no raise", async (t) => {
  answering(t, { ...up, factories: [raised] });
  assert.deepEqual((await readLevel()).factories, [raised]);
  answering(t, { ...up, factories: [{ ...raised, level: 'on' }] });
  await assert.rejects(readLevel(), (err: unknown) => err instanceof UnreadAnswer && /at factories\[0\]\.level/.test(err.message));
  const { raise: _raise, ...noRaise } = raised;
  answering(t, { ...up, factories: [noRaise] });
  await assert.rejects(
    readLevel(),
    (err: unknown) => err instanceof UnreadAnswer && /at factories\[0\]\.raise, the value is missing/.test(err.message),
  );
});

test('the line that trusts her folder reads back; REFUSED: an answer with no trust', async (t) => {
  answering(t, { ...up, trust: "cd '/store/nemia' && claude" });
  assert.equal((await readLevel()).trust, "cd '/store/nemia' && claude");
  const { trust: _trust, ...noTrust } = up;
  answering(t, noTrust);
  await assert.rejects(readLevel(), (err: unknown) => err instanceof UnreadAnswer && /at trust, the value is missing/.test(err.message));
});

test('REFUSED: a level the board has no word for, and an answer with no reach', async (t) => {
  answering(t, { ...up, level: 'on' });
  await assert.rejects(readLevel(), (err: unknown) => err instanceof UnreadAnswer && /at level/.test(err.message));
  const { reach: _reach, ...noReach } = up;
  answering(t, noReach);
  await assert.rejects(readLevel(), (err: unknown) => err instanceof UnreadAnswer && /at reach, the value is missing/.test(err.message));
});

test('her memory reads with no fact asked, and one fact with its words', async (t) => {
  answering(t, { dir: '/store/nemia/memory', facts: ['style', 'owner'], fact: null });
  assert.deepEqual(await readMemory(), { dir: '/store/nemia/memory', facts: ['style', 'owner'], fact: null });
  answering(t, { dir: '/store/nemia/memory', facts: ['style'], fact: { name: 'style', text: 'Short sentences.\n' } });
  assert.deepEqual((await readFact()).fact, { name: 'style', text: 'Short sentences.\n' });
});

test('a fact she no longer keeps is said at once, never tried again; any other failure is', () => {
  const retry = nemiaFactQuery('gone').retry as (failures: number, error: unknown) => boolean;
  assert.equal(retry(0, new ReadRefusal('no such fact', 404)), false);
  assert.equal(retry(0, new ReadRefusal('down', 500)), true);
  assert.equal(retry(3, new ReadRefusal('down', 500)), false, 'three tries, as by default');
});
