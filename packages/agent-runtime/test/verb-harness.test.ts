/**
 * The Engine verbs only some harnesses answer go to a harness by what it declares (`verbHarnessOf`), on the engine and on its
 * stand-in alike: a harness named that the engine has not is refused as unknown, one that does not declare the verb as undeclared, and
 * an engine none of whose harnesses declares it as none — each in the verb's own error, nothing asked of any harness. The two drains
 * ask no harness: each is the store's record, judged per harness where it is read (`test/drain-harness.test.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { commandHarness, Engine, type EngineShape } from '../src/index.ts';
import { testEngine } from '../src/testing.ts';
import { testOps } from '../src/harness/seam.ts';
import { scratch } from 'test-kit/scratch';
import { builtEngine } from './engine.ts';

/** The tag a call failed with; one that succeeded fails the test. */
const tagOf = async (asked: Effect.Effect<unknown, { _tag: string }>): Promise<string> =>
  (await Effect.runPromise(Effect.flip(asked)))._tag;

/** The engine of `layer`, run as a test runs the stand-in's. */
const engineOf = (layer: Parameters<typeof builtEngine>[0]): EngineShape => builtEngine(layer);

/**
 * Two engines, each with a runner of the consumer's that declares nothing but the ops it has (`plain`, no quota) and the command
 * harness, which declares none of the ten: the real engine, and the stand-in told the same declarations.
 */
const sides = (): Array<[string, EngineShape]> => [
  ['engine', engineOf(Engine.layer({ root: scratch('ae-verb-harness-'), harnesses: { plain: testOps(), cmd: commandHarness } }))],
  [
    'stand-in',
    engineOf(
      testEngine({
        harnesses: [
          { name: 'plain', can: ['interrupt', 'answerAsk'] },
          { name: 'cmd', can: commandHarness.can },
        ],
      }).layer,
    ),
  ],
];

test('a verb only some harnesses answer: unknown, undeclared and none refused in its own error, on the engine and the stand-in', async (t) => {
  for (const [side, engine] of sides()) {
    await t.test(side, async () => {
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
      for (const [name, asked, tag] of rows) assert.equal(await tagOf(asked), tag, name);
    });
  }
});
