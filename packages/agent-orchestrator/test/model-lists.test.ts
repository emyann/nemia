/**
 * A model named for a step judged by the list its harness gave, as the daemon recorded it: the record (`models.store.ts`), the daemon's
 * ask (`askedModels`), the load (`parseFolder`) and the start (`modelsRefusal`) refusing an alias or an unlisted word and naming the
 * ids, and passing every word where no list is recorded. The judgement itself is proved by `contracts/model-listed.contract.ts`.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import type { ListedModel } from 'agent-runtime/vocabulary';
import { listedModels, modelsFile, recordedModels, recordModels } from '../src/harness/models.store.ts';
import { parseFolder } from '../src/folder/folder.ts';
import { modelsRefusal } from '../src/start/models.ts';
import { askedModels } from '../src/daemon/up.verb.ts';
import type { Engine } from '../src/runtime-client.ts';
import { WorkflowError } from '../src/step/step.ts';

const OPUS: ListedModel = { id: 'claude-opus-5-5', aliases: ['opus'], name: 'Opus 5.5', keepsAuto: true, efforts: ['low', 'high'] };
const HAIKU: ListedModel = { id: 'claude-haiku-4-5', aliases: ['haiku'], name: 'Haiku 4.5', keepsAuto: false, efforts: undefined };
const LISTS = { claude: [OPUS, HAIKU] };

const step = (lines: string) => [['implement', `---\nplace: git\n${lines}---\nBuild it.\n`]] as Array<[string, string]>;

/** What loading `lines` as a step refuses with, or undefined where it loads. */
const loadRefusal = (lines: string, lists?: typeof LISTS) => {
  try {
    parseFolder(step(lines), undefined, undefined, undefined, undefined, lists);
  } catch (e) {
    assert.ok(e instanceof WorkflowError);
    return e.message;
  }
  return undefined;
};

describe('the record of what each harness lists: one file the daemon writes, every harness whole', () => {
  test('a harness recorded is read back, another recorded after it keeps the first, and a store with no file records nothing', () => {
    const home = scratch('wf-models-');
    assert.deepEqual(recordedModels(home), {});
    recordModels(home, 'claude', [OPUS, HAIKU], '2026-11-26T10:00:00.000Z');
    recordModels(home, 'other', [OPUS], '2026-11-26T11:00:00.000Z');
    assert.deepEqual(listedModels(home), { claude: [OPUS, HAIKU], other: [OPUS] });
    recordModels(home, 'claude', [HAIKU], '2026-11-26T12:00:00.000Z');
    assert.deepEqual(listedModels(home).claude, [HAIKU], "a harness's answer replaces its own entry whole");
    assert.equal(recordedModels(home).other?.at, '2026-11-26T11:00:00.000Z');
  });

  test('a file that is not JSON, and an entry that is malformed, record nothing', () => {
    const home = scratch('wf-models-');
    fs.writeFileSync(modelsFile(home), 'not json');
    assert.deepEqual(recordedModels(home), {});
    fs.writeFileSync(modelsFile(home), JSON.stringify({ claude: { at: 'now', models: [{ id: 1 }] }, ok: { at: 'now', models: [] } }));
    assert.deepEqual(Object.keys(recordedModels(home)), ['ok']);
  });
});

describe("the daemon's ask: each harness's answer is recorded whole, and one that fails or lists none leaves the record", () => {
  test('a list is recorded, a failure keeps the last answer, a harness that lists none writes none', async () => {
    const home = scratch('wf-models-');
    const answers: Record<string, Effect.Effect<readonly ListedModel[] | undefined, unknown>> = {
      claude: Effect.succeed([OPUS]),
      broken: Effect.fail(new Error('no account')),
      died: Effect.die(new Error('the harness broke')),
      codex: Effect.succeed(undefined),
    };
    recordModels(home, 'broken', [HAIKU], '2026-11-26T09:00:00.000Z');
    await Effect.runPromise(
      askedModels({} as Engine, home, '2026-11-26T10:00:00.000Z', ['claude', 'broken', 'died', 'codex'], (name) => answers[name] as never),
    );
    assert.deepEqual(Object.keys(recordedModels(home)).sort(), ['broken', 'claude']);
    assert.deepEqual(listedModels(home).broken, [HAIKU], 'the failed ask kept its last');
    assert.equal(recordedModels(home).claude?.at, '2026-11-26T10:00:00.000Z');
  });
});

describe('a step names a model: refused at load, naming the ids, where its harness lists models', () => {
  test('an alias is refused naming the id it resolves to and each listed id; the id itself loads', () => {
    const words = loadRefusal('model: opus\n', LISTS);
    assert.ok(words !== undefined, 'refused');
    for (const named of ['opus', 'claude-opus-5-5', 'claude-haiku-4-5']) assert.ok(words.includes(named), `names ${named}: ${words}`);
    assert.equal(loadRefusal('model: claude-opus-5-5\n', LISTS), undefined);
  });

  test('a word the harness does not list is refused', () => {
    assert.ok(loadRefusal('model: gpt-9\n', LISTS) !== undefined);
  });

  test('a listed model that drops the step’s mode, or the step’s effort, is refused; naming a mode it keeps loads', () => {
    assert.ok(loadRefusal('model: claude-haiku-4-5\n', LISTS) !== undefined, 'filed in auto by default, which haiku drops');
    assert.equal(loadRefusal('model: claude-haiku-4-5\npermissionMode: dontAsk\n', LISTS), undefined);
    assert.ok(loadRefusal('model: claude-opus-5-5\neffort: max\n', LISTS) !== undefined);
    assert.equal(loadRefusal('model: claude-opus-5-5\neffort: high\n', LISTS), undefined);
  });

  test('where no list is recorded for the step’s harness, any word passes', () => {
    assert.equal(loadRefusal('model: opus\n'), undefined);
    assert.equal(loadRefusal('model: opus\n', {} as typeof LISTS), undefined);
    assert.equal(loadRefusal('harness: codex\nmodel: opus\n', LISTS), undefined);
  });
});

describe('a run’s models (`nemia start --model`, a card’s `model:`): refused as the load refuses them', () => {
  const steps = parseFolder(step(''), undefined, undefined, undefined, undefined, undefined);
  const said = (name: string) => `--model ${name}`;
  test('an alias and an unlisted word are refused, naming the ids; a listed id and any word without a list are taken', () => {
    const alias = modelsRefusal(steps, { implement: 'sonnet' }, said, LISTS);
    assert.ok(alias !== undefined && alias.includes('claude-opus-5-5'), String(alias));
    assert.equal(modelsRefusal(steps, { implement: 'claude-opus-5-5' }, said, LISTS), undefined);
    assert.equal(modelsRefusal(steps, { implement: 'sonnet' }, said), undefined);
  });
});
