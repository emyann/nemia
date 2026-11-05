/**
 * The Factory (`src/factory.ts`): a factory and a page of them decoded from JSON and encoded back equal, a factory missing every optional
 * key read; its condition words closed; and its sub-resources — its rules, its instruction and its commands, the old route's lines
 * decoded as the board read them — decoded as the api answers them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import {
  API_VERSION,
  Factory,
  FactoryCommands,
  FactoryInstruction,
  FactoryInstructionWords,
  FactoryInstructionWrite,
  FactoryList,
  FactoryRules,
  FactoryRulesWrite,
} from 'objects';

const templated = {
  apiVersion: API_VERSION,
  kind: 'Factory',
  metadata: { name: 'mill', creationTimestamp: '2026-11-04T00:00:00.000Z', resourceVersion: 'f1', generation: 3 },
  spec: {
    repos: ['/repo'],
    workflows: ['build', 'quick'],
    hires: { 'build/implement': 'grace' },
    volumes: [{ name: 'data', path: '/a/data', readOnly: true }],
    harnessSettings: { claude: { model: 'opus' } },
    revisions: 'follow',
    template: { source: 'sdlc', version: '1.2.0', params: { repo: '/repo', strict: true, cap: 3 } },
    level: 'semi-auto',
  },
  status: {
    observedGeneration: 3,
    conditions: [
      {
        type: 'Applied',
        status: 'True',
        reason: 'Rendered',
        message: 'sdlc 1.2.0 rendered',
        lastTransitionTime: '2026-11-04T00:01:00.000Z',
      },
      { type: 'ConflictsPending', status: 'False', reason: 'NoUpgrade', message: 'no upgrade waits' },
    ],
    applied: '1.2.0',
    upgrade: { from: '1.2.0', to: '1.3.0', conflicts: [{ at: 'agents/grace.md', base: 'a', ours: 'b', theirs: null }] },
    untrusted: [{ place: '/repo', harness: 'Claude Code', withheld: 'its hooks', never: 'the folder is gone' }],
  },
} as const;

/** The default factory: no workflows key (it offers every workflow found), nothing else optional. */
const bare = {
  apiVersion: API_VERSION,
  kind: 'Factory',
  metadata: { name: 'default', creationTimestamp: '2026-11-04T00:00:00.000Z', resourceVersion: 'f0' },
  spec: { repos: ['/repo'], hires: {}, volumes: [] },
  status: { conditions: [], untrusted: [] },
} as const;

const stray = {
  ...bare,
  metadata: { ...bare.metadata, name: 'broken' },
  spec: { repos: [], hires: {}, volumes: [] },
  status: { conditions: [], untrusted: [], error: 'broken.json does not read as JSON' },
} as const;

const roundTrip = <S extends Schema.Codec<unknown, unknown>>(schema: S, value: unknown): unknown =>
  JSON.parse(JSON.stringify(Schema.encodeSync(schema)(Schema.decodeUnknownSync(schema)(JSON.parse(JSON.stringify(value))))));

test('a factory and a page of them decode from JSON and encode back the same, absent keys left absent', () => {
  assert.deepEqual(roundTrip(Factory, templated), templated);
  assert.deepEqual(roundTrip(Factory, bare), bare);
  assert.deepEqual(roundTrip(Factory, stray), stray);
  const page = { apiVersion: API_VERSION, kind: 'FactoryList', metadata: { continue: 'bWlsbA', remainingItemCount: 1 }, items: [bare] };
  assert.deepEqual(roundTrip(FactoryList, page), page);
});

test("the factory's sub-resources decode as the api answers them and as it is sent them", () => {
  const rules = { name: 'mill', file: '/store/factories/mill/rules.md', words: 'Be brief.', error: null, revision: 'r3' };
  assert.deepEqual(roundTrip(FactoryRules, rules), rules);
  const removed = { name: 'mill', file: '/store/factories/mill/rules.md', words: null, error: null, removed: true };
  assert.deepEqual(roundTrip(FactoryRules, removed), removed);
  const instruction = { name: 'mill', path: null, store: true, file: '/store/mill.md', words: 'Hi', error: null, stored: true };
  assert.deepEqual(roundTrip(FactoryInstruction, instruction), instruction);
  assert.deepEqual(roundTrip(FactoryRulesWrite, { words: 'Be brief.' }), { words: 'Be brief.' });
  assert.deepEqual(roundTrip(FactoryInstructionWrite, { path: 'NEMIA.md' }), { path: 'NEMIA.md' });
  assert.deepEqual(roundTrip(FactoryInstructionWrite, { store: true }), { store: true });
  assert.deepEqual(roundTrip(FactoryInstructionWords, { words: 'Hi' }), { words: 'Hi' });
});

test("FactoryCommands decodes the old route's lines, with unschedule by workflow and volume rm by volume name", () => {
  const commands = {
    attach: 'nemia factory attach mill <workflow>',
    rm: 'nemia factory rm mill',
    add: 'nemia factory add mill --repo <path>',
    schedule: 'nemia factory schedule mill <workflow> --cron <expr> --brief <text>',
    trust: 'nemia factory trust mill',
    volume: 'nemia factory volume add mill <path>:ro|:rw',
    unschedule: { build: 'nemia factory unschedule mill build' },
    volumeRm: { data: 'nemia factory volume rm mill /a/data' },
  };
  assert.deepEqual(roundTrip(FactoryCommands, commands), commands);
  assert.deepEqual(roundTrip(FactoryCommands, { ...commands, unschedule: {}, volumeRm: {} }), {
    ...commands,
    unschedule: {},
    volumeRm: {},
  });
});

test('REFUSED: a condition, a status, a reason, a level or a revisions policy off its words, and another kind', () => {
  const decode = Schema.decodeUnknownSync(Factory);
  const condition = templated.status.conditions[0];
  const withCondition = (c: object) => ({ ...templated, status: { ...templated.status, conditions: [{ ...condition, ...c }] } });
  assert.throws(() => decode(withCondition({ type: 'Ready' })));
  assert.throws(() => decode(withCondition({ status: 'Unknown' })));
  assert.throws(() => decode(withCondition({ reason: 'Because' })));
  assert.throws(() => decode({ ...templated, spec: { ...templated.spec, level: 'full' } }));
  assert.throws(() => decode({ ...templated, spec: { ...templated.spec, revisions: 'latest' } }));
  assert.throws(() => decode({ ...templated, kind: 'Card' }));
  assert.throws(() => Schema.decodeUnknownSync(FactoryCommands)({ attach: 'x' }));
});
