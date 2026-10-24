/** The check of an engine no command is to ask (`unasked`): it refuses each of the four writes, and lets a read through. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { Engine } from 'agent-runtime';
import { testEngine, type TestEngine } from 'agent-runtime/testing';
import { unasked } from './unasked.ts';

/** `use` run over the stand-in `made`'s engine. */
const over = <A, E>(made: TestEngine, use: (engine: typeof Engine.Service) => Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(Engine.use(use).pipe(Effect.provide(made.layer)));

/** A stand-in with one task filed and settled `running`. */
async function atWork(): Promise<TestEngine> {
  const made = testEngine();
  await over(made, (engine) => engine.file({ id: 't', brief: 'work', cwd: '/' }));
  made.settle('t', 'working');
  return made;
}

test('an engine nothing was asked of, and one only read, passes', async () => {
  const made = testEngine();
  unasked(made);
  await over(made, (engine) => engine.view('t'));
  await over(made, (engine) => engine.list());
  unasked(made);
});

test('REFUSED: an engine a command filed on, stopped, said to or forgot from, each alone', async () => {
  const refused = (made: TestEngine, mark: 'filings' | 'stopped' | 'said' | 'forgets') =>
    assert.throws(
      () => unasked(made),
      (err: unknown) =>
        err instanceof assert.AssertionError &&
        err.message.includes('one did') &&
        (err.actual as Record<typeof mark, unknown[]>)[mark].length > 0,
    );
  refused(await atWork(), 'filings');
  for (const mark of ['stopped', 'said', 'forgets'] as const) {
    const made = await atWork();
    if (mark === 'stopped') await over(made, (engine) => engine.stop('t'));
    if (mark === 'said') await over(made, (engine) => engine.say('t', 'go on'));
    if (mark === 'forgets') await over(made, (engine) => engine.forget(['t'], { yes: false })).catch(() => undefined);
    made.filings.length = 0;
    assert.ok(made[mark].length > 0, `${mark} was marked`);
    refused(made, mark);
  }
});
