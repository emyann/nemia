/**
 * A harness's declaration and its driver must not drift: what each shipped harness declares is what its runner does, its job's spec
 * declares what it does, and the default harness is the first of each list. And a spec says what it takes in `can` alone: a spec that
 * still carries a boolean `can` replaced is refused by name at `Engine.layer`, rather than its word read as nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scratch } from 'test-kit/scratch';
import { Engine, codex, commandHarness, type HarnessSpec } from '../src/index.ts';
import { CLAUDE_DECLARATION } from '../src/harness/claude/vocabulary.ts';
import { CODEX_DECLARATION } from '../src/harness/codex/vocabulary.ts';
import { COMMAND_DECLARATION } from '../src/harness/command/vocabulary.ts';
import { REMOTE_DECLARATION } from '../src/a2a/vocabulary.ts';
import { DEFAULT_HARNESS, HARNESS_DECLARATIONS, declares, type Capability } from '../src/harness/declaration.ts';
import { claudeJobSpec } from '../src/harness/claude/code.ts';
import { attachedSessions } from '../src/harness/claude/index.ts';
import { DEFAULT_HARNESSES } from '../src/service/default-harnesses.ts';
import { declarationOf, heldHarnessesOf, optionsRefusalOf, runnersOf } from '../src/service/options.ts';
import { testOps, type RunnerOps } from '../src/harness/seam.ts';
import { builtEngine } from './engine.ts';

/** The Engine verbs a declaration lists that a runner answers through an op of its own, and that op. */
const VERB_OPS: readonly [Capability, keyof RunnerOps][] = [
  ['interrupt', 'interrupt'],
  ['answerAsk', 'answer'],
  ['quota', 'quota'],
];

test('each shipped harness declares what its driver does, and no more', async (t) => {
  const root = scratch('declaration-');
  const runners = runnersOf(DEFAULT_HARNESSES, { root, attached: attachedSessions(root) });

  await t.test('a verb declared ⇔ its runner has the op that answers it', () => {
    for (const [name, h] of Object.entries(DEFAULT_HARNESSES)) {
      const runner = runners[name];
      assert.ok(runner !== undefined, `\`${name}\` has a runner`);
      for (const [verb, op] of VERB_OPS) {
        assert.equal(declares(declarationOf(h)?.can, verb), runner[op] !== undefined, `\`${name}\` declares \`${verb}\` ⇔ has \`${op}\``);
      }
    }
  });

  await t.test('`hold` declared ⇔ a holder holds the harness: the verbs with no op of a runner (mcp, hold, drain) are the held', () => {
    const held = heldHarnessesOf(DEFAULT_HARNESSES);
    for (const [name, h] of Object.entries(DEFAULT_HARNESSES)) {
      for (const verb of ['hold', 'mcp', 'drain'] as const) {
        assert.equal(declares(declarationOf(h)?.can, verb), held.includes(name), `\`${name}\` declares \`${verb}\` ⇔ it is held`);
      }
    }
  });

  await t.test('each spec declares its harness’s `can`, word for word', () => {
    assert.deepEqual(claudeJobSpec().can, CLAUDE_DECLARATION.can, 'a Claude Code job');
    assert.deepEqual(codex.can, CODEX_DECLARATION.can, 'Codex');
    assert.deepEqual(commandHarness.can, COMMAND_DECLARATION.can, 'the command harness');
  });

  await t.test('declarationOf: the literal, a spec’s own, a remote agent’s, and none for a runner of the consumer’s', () => {
    assert.equal(declarationOf('claude'), CLAUDE_DECLARATION);
    assert.deepEqual(declarationOf(codex)?.can, CODEX_DECLARATION.can);
    assert.equal(declarationOf({ url: 'https://a.example' }), REMOTE_DECLARATION);
    assert.equal(declarationOf(testOps({ sessions: new Map() })), undefined);
  });

  await t.test('the default harness is the first declared and the first configured', () => {
    assert.equal(Object.keys(HARNESS_DECLARATIONS)[0], DEFAULT_HARNESS);
    assert.equal(Object.keys(DEFAULT_HARNESSES)[0], DEFAULT_HARNESS);
    assert.deepEqual(Object.keys(DEFAULT_HARNESSES), Object.keys(HARNESS_DECLARATIONS), 'one harness configured for each declared');
  });
});

test('a spec that still carries a boolean `can` replaced is refused by name at `Engine.layer`', async (t) => {
  const RETIRED = ['claudeFlags', 'codexArgs', 'commandArgs', 'env', 'projectMcp', 'enabledSkills', 'mounts', 'callAdmission'];
  for (const field of RETIRED) {
    await t.test(field, () => {
      const spec = { ...commandHarness, [field]: field === 'mounts' ? { readOnly: true } : true };
      const said = optionsRefusalOf({ harnesses: { made: spec } });
      assert.ok(said?.includes(`\`${field}\``) && said.includes('`can`'), `names the field and \`can\`: ${said}`);
      assert.throws(
        () => builtEngine(Engine.layer({ root: scratch('declaration-'), harnesses: { made: spec } })),
        (err: { _tag?: string }) => err._tag === 'EngineRefused',
      );
    });
  }
  await t.test('a `can` that is no list of capability words', () => {
    for (const can of [undefined, 'env', ['env', 'teleport']]) {
      const said = optionsRefusalOf({ harnesses: { made: { ...commandHarness, can } as HarnessSpec } });
      assert.ok(said?.includes('`can`'), `refused, naming \`can\`: ${JSON.stringify(can)} → ${said}`);
    }
  });
  await t.test('a range of windows with no `contextTokens` declared, and one declared with no range', () => {
    const ranged = optionsRefusalOf({ harnesses: { made: { ...commandHarness, contextTokens: { least: 1, most: 2 } } } });
    assert.ok(ranged?.includes('`contextTokens`'), String(ranged));
    const unranged = optionsRefusalOf({ harnesses: { made: { ...commandHarness, can: ['contextTokens'] } } });
    assert.ok(unranged?.includes('`contextTokens`'), String(unranged));
  });
  await t.test('the shipped specs build', () => {
    assert.equal(optionsRefusalOf({ harnesses: DEFAULT_HARNESSES }), undefined);
  });
});
