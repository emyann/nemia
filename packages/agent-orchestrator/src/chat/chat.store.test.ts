/**
 * The chat's files: none reads as empty, each append reads back in order, a last line still being written is left out, a line that does
 * not decode is refused naming the file and the line, and the read mark is written whole and read back.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratch } from '../../test/scratch.ts';
import {
  appendDelivered,
  appendOutbox,
  deliveredFile,
  outboxFile,
  readDelivered,
  readMarkFile,
  readOutbox,
  readReadMark,
  writeReadMark,
} from './chat.store.ts';

test('no file reads as empty, and what is appended reads back in order', () => {
  const dir = scratch('wf-chat-store-');
  assert.deepEqual([readOutbox(dir), readDelivered(dir), readReadMark(dir)], [[], [], undefined]);
  appendOutbox(dir, { id: 'o1', at: '2026-10-15T12:00:00.000Z', text: 'one' });
  appendOutbox(dir, { id: 'o2', at: '2026-10-15T12:00:01.000Z', text: 'two\nlines' });
  appendDelivered(dir, { id: 'o1', said: '2026-10-15T12:00:02.000Z', attempt: 1 });
  writeReadMark(dir, { through: 'm:1:a', at: '2026-10-15T12:00:03.000Z' });
  writeReadMark(dir, { through: 'm:1:b', at: '2026-10-15T12:00:04.000Z' });
  assert.deepEqual(
    readOutbox(dir).map((e) => e.text),
    ['one', 'two\nlines'],
  );
  assert.deepEqual(readDelivered(dir), [{ id: 'o1', said: '2026-10-15T12:00:02.000Z', attempt: 1 }]);
  assert.deepEqual(readReadMark(dir), { through: 'm:1:b', at: '2026-10-15T12:00:04.000Z' });
});

test('a last line not yet ended is left out, as an append still being written', () => {
  const dir = scratch('wf-chat-store-');
  appendOutbox(dir, { id: 'o1', at: '2026-10-15T12:00:00.000Z', text: 'one' });
  fs.appendFileSync(outboxFile(dir), '{"id":"o2","at":"2026-10');
  assert.deepEqual(
    readOutbox(dir).map((e) => e.id),
    ['o1'],
  );
});

test('REFUSED: a line that does not decode, or a read mark that is none, naming the file and the line', () => {
  const dir = scratch('wf-chat-store-');
  appendDelivered(dir, { id: 'o1', said: '2026-10-15T12:00:02.000Z', attempt: 1 });
  fs.appendFileSync(deliveredFile(dir), '{"id":"o2"}\n');
  assert.throws(
    () => readDelivered(dir),
    (err: Error) => err.message.startsWith(`${deliveredFile(dir)}:2 is not a line of the chat's record`),
  );
  fs.writeFileSync(readMarkFile(dir), 'not json');
  assert.throws(
    () => readReadMark(dir),
    (err: Error) => err.message.startsWith(`${readMarkFile(dir)} is not a line`),
  );
});
