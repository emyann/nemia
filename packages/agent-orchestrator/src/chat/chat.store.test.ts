/**
 * The chat's files: none reads as empty, each append reads back in order, a last line still being written is left out, a line that does
 * not decode is refused naming the file and the line, an ask line read with its kind (none a question), and the read mark is
 * written whole and read back: one table, each row on a
 * folder of its own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { names } from '../../test/assessed.ts';
import {
  appendAsk,
  appendDelivered,
  appendOutbox,
  appendStop,
  asksFile,
  deliveredFile,
  outboxFile,
  readAsks,
  readDelivered,
  readMarkFile,
  readOutbox,
  readReadMark,
  readSpeakers,
  readStops,
  speakersFile,
  stopsFile,
  writeReadMark,
  writeSpeakers,
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
  await t.test("an agent's entry reads back with who wrote it, and a line written with none reads as before, the person's", () => {
    const dir = scratch('wf-chat-store-');
    fs.mkdirSync(path.dirname(outboxFile(dir)), { recursive: true });
    fs.appendFileSync(outboxFile(dir), `${JSON.stringify({ id: 'o1', at: '2026-10-15T12:00:00.000Z', text: 'mine' })}\n`);
    appendOutbox(dir, { id: 'o2', at: '2026-10-15T12:00:01.000Z', text: 'theirs', from: { kind: 'agent', name: 'operator' } });
    assert.deepEqual(readOutbox(dir), [
      { id: 'o1', at: '2026-10-15T12:00:00.000Z', text: 'mine' },
      { id: 'o2', at: '2026-10-15T12:00:01.000Z', text: 'theirs', from: { kind: 'agent', name: 'operator' } },
    ]);
  });
  await t.test('the names the person allowed: none with no file, read back whole as written, a key a newer writer added kept', () => {
    const dir = scratch('wf-chat-store-');
    assert.deepEqual(readSpeakers(dir), []);
    writeSpeakers(dir, ['operator', 'nemia-ab12/design']);
    fs.writeFileSync(speakersFile(dir), JSON.stringify({ allowed: ['operator', 'nemia-ab12/design'], since: 'a newer writer' }));
    writeSpeakers(dir, ['operator']);
    assert.deepEqual(readSpeakers(dir), ['operator']);
    assert.equal(JSON.parse(fs.readFileSync(speakersFile(dir), 'utf8')).since, 'a newer writer', 'a key a newer writer added is kept');
  });
  await t.test('REFUSED: a speakers file that does not read as one, naming the file', () => {
    const dir = scratch('wf-chat-store-');
    fs.mkdirSync(path.dirname(speakersFile(dir)), { recursive: true });
    fs.writeFileSync(speakersFile(dir), '{"allowed":"operator"}');
    refused(() => readSpeakers(dir), `${speakersFile(dir)} is not`);
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
  await t.test('an ask line that says no kind reads as a question, and a permission reads back with its facts', () => {
    const dir = scratch('wf-chat-store-');
    const question = {
      question: 'Which?',
      header: 'Pick',
      options: [{ label: 'One', description: 'the one', recommended: true }],
      multiSelect: false,
    };
    fs.mkdirSync(path.dirname(asksFile(dir)), { recursive: true });
    fs.appendFileSync(asksFile(dir), `${JSON.stringify({ id: 'call-1', at: '2026-10-15T12:00:00.000Z', questions: [question] })}\n`);
    const permission = { tool: 'Bash', command: 'git push', always: false, defaultToNo: true };
    appendAsk(dir, { id: 'toolu-1', at: '2026-10-15T12:00:01.000Z', kind: 'permission', questions: [question], permission });
    assert.deepEqual(readAsks(dir), [
      { id: 'call-1', at: '2026-10-15T12:00:00.000Z', kind: 'question', questions: [question] },
      { id: 'toolu-1', at: '2026-10-15T12:00:01.000Z', kind: 'permission', questions: [question], permission },
    ]);
  });
  await t.test('REFUSED: an ask line of a kind the chat has no word for, naming the file and the line', () => {
    const dir = scratch('wf-chat-store-');
    fs.mkdirSync(path.dirname(asksFile(dir)), { recursive: true });
    fs.appendFileSync(asksFile(dir), `${JSON.stringify({ id: 'call-1', at: '2026-10-15T12:00:00.000Z', kind: 'plan', questions: [] })}\n`);
    refused(() => readAsks(dir), `${asksFile(dir)}:1 is not a line`);
  });
});
