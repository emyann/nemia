/**
 * Which turn of a session a try is, and that turn's span: read off the record's tries and the task's attempts. Pure: no disk, no engine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Run } from '../record/record.ts';
import { timeline, type AttemptClock, type TaskClock } from './timeline.ts';
import { answerWaitOf, turnOf, turnSpanOf, type TurnTry } from './turns.ts';
import type { TryCause } from '../retry/index.ts';

const MIN = 60_000;

/** An instant of the fixtures' day, at `hm`. */
const at = (hm: string) => `2026-10-06T${hm}:00.000Z`;

const BLOCKED = { outcome: 'blocked', summary: 'two flags could be meant', artifacts: [], needs: 'which flag?' };
const DONE = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** An attempt of `turn` spawned and ended at those times, having signed `closeout`; `ended` null for one still running. */
const attempt = (turn: number, spawned: string, ended: string | null, closeout?: object): AttemptClock => ({
  startedAt: at(spawned),
  spawnedAt: at(spawned),
  endedAt: ended ? at(ended) : null,
  reason: null,
  usage: null,
  ended: ended ? 'succeeded' : null,
  turn,
  ...(closeout ? { closeout } : {}),
});

/** Tries on task `T`, each replaced as `causes` says, then the current try on `current`. */
const tries = (causes: TryCause[], current = 'T'): TurnTry[] => [...causes.map((cause) => ({ taskId: 'T', cause })), { taskId: current }];

test('a try that answers an earlier try on its task is that many turns in', () => {
  assert.equal(turnOf(tries(['continue']), 1), 1);
  assert.equal(turnOf(tries(['continue', 'continue']), 2), 2);
  assert.equal(turnOf(tries(['continue']), 0), null, 'the try that filed the session is no turn of another');
});

test('REFUSED: a try a recheck reached, and one on a task of its own, are no turn; a recheck behind a turn is not counted in it', () => {
  assert.equal(turnOf(tries(['recheck']), 1), null, 'a recheck ran the check again, and no turn');
  const mixed = tries(['continue', 'recheck']);
  assert.equal(turnOf(mixed, 1), 1);
  assert.equal(turnOf(mixed, 2), null, 'the latest try behind it was replaced by a recheck');
  assert.equal(turnOf(tries(['recheck', 'continue']), 2), 1, 'the recheck behind it is no turn');
  assert.equal(turnOf(tries(['continue'], 'U'), 1), null, 'a task of its own');
});

test("a turn's span is the end of the turn before it, its own first spawn and its last end; a turn the runtime skipped has none", () => {
  const attempts = [
    attempt(0, '10:00', '10:05', BLOCKED),
    attempt(1, '10:10', '10:12'),
    attempt(1, '10:13', '10:20', DONE),
    attempt(3, '10:30', '10:40'),
  ];
  assert.deepEqual(turnSpanOf(attempts, 1, true), {
    asked: true,
    heldFrom: at('10:05'),
    spawnedAt: at('10:10'),
    endedAt: at('10:20'),
  });
  assert.deepEqual(turnSpanOf(attempts, 3, true), {
    asked: false,
    heldFrom: at('10:20'),
    spawnedAt: at('10:30'),
    endedAt: at('10:40'),
  });
  const none = { asked: false, heldFrom: null, spawnedAt: null, endedAt: null };
  assert.deepEqual(turnSpanOf(attempts, 2, true), none, 'two answers raced, and one turn heard both');
  assert.deepEqual(turnSpanOf([], 1, true), none);
});

test("REFUSED: the last turn of a task not over has no end, though an attempt of it ended; an earlier turn's end stands", () => {
  const attempts = [attempt(0, '10:00', '10:05'), attempt(1, '10:10', '10:12')];
  assert.equal(turnSpanOf(attempts, 1, false).endedAt, null);
  assert.equal(turnSpanOf(attempts, 1, true).endedAt, at('10:12'));
  assert.equal(turnSpanOf([...attempts, attempt(2, '10:20', null)], 1, false).endedAt, at('10:12'));
});

test('a session that signed off blocked twice and was answered twice: what it ran and what it waited on answers add up to its first spawn to its last end', () => {
  const run = {
    id: 'r-1',
    createdAt: at('09:59'),
    steps: {
      ask: {
        taskId: 'T',
        tries: [
          { taskId: 'T', cause: 'continue' },
          { taskId: 'T', cause: 'continue' },
        ],
      },
    },
  } as unknown as Run;
  const view: TaskClock = {
    phase: 'input-required',
    state: {
      brief: 'Do it.',
      settled: null,
      attempts: [attempt(0, '10:00', '10:05', BLOCKED), attempt(1, '10:11', '10:20', BLOCKED), attempt(2, '10:24', '10:30', DONE)],
    },
  };
  const [one, two, three] = timeline(run, new Map([['T', view]])).steps.ask;
  assert.equal(one.turn, undefined, 'the try that filed the session carries no turn');
  assert.deepEqual([one.sessionOf, two.sessionOf, three.sessionOf], [null, 1, 1]);
  assert.deepEqual([answerWaitOf(one), answerWaitOf(two), answerWaitOf(three)], [null, 6 * MIN, 4 * MIN]);
  assert.equal(one.session!.ranMs! + answerWaitOf(two)! + answerWaitOf(three)!, 30 * MIN);
  assert.equal(three.turn!.endedAt, at('10:30'));
});

test('REFUSED: a turn that answers no blocked sign-off waited on no answer: work sent back from a gate, and a turn with a time missing', () => {
  const sentBack = [attempt(0, '10:00', '10:05', DONE), attempt(1, '10:11', '10:20', DONE)];
  const back = turnSpanOf(sentBack, 1, true);
  assert.deepEqual(back, { asked: false, heldFrom: at('10:05'), spawnedAt: at('10:11'), endedAt: at('10:20') });
  assert.equal(answerWaitOf({ turn: back }), null, 'the turn before signed off done: the wait was at its gate');
  const answered = turnSpanOf([attempt(0, '10:00', '10:05', BLOCKED), sentBack[1]], 1, true);
  assert.equal(answerWaitOf({ turn: answered }), 6 * MIN, 'the same clock, after a blocked sign-off');
  assert.equal(turnSpanOf([attempt(0, '10:00', '10:05'), sentBack[1]], 1, true).asked, false, 'a turn that signed nothing asked nothing');
  assert.equal(turnSpanOf([attempt(0, '10:00', '10:05', ['blocked']), sentBack[1]], 1, true).asked, false, 'a closeout that does not read');
  assert.equal(answerWaitOf({ turn: { ...answered, heldFrom: null } }), null);
  assert.equal(answerWaitOf({ turn: { ...answered, spawnedAt: null } }), null);
  assert.equal(answerWaitOf({}), null);
});
