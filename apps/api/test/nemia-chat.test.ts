/**
 * Nemia's chat on the api, over the engine's stand-in with her task at work on it and her level file naming it: a page of her history
 * with where she is, a send put in her outbox and refused when empty, a read mark moved and refused for an event she does not hold,
 * and the stream: presence first, then her events with the cursor, resumed after Last-Event-ID with nothing repeated, and a cursor no
 * read gave refused before it opens.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { Engine as RuntimeEngine } from 'agent-runtime';
import { testEngine } from 'agent-runtime/testing';
import type { ChatEvent, ChatHistory } from 'agent-orchestrator';
import { appOf, liveOf } from '../src/app.ts';
import { Engine } from '../src/store.ts';

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

const event = (id: string, words: string) => ({
  id,
  at: '2026-10-15T12:00:00.000Z',
  role: 'assistant' as const,
  kind: 'text' as const,
  text: words,
});

/** An app over a stand-in on which her task is at work, its transcript `words`, and her level file naming it. */
async function withHer(words: string[]) {
  const stand = testEngine();
  const e = Effect.runSync(Effect.provide(Effect.service(RuntimeEngine), stand.layer));
  const task = await Effect.runPromise(e.file({ id: `nemia-${Date.now()}`, brief: 'be there', cwd: '/r', restartPolicy: 'Always' }));
  stand.settle(task, 'running (working)');
  stand.plantTranscript(
    task,
    1,
    words.map((w, i) => event(`e${i}`, w)),
  );
  fs.mkdirSync(path.join(root, 'nemia'), { recursive: true });
  fs.writeFileSync(path.join(root, 'nemia', 'level.json'), JSON.stringify({ level: 'semi-auto', since: new Date().toISOString(), task }));
  fs.rmSync(path.join(root, 'nemia', 'chat'), { recursive: true, force: true });
  const { app } = appOf(Layer.merge(liveOf(), Layer.succeed(Engine)({ ...e, io: undefined } as never)));
  const asked = async (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(url, {
      method,
      headers: { ...BOARD, ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  return { app, stand, task, asked };
}

type Block = { event?: string; data?: string; id?: string };

/** The server-sent events of `text`, each block a record of its fields. */
const blocks = (text: string): Block[] =>
  text
    .split('\n\n')
    .filter((block) => block.trim())
    .map((block) =>
      Object.fromEntries(block.split('\n').map((line) => [line.slice(0, line.indexOf(': ')), line.slice(line.indexOf(': ') + 2)])),
    );

/** The stream's blocks once `enough` holds of them, the reader cancelled after. */
async function streamed(res: Response, enough: (said: Block[]) => boolean): Promise<Block[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const complete = blocks(text.slice(0, text.lastIndexOf('\n\n') + 2));
    if (enough(complete)) {
      await reader.cancel();
      return complete;
    }
    const { done, value } = await reader.read();
    if (done) return blocks(text);
    text += decoder.decode(value, { stream: true });
  }
}

const textsOf = (said: Block[]) =>
  said.filter((b) => b.event === 'chat').map((b) => (JSON.parse(b.data!) as ChatEvent & { text?: string }).text);

test('a page of her history, with where she is', async () => {
  const { asked } = await withHer(['One.', 'Two.', 'Three.']);
  const page = await asked('GET', '/api/nemia/chat?limit=2');
  assert.equal(page.status, 200);
  const body = page.body as unknown as ChatHistory;
  assert.deepEqual(
    body.events.map((e) => (e as { text: string }).text),
    ['Two.', 'Three.'],
  );
  assert.deepEqual(body.presence, { up: true, answering: true, waitsOnYou: 0, unread: 3 });
  assert.equal(body.before, 'm:1:e1');
  assert.equal((await asked('GET', '/api/nemia/chat?limit=0')).status, 422, 'a page of no size');
});

test('REFUSED: a send with no words is a 422 and a body that is none a 400; one with words is put in her outbox, 201', async () => {
  const { asked } = await withHer([]);
  const empty = await asked('POST', '/api/nemia/chat/send', { text: '   ' });
  assert.equal(empty.status, 422);
  assert.match(String(empty.body.error), /^The message is empty/);
  assert.equal((await asked('POST', '/api/nemia/chat/send', { words: 'hi' })).status, 400);
  const sent = await asked('POST', '/api/nemia/chat/send', { text: 'Hello' });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.text, 'Hello');
  const page = (await asked('GET', '/api/nemia/chat')).body as unknown as ChatHistory;
  assert.deepEqual(page.events.at(-1), {
    kind: 'message',
    id: `p:${String(sent.body.id)}`,
    at: sent.body.at,
    from: 'person',
    text: 'Hello',
    delivered: null,
  });
});

test('REFUSED: a read mark on an event she does not hold is a 404; one she holds is a 200, and unread follows it', async () => {
  const { asked } = await withHer(['One.', 'Two.']);
  assert.equal((await asked('POST', '/api/nemia/chat/read', { through: 'm:9:z' })).status, 404);
  const marked = await asked('POST', '/api/nemia/chat/read', { through: 'm:1:e0' });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.through, 'm:1:e0');
  assert.equal(((await asked('GET', '/api/nemia/chat')).body as unknown as ChatHistory).presence.unread, 1);
});

test('the stream sends presence first, then her events with the cursor, and resumes after Last-Event-ID with nothing repeated', async () => {
  const { app, stand, task } = await withHer(['One.', 'Two.']);
  const first = await streamed(await app.request('/api/nemia/chat/stream'), (said) => textsOf(said).length >= 2);
  assert.equal(first[0]?.event, 'presence');
  assert.deepEqual(JSON.parse(first[0].data!), { up: true, answering: true, waitsOnYou: 0, unread: 2 });
  assert.deepEqual(textsOf(first), ['One.', 'Two.']);
  const cursor = first.filter((b) => b.id !== undefined).at(-1)?.id;
  assert.equal(cursor, '1.2.0.0.0');
  stand.plantTranscript(task, 1, [event('e0', 'One.'), event('e1', 'Two.'), event('e2', 'Three.')]);
  const resumed = await streamed(
    await app.request('/api/nemia/chat/stream', { headers: { 'Last-Event-ID': cursor } }),
    (said) => textsOf(said).length >= 1,
  );
  assert.deepEqual(textsOf(resumed), ['Three.']);
  assert.equal(resumed.filter((b) => b.id !== undefined).at(-1)?.id, '1.3.0.0.0');
});

test('REFUSED: a stream from a cursor no read gave is a 422 before it opens', async () => {
  const { app } = await withHer(['One.']);
  for (const headers of [{ 'Last-Event-ID': 'page-2' }, { 'Last-Event-ID': '9.0.0.0.0' }]) {
    const res = await app.request('/api/nemia/chat/stream', { headers });
    assert.equal(res.status, 422);
    assert.match(String(((await res.json()) as { error: string }).error), /is not a cursor a chat read gave/);
  }
});
