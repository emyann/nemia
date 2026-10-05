/**
 * Nemia on the board: her session's state judged from the orchestrator's facts (`sessionOf`), the level the switch writes, her spend in
 * words, and the mirror of what the api answers of her, which decodes her level and memory and refuses an answer it does not read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadRefusal, UnreadAnswer } from '../src/lib/api/read.ts';
import { levelQuery, nemiaFactQuery, nemiaMemoryQuery, type NemiaLevel, type NemiaMemory } from '../src/lib/api/nemia.ts';
import { offeredLevel, PRUNE_WORDS, sessionOf, spendWords } from '../src/lib/nemia.ts';

/** Where she is, as the api answers it: off, never set, unless `over` says otherwise. */
const nemiaLevel = (over: Partial<NemiaLevel> = {}): NemiaLevel => ({
  level: 'manual',
  since: null,
  task: null,
  phase: null,
  sessionId: null,
  reach: [],
  stopped: false,
  spend: null,
  allows: [],
  ...over,
});

/** Her session up: Semi-auto, filed and reached. */
const up = nemiaLevel({
  level: 'semi-auto',
  since: '2026-10-05T12:00:00.000Z',
  task: 'nemia-1',
  phase: 'running',
  sessionId: '0123456789abcdef',
  reach: ['attach 01234567', 'or the web link her session shows once its bridge is up, from a phone too'],
});

test('her session reads off with no task, not filed with no phase, starting while nothing reaches it, and up once something does', () => {
  assert.equal(sessionOf(nemiaLevel()).kind, 'off');
  assert.equal(sessionOf(nemiaLevel({ level: 'semi-auto', task: 'nemia-1' })).kind, 'not-filed');
  assert.equal(sessionOf({ ...up, reach: [], sessionId: null }).kind, 'starting');
  assert.equal(sessionOf(up).kind, 'up');
  assert.match(sessionOf(nemiaLevel({ level: 'semi-auto', task: 'nemia-1' })).words, /^Not filed yet: the keeper files her session/);
});

test('Manual asked of a session still reached reads leaving, and off once nothing reaches it', () => {
  assert.equal(sessionOf({ ...up, level: 'manual' }).kind, 'leaving');
  assert.equal(sessionOf({ ...up, level: 'manual', reach: [] }).kind, 'off');
});

test('a session stopped from outside reads stopped, even while something still reaches it', () => {
  assert.equal(sessionOf({ ...up, stopped: true }).kind, 'stopped');
  assert.equal(sessionOf({ ...up, stopped: true, reach: [] }).kind, 'stopped');
  assert.match(sessionOf({ ...up, stopped: true }).words, /stopped from outside/i);
});

test('the phase is never read: any word there judges the same', () => {
  for (const phase of ['running', 'settled', 'whatever'])
    assert.equal(sessionOf({ ...up, phase }).kind, 'up', phase);
});

test('the switch offers Manual from Semi-auto, and Semi-auto from Manual', () => {
  assert.equal(offeredLevel({ level: 'semi-auto' }), 'manual');
  assert.equal(offeredLevel({ level: 'manual' }), 'semi-auto');
});

test('her spend says one session or several, and names the unmeasured ones only when there are some', () => {
  assert.equal(
    spendWords({ usd: 0.5, measured: 1, unmeasured: 0 }),
    'Spent $0.50 over 1 session ended; her open one counts once it ends.',
  );
  assert.equal(
    spendWords({ usd: 2, measured: 2, unmeasured: 1 }),
    'Spent $2.00 over 2 sessions ended, 1 not measured; her open one counts once it ends.',
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

test('REFUSED: a level the board has no word for, and an answer with no reach', async (t) => {
  answering(t, { ...up, level: 'auto' });
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
