/**
 * The JSONL files another process writes beside an attached session (its asks, its answers) are decoded by their schema on read: a
 * line that does not parse, or parses to a shape the file never holds, is counted unread, never cast into a line the runtime acts on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { filesOf, openAsks } from '../src/harness/claude/attached-file.ts';
import * as attachedFile from '../src/harness/claude/attached-file.ts';

const QUESTION = { question: 'Which?', header: 'Pick', options: [{ label: 'a', description: 'A' }], multiSelect: false };

test('a bad line of an asks file is counted unread, and neither drops the good lines nor becomes an ask', () => {
  const root = scratch('ae-lines-');
  const file = filesOf(root, 'ae/t/1').asks;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [
    { id: 'good', at: '2026-01-01T00:00:00.000Z', questions: [QUESTION] },
    'not json',
    { id: 3, at: '2026-01-01T00:00:00.000Z', questions: [QUESTION] },
  ];
  fs.writeFileSync(file, `${lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n')}\n`);
  assert.deepEqual(
    openAsks(root, 'ae/t/1').map((a) => a.id),
    ['good'],
    'the good line read, the bad ones not acted on',
  );
  const read = attachedFile.askLinesOf(root, 'ae/t/1');
  assert.deepEqual([read.lines.map((l) => l.id), read.unread], [['good'], 2], 'two lines unread, counted');
});
