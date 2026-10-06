/**
 * Nemia's machine, pure: what the keeper owes at each state, a task stopped from outside never filed again, a level that is none refused
 * and `auto` named as to come, and her diagram drawing each edge and each verb.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WAKE, sortLine } from '../subscription/subscription.ts';
import {
  NEMIA_WAKE,
  levelRefusal,
  nemiaDiagram,
  nemiaDue,
  nemiaGraph,
  nemiaState,
  nemiaTaskId,
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

test('REFUSED: a word that is no level, and auto, named as to come; manual and semi-auto are levels', () => {
  assert.equal(levelRefusal('manual'), undefined);
  assert.equal(levelRefusal('semi-auto'), undefined);
  assert.match(levelRefusal('auto') ?? '', /^auto is not built yet: .*slice 6.*nemia level \[manual\|semi-auto\] \[--factory <name> \[--for <duration> \| --end\]\]\.$/);
  assert.equal(levelRefusal('on'), '"on" is no level: nemia level [manual|semi-auto] [--factory <name> [--for <duration> | --end]].');
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
    ['level (a factory above manual)', 'level (none above manual)'],
  );
});

test("a step's denied calls wake her, and only her: the default wake words leave them to the digest", () => {
  const line = { at: '2026-10-05T16:00:00.000Z', run: 'r-1', step: 'build', word: 'running', note: 'denied: Bash(git push) ×1 · try 2' };
  assert.equal(sortLine(line, NEMIA_WAKE), 'wake');
  assert.equal(sortLine(line, DEFAULT_WAKE), 'routine');
});
