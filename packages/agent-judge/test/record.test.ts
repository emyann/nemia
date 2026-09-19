/**
 * The recorded judge: asked once, never re-asked unless a person says so, one writer per file, and a record it cannot
 * read or write refused by name.
 */
import { answering, ENV, files, stub, tmp } from './hermetic.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decide, judge, noul, score } from '../src/facade.ts';
import { keyOf, questionOf, stateHash } from '../src/key.ts';
import { settle, writeFact, type AnswerFact } from '../src/record.ts';

const MODEL = 'jev-1.13.0';
const state = { card: 'Sort the inbox by date.' };
const web = noul('Does `card` touch the web app?', { true: 'yes', false: 'no' });
const plan = noul('Should `card` be planned first?', { true: 'yes', false: 'no' });
const size = score('How large is `card`?', ['small', 'large']);
const T = { yes: 0.8, no: 0.2 };

const judgeOver = (record: string, fetch: ReturnType<typeof stub>['fetch'], more: object = {}) =>
  judge({ model: MODEL, record, env: ENV, fetch, retries: 0, ...more });

const rejects = async (p: Promise<unknown>, pattern: RegExp) => {
  const e = await p.then(() => assert.fail('it did not reject'), (e: Error & { exitCode?: number }) => e);
  assert.equal(e.exitCode, 2);
  assert.match(e.message, pattern);
};

test('asked once: a second ask of the same words and state makes no request', async () => {
  const record = tmp('record');
  const s = stub(answering({ web: 0.9, size: 1 }));
  const first = await judgeOver(record, s.fetch).ask(state, { web, size });
  const second = await judgeOver(record, s.fetch).ask(state, { web, size });
  assert.equal(s.calls.length, 1);
  assert.equal(first.requests, 1);
  assert.equal(second.requests, 0);
  assert.equal(second.ms, undefined);
  assert.deepEqual(second.answers, first.answers);
  assert.equal(files(record).filter((f) => f.endsWith('.answer.json')).length, 2);
  assert.equal(files(record).filter((f) => f.endsWith('.asked.json')).length, 2);
  assert.ok(files(record).every((f) => !f.endsWith('.tmp')), 'no temp file is left');
});

test('the record holds the state\'s hash, never its text', async () => {
  const record = tmp('record');
  await judgeOver(record, stub(answering({})).fetch).ask({ card: 'a secret-ish sentence' }, { web });
  const text = files(record).map((f) => fs.readFileSync(path.join(record, f), 'utf8')).join('');
  assert.ok(!text.includes('secret-ish'));
  assert.match(text, /"state":"sha256:[0-9a-f]{64}"/);
});

test('a partial fan-out sends only the questions not on record, in one request', async () => {
  const record = tmp('record');
  const s = stub(answering({ web: 0.9, plan: 0.1, size: 1 }));
  await judgeOver(record, s.fetch).ask(state, { web });
  const asked = await judgeOver(record, s.fetch).ask(state, { web, plan, size });
  assert.equal(s.calls.length, 2);
  assert.deepEqual(Object.keys(s.calls[1]!.body.questions), ['plan', 'size']);
  assert.equal(asked.sent, 2);
  assert.equal(decide(asked.answers.plan, T), 'no');
});

test('two ids asking the same words share one key, and one question is sent', async () => {
  const record = tmp('record');
  const s = stub(answering({}));
  const asked = await judgeOver(record, s.fetch).ask(state, { web, again: web });
  assert.equal(Object.keys(s.calls[0]!.body.questions).length, 1);
  assert.equal(asked.answers.web.key, asked.answers.again.key);
  assert.deepEqual(asked.answers.web, asked.answers.again);
});

test('a failure is a fact: read as unsure, and not asked again', async () => {
  const record = tmp('record');
  const s = stub({ status: 503 }, answering({ web: 0.9 }));
  const first = await judgeOver(record, s.fetch).ask(state, { web });
  const second = await judgeOver(record, s.fetch).ask(state, { web });
  assert.equal(s.calls.length, 1);
  assert.equal(second.answers.web.status === 'failed' && second.answers.web.kind, 'unreachable');
  assert.deepEqual(second.answers.web, first.answers.web);
});

test('reask: failed asks exactly the failed keys again, as the next asking', async () => {
  const record = tmp('record');
  const s = stub(answering({ web: 0.9 }), { status: 500 }, answering({ plan: 0.1 }));
  await judgeOver(record, s.fetch).ask(state, { web });
  await judgeOver(record, s.fetch).ask(state, { web, plan });
  const asked = await judgeOver(record, s.fetch).ask(state, { web, plan }, { reask: 'failed' });
  assert.equal(s.calls.length, 3);
  assert.deepEqual(Object.keys(s.calls[2]!.body.questions), ['plan']);
  assert.equal(decide(asked.answers.plan, T), 'no');
  const planKey = asked.answers.plan.key;
  assert.deepEqual(files(path.join(record, planKey)), ['1.asked.json', '1.failed.json', '2.answer.json', '2.asked.json', 'answer.json']);
  assert.equal(fs.readFileSync(path.join(record, planKey, 'answer.json'), 'utf8'), fs.readFileSync(path.join(record, planKey, '2.answer.json'), 'utf8'));
  const none = await judgeOver(record, s.fetch).ask(state, { web, plan }, { reask: 'failed' });
  assert.equal(none.requests, 0, 'nothing failed is left to re-ask');
});

test('a reply that is not an answer is kept, read as malformed, and re-askable', async () => {
  const record = tmp('record');
  const s = stub({ body: { model: MODEL, answers: { web: { type: 'noul', noul: 'high' } } } }, answering({ web: 0.9 }));
  const bad = await judgeOver(record, s.fetch).ask(state, { web });
  assert.equal(bad.answers.web.status === 'failed' && bad.answers.web.kind, 'malformed');
  assert.match(bad.answers.web.status === 'failed' ? bad.answers.web.message : '', /1\.answer\.json/);
  assert.equal((await judgeOver(record, s.fetch).ask(state, { web })).requests, 0);
  const good = await judgeOver(record, s.fetch).ask(state, { web }, { reask: 'failed' });
  assert.equal(decide(good.answers.web, T), 'yes');
  assert.ok(fs.existsSync(path.join(record, good.answers.web.key, '1.answer.json')), 'the bad answer stays on record');
});

test('a claim whose asker never wrote back reads interrupted past its deadline, and is re-asked only on reask', async () => {
  const record = tmp('record');
  const key = keyOf(MODEL, web, state);
  fs.mkdirSync(path.join(record, key));
  const at = new Date(Date.now() - 60_000).toISOString();
  fs.writeFileSync(path.join(record, key, '1.asked.json'), JSON.stringify({
    v: 1, key, n: 1, id: 'web', model: MODEL, question: questionOf(web), state: stateHash(state), at,
    deadline: new Date(Date.now() - 30_000).toISOString(), pid: 4242, host: 'elsewhere',
  }));
  const s = stub(answering({ web: 0.9 }));
  const read = await judgeOver(record, s.fetch).ask(state, { web });
  assert.equal(s.calls.length, 0);
  assert.equal(read.answers.web.status === 'failed' && read.answers.web.kind, 'interrupted');
  assert.match(read.answers.web.status === 'failed' ? read.answers.web.message : '', /process 4242 on elsewhere/);
  const again = await judgeOver(record, s.fetch).ask(state, { web }, { reask: 'failed' });
  assert.equal(s.calls.length, 1);
  assert.equal(decide(again.answers.web, T), 'yes');
});

test('a claim inside its deadline is waited on, not asked', async () => {
  const record = tmp('record');
  const key = keyOf(MODEL, web, state);
  fs.mkdirSync(path.join(record, key));
  const common = { v: 1 as const, key, n: 1, id: 'web', model: MODEL, question: questionOf(web) as never, state: stateHash(state), at: new Date().toISOString() };
  fs.writeFileSync(path.join(record, key, '1.asked.json'), JSON.stringify({ ...common, deadline: new Date(Date.now() + 10_000).toISOString(), pid: 1, host: 'h' }));
  setTimeout(() => writeFact(record, 'answer', {
    ...common, request: 'r', requestId: null, ms: 5, answeredBy: MODEL, raw: { type: 'noul', noul: 0.05 }, usage: {},
  } satisfies AnswerFact), 120);
  const s = stub(answering({ web: 0.9 }));
  const asked = await judgeOver(record, s.fetch).ask(state, { web });
  assert.equal(s.calls.length, 0);
  assert.equal(decide(asked.answers.web, T), 'no', "the other asker's answer");
});

test('two askers at once: one request, one answer file, the same answer for both', async () => {
  const record = tmp('record');
  const s = stub(answering({ web: 0.9 }));
  const both = await Promise.all([judgeOver(record, s.fetch).ask(state, { web }), judgeOver(record, s.fetch).ask(state, { web })]);
  assert.equal(s.calls.length, 1);
  assert.deepEqual(both[0].answers.web, both[1].answers.web);
  assert.deepEqual(files(path.join(record, both[0].answers.web.key)), ['1.answer.json', '1.asked.json', 'answer.json']);
  assert.equal(both[0].requests + both[1].requests, 1);
});

// Every asking of `web` under `state`, written by hand the way an asker writes them.
const webKey = keyOf(MODEL, web, state);
const common = (n: number) => ({ v: 1 as const, key: webKey, n, id: 'web', model: MODEL, question: questionOf(web) as never, state: stateHash(state), at: new Date().toISOString() });
/** A claim whose asker stalled: its deadline has passed, and nothing came of it yet. */
const stalled = (record: string, n: number) => {
  fs.mkdirSync(path.join(record, webKey), { recursive: true });
  fs.writeFileSync(path.join(record, webKey, `${n}.asked.json`), JSON.stringify({ ...common(n), deadline: new Date(Date.now() - 1_000).toISOString(), pid: 4242, host: 'elsewhere' }));
};
/** A stalled asker's answer landing at last, as the asker writes it: the fact, then its link to the key's answer. */
const lands = (record: string, n: number, noul: number) => {
  writeFact(record, 'answer', { ...common(n), request: `r${n}`, requestId: null, ms: 5, answeredBy: MODEL, raw: { type: 'noul', noul }, usage: {} });
  return settle(record, webKey, n);
};
const readWeb = async (record: string) => decide((await judgeOver(record, stub().fetch).ask(state, { web })).answers.web, T);

test('asking 2 answered and read, then asking 1\'s late answer lands: the read stays asking 2\'s', async () => {
  const record = tmp('record');
  stalled(record, 1);
  assert.equal(await readWeb(record), 'unsure', 'asking 1 reads interrupted');
  const s = stub(answering({ web: 0.9 }));
  const reasked = await judgeOver(record, s.fetch).ask(state, { web }, { reask: 'failed' });
  assert.equal(s.calls.length, 1);
  assert.equal(decide(reasked.answers.web, T), 'yes');
  assert.equal(await readWeb(record), 'yes');
  assert.equal(lands(record, 1, 0.05), false, 'the late answer does not become the key\'s');
  assert.equal(await readWeb(record), 'yes');
  assert.equal(await readWeb(record), 'yes');
  assert.equal(JSON.parse(fs.readFileSync(path.join(record, webKey, '1.answer.json'), 'utf8')).raw.noul, 0.05, 'the late answer is kept as a fact of its asking');
});

test('asking 1 stalls, asking 2 is claimed and stalls, asking 1\'s answer lands and is read, then asking 2\'s lands: the read stays asking 1\'s', async () => {
  const record = tmp('record');
  stalled(record, 1);
  stalled(record, 2);
  assert.equal(lands(record, 1, 0.9), true);
  assert.equal(await readWeb(record), 'yes');
  assert.equal(lands(record, 2, 0.05), false);
  assert.equal(await readWeb(record), 'yes');
  assert.equal(await readWeb(record), 'yes');
  assert.equal(JSON.parse(fs.readFileSync(path.join(record, webKey, '2.answer.json'), 'utf8')).raw.noul, 0.05, 'the late answer is kept as a fact of its asking');
});

test('an answer its asker wrote and never linked is settled by the next recorded read; a replay reads it in-flight and writes nothing', async () => {
  const record = tmp('record');
  stalled(record, 1);
  writeFact(record, 'answer', { ...common(1), request: 'r', requestId: null, ms: 5, answeredBy: MODEL, raw: { type: 'noul', noul: 0.9 }, usage: {} });
  const before = files(record);
  const replayed = await judge({ model: MODEL, record, mode: 'replay' }).ask(state, { web });
  assert.equal(replayed.answers.web.status === 'failed' && replayed.answers.web.kind, 'in-flight');
  assert.deepEqual(files(record), before, 'replay linked nothing');
  assert.equal(await readWeb(record), 'yes');
  assert.ok(fs.existsSync(path.join(record, webKey, 'answer.json')));
  assert.equal(decide((await judge({ model: MODEL, record, mode: 'replay' }).ask(state, { web })).answers.web, T), 'yes');
});

test('a fact is never written over: a second answer for the same asking is refused', () => {
  const record = tmp('record');
  const key = keyOf(MODEL, web, state);
  fs.mkdirSync(path.join(record, key));
  const fact = { v: 1 as const, key, n: 1, id: 'web', model: MODEL, question: questionOf(web) as never, state: stateHash(state), at: '', request: 'r', requestId: null, ms: 1, answeredBy: MODEL, raw: null, usage: {} };
  writeFact(record, 'answer', fact);
  assert.throws(() => writeFact(record, 'answer', fact), (e: Error & { exitCode?: number }) => e.exitCode === 2 && /^judge: cannot write .*EEXIST/.test(e.message));
  assert.deepEqual(files(path.join(record, key)), ['1.answer.json']);
});

test('a file on record that is not a fact is refused by name', async () => {
  const record = tmp('record');
  const key = keyOf(MODEL, web, state);
  fs.mkdirSync(path.join(record, key));
  fs.writeFileSync(path.join(record, key, '1.answer.json'), '{ not json');
  await rejects(judgeOver(record, stub(answering({})).fetch).ask(state, { web }), new RegExp(`^judge: cannot read .*${key}/1\\.answer\\.json: .*--record\\.$`));
  fs.writeFileSync(path.join(record, key, '1.answer.json'), JSON.stringify({ key: 'another', n: 1 }));
  await rejects(judgeOver(record, stub(answering({})).fetch).ask(state, { web }), /it is not a record of key/);
  fs.writeFileSync(path.join(record, key, '1.answer.json'), JSON.stringify({ key, n: 2 }));
  await rejects(judgeOver(record, stub(answering({})).fetch).ask(state, { web }), /asking 1/);
  fs.rmSync(path.join(record, key, '1.answer.json'));
  fs.writeFileSync(path.join(record, key, 'answer.json'), JSON.stringify({ key: 'another', n: 1 }));
  await rejects(judgeOver(record, stub(answering({})).fetch).ask(state, { web }), new RegExp(`^judge: cannot read .*${key}/answer\\.json: it is not an answer of key`));
});

test('a record it cannot write is refused, and nothing is asked', { skip: os.userInfo().uid === 0 && 'root writes anywhere' }, async () => {
  const record = tmp('record');
  fs.chmodSync(record, 0o500);
  const s = stub(answering({}));
  try {
    await rejects(judgeOver(record, s.fetch).ask(state, { web }), /^judge: cannot write .*EACCES/);
    assert.equal(s.calls.length, 0);
  } finally {
    fs.chmodSync(record, 0o700);
  }
});
