/** A test file whose one test files on an engine it holds unasked (`heldUnasked`): run as a child, it must fail. */
import { test } from 'node:test';
import { Effect } from 'effect';
import { Engine } from 'agent-runtime';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../placed.ts';
import { heldUnasked } from '../../unasked.ts';

const engine = eachTest(testEngine);
heldUnasked(engine);

test('a command that files on the engine', async () => {
  await Effect.runPromise(Engine.use((e) => e.file({ id: 't', brief: 'work', cwd: '/' })).pipe(Effect.provide(engine().layer)));
});
