/**
 * Nemia's chat on the api, over the app's engine, her task journalled at work in its store and her transcript Claude Code's, and her level
 * file naming it: a page of her history with where she is, a send put in her outbox and refused when empty, a read mark moved and refused
 * for an event she does not hold, a stop refused where her session cannot have its turn ended and guarded as her other writes are,
 * and the stream: presence first, then her events with the cursor, resumed after Last-Event-ID with nothing
 * repeated, and a cursor no read gave refused before it opens.
 */
import { config, registry, root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ChatEvent, ChatHistory } from 'agent-orchestrator';
import { app } from '../src/app.ts';

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

const T0 = Date.parse('2026-10-15T12:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');

/** One line of her session's transcript, as Claude Code writes it: her words `text`. */
const herLine = (sessionId: string, uuid: string, s: number, text: string) => ({
  sessionId,
  isSidechain: false,
  userType: 'external',
  cwd: '/code/app',
  version: '2.1.270',
  type: 'assistant',
  uuid,
  timestamp: at(s),
  message: { role: 'assistant', content: [{ type: 'text', text }] },
});

/** Her session's transcript, `words` appended to it. */
const said = (sessionId: string, words: string[], from = 0) => {
  const file = path.join(config, 'projects', '-code-app', `${sessionId}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, jsonl(words.map((w, i) => herLine(sessionId, `e${from + i}`, from + i + 1, w))));
};

/**
 * Her task at work: journalled as filed long-lived and spawned, its session listed working by `claude agents`, its transcript `words`,
 * and her level file naming it; her chat's files none.
 */
function withHer(words: string[]) {
  const task = `nemia-${randomUUID().slice(0, 8)}`;
  const sessionId = randomUUID();
  const journal = path.join(root, 'engine', 'tasks', `${task}.jsonl`);
  fs.mkdirSync(path.dirname(journal), { recursive: true });
  const filed = { kind: 'filed', at: at(0), brief: 'Be there.', cwd: '/code/app', maxAttempts: 1, harness: 'claude' };
  fs.writeFileSync(journal, jsonl([filed, { kind: 'starting', at: at(0), attempt: 1 }, { kind: 'spawned', at: at(0), attempt: 1 }]));
  const rows = fs.existsSync(registry) ? (JSON.parse(fs.readFileSync(registry, 'utf8')) as object[]) : [];
  rows.push({ name: `ae/${task}/1`, sessionId, kind: 'background', state: 'working', status: 'busy', startedAt: T0 });
  fs.writeFileSync(registry, JSON.stringify(rows));
  said(sessionId, words);
  fs.mkdirSync(path.join(root, 'nemia'), { recursive: true });
  fs.writeFileSync(path.join(root, 'nemia', 'level.json'), JSON.stringify({ level: 'semi-auto', since: at(0), task }));
  fs.rmSync(path.join(root, 'nemia', 'chat'), { recursive: true, force: true });
  return { task, sessionId };
}

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
