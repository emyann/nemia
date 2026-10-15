/**
 * The chat's reads and the person's writes over the engine's stand-in and the test place: a history paged across two attempts with
 * the line between them, a stream's read resumed after its cursor, the person's words put in the outbox and refused when empty or too
 * long, and the read mark moved forward only, refused for an event the chat does not hold. A store of its own, since `WF_ROOT` is read
 * as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from '../../test/scratch.ts';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';

process.env.WF_ROOT = scratch('wf-chat-verb-');
const { chatHistory, chatRead, chatSend, chatSince } = await import('./chat.verb.ts');
const { readOutbox, readReadMark } = await import('./chat.store.ts');
const { engineOf, runWith: runEngine } = await import('../runtime-client.ts');

const engine = eachTest(testEngine);
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);

const event = (id: string, words: string) => ({
  id,
  at: '2026-10-15T12:00:00.000Z',
  role: 'assistant' as const,
  kind: 'text' as const,
  text: words,
});

/** Her task at work on its second attempt, each attempt's transcript planted, and her chat's folder. */
const twoAttempts = async () => {
  const e = engineOf(engine().layer);
  const task = await runEngine(e, e.file({ id: 'her', brief: 'be there', cwd: '/r', restartPolicy: 'Always' }));
  engine().settle(task, 'running (working)');
  engine().plantTranscript(task, 1, [event('a', 'One.'), event('b', 'Two.')]);
  engine().restart(task);
  engine().plantTranscript(task, 2, [event('c', 'Three.')]);
  return { e, place: { task, dir: scratch('wf-chat-dir-') } };
};

const texts = (events: readonly { kind: string; text?: string }[]) => events.map((e) => (e.kind === 'session' ? '—' : e.text));

test('history pages back across two attempts with the line between them, and says where she is', async () => {
  const { e, place } = await twoAttempts();
  const last = await runWith(e, chatHistory(place, { limit: 2 }));
  assert.deepEqual(texts(last.events), ['—', 'Three.']);
  assert.deepEqual(last.presence, { up: true, answering: true, waitsOnYou: 0, unread: 3 });
  const older = await runWith(e, chatHistory(place, { before: last.before ?? '', limit: 5 }));
  assert.deepEqual([texts(older.events), older.before], [['One.', 'Two.'], null]);
});

test('no task filed is a chat with nothing but the outbox, and she is down', async () => {
  const e = engineOf(engine().layer);
  const place = { task: undefined, dir: scratch('wf-chat-dir-') };
  await runWith(e, chatSend(place, 'Are you there?'));
  const read = await runWith(e, chatHistory(place));
  assert.deepEqual(texts(read.events), ['Are you there?']);
  assert.deepEqual(read.presence, { up: false, answering: false, waitsOnYou: 0, unread: 0 });
});

test("a read after the history's cursor gives only what came since, and the person's words once delivered", async () => {
  const { e, place } = await twoAttempts();
  const { cursor } = await runWith(e, chatHistory(place));
  assert.deepEqual((await runWith(e, chatSince(place, cursor))).events, []);
  const sent = await runWith(e, chatSend(place, 'Hi'));
  const pending = await runWith(e, chatSince(place, cursor));
  assert.deepEqual(
    pending.events.map((x) => [x.id, x.kind === 'message' && x.delivered]),
    [[`p:${sent.id}`, null]],
  );
  engine().plantTranscript(place.task, 2, [event('c', 'Three.'), event('d', 'Four.')]);
  const later = await runWith(e, chatSince(place, pending.cursor));
  assert.deepEqual(texts(later.events), ['Four.']);
  await runWith(e, chatSince(place, undefined)).then((all) => assert.equal(all.events.length, 6));
});

test('REFUSED: a read from a cursor no read gave', async () => {
  const { e, place } = await twoAttempts();
  await assert.rejects(runWith(e, chatSince(place, '9.0.0.0.0')), (err: Error) => /is not a cursor a chat read gave/.test(err.message));
});

test('REFUSED: a send that is empty or too long puts nothing in the outbox; one that is not is put there once', async () => {
  const { e, place } = await twoAttempts();
  await assert.rejects(runWith(e, chatSend(place, '  ')), (err: Error) => err.message.startsWith('The message is empty'));
  await assert.rejects(runWith(e, chatSend(place, 'x'.repeat(8001))), (err: Error) => /send at most 8000/.test(err.message));
  assert.deepEqual(readOutbox(place.dir), []);
  const sent = await runWith(e, chatSend(place, 'Go'));
  assert.deepEqual(readOutbox(place.dir), [sent]);
});

test('the read mark moves forward only, and unread follows it', async () => {
  const { e, place } = await twoAttempts();
  await runWith(e, chatRead(place, 'm:2:c'));
  assert.equal((await runWith(e, chatHistory(place))).presence.unread, 0);
  const kept = await runWith(e, chatRead(place, 'm:1:a'));
  assert.equal(kept.through, 'm:2:c', 'a mark behind answers the one kept');
  assert.equal(readReadMark(place.dir)?.through, 'm:2:c');
  engine().plantTranscript(place.task, 2, [event('c', 'Three.'), event('d', 'Four.')]);
  assert.equal((await runWith(e, chatHistory(place))).presence.unread, 1);
});

test('REFUSED: a read mark on an event the chat does not hold', async () => {
  const { e, place } = await twoAttempts();
  await assert.rejects(runWith(e, chatRead(place, 'm:9:z')), (err: Error) => err.message.startsWith('m:9:z is no event of this chat'));
  assert.equal(readReadMark(place.dir), undefined);
});
