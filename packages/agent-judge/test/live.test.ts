/**
 * The live layer over a stub `fetch`: what is sent, and each way an asking fails, made to happen. Every failure is a fact
 * on the record and reads as `unsure`; none rejects the caller.
 */
import { answering, ENV, files, KEY, reached, stub, tmp, type Reply } from './hermetic.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { decide, judge, noul, score, type FailureKind } from '../src/facade.ts';

const state = { card: 'Sort the inbox by date.' };
const questions = { web: noul('Does `card` touch the web app?', { true: 'yes', false: 'no' }), size: score('How large is `card`?', ['small', 'large']) };

const ask = async (replies: Reply[], options: { env?: Record<string, string>; attemptMs?: number; deadlineMs?: number; retries?: number } = {}) => {
  const record = tmp('live');
  const s = stub(...replies);
  const j = judge({ model: 'jev-1.13.0', record, env: ENV, fetch: s.fetch, retries: 0, ...options });
  const asked = await j.ask(state, questions);
  const text = files(record).map((f) => fs.readFileSync(path.join(record, f), 'utf8')).join('');
  return { asked, calls: s.calls, record, text };
};

const failedAs = (asked: Awaited<ReturnType<typeof ask>>['asked'], kind: FailureKind) => {
  for (const id of ['web', 'size'] as const) {
    const j = asked.answers[id];
    assert.equal(j.status, 'failed', id);
    assert.equal(j.status === 'failed' && j.kind, kind, `${id}: ${JSON.stringify(j)}`);
    assert.equal(decide(j, id === 'web' ? { yes: 0.8, no: 0.2 } : { yes: 1, no: 0 }), 'unsure');
  }
};

test('one request carries every question, the caller\'s state and the pinned model, and nothing else', async () => {
  const { asked, calls } = await ask([answering({ web: 0.93, size: 0.4 })]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(calls[0]!.headers.authorization, `Bearer ${KEY}`);
  assert.deepEqual(calls[0]!.body, {
    model: 'jev-1.13.0', state,
    questions: {
      web: { type: 'noul', instructions: 'Does `card` touch the web app?', criteria: { true: 'yes', false: 'no' } },
      size: { type: 'score', instructions: 'How large is `card`?', criteria: ['small', 'large'] },
    },
  });
  assert.equal(asked.requests, 1);
  assert.equal(asked.sent, 2);
  assert.equal(decide(asked.answers.web, { yes: 0.8, no: 0.2 }), 'yes');
  assert.equal(asked.answers.size.status === 'answered' && asked.answers.size.answer.score, 0.4);
  assert.equal(reached.length, 0, 'the global fetch was never reached');
});

test('TYPESAFE_BASE_URL and TYPESAFE_LOG_LEVEL in the environment move nothing: the state goes to TypeSafe, and nothing is logged', async () => {
  const logged: unknown[] = [];
  const log = console.debug;
  console.debug = console.info = (...xs: unknown[]) => void logged.push(xs);
  try {
    const { calls } = await ask([answering({})], { env: { ...ENV, TYPESAFE_BASE_URL: 'https://elsewhere.example', TYPESAFE_LOG_LEVEL: 'debug' } });
    assert.equal(calls[0]!.url, 'https://api.typesafe.ai/v1/systemone');
  } finally {
    console.debug = log;
  }
  assert.deepEqual(logged, []);
});

test('no key: nothing is built or sent, and every question reads no-key', async () => {
  const { asked, calls } = await ask([answering({})], { env: {} });
  assert.equal(calls.length, 0);
  assert.equal(asked.requests, 0);
  failedAs(asked, 'no-key');
  const blank = await ask([answering({})], { env: { TYPESAFE_API_KEY: '  ' } });
  assert.equal(blank.calls.length, 0);
  failedAs(blank.asked, 'no-key');
});

for (const [status, kind] of [[400, 'refused'], [401, 'refused'], [403, 'refused'], [422, 'refused'], [429, 'rate-limited'], [529, 'rate-limited'], [500, 'unreachable'], [503, 'unreachable']] as const) {
  test(`a ${status} is ${kind}, recorded, and not asked again`, async () => {
    const { asked, calls, record, text } = await ask([{ status, body: { detail: `status ${status}` } }]);
    assert.equal(calls.length, 1);
    failedAs(asked, kind);
    assert.match(text, new RegExp(`"kind":"${kind}"`));
    const again = await judge({ model: 'jev-1.13.0', record, env: ENV, fetch: stub(answering({})).fetch }).ask(state, questions);
    assert.equal(again.requests, 0);
    failedAs(again, kind);
  });
}

test('a lost connection is unreachable', async () => {
  const { asked, calls } = await ask(['throw']);
  assert.equal(calls.length, 1);
  failedAs(asked, 'unreachable');
});

test('an attempt that times out is timed-out', async () => {
  const { asked, calls } = await ask(['hang'], { attemptMs: 30 });
  assert.equal(calls.length, 1);
  failedAs(asked, 'timed-out');
});

test('the deadline over every attempt aborts the request in flight, and is timed-out', async () => {
  const started = Date.now();
  const { asked, calls } = await ask(['hang'], { attemptMs: 60_000, deadlineMs: 80 });
  assert.ok(Date.now() - started < 5_000);
  failedAs(asked, 'timed-out');
  assert.equal(calls[0]!.signal?.aborted, true, 'the socket was let go');
});

test("the SDK's own retries are kept: a 429 then an answer is one answer", async () => {
  const { asked, calls } = await ask([{ status: 429, headers: { 'retry-after-ms': '1' } }, answering({ web: 0.1 })], { retries: 2 });
  assert.equal(calls.length, 2);
  assert.equal(decide(asked.answers.web, { yes: 0.8, no: 0.2 }), 'no');
});

test('a key the service echoes back is in no message and no record', async () => {
  const { asked, text } = await ask([{ status: 401, body: { detail: `invalid key ${KEY}, sent as Bearer ${KEY}` } }]);
  failedAs(asked, 'refused');
  const message = asked.answers.web.status === 'failed' ? asked.answers.web.message : '';
  assert.match(message, /\[key\]/);
  assert.ok(!message.includes(KEY) && !text.includes(KEY), message);
});

test('an answer that is not one is kept raw, read as malformed, and paid for once', async () => {
  const bad = { body: { model: 'jev-1.13.0', answers: { web: { type: 'noul', noul: 1.7 }, size: { type: 'noul', noul: 0.5 } }, usage: { input_tokens: 9, output_tokens: 0 } } };
  const { asked, record, text } = await ask([bad]);
  failedAs(asked, 'malformed');
  assert.match(text, /"raw":\{"type":"noul","noul":1\.7\}/);
  const again = await judge({ model: 'jev-1.13.0', record, env: ENV, fetch: stub(answering({})).fetch }).ask(state, questions);
  assert.equal(again.requests, 0);
  const text2 = await ask([{ text: 'not json at all', headers: { 'content-type': 'text/plain' } }]);
  failedAs(text2.asked, 'malformed');
  assert.match(text2.text, /"body":"not json at all"/);
  const empty = await ask([{ body: { model: 'jev-1.13.0', answers: {} } }]);
  failedAs(empty.asked, 'malformed');
});

test('an answer from a model other than the pinned one is wrong-model', async () => {
  const { asked, text } = await ask([answering({ web: 0.9 }, 'jev-1.14.0')]);
  failedAs(asked, 'wrong-model');
  assert.match(text, /"answeredBy":"jev-1\.14\.0"/);
});
