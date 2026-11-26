/**
 * A harness's models through the runtime: the rows the Agent SDK answers read by canonical id (`listedOf`), the ask itself
 * (`claudeModels`) over a stand-in for the SDK's call, and the engine's `models` verb, which answers for a harness that lists models and
 * says none for one that does not.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { Effect, Exit } from 'effect';
import { claudeModels, listedOf, type ModelRow, type OpenModels } from '../src/harness/claude/index.ts';
import { Engine } from '../src/index.ts';
import { scratch } from 'test-kit/scratch';
import { asyncOps, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';

const ROWS: readonly ModelRow[] = [
  { value: 'opus', resolvedModel: 'claude-opus-5-5', displayName: 'Opus', supportsAutoMode: true, supportedEffortLevels: ['low', 'high'] },
  { value: 'claude-opus-5-5', displayName: 'Opus 5.5' },
  { value: 'haiku', resolvedModel: 'claude-haiku-4-5', displayName: 'Haiku', supportsAutoMode: false },
];

const OPUS = { id: 'claude-opus-5-5', aliases: ['opus'], name: 'Opus', keepsAuto: true, efforts: ['low', 'high'] };
const HAIKU = { id: 'claude-haiku-4-5', aliases: ['haiku'], name: 'Haiku', keepsAuto: false, efforts: undefined };

/** A stand-in for the SDK's models call: what `answer` says, and that the ask closed its query. */
const standIn = (answer: () => Promise<readonly ModelRow[]>) => {
  const seen = { closes: 0 };
  const ask: OpenModels = () => ({
    models: answer,
    close: async () => {
      seen.closes += 1;
    },
  });
  return { ask, seen };
};

const fake: AsyncRunner = {
  spawn: async () => {},
  observe: async () => new Map(),
  stop: async () => {},
  logs: async () => '',
};

describe('listedOf and claudeModels: the models the harness lists, by canonical id', () => {
  test('an alias row yields its resolved model once, with the alias kept, and a model its own row names too is not listed twice', () => {
    assert.deepEqual(listedOf(ROWS), [OPUS, HAIKU]);
  });

  test('the ask answers the rows read by `listedOf` and closes its query', async () => {
    const stand = standIn(async () => ROWS);
    assert.deepEqual(await Effect.runPromise(claudeModels({ ask: stand.ask })), [OPUS, HAIKU]);
    assert.equal(stand.seen.closes, 1);
  });

  test('a refused ask and one that does not answer in time fail and close the query', async () => {
    const refused = standIn(() => Promise.reject(new Error('no account')));
    assert.ok(Exit.isFailure(await Effect.runPromiseExit(claudeModels({ ask: refused.ask }))));
    assert.equal(refused.seen.closes, 1);
    const silent = standIn(() => new Promise(() => {}));
    assert.ok(Exit.isFailure(await Effect.runPromiseExit(claudeModels({ ask: silent.ask, timeoutMs: 20 }))));
    assert.equal(silent.seen.closes, 1);
  });
});

describe("the engine's models verb: the list of a harness that has one, none for one that has none", () => {
  test('answers the harness named its list, and nothing for a harness without the verb or one it does not have', async () => {
    const stand = standIn(async () => ROWS);
    const engine = builtEngine(
      Engine.layer({
        root: scratch('ae-models-'),
        harnesses: { claude: { ...asyncOps(fake), models: claudeModels({ ask: stand.ask }) }, fake: asyncOps(fake) },
      }),
    );
    assert.deepEqual(await Effect.runPromise(engine.models('claude')), [OPUS, HAIKU]);
    assert.equal(await Effect.runPromise(engine.models('fake')), undefined);
    assert.equal(await Effect.runPromise(engine.models('nope')), undefined);
  });
});
