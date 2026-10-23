/**
 * The chat's files: none reads as empty, each append reads back in order, a last line still being written is left out, a line that does
 * not decode is refused naming the file and the line, and the read mark is written whole and read back: one table, each row on a
 * folder of its own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { names } from '../../test/assessed.ts';
import {
  appendDelivered,
  appendOutbox,
  appendStop,
  deliveredFile,
  outboxFile,
  readDelivered,
  readMarkFile,
  readOutbox,
  readReadMark,
  readStops,
  stopsFile,
  writeReadMark,
} from './chat.store.ts';

/** That `read` refuses, naming the file and line `at`. */
const refused = (read: () => unknown, at: string) =>
  assert.throws(read, (err: Error) => {
    names(err.message, at);
    assert.ok(err.message.startsWith(at), err.message);
    return true;
  });

test("the chat's files: read back in order, a last line still being written left out, and a line that does not decode refused", async (t) => {
  await t.test('no file reads as empty, and what is appended reads back in order', () => {
    const dir = scratch('wf-chat-store-');
    assert.deepEqual([readOutbox(dir), readDelivered(dir), readStops(dir), readReadMark(dir)], [[], [], [], undefined]);
    appendOutbox(dir, { id: 'o1', at: '2026-10-15T12:00:00.000Z', text: 'one' });
    appendOutbox(dir, { id: 'o2', at: '2026-10-15T12:00:01.000Z', text: 'two\nlines' });
    appendDelivered(dir, { id: 'o1', said: '2026-10-15T12:00:02.000Z', attempt: 1 });
    appendStop(dir, { at: '2026-10-15T12:00:05.000Z', attempt: 1 });
    appendStop(dir, { at: '2026-10-15T12:00:06.000Z', attempt: 2 });
    writeReadMark(dir, { through: 'm:1:a', at: '2026-10-15T12:00:03.000Z' });
    writeReadMark(dir, { through: 'm:1:b', at: '2026-10-15T12:00:04.000Z' });
    assert.deepEqual(
      readOutbox(dir).map((e) => e.text),
      ['one', 'two\nlines'],
    );
    assert.deepEqual(readDelivered(dir), [{ id: 'o1', said: '2026-10-15T12:00:02.000Z', attempt: 1 }]);
    assert.deepEqual(readReadMark(dir), { through: 'm:1:b', at: '2026-10-15T12:00:04.000Z' });
    assert.deepEqual(readStops(dir), [
      { at: '2026-10-15T12:00:05.000Z', attempt: 1 },
      { at: '2026-10-15T12:00:06.000Z', attempt: 2 },
    ]);
  });
  await t.test('a last line not yet ended is left out, as an append still being written', () => {
    const dir = scratch('wf-chat-store-');
    appendOutbox(dir, { id: 'o1', at: '2026-10-15T12:00:00.000Z', text: 'one' });
    fs.appendFileSync(outboxFile(dir), '{"id":"o2","at":"2026-10');
    assert.deepEqual(
      readOutbox(dir).map((e) => e.id),
      ['o1'],
    );
  });
  await t.test('REFUSED: a stop line that does not decode, naming the file and the line — never read as saying nothing', () => {
    const dir = scratch('wf-chat-store-');
    appendStop(dir, { at: '2026-10-15T12:00:05.000Z', attempt: 1 });
    fs.appendFileSync(stopsFile(dir), '{"at":"2026-10-15T12:00:07.000Z"}\n');
    refused(() => readStops(dir), `${stopsFile(dir)}:2 is not a line`);
  });
  await t.test('REFUSED: a delivered line that does not decode, naming the file and the line', () => {
    const dir = scratch('wf-chat-store-');
    appendDelivered(dir, { id: 'o1', said: '2026-10-15T12:00:02.000Z', attempt: 1 });
    fs.appendFileSync(deliveredFile(dir), '{"id":"o2"}\n');
    refused(() => readDelivered(dir), `${deliveredFile(dir)}:2 is not a line`);
  });
  await t.test('REFUSED: a read mark that is none, naming the file', () => {
    const dir = scratch('wf-chat-store-');
    fs.mkdirSync(path.dirname(readMarkFile(dir)), { recursive: true });
    fs.writeFileSync(readMarkFile(dir), 'not json');
    refused(() => readReadMark(dir), `${readMarkFile(dir)} is not a line`);
  });
});
