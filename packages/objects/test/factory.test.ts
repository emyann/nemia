/**
 * The Factory (`src/factory.ts`): a factory and a page of them as the Api's endpoints answer them, every key kept, a factory missing
 * every optional key read; its condition words closed; and its sub-resources — its rules, its instruction and its commands, the old
 * route's lines as the board read them — as the Api's endpoints answer them and take their writes; and the writes that name a template
 * or a folder, a template given by its name, packed, or by a path of the daemon's machine, which its verb holds to a whole one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Factory, FactoryCommands, TemplateGiven } from 'objects';
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
    origins: { '/repo': 'https://example.com/o/r.git' },
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

test("an upgrade's conflict names the proposal its resolution waits on: its phase one of the proposal's words, or null where it is gone", () => {
  const conflict = { at: 'workflows/flow/check.ts:3-4', base: 'a', ours: 'b', theirs: 'c' };
  const upgradeWith = (proposal: unknown) => ({
    ...templated,
    status: { ...templated.status, upgrade: { from: '1.2.0', to: '1.3.0', conflicts: [{ ...conflict, proposal }] } },
  });
  for (const phase of ['waiting', null]) {
    const factory = upgradeWith({ name: 'p-1', phase });
    assert.deepEqual(answered('factories', 'get', factory), factory);
  }
  assert.throws(
    () => Schema.decodeUnknownSync(Factory)(upgradeWith({ name: 'p-1', phase: 'pending' })),
    'a phase is one of PROPOSAL_PHASES',
  );
});

test("a template travels by its name, packed in base64, or by a path of the daemon's machine; REFUSED: none of them, or no text", () => {
  for (const template of [{ name: 'sdlc' }, { archive: 'H4sIAAAA' }, { path: '/srv/sdlc' }])
    assert.deepEqual(taken('factories', 'apply', { template, repos: ['/srv/repo'] }), { template, repos: ['/srv/repo'] });
  assert.equal(taken('factories', 'apply', { template: { path: 7 }, repos: [] }), undefined);
  assert.equal(taken('factories', 'apply', { template: {}, repos: [] }), undefined);
  assert.deepEqual(taken('factories', 'apply', {}), {}, "a template or repositories left out are the verb's to refuse, in its words");
  assert.equal(Schema.decodeUnknownExit(TemplateGiven)({ name: 1 })._tag, 'Failure');
});

test('a factory filed and a volume mounted and taken off, as the Api takes and answers them; REFUSED: a filing whose repos are no list', () => {
  const filing = { name: 'mill', repos: ['/srv/repo'], noTrust: true };
  assert.deepEqual(taken('factories', 'create', filing), filing);
  assert.equal(taken('factories', 'create', { name: 'mill', repos: '/srv/repo' }), undefined);
  const created = {
    name: 'mill',
    repos: ['/srv/repo'],
    file: '/store/factories/mill.json',
    trusts: [{ place: '/srv/repo', unasked: 'no harness keeps a trust' }],
  };
  assert.deepEqual(answered('factories', 'create', created), created);
  assert.deepEqual(taken('factories', 'addVolume', { volume: '/srv/data:ro' }), { volume: '/srv/data:ro' });
  const added = { file: '/store/factories/mill.json', volume: { path: '/srv/data', readOnly: true }, was: null };
  assert.deepEqual(answered('factories', 'addVolume', added), added);
  const removed = { file: '/store/factories/mill.json', removed: '/srv/data' };
  assert.deepEqual(answered('factories', 'removeVolume', removed), removed);
  assert.equal(answered('factories', 'addVolume', removed), undefined);
});

test('a preview answers an upgrade or a takeover, told apart by kind; REFUSED: a kind, a side or a hire change off its words', () => {
  const upgrade = {
    kind: 'upgrade',
    name: 'mill',
    from: '1.0.0',
    to: '1.1.0',
    merge: {
      base: 'common',
      merged: [{ at: 'workflows/a/x.md', from: 'template' }],
      conflicts: [{ at: 'RULES.md', base: 'a', ours: 'b', theirs: null }],
    },
    next: { line: 'nemia factory upgrade mill --to 1.1.0', digest: 'sha256:ab', dropped: [] },
  };
  assert.deepEqual(answered('factories', 'diff', upgrade), upgrade);
  const unnamed = { ...upgrade, from: undefined, switched: { from: 'mill', to: 'press' } };
  assert.deepEqual(answered('factories', 'diff', unnamed), JSON.parse(JSON.stringify(unnamed)), 'a base no status names has no from');
  const adopt = {
    kind: 'adopt',
    plan: {
      factory: 'mill',
      kept: { repos: ['/srv/repo'], schedules: [], instruction: false, volumes: [], settings: [] },
      workflows: { added: ['press'], dropped: [], kept: [] },
      hires: [{ step: 'press/draft', kind: 'added', now: 'drafter' }],
      revisions: { was: 'pinned', now: 'pinned' },
      rules: null,
      runs: { ids: [], policy: 'pinned' },
      stranded: { cards: [], schedules: [] },
    },
    digest: 'sha256:cd',
    line: 'nemia factory adopt mill --template /store/x.tgz --plan sha256:cd',
  };
  assert.deepEqual(answered('factories', 'diff', adopt), adopt);
  assert.equal(answered('factories', 'diff', { ...upgrade, kind: 'switch' }), undefined);
  assert.equal(answered('factories', 'diff', { ...upgrade, merge: { ...upgrade.merge, base: 'some' } }), undefined);
  assert.equal(answered('factories', 'diff', { ...adopt, plan: { ...adopt.plan, hires: [{ step: 's', kind: 'moved' }] } }), undefined);
  assert.deepEqual(taken('factories', 'diff', { to: '1.1.0', template: { name: 'sdlc' }, sets: ['a=1'] }), {
    to: '1.1.0',
    template: { name: 'sdlc' },
    sets: ['a=1'],
  });
});

test("an apply, a takeover, an upgrade and a conflict's choice, as the Api takes and answers them; REFUSED: a choice's file as a path", () => {
  const template = { source: '/store/templates-given/ab.tgz', version: '1.0.0', params: { budget: 7 } };
  const applied = { name: 'mill', repos: ['/srv/repo'], file: '/f', template, place: template.source, tree: '/t', trusts: [] };
  assert.deepEqual(answered('factories', 'apply', applied), applied);
  assert.deepEqual(taken('factories', 'adopt', { template: { name: 'sdlc' }, plan: 'sha256:cd' }), {
    template: { name: 'sdlc' },
    plan: 'sha256:cd',
  });
  const adopted = { name: 'mill', file: '/f', template, tree: '/t' };
  assert.deepEqual(answered('factories', 'adopt', adopted), adopted);
  assert.deepEqual(taken('factories', 'upgrade', { to: '1.1.0', plan: 'sha256:ab', downgrade: false }), {
    to: '1.1.0',
    plan: 'sha256:ab',
    downgrade: false,
  });
  const upgraded = { name: 'mill', from: '1.0.0', to: '1.1.0', file: '/f', dropped: ['old'], conflicts: 2 };
  assert.deepEqual(answered('factories', 'upgrade', upgraded), upgraded);
  assert.deepEqual(taken('factories', 'resolve', { conflict: 'RULES.md', text: 'Be brief.\n' }), {
    conflict: 'RULES.md',
    text: 'Be brief.\n',
  });
  assert.deepEqual(
    taken('factories', 'resolve', { conflict: 'RULES.md', file: '/laptop/rules.md' }),
    { conflict: 'RULES.md' },
    'a path is no key of it',
  );
  const resolved = {
    name: 'mill',
    at: 'RULES.md',
    to: '1.1.0',
    file: '/r',
    left: [],
    proposed: { kind: 'Factory', name: 'mill', proposal: 'p-1' },
    waits: ['p-1'],
  };
  assert.deepEqual(answered('factories', 'resolve', resolved), resolved);
  assert.equal(answered('factories', 'resolve', { ...resolved, proposed: { ...resolved.proposed, kind: 'Card' } }), undefined);
});
