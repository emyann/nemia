// The replay layer: the supervisor's routing tested with no network and no key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { Judge, replay, route, orUnsure } from './judge.ts';

const needs = JSON.parse((await import('node:fs')).readFileSync('e4-needs.json', 'utf8')).needs;
const Q_KIND = { type: 'choice', instructions: 'What does the blocked step in `needs` need from a person?',
  criteria: { decision: 'A choice between options, or an approval of a plan or a design: a judgement only the owner can make.',
              unblock: 'Something in the environment fixed or permitted: a file made writable, a login, a permission, a tool installed. No design judgement.',
              nothing: 'Nothing is asked of a person.' } };
const kindOf = (n: any) => Effect.gen(function* () { const j = yield* Judge; const v = yield* j.ask({ state: { summary: n.summary, needs: n.needs }, questions: { kind: Q_KIND } }); return v.answers.kind; });

test('a recorded verdict is read back, typed, with no network', async () => {
  delete process.env.TYPESAFE_API_KEY;
  const a = await Effect.runPromise(kindOf(needs[0]).pipe(Effect.provide(Judge.layer(replay('verdicts.jsonl')))));
  assert.equal(a.type, 'choice'); assert.equal(a.type === 'choice' && a.choice, 'unblock');
});
test('a request nobody recorded is refused, and the caller reads that as unsure, never as a verdict', async () => {
  const r = await Effect.runPromise(orUnsure(kindOf({ summary: 'x', needs: 'never asked' })).pipe(Effect.provide(Judge.layer(replay('verdicts.jsonl')))));
  assert.equal(r.ok, false); assert.equal(!r.ok && r.err._tag, 'JudgeRefused');
});
test('the threshold has a third answer', () => { assert.equal(route(0.6, 0.8, 0.2), 'unsure'); assert.equal(route(0.93, 0.8, 0.2), 'yes'); });
