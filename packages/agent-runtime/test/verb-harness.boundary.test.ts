/**
 * The Engine verbs only some harnesses answer go to a harness by what it declares (`verbHarnessOf`), on the real engine: a harness
 * named that the engine has not is refused as unknown, one that does not declare the verb as undeclared, and an engine none of whose
 * harnesses declares it as none — each in the verb's own error, nothing asked of any harness. The stand-in is held to the same rows in
 * `engine-contract.test.ts`; the two drains ask no harness (`test/drain-harness.test.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { commandHarness, Engine, testOps, type EngineShape } from '../src/index.ts';
import { scratch } from 'test-kit/scratch';
import { builtEngine } from './engine.ts';

/** The engine of `layer`, run as a test runs the stand-in's. */
const verbEngineOf = (layer: Parameters<typeof builtEngine>[0]): EngineShape => builtEngine(layer);

/** The tag a call failed with; one that succeeded fails the test. */
const verbTagOf = async (asked: Effect.Effect<unknown, { _tag: string }>): Promise<string> =>
  (await Effect.runPromise(Effect.flip(asked)))._tag;

test('a verb only some harnesses answer: unknown, undeclared and none refused in its own error, on the real engine', async () => {
  {
    const engine = verbEngineOf(Engine.layer({ root: scratch('ae-verb-harness-'), harnesses: { plain: testOps(), cmd: commandHarness } }));
    {
      await Effect.runPromise(
        engine.file({ brief: 'b', cwd: '/r', id: 'on-cmd', harness: 'cmd', queued: true, config: { command: ['true'] } }),
      );
      const rows: Array<[string, Effect.Effect<unknown, { _tag: string }>, string]> = [
        ['quota of a harness the engine has not: unknown', engine.quota('nope'), 'QuotaRefused'],
        ['quota of one that declares none: undeclared', engine.quota('cmd'), 'QuotaRefused'],
        ['quota with none named, and none declaring it: none', engine.quota(), 'QuotaRefused'],
        ['interrupt of a task on a harness that declares none: undeclared', engine.interrupt('on-cmd'), 'InterruptRefused'],
        [
          'answerAsk of a task on a harness that declares none: undeclared',
          engine.answerAsk('on-cmd', { id: 'a', answers: {} }),
          'AnswerRefused',
        ],
        [
          'mcpState with no harness declaring mcp: none',
          engine.mcpState({ s: { type: 'http', url: 'https://e.example/mcp' } }),
          'McpStateRefused',
        ],
      ];
      for (const [name, asked, tag] of rows) assert.equal(await verbTagOf(asked), tag, name);
    }
  }
});
