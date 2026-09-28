/** Replay: answers from the record alone. It never asks and never writes, and a question it has no record of rejects. */
import { answering, ENV, files, reached, stub, tmp } from './hermetic.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { decide, judge, noul } from '../src/facade.ts';
import { keyOf, questionOf, stateHash } from '../src/key.ts';

const MODEL = 'jev-1.13.0';
const state = { card: 'Sort the inbox by date.' };
const web = noul('Does `card` touch the web app?', { true: 'yes', false: 'no' });
const plan = noul('Should `card` be planned first?', { true: 'yes', false: 'no' });

test('replay answers what the recorded judge was told, with no network at all', async () => {
  const record = tmp('replay');
  await judge({ model: MODEL, record, env: ENV, fetch: stub(answering({ web: 0.9 })).fetch }).ask(state, { web });
  const before = files(record);
  const replayed = await judge({ model: MODEL, record, mode: 'replay', env: ENV }).ask(state, { web });
  assert.equal(decide(replayed.answers.web, { yes: 0.8, no: 0.2 }), 'yes');
  assert.equal(replayed.requests, 0);
  assert.equal(reached.length, 0);
  assert.deepEqual(files(record), before, 'replay wrote nothing');
});

test('a question replay has no record of rejects, naming it, and writes nothing', async () => {
  const record = tmp('replay');
  await judge({ model: MODEL, record, env: ENV, fetch: stub(answering({})).fetch }).ask(state, { web });
  const before = files(record);
  const e = await judge({ model: MODEL, record, mode: 'replay' })
    .ask(state, { web, plan })
    .then(
      () => assert.fail('it answered'),
      (e) => e,
    );
  assert.equal(e.exitCode, 2);
  assert.match(
    e.message,
    /^judge: replay holds no record of `plan` \("Should `card` be planned first\?"\) under .*Ask it once with the recorded judge/,
  );
  assert.deepEqual(files(record), before);
  const other = await judge({ model: MODEL, record, mode: 'replay' })
    .ask({ card: 'Another card.' }, { web })
    .then(
      () => assert.fail('it answered'),
      (e) => e,
    );
  assert.match(other.message, /no record of `web`/, 'another state is another key');
});

test('replay reads a failure as the failure, and a claim inside its deadline as in-flight, without waiting', async () => {
  const record = tmp('replay');
  await judge({ model: MODEL, record, env: ENV, fetch: stub({ status: 500 }).fetch, retries: 0 }).ask(state, { web });
  const failed = await judge({ model: MODEL, record, mode: 'replay' }).ask(state, { web });
  assert.equal(failed.answers.web.status === 'failed' && failed.answers.web.kind, 'unreachable');
  const key = keyOf(MODEL, plan, state);
  fs.mkdirSync(path.join(record, key));
  fs.writeFileSync(
    path.join(record, key, '1.asked.json'),
    JSON.stringify({
      v: 1,
      key,
      n: 1,
      id: 'plan',
      model: MODEL,
      question: questionOf(plan),
      state: stateHash(state),
      at: new Date().toISOString(),
      deadline: new Date(Date.now() + 60_000).toISOString(),
      pid: 1,
      host: 'h',
    }),
  );
  const started = Date.now();
  const flying = await judge({ model: MODEL, record, mode: 'replay' }).ask(state, { plan });
  assert.ok(Date.now() - started < 1_000);
  assert.equal(flying.answers.plan.status === 'failed' && flying.answers.plan.kind, 'in-flight');
  assert.equal(decide(flying.answers.plan, { yes: 0.8, no: 0.2 }), 'unsure');
});
