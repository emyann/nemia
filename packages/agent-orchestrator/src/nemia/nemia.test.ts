/**
 * Nemia's machine, pure: what the keeper owes at each state, a task stopped from outside never filed again, a level that is none refused
 * her diagram drawing each edge and each verb, and her settings turning the daemon's start off.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WAKE, sortLine } from '../subscription/subscription.ts';
import { DEMAND_OFF } from '../demand/demand.ts';
import {
  NEMIA_WAKE,
  customChanged,
  levelRefusal,
  nemiaDiagram,
  nemiaDue,
  nemiaGraph,
  nemiaSettings,
  nemiaState,
  nemiaTaskId,
  toldCustom,
  type HerSubscription,
  type HerTask,
  type Keeping,
} from './nemia.ts';

const SEMI: Keeping = { above: true, task: 'nemia-1' };
const MANUAL: Keeping = { above: false, task: 'nemia-1' };
const HERS: HerSubscription = { task: 'nemia-1', scoped: true };
const OLDER: HerSubscription = { task: 'nemia-0', scoped: true };
const UNSCOPED: HerSubscription = { task: 'nemia-1', scoped: false };
const OPEN: HerTask = { settled: false, stopRequested: false };
const SETTLED: HerTask = { settled: true, stopRequested: false };
const STOPPING: HerTask = { settled: false, stopRequested: true };

test('the keeper owes a filing, then a subscription, then nothing, while some factory is above manual', () => {
  assert.deepEqual(nemiaDue(SEMI, undefined, undefined), ['file']);
  assert.deepEqual(nemiaDue(SEMI, OPEN, undefined), ['subscribe']);
  assert.deepEqual(nemiaDue(SEMI, OPEN, HERS), []);
  assert.equal(nemiaState(SEMI, OPEN, HERS), 'kept');
  assert.deepEqual(nemiaDue(SEMI, OPEN, OLDER), ['drop', 'subscribe'], 'a subscription left for an older task is put again');
});

test('the keeper tells her a changed custom instruction while she is kept, and in no other state', () => {
  const STALE: Keeping = { ...SEMI, stale: true };
  assert.deepEqual(nemiaDue(STALE, OPEN, HERS), ['tell']);
  assert.deepEqual(nemiaDue({ ...SEMI, stale: false }, OPEN, HERS), [], 'her filed words are the ones that compose now');
  assert.deepEqual(nemiaDue(STALE, OPEN, undefined), ['subscribe'], 'filed: subscribed first, told on a later beat');
  assert.deepEqual(nemiaDue(STALE, OPEN, OLDER), ['drop', 'subscribe']);
  assert.deepEqual(nemiaDue(STALE, undefined, undefined), ['file'], 'due: filed with the words that compose now');
  for (const task of [SETTLED, STOPPING]) assert.deepEqual(nemiaDue(STALE, task, HERS), ['drop'], 'stopped: nothing to tell');
  assert.deepEqual(nemiaDue({ ...MANUAL, stale: true }, OPEN, HERS), ['stop', 'drop'], 'leaving: stopped, not told');
});

test("REFUSED: the keeper delivers the person's chat words only while she is kept and her session is live", () => {
  const OWED = { ...SEMI, owed: true, up: true };
  assert.deepEqual(nemiaDue(OWED, OPEN, HERS), ['deliver']);
  assert.deepEqual(nemiaDue({ ...OWED, stale: true }, OPEN, HERS), ['tell', 'deliver'], 'told first, then delivered');
  assert.deepEqual(nemiaDue({ ...OWED, up: false }, OPEN, HERS), [], 'kept but down: kept for later');
  assert.deepEqual(nemiaDue({ ...OWED, owed: false }, OPEN, HERS), [], 'nothing owed');
  assert.deepEqual(nemiaDue(OWED, OPEN, undefined), ['subscribe'], 'filed: not yet kept');
  assert.deepEqual(nemiaDue({ ...OWED, trusted: false }, undefined, undefined), [], 'untrusted');
  assert.deepEqual(nemiaDue({ ...MANUAL, owed: true, up: true }, OPEN, HERS), ['stop', 'drop'], 'leaving');
});

test('her custom words changed are those she was not last filed or told with; her shipped instruction is never compared', () => {
  const FILED = 'Her shipped instruction.\n\nAnswer in French.\n';
  assert.equal(customChanged({ words: 'Answer in French.' }, 'Answer in French.', 'Another instruction.\n'), false);
  assert.equal(customChanged({ words: 'Answer in French.' }, 'Answer in Dutch.', FILED), true);
  assert.equal(customChanged({ words: 'Answer in French.' }, undefined, FILED), true, 'removed: told');
  assert.equal(customChanged({}, 'Answer in French.', FILED), true, 'added: told');
  assert.equal(customChanged({}, undefined, 'Another instruction.\n\nOnce a paragraph of hers.\n'), false);
  assert.equal(customChanged(undefined, 'Answer in French.', FILED), false, 'no record: her instruction ends with them');
  assert.equal(customChanged(undefined, 'Answer in Dutch.', FILED), true, 'no record: it ends with others');
  assert.equal(customChanged(undefined, 'Answer in Dutch.', undefined), true, 'no record and no instruction');
  assert.equal(customChanged(undefined, undefined, FILED), false, 'no record: whether she had words is unknown, so no removal');
});

test("the words that tell her a change carry the person's new words whole, or say she has none", () => {
  const told = toldCustom('Answer in French.\nTimes in Montreal.');
  assert.ok(told.includes('Answer in French.\nTimes in Montreal.'), told);
  assert.match(told, /replac/);
  const cleared = toldCustom(undefined);
  assert.match(cleared, /removed/);
  assert.match(cleared, /none/);
});

test('REFUSED: a subscription of hers without her floor is no keeping; it is dropped and put again with it', () => {
  assert.equal(nemiaState(SEMI, OPEN, UNSCOPED), 'filed');
  assert.deepEqual(nemiaDue(SEMI, OPEN, UNSCOPED), ['drop', 'subscribe']);
});

test('REFUSED: a task stopped or ended from outside is never filed again at semi-auto; a subscription left is dropped', () => {
  for (const task of [SETTLED, STOPPING]) {
    assert.equal(nemiaState(SEMI, task, undefined), 'stopped');
    assert.deepEqual(nemiaDue(SEMI, task, undefined), []);
    assert.deepEqual(nemiaDue(SEMI, task, HERS), ['drop']);
  }
});

test('with no factory above manual, her open task is stopped and her subscription dropped; with neither, nothing is owed', () => {
  assert.deepEqual(nemiaDue(MANUAL, OPEN, HERS), ['stop', 'drop']);
  assert.equal(nemiaState(MANUAL, OPEN, HERS), 'leaving');
  assert.deepEqual(nemiaDue(MANUAL, STOPPING, HERS), ['drop'], 'a stop asked is not asked again');
  assert.deepEqual(nemiaDue(MANUAL, SETTLED, undefined), []);
  assert.deepEqual(nemiaDue({ above: false }, undefined, undefined), [], 'no level set is manual');
  assert.equal(nemiaState({ above: false }, undefined, undefined), 'off');
});

test('REFUSED: no task is filed while her folder is not trusted; once it is, or for a harness that keeps no trust, she is filed', () => {
  const UNTRUSTED: Keeping = { ...SEMI, trusted: false };
  assert.equal(nemiaState(UNTRUSTED, undefined, undefined), 'untrusted');
  assert.deepEqual(nemiaDue(UNTRUSTED, undefined, undefined), [], 'her session waits for the person to trust her folder');
  assert.deepEqual(nemiaDue(UNTRUSTED, undefined, OLDER), [], 'nothing owed while she waits');
  assert.deepEqual(nemiaDue({ ...SEMI, trusted: true }, undefined, undefined), ['file']);
  assert.deepEqual(nemiaDue(SEMI, undefined, undefined), ['file'], 'a harness that keeps no trust');
  assert.equal(nemiaState(UNTRUSTED, OPEN, undefined), 'filed', 'trust lost later never stops a running session');
  assert.equal(nemiaState(UNTRUSTED, OPEN, HERS), 'kept');
  assert.equal(nemiaState({ above: false, trusted: false }, undefined, undefined), 'off', 'manual: nothing waits');
});

test('REFUSED: a word that is no level; manual, semi-auto and auto are levels', () => {
  assert.equal(levelRefusal('manual'), undefined);
  assert.equal(levelRefusal('semi-auto'), undefined);
  assert.equal(levelRefusal('auto'), undefined);
  assert.equal(levelRefusal('on'), '"on" is no level: nemia level [manual|semi-auto|auto] [--factory <name> [--for <duration> | --end]].');
});

test("her task's id is nemia- and the digits of the moment a factory was put above manual", () => {
  assert.equal(nemiaTaskId('2026-10-05T16:27:03.120Z'), 'nemia-20261005162703120');
});

test('her diagram draws every edge and each verb from every state it is taken from', () => {
  const graph = nemiaGraph();
  const drawn = nemiaDiagram(graph).split('\n');
  assert.equal(drawn[0], 'stateDiagram-v2');
  for (const e of graph.edges) assert.ok(drawn.includes(`  ${e.from} --> ${e.to}: ${e.event} / ${e.action}`), e.event);
  for (const v of graph.verbs)
    for (const from of v.from) assert.ok(drawn.includes(`  ${from} --> ${v.to}: ${v.verb} [${v.guard}] (by ${v.by})`), v.verb);
  assert.deepEqual(
    graph.verbs.map((v) => v.verb),
    ['level (a factory above manual)', 'level (none above manual)', 'agents custom nemia (set or clear)'],
  );
  assert.ok(drawn.includes('  kept --> kept: CUSTOM_CHANGED / tell'));
  assert.ok(drawn.includes('  untrusted --> due: FOLDER_TRUSTED / nothing'));
  assert.ok(
    graph.verbs.every((v) => v.guard === 'always'),
    'no verb of the person asks her folder trusted',
  );
});

test("a step's denied calls wake her, and only her: the default wake words leave them to the digest", () => {
  const line = { at: '2026-10-05T16:00:00.000Z', run: 'r-1', step: 'build', word: 'running', note: 'denied: Bash(git push) ×1 · try 2' };
  assert.equal(sortLine(line, NEMIA_WAKE), 'wake');
  assert.equal(sortLine(line, DEFAULT_WAKE), 'routine');
});

test('a nemia she types starts no daemon beside the one that keeps her, with a bin of its own or none', () => {
  const rules = { ask: ['Bash(nemia cancel:*)'], deny: [] };
  assert.deepEqual(JSON.parse(nemiaSettings(rules, undefined, '/usr/bin')).env, { [DEMAND_OFF]: 'off' });
  assert.deepEqual(JSON.parse(nemiaSettings(rules, '/srv/nemia/bin', '/usr/bin:/srv/nemia/bin')).env, {
    [DEMAND_OFF]: 'off',
    PATH: '/srv/nemia/bin:/usr/bin',
  });
});
