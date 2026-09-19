import test from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Exit, Cause } from 'effect';
import { Judge } from './judge.ts';
import { cardQuestions, cardState } from './questions.ts';
import fs from 'node:fs';

const file = `${import.meta.dirname}/verdicts.jsonl`;
const run = (state: unknown, asking = 1) => Effect.runPromiseExit(
  Effect.gen(function* () { return yield* (yield* Judge).ask({ state, questions: cardQuestions, asking }); }).pipe(Effect.provide(Judge.replay(file))));

test('replay answers a recorded asking with no key in the environment', async () => {
  assert.equal(process.env.TYPESAFE_API_KEY, undefined);
  const brief = JSON.parse(fs.readFileSync(`${import.meta.dirname}/dataset.json`, 'utf8')).runs[0].brief;
  const exit = await run(cardState(brief));
  assert.ok(Exit.isSuccess(exit));
});

test('replay REFUSES what was never asked: a typed NotRecorded, never a call', async () => {
  const exit = await run(cardState('a card nobody ever filed'));
  assert.ok(Exit.isFailure(exit));
  assert.match(Cause.pretty(exit.cause), /NotRecorded/);
});

test('replay refuses a third asking of a recorded card: asked twice, recorded twice', async () => {
  const brief = JSON.parse(fs.readFileSync(`${import.meta.dirname}/dataset.json`, 'utf8')).runs[0].brief;
  assert.ok(Exit.isFailure(await run(cardState(brief), 3)));
});
