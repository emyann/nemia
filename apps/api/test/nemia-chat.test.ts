/**
 * Nemia's chat on the api, over the app's engine, her task journalled at work in its store and her transcript Claude Code's, and her level
 * file naming it: a page of her history with where she is, a send put in her outbox and refused when empty, a read mark moved and refused
 * for an event she does not hold, a question of hers answered and refused — one her chat does not hold, one answered already, picks
 * that do not answer it, a body that is none, and a write from another site — a stop of her turn taken, asked of her session's holder
 * on the file it reads (`<name>.interrupt`), refused where she is not answering and guarded as her other writes are, and the stream:
 * presence first, then her events with the cursor, resumed after Last-Event-ID with nothing repeated, and a cursor no read gave refused
 * before it opens. The stop verb's own path — the interrupt through the one client, then the line — is proven on the engine's stand-in
 * (`packages/agent-orchestrator/test/nemia-chat.test.ts`).
 *
 * Her record is planted by `her.ts`: her session an attached one, its run file held by this process.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import { story } from './checkpoints.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Ask, ChatEvent, ChatHistory } from 'agent-orchestrator';
import { at, said, withHer } from './her.ts';
import { Layer } from 'effect';
import { app, appOf, liveOf } from '../src/app.ts';
import { Beats } from '../src/layer.ts';
import { CHAT_BEAT_MS } from '../src/nemia/chat.ts';

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

test('A person talks with Nemia in her chat: a page of history, a send to her outbox, read marks, a question answered, and the stream from presence to a resume', async (t) => {
  const s = story(t);
  await s.test('a page of her history, with where she is', async () => {
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
  await s.test(
    'REFUSED: a send with no words is a 422 and a body that is none a 400; one with words is put in her outbox, 201',
    async () => {
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
    },
  );
  await s.test('REFUSED: a read mark on an event she does not hold is a 404; one she holds is a 200, and unread follows it', async () => {
    withHer(['One.', 'Two.']);
    assert.equal((await asked('POST', '/api/nemia/chat/read', { through: 'm:9:z' })).status, 404);
    const marked = await asked('POST', '/api/nemia/chat/read', { through: 'm:1:e0:0' });
    assert.equal(marked.status, 200);
    assert.equal(marked.body.through, 'm:1:e0:0');
    assert.equal(((await asked('GET', '/api/nemia/chat')).body as unknown as ChatHistory).presence.unread, 1);
  });
  await s.test('a question of hers is answered by the person, drawn with their choice, and waits on them no longer', async () => {
    withHer(['One.']);
    const ask = waiting();
    const question = ask.questions[0].question;
    const before = (await asked('GET', '/api/nemia/chat')).body as unknown as ChatHistory;
    assert.equal(before.presence.waitsOnYou, 1, 'her question waits on the person');
    const answered = await asked('POST', '/api/nemia/chat/answer', { id: 'q1', picks: [{ question, labels: ['Cut it on read'] }] });
    assert.equal(answered.status, 200);
    assert.deepEqual(answered.body.answers, { [question]: 'Cut it on read' });
    const after = (await asked('GET', '/api/nemia/chat')).body as unknown as ChatHistory;
    const drawn = after.events.find((e: ChatEvent) => e.kind === 'question');
    assert.deepEqual(drawn?.kind === 'question' ? drawn.chose : undefined, { [question]: 'Cut it on read' });
    assert.equal(after.presence.waitsOnYou, 0, 'answered: it waits on nobody');
  });
  await s.test(
    'REFUSED: a question her chat does not hold is a 404, one answered already a 409, picks that do not answer it a 422, a body that is none a 400',
    async () => {
      withHer(['One.']);
      const ask = waiting();
      const question = ask.questions[0].question;
      const picks = [{ question, labels: ['Cut it on read'] }];
      assert.equal((await asked('POST', '/api/nemia/chat/answer', { id: 'q9', picks })).status, 404);
      assert.equal((await asked('POST', '/api/nemia/chat/answer', { id: 'q1', picks: [] })).status, 422, 'the question left out');
      const stray = await asked('POST', '/api/nemia/chat/answer', { id: 'q1', picks: [{ question, labels: ['Something else'] }] });
      assert.equal(stray.status, 422);
      assert.match(String(stray.body.error), /is no choice of/);
      assert.equal((await asked('POST', '/api/nemia/chat/answer', { id: 'q1', answers: {} })).status, 400, 'no picks at all');
      assert.equal((await asked('POST', '/api/nemia/chat/answer', { id: 'q1', picks })).status, 200);
      const twice = await asked('POST', '/api/nemia/chat/answer', { id: 'q1', picks });
      assert.equal(twice.status, 409);
      assert.match(String(twice.body.error), /read her chat again/);
    },
  );
  await s.test(
    'the stream sends presence first, then her events with the cursor, and resumes after Last-Event-ID with nothing repeated',
    async () => {
      const { sessionId } = withHer(['One.', 'Two.']);
      const first = await streamed(await app.request('/api/nemia/chat/stream'), (said) => textsOf(said).length >= 2);
      assert.equal(first[0]?.event, 'presence');
      assert.deepEqual(JSON.parse(first[0].data!), { up: true, answering: true, waitsOnYou: 0, unread: 2 });
      assert.deepEqual(textsOf(first), ['One.', 'Two.']);
      const cursor = first.filter((b) => b.id !== undefined).at(-1)?.id;
      assert.equal(cursor, '1.2.0.0.0.0.0.0.0');
      said(sessionId, ['Three.'], 2);
      const resumed = await streamed(
        await app.request('/api/nemia/chat/stream', { headers: { 'Last-Event-ID': cursor } }),
        (said) => textsOf(said).length >= 1,
      );
      assert.deepEqual(textsOf(resumed), ['Three.']);
      assert.equal(resumed.filter((b) => b.id !== undefined).at(-1)?.id, '1.3.0.0.0.0.0.0.0');
    },
  );
  await s.test('REFUSED: a stream from a cursor no read gave is a 422 before it opens', async () => {
    withHer(['One.']);
    for (const headers of [{ 'Last-Event-ID': 'page-2' }, { 'Last-Event-ID': '9.0.0.0.0' }]) {
      const res = await app.request('/api/nemia/chat/stream', { headers });
      assert.equal(res.status, 422);
      assert.match(String(((await res.json()) as { error: string }).error), /is not a cursor a chat read gave/);
    }
  });
});

/** One question of hers waiting on the person, as the keeper wrote it into her chat. */
const ASK: Ask = {
  id: 'q1',
  at: at(2),
  questions: [
    {
      question: 'What the board shows as an old closeout’s one line?',
      header: 'Summary',
      options: [
        { label: 'Cut it on read', description: 'The first line, cut at a word.', recommended: true },
        { label: 'First line as it is', description: 'The board cuts it by its layout.', recommended: false },
      ],
      multiSelect: false,
    },
  ],
};

/** Plants `ask` in her chat, where the keeper's copy of her session's questions lives. */
function waiting(ask: Ask = ASK): Ask {
  const file = path.join(root, 'nemia', 'chat', 'asks.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(ask)}\n`);
  return ask;
}

test('a question whose call was cut is served with the moment it was, and waits on nobody', async () => {
  withHer(['One.']);
  const ask = waiting();
  const marks = path.join(root, 'nemia', 'chat', 'asks-closed.jsonl');
  fs.writeFileSync(marks, `${JSON.stringify({ id: ask.id, how: 'cut', at: at(5) })}\n`);
  const page = (await asked('GET', '/api/nemia/chat')).body as unknown as ChatHistory;
  const drawn = page.events.find((e: ChatEvent) => e.kind === 'question');
  assert.equal(drawn?.kind === 'question' ? drawn.cutAt : undefined, at(5), 'the board is told her call is no longer waiting');
  assert.equal(page.presence.waitsOnYou, 0, 'and nothing of hers is held open for it, so it waits on nobody');
  assert.equal(page.cursor.split('.').length, 9, 'the marks are a count of the cursor a stream resumes from');
});

test("a stop of the turn she is answering is a 200 with the stop as the package gave it, asked of her session's holder, and her history holds the one Stopped line", async () => {
  const { task } = withHer(['One.']);
  const stopped = await asked('POST', '/api/nemia/chat/stop', {});
  assert.equal(stopped.status, 200, JSON.stringify(stopped.body));
  assert.deepEqual(Object.keys(stopped.body).sort(), ['at', 'attempt'], 'the stop as the package gave it, and nothing else');
  assert.equal(stopped.body.attempt, 1, 'the attempt she is in');
  assert.ok(
    fs.existsSync(path.join(root, 'engine', 'runs', 'attached', `ae_${task}_1.interrupt`)),
    "the turn's end asked of her session's holder, on the file it reads beside her run file",
  );
  const history = (await asked('GET', '/api/nemia/chat')).body as unknown as ChatHistory;
  assert.deepEqual(
    history.events.filter((e: ChatEvent) => e.kind === 'message' && e.from === 'keeper').map((e) => (e as { text: string }).text),
    ['Stopped'],
  );
});

test('REFUSED: a write to her chat before it reaches her — an answer or a stop from another site or not JSON', async (t) => {
  await t.test(
    'REFUSED: an answer made by a page on another site, or with no JSON content-type, is refused before it reaches her chat',
    async () => {
      withHer(['One.']);
      waiting();
      const body = JSON.stringify({ id: 'q1', picks: [{ question: ASK.questions[0].question, labels: ['Cut it on read'] }] });
      const cross = await app.request('/api/nemia/chat/answer', {
        method: 'POST',
        headers: { ...BOARD, 'sec-fetch-site': 'cross-site' },
        body,
      });
      assert.equal(cross.status, 403);
      const plain = await app.request('/api/nemia/chat/answer', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' }, body });
      assert.equal(plain.status, 415);
      const page = (await asked('GET', '/api/nemia/chat')).body as unknown as ChatHistory;
      const drawn = page.events.find((e: ChatEvent) => e.kind === 'question');
      assert.equal(drawn?.kind === 'question' ? drawn.chose : 'none', undefined, 'neither write reached her chat');
    },
  );
  await t.test('REFUSED: a stop when she is not answering — no session of hers filed — is a 409, and leaves no Stopped line', async () => {
    withHer(['One.']);
    fs.rmSync(path.join(root, 'nemia', 'level.json'));
    const stopped = await asked('POST', '/api/nemia/chat/stop', {});
    assert.equal(stopped.status, 409, JSON.stringify(stopped.body));
    const history = (await asked('GET', '/api/nemia/chat')).body as unknown as ChatHistory;
    assert.deepEqual(
      history.events.filter((e: ChatEvent) => e.kind === 'message' && e.from === 'keeper'),
      [],
      'a turn the runtime did not end is on no record',
    );
  });
  await t.test(
    'REFUSED: a stop made by a page on another site, or with no JSON content-type, is refused before it reaches her',
    async () => {
      withHer(['One.']);
      const cross = await app.request('/api/nemia/chat/stop', {
        method: 'POST',
        headers: { ...BOARD, 'sec-fetch-site': 'cross-site' },
        body: '{}',
      });
      assert.equal(cross.status, 403);
      const plain = await app.request('/api/nemia/chat/stop', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } });
      assert.equal(plain.status, 415);
    },
  );
});

/** The beat a test's own chat stream reads again on (`Beats.chat`), shorter than the shipped `CHAT_BEAT_MS`. */
const BEAT_MS = 100;

test('a read that fails under an open stream is `unreadable` with retrying, and the first beat that works after it says `readable`', async (t) => {
  assert.ok(BEAT_MS < CHAT_BEAT_MS, 'read again on a beat shorter than shipped, never longer');
  const own = appOf(Layer.merge(liveOf(), Layer.succeed(Beats)({ ...Beats.defaultValue(), chat: BEAT_MS })));
  t.after(() => own.runtime.dispose());
  const { sessionId } = withHer(['One.']);
  const outbox = path.join(root, 'nemia', 'chat', 'outbox.jsonl');
  fs.mkdirSync(path.dirname(outbox), { recursive: true });
  const mended = fs.rmSync.bind(null, outbox, { force: true });
  let broken = false;
  let whole = false;
  const beats = await streamed(await own.app.request('/api/nemia/chat/stream'), (got) => {
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
