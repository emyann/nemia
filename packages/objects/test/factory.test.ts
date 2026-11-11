/**
 * The Factory (`src/factory.ts`): a factory and a page of them as the Api's endpoints answer them, every key kept, a factory missing
 * every optional key read; its condition words closed; and its sub-resources — its rules, its instruction and its commands, the old
 * route's lines as the board read them — as the Api's endpoints answer them and take their writes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Factory, FactoryCommands } from 'objects';
import { answered, taken } from './served.ts';

const templated = {
  apiVersion: API_VERSION,
  kind: 'Factory',
  metadata: { name: 'mill', creationTimestamp: '2026-11-04T00:00:00.000Z', resourceVersion: 'f1', generation: 3 },
  spec: {
    repos: ['/repo'],
    workflows: ['build', 'quick'],
    hires: { 'build/implement': 'implementer' },
    volumes: [{ name: 'data', path: '/a/data', readOnly: true }],
    harnessSettings: { claude: { model: 'opus' } },
    revisions: 'follow',
    template: { source: 'sdlc', version: '1.2.0', params: { repo: '/repo', strict: true, cap: 3 } },
    level: 'semi-auto',
    costLines: { build: 80 },
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
    upgrade: { from: '1.2.0', to: '1.3.0', conflicts: [{ at: 'agents/implementer.md', base: 'a', ours: 'b', theirs: null }] },
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

test("the Api's get answers a factory and its list a page of them, every key kept, absent keys left absent; another kind refused", () => {
  assert.deepEqual(answered('factories', 'get', templated), templated);
  assert.deepEqual(answered('factories', 'get', bare), bare);
  assert.deepEqual(answered('factories', 'get', stray), stray);
  const page = { apiVersion: API_VERSION, kind: 'FactoryList', metadata: { continue: 'bWlsbA', remainingItemCount: 1 }, items: [bare] };
  assert.deepEqual(answered('factories', 'listAll', page), page);
  assert.equal(answered('factories', 'get', { ...bare, kind: 'Card' }), undefined);
  assert.equal(answered('factories', 'listAll', { ...page, kind: 'CardList' }), undefined);
});

test("the factory's sub-resources as the Api's endpoints answer them and take them, one's answer not another's", () => {
  const rules = { name: 'mill', file: '/store/factories/mill/rules.md', words: 'Be brief.', error: null, revision: 'r3' };
  assert.deepEqual(answered('factories', 'rules', rules), rules);
  const removed = { name: 'mill', file: '/store/factories/mill/rules.md', words: null, error: null, removed: true };
  assert.deepEqual(answered('factories', 'rules', removed), removed);
  const instruction = { name: 'mill', path: null, store: true, file: '/store/mill.md', words: 'Hi', error: null, stored: true };
  assert.deepEqual(answered('factories', 'instruction', instruction), instruction);
  assert.deepEqual(taken('factories', 'putRules', { words: 'Be brief.' }), { words: 'Be brief.' });
  assert.deepEqual(taken('factories', 'putInstruction', { path: 'NEMIA.md' }), { path: 'NEMIA.md' });
  assert.deepEqual(taken('factories', 'putInstruction', { store: true }), { store: true });
  assert.deepEqual(taken('factories', 'putInstructionWords', { words: 'Hi' }), { words: 'Hi' });
  assert.notDeepEqual(answered('factories', 'rules', instruction), instruction, "the rules keep none of the instruction's own keys");
  assert.equal(answered('factories', 'instruction', rules), undefined);
  assert.equal(taken('factories', 'putRules', {}), undefined);
});

test("a cost line's write takes its dollars and answers the factory; REFUSED: a write without them, or with them as words", () => {
  assert.deepEqual(taken('factories', 'putCostLine', { usd: 80 }), { usd: 80 });
  assert.equal(taken('factories', 'putCostLine', {}), undefined);
  assert.equal(taken('factories', 'putCostLine', { usd: '80' }), undefined);
  assert.deepEqual(answered('factories', 'putCostLine', templated), templated);
  assert.deepEqual(answered('factories', 'deleteCostLine', bare), bare);
});

test("the Api's commands answer the old route's lines, with unschedule by workflow and volume rm by volume name", () => {
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
  assert.deepEqual(answered('factories', 'commands', commands), commands);
  assert.deepEqual(answered('factories', 'commands', { ...commands, unschedule: {}, volumeRm: {} }), {
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
