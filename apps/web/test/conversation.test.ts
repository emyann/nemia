/**
 * The one turn shape both of the board's conversations draw (`src/lib/conversation.ts`), which is pure: the data mark a family part
 * writes under the prefix its caller names, the map from a line's state to a trace line's, and the words a folded turn, a jump pill
 * and a new line say.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jumpWords, mark, newWords, traceStatusOf, turnWords, type ConversationState } from '../src/lib/conversation.ts';

test('a family part writes its mark under the prefix its caller names, so each conversation keeps the names its pages read', () => {
  assert.deepEqual(mark('chat', 'talk', 'latest'), { 'data-chat-talk': 'latest' });
  assert.deepEqual(mark('session', 'talk', 'latest'), { 'data-session-talk': 'latest' });
  assert.deepEqual(mark('chat', 'step', 'running'), { 'data-chat-step': 'running' });
  assert.deepEqual(mark('session', 'step', 'running'), { 'data-session-step': 'running' });
  assert.deepEqual(mark('chat', 'empty'), { 'data-chat-empty': true }, 'a mark with no value is what React writes for a bare one');
  assert.deepEqual(mark('session', 'jump'), { 'data-session-jump': true });
  assert.notDeepEqual(mark('session', 'talk', 'latest'), mark('chat', 'talk', 'latest'), 'two prefixes are two attributes');
});

test('a line draws in the state its own state maps to: done plain, and the one that waits on a person in the look’s own', () => {
  const states: ConversationState[] = ['done', 'running', 'error', 'pending', 'waits'];
  assert.deepEqual(
    states.map((state) => traceStatusOf(state)),
    [undefined, 'running', 'error', 'pending', 'yours'],
  );
  assert.notEqual(traceStatusOf('waits'), 'pending', 'a line that waits on a person is never drawn at rest');
});

test('the words the family says: a folded turn, the pill over the talk, and the line over what is new', () => {
  assert.equal(turnWords(134_000, 2), 'Worked for 2m 14s · 2 steps');
  assert.equal(turnWords(134_000, 1), 'Worked for 2m 14s · 1 step');
  assert.equal(jumpWords(2), '2 new · Jump to the latest');
  assert.equal(jumpWords(1), '1 new · Jump to the latest');
  assert.equal(newWords(2), '2 new');
  assert.equal(newWords(1), '1 new');
});
