/**
 * Nemia's chat on the api, over the app's engine, her task journalled at work in its store and her transcript Claude Code's, and her level
 * file naming it: a page of her history with where she is, a send put in her outbox and refused when empty, a read mark moved and refused
 * for an event she does not hold, a stop refused where her session cannot have its turn ended and guarded as her other writes are,
 * and the stream: presence first, then her events with the cursor, resumed after Last-Event-ID with nothing
 * repeated, and a cursor no read gave refused before it opens. The stop a session takes is answered 200 in
 * `nemia-chat-stop.boundary.test.ts`: no session the harness lists here can have its turn ended.
 *
 * Her record is planted by `her.ts`, the fixture both files share.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { ChatEvent, ChatHistory } from 'agent-orchestrator';
import { said, withHer } from './her.ts';
import { app } from '../src/app.ts';

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

/** The api's answer to `method` on `url` with `body`, as the board sends it. */
async function asked(method: string, url: string, body?: unknown) {
  const res = await app.request(url, { method, headers: BOARD, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
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
  withHer(['One.', 'Two.', 'Three.']);
  const page = await asked('GET', '/api/nemia/chat?limit=2');
  assert.equal(page.status, 200);
  const body = page.body as unknown as ChatHistory;
  assert.deepEqual(
    body.events.map((e) => (e as { text: string }).text),
    ['Two.', 'Three.'],
  );
  assert.deepEqual(body.presence, { up: true, answering: true, waitsOnYou: 0, unread: 3 });
  assert.equal(body.before, 'm:1:e1:0');
  assert.equal((await asked('GET', '/api/nemia/chat?limit=0')).status, 422, 'a page of no size');
});

test('REFUSED: a send with no words is a 422 and a body that is none a 400; one with words is put in her outbox, 201', async () => {
  withHer([]);
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
  withHer(['One.', 'Two.']);
  assert.equal((await asked('POST', '/api/nemia/chat/read', { through: 'm:9:z' })).status, 404);
  const marked = await asked('POST', '/api/nemia/chat/read', { through: 'm:1:e0:0' });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.through, 'm:1:e0:0');
  assert.equal(((await asked('GET', '/api/nemia/chat')).body as unknown as ChatHistory).presence.unread, 1);
});

test('the stream sends presence first, then her events with the cursor, and resumes after Last-Event-ID with nothing repeated', async () => {
  const { sessionId } = withHer(['One.', 'Two.']);
  const first = await streamed(await app.request('/api/nemia/chat/stream'), (said) => textsOf(said).length >= 2);
  assert.equal(first[0]?.event, 'presence');
  assert.deepEqual(JSON.parse(first[0].data!), { up: true, answering: true, waitsOnYou: 0, unread: 2 });
  assert.deepEqual(textsOf(first), ['One.', 'Two.']);
  const cursor = first.filter((b) => b.id !== undefined).at(-1)?.id;
  assert.equal(cursor, '1.2.0.0.0.0');
  said(sessionId, ['Three.'], 2);
  const resumed = await streamed(
    await app.request('/api/nemia/chat/stream', { headers: { 'Last-Event-ID': cursor } }),
    (said) => textsOf(said).length >= 1,
  );
  assert.deepEqual(textsOf(resumed), ['Three.']);
  assert.equal(resumed.filter((b) => b.id !== undefined).at(-1)?.id, '1.3.0.0.0.0');
});

test('a read that fails under an open stream is `unreadable` with retrying, and the first beat that works after it says `readable`', async () => {
  const { sessionId } = withHer(['One.']);
  const outbox = path.join(root, 'nemia', 'chat', 'outbox.jsonl');
  fs.mkdirSync(path.dirname(outbox), { recursive: true });
  const mended = fs.rmSync.bind(null, outbox, { force: true });
  let broken = false;
  let whole = false;
  const beats = await streamed(await app.request('/api/nemia/chat/stream'), (got) => {
    if (!broken && textsOf(got).length >= 1) {
      broken = true;
      fs.writeFileSync(outbox, '{"id":"half-written"}\n');
    } else if (broken && !whole && got.some((b) => b.event === 'unreadable')) {
      whole = true;
      mended();
      said(sessionId, ['Two.'], 1);
    }
    return textsOf(got).includes('Two.');
  });
  mended();
  const notice = JSON.parse(beats.find((b) => b.event === 'unreadable')!.data!) as { error: string; retrying: boolean };
  assert.equal(notice.retrying, true, 'a read that failed is a notice: the next beat reads again');
  assert.match(notice.error, /is not a line of the chat's record/, "and it says what the api could not read, in the store's own words");
  assert.equal(
    beats.findIndex((b) => b.event === 'readable') > beats.findIndex((b) => b.event === 'unreadable'),
    true,
    'the beat that reads again says `readable`, which takes the notice off the page, before what it read',
  );
});

test('REFUSED: a stream from a cursor no read gave is a 422 before it opens', async () => {
  withHer(['One.']);
  for (const headers of [{ 'Last-Event-ID': 'page-2' }, { 'Last-Event-ID': '9.0.0.0.0' }]) {
    const res = await app.request('/api/nemia/chat/stream', { headers });
    assert.equal(res.status, 422);
    assert.match(String(((await res.json()) as { error: string }).error), /is not a cursor a chat read gave/);
  }
});

test("REFUSED: a stop of a session whose harness cannot end a turn is a 409 in that harness's words, and leaves no Stopped line", async () => {
  withHer(['One.']);
  const stopped = await asked('POST', '/api/nemia/chat/stop', {});
  assert.equal(stopped.status, 409);
  assert.match(
    String(stopped.body.error),
    /does not run attached on the Agent SDK, and its turn cannot be ended without ending its session/,
  );
  const history = (await asked('GET', '/api/nemia/chat')).body as unknown as ChatHistory;
  assert.deepEqual(
    history.events.filter((e: ChatEvent) => e.kind === 'message' && e.from === 'keeper'),
    [],
    'a turn the runtime did not end is on no record',
  );
});

test('REFUSED: a stop made by a page on another site, or with no JSON content-type, is refused before it reaches her', async () => {
  withHer(['One.']);
  const cross = await app.request('/api/nemia/chat/stop', {
    method: 'POST',
    headers: { ...BOARD, 'sec-fetch-site': 'cross-site' },
    body: '{}',
  });
  assert.equal(cross.status, 403);
  const plain = await app.request('/api/nemia/chat/stop', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } });
  assert.equal(plain.status, 415);
});
