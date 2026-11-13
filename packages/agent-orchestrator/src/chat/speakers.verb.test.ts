/**
 * Who may speak in her chat as an agent: a name allowed is listed once however often it is allowed, taken back it is gone, and a name no
 * agent speaks under is refused with nothing written. Each write is the person's own setting, asked of them every time, and each verb is
 * served by its endpoint of the api's nemia group.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit } from 'effect';
import { scratch } from 'test-kit/scratch';
import { CHAT_ALLOW, CHAT_DISALLOW, CHAT_SPEAKERS } from './speakers.verb.ts';
import { speakersFile } from './chat.store.ts';
import { storeGiven } from '../../test/config-given.ts';

/** The tag a handler's refusal carries, or undefined where it answered. */
const refusedAs = async (program: Effect.Effect<unknown, unknown>): Promise<string | undefined> => {
  const exit = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(exit)) return undefined;
  const failure = exit.cause.reasons.find((r) => r._tag === 'Fail');
  return failure?._tag === 'Fail' ? (failure.error as { _tag?: string })._tag : 'Die';
};

/** A handler's answer at the store `home`, run with no engine or place: these commands need neither. */
const answer = <A>(home: string, program: Effect.Effect<A, unknown, unknown>) =>
  Effect.runPromise(storeGiven(home)(program) as Effect.Effect<A>);

test('nemia chat allow, disallow and speakers: the names an agent may speak under in her chat', async (t) => {
  const home = scratch('wf-chat-speakers-');
  await t.test('none is allowed before the person allows one', async () => {
    assert.deepEqual(await answer(home, CHAT_SPEAKERS.handler({})), { allowed: [] });
  });
  await t.test('a name allowed twice is listed once, in her chat’s own folder', async () => {
    await answer(home, CHAT_ALLOW.handler({ name: 'operator' }));
    await answer(home, CHAT_ALLOW.handler({ name: 'operator' }));
    await answer(home, CHAT_ALLOW.handler({ name: 'nemia-ab12/design' }));
    assert.deepEqual(await answer(home, CHAT_SPEAKERS.handler({})), { allowed: ['operator', 'nemia-ab12/design'] });
    assert.ok(fs.existsSync(speakersFile(path.join(home, 'nemia'))));
  });
  await t.test('a name taken back is gone, and the others stay', async () => {
    assert.deepEqual(await answer(home, CHAT_DISALLOW.handler({ name: 'operator' })), { allowed: ['nemia-ab12/design'] });
  });
  await t.test(
    'REFUSED: a name no agent speaks under, by the handler the api and the client both reach, with nothing written',
    async () => {
      for (const name of ['You', 'person', 'Not/A Name'])
        assert.equal(await refusedAs(storeGiven(home)(CHAT_ALLOW.handler({ name })) as Effect.Effect<unknown, unknown>), 'Invalid', name);
      assert.deepEqual(await answer(home, CHAT_SPEAKERS.handler({})), { allowed: ['nemia-ab12/design'] });
    },
  );
  await t.test('REFUSED: a call given no store root does not compile, and one run all the same writes nothing', async () => {
    const before = fs.readFileSync(speakersFile(path.join(home, 'nemia')), 'utf8');
    // @ts-expect-error -- the handler asks the store root, and it is given none
    assert.equal(await refusedAs(CHAT_ALLOW.handler({ name: 'operator' })), 'Die');
    assert.equal(fs.readFileSync(speakersFile(path.join(home, 'nemia')), 'utf8'), before);
  });
  await t.test('each write is the person’s own setting, asked of them every time, and each is served by its endpoint of the api', () => {
    for (const c of [CHAT_ALLOW, CHAT_DISALLOW]) assert.deepEqual([c.writes, c.class, c.asksAlways], [true, 'ask', true], c.name);
    assert.deepEqual([CHAT_SPEAKERS.writes, CHAT_SPEAKERS.class], [false, 'read']);
    assert.deepEqual(
      [CHAT_SPEAKERS, CHAT_ALLOW, CHAT_DISALLOW].map((c) => [c.served?.map((l) => l.endpoint), c.only]),
      [
        [['nemia.speakers'], undefined],
        [['nemia.allowSpeaker'], undefined],
        [['nemia.disallowSpeaker'], undefined],
      ],
    );
  });
});
