/**
 * Which turn of a session a try is, and that turn's span: read off the record's tries and the task's attempts. Pure: no disk, no engine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Run } from '../record/record.ts';
import { timeline, type AttemptClock, type TaskClock } from './timeline.ts';
import { answerWaitOf, turnOf, turnSpanOf, type TurnTry } from './turns.ts';

const MIN = 60_000;

/** An instant of the fixtures' day, at `hm`. */
const at = (hm: string) => `2026-10-06T${hm}:00.000Z`;

/** An attempt of `turn` spawned and ended at those times; `ended` null for one still running. */
const attempt = (turn: number, spawned: string, ended: string | null): AttemptClock => ({
  startedAt: at(spawned),
  spawnedAt: at(spawned),
  endedAt: ended ? at(ended) : null,
  reason: null,
  usage: null,
  ended: ended ? 'done' : null,
  turn,
});

/** Tries on task `T`, each replaced as `thens` says, then the current try on `current`. */
const tries = (thens: string[], current = 'T'): TurnTry[] => [...thens.map((then) => ({ taskId: 'T', then })), { taskId: current }];

test('a try that answers an earlier try on its task is that many turns in, and says what replaced the try it answers', () => {
  assert.deepEqual(turnOf(tries(['nudge']), 1), { turn: 1, after: 'nudge' });
  assert.deepEqual(turnOf(tries(['nudge', 'back']), 2), { turn: 2, after: 'back' });
  assert.equal(turnOf(tries(['nudge']), 0), null, 'the try that filed the session is no turn of another');
});

test('REFUSED: a try a recheck reached, and one on a task of its own, are no turn; a recheck behind a turn is not counted in it', () => {
  assert.equal(turnOf(tries(['recheck']), 1), null, 'a recheck ran the check again, and no turn');
  const mixed = tries(['nudge', 'recheck']);
  assert.deepEqual(turnOf(mixed, 1), { turn: 1, after: 'nudge' });
  assert.equal(turnOf(mixed, 2), null, 'the latest try behind it was replaced by a recheck');
  assert.deepEqual(turnOf(tries(['recheck', 'nudge']), 2), { turn: 1, after: 'nudge' }, 'the recheck behind it is no turn');
  assert.equal(turnOf(tries(['nudge'], 'U'), 1), null, 'a task of its own');
});

test("a turn's span is the end of the turn before it, its own first spawn and its last end; a turn the runtime skipped has none", () => {
  const attempts = [attempt(0, '10:00', '10:05'), attempt(1, '10:10', '10:12'), attempt(1, '10:13', '10:20'), attempt(3, '10:30', '10:40')];
  assert.deepEqual(turnSpanOf(attempts, 1, 'nudge', true), {
    after: 'nudge',
    heldFrom: at('10:05'),
    spawnedAt: at('10:10'),
    endedAt: at('10:20'),
  });
  assert.deepEqual(turnSpanOf(attempts, 3, 'nudge', true), {
    after: 'nudge',
    heldFrom: at('10:20'),
    spawnedAt: at('10:30'),
    endedAt: at('10:40'),
  });
  const none = { after: 'nudge', heldFrom: null, spawnedAt: null, endedAt: null };
  assert.deepEqual(turnSpanOf(attempts, 2, 'nudge', true), none, 'two answers raced, and one turn heard both');
  assert.deepEqual(turnSpanOf([], 1, 'nudge', true), none);
});

test("REFUSED: the last turn of a task not over has no end, though an attempt of it ended; an earlier turn's end stands", () => {
  const attempts = [attempt(0, '10:00', '10:05'), attempt(1, '10:10', '10:12')];
  assert.equal(turnSpanOf(attempts, 1, 'nudge', false).endedAt, null);
  assert.equal(turnSpanOf(attempts, 1, 'nudge', true).endedAt, at('10:12'));
  assert.equal(turnSpanOf([...attempts, attempt(2, '10:20', null)], 1, 'nudge', false).endedAt, at('10:12'));
});

test('a session answered twice by nudges: what it ran and what it waited on answers add up to its first spawn to its last end', () => {
  const run = {
    id: 'r-1',
    createdAt: at('09:59'),
    steps: {
      ask: {
        taskId: 'T',
        tries: [
          { taskId: 'T', then: 'nudge' },
          { taskId: 'T', then: 'nudge' },
        ],
      },
    },
  } as unknown as Run;
  const view: TaskClock = {
    phase: 'input-required',
    state: {
      brief: 'Do it.',
      settled: null,
      attempts: [attempt(0, '10:00', '10:05'), attempt(1, '10:11', '10:20'), attempt(2, '10:24', '10:30')],
    },
  };
  const [one, two, three] = timeline(run, new Map([['T', view]])).steps.ask;
  assert.equal(one.turn, undefined, 'the try that filed the session carries no turn');
  assert.deepEqual([one.sessionOf, two.sessionOf, three.sessionOf], [null, 1, 1]);
  assert.deepEqual([answerWaitOf(one), answerWaitOf(two), answerWaitOf(three)], [null, 6 * MIN, 4 * MIN]);
  assert.equal(one.session!.ranMs! + answerWaitOf(two)! + answerWaitOf(three)!, 30 * MIN);
  assert.equal(three.turn!.endedAt, at('10:30'));
});

test('REFUSED: only a turn a nudge started waited on an answer: work sent back with words, and a turn with a time missing, give none', () => {
  const span = { after: 'nudge', heldFrom: at('10:05'), spawnedAt: at('10:11'), endedAt: at('10:20') };
  assert.equal(answerWaitOf({ turn: span }), 6 * MIN);
  assert.equal(answerWaitOf({ turn: { ...span, after: 'back' } }), null);
  assert.equal(answerWaitOf({ turn: { ...span, after: 'retries' } }), null);
  assert.equal(answerWaitOf({ turn: { ...span, heldFrom: null } }), null);
  assert.equal(answerWaitOf({ turn: { ...span, spawnedAt: null } }), null);
  assert.equal(answerWaitOf({}), null);
});
