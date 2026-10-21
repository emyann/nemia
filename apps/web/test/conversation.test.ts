/**
 * The one turn shape both of the board's conversations draw (`src/lib/conversation.ts`), which is pure: the data mark a family part
 * writes under the prefix its caller names, the map from a line's state to a trace line's, the words a folded turn, a jump pill and a
 * new line say, and how much of a conversation is drawn, which is what a talk follows its latest by.
 *
 * And the one rule every part of `components/conversation` keeps, read off its files: a part names no conversation itself, so each
 * conversation's pages keep their names and a step's session is never drawn under hers. Only `Worked` can be rendered by Node — the
 * family's other parts reach the look's door, which Node refuses — so they are held to it here, by their text, and so are the three
 * parts of a step's session that stand in the folder until S6.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  drawnCount,
  jumpWords,
  mark,
  newWords,
  traceStatusOf,
  turnWords,
  type ConversationItem,
  type ConversationState,
} from '../src/lib/conversation.ts';

/** The family's own folder. */
const FAMILY = path.join(import.meta.dirname, '..', 'src', 'components', 'conversation');

/**
 * Every data mark in `source` that names a conversation of its own: a part writes each through `mark`, under the prefix its caller
 * hands over, so a literal `data-chat-…` or `data-session-…` in one of them is the rule broken. A mark that is no conversation's —
 * the band's bare `data-band`, the look's `data-cut-ring` — is none.
 */
export const namedMarks = (source: string): string[] => source.match(/data-(?:chat|session)-[\w-]*/g) ?? [];

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

test('REFUSED: a family part that names a conversation itself; a mark built from the caller’s prefix, and one of neither, are not', () => {
  assert.deepEqual(namedMarks('<div data-chat-talk="latest" />'), ['data-chat-talk']);
  assert.deepEqual(namedMarks("<Trace {...mark('session', 'turn', 'running')} />"), []);
  assert.deepEqual(namedMarks('<div data-session-step={line.state} />'), ['data-session-step']);
  assert.deepEqual(namedMarks('<div data-band={what} data-cut-ring marks="chat" />'), [], 'a mark that is no conversation’s');
  assert.deepEqual(namedMarks("{...mark(marks, 'talk', atEnd ? 'latest' : 'back')}"), []);

  const parts = fs
    .readdirSync(FAMILY)
    .filter((name) => name.endsWith('.tsx') && !name.endsWith('.stories.tsx'))
    .sort();
  assert.deepEqual(
    parts,
    [
      'Composer.tsx',
      'Conversation.tsx',
      'ConversationBand.tsx',
      'Jump.tsx',
      'PromptBox.tsx',
      'Said.tsx',
      'Talk.tsx',
      'Turns.tsx',
      'Worked.tsx',
    ],
    'the folder is read off the tree, so a part added to it is held to the rule too; the last three are a step’s own until S6',
  );
  for (const part of parts)
    assert.deepEqual(
      namedMarks(fs.readFileSync(path.join(FAMILY, part), 'utf8')),
      [],
      `${part} names a conversation of its own, where every mark of a family part is the caller’s`,
    );
});

test('a talk follows its latest by how much is drawn, which a turn grows a line at a time without growing the items', () => {
  const said = (id: string): ConversationItem => ({
    kind: 'said',
    id,
    who: 'You',
    at: '',
    text: '',
    markdown: false,
    yours: true,
    links: [],
  });
  const work = (lines: number): ConversationItem => ({
    kind: 'work',
    id: 'w:1',
    running: true,
    ms: 0,
    lines: Array.from({ length: lines }, (_, i) => ({ id: `l:${i}`, tool: 'Read', sentence: '', state: 'done' as const })),
  });
  const [before, after] = [
    [said('p:1'), work(1)],
    [said('p:1'), work(9)],
  ];
  assert.equal(before.length, after.length, 'a turn of one line and a turn of nine are one item either way');
  assert.equal(drawnCount(before), 2);
  assert.equal(drawnCount(after), 10, 'and what is drawn grows with every line of it');
  assert.deepEqual(drawnCount([]), 0);
  assert.equal(drawnCount([said('p:1'), { kind: 'note', id: 'n:1', what: 'session', words: '' }]), 2, 'anything else counts as one');

  const talk = fs.readFileSync(path.join(FAMILY, 'Talk.tsx'), 'utf8');
  assert.match(talk, /const drawn = drawnCount\(items\);/, 'and the talk follows its latest by that number');
  assert.doesNotMatch(
    talk,
    /items\.length/,
    'never by the count of its items: a turn grows a line at a time without growing them, and the talk would stand still for every line after the first',
  );
});
