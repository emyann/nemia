/**
 * Proposals on a scratch store, over a templated factory whose tree is rendered by hand: an agent proposes a factory's Workflow at the
 * version it read, the person approves, and it is applied into the tree with what it held before; an undo applies that back as a new
 * revision. Then one fixture per rule: stale, a run-end proposal and its run, a delegation taken back, an agent's own proposal, a level
 * short of auto, a widening, a confirm past the delegation, a Factory read before its rules, its instruction or its status moved, and
 * the Proposal door's own refusals. Kinds and `_tag`s are asserted, never
 * a sentence. The store is the file's own, at `ROOT`, given as `ENV`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runOver } from './placed.ts';
import type { ProposedObject } from 'objects';
import { runWith as runEngine } from '../src/runner.ts';
import { engineOf } from '../src/runtime-client.ts';
import { proposeProgram, undoProgram } from '../src/propose/propose.verb.ts';
import { approveProgram, declineProgram, proposalGet } from '../src/approval/approve.verb.ts';
import { applyProgram } from '../src/apply/apply.verb.ts';
import { proposalsPass } from '../src/apply/pass.verb.ts';
import { currentOf } from '../src/propose/current.verb.ts';
import { PERSON } from '../src/caller/caller.ts';
import { delegationPut, delegationRemove } from '../src/delegation/delegation.verb.ts';
import { writeFactoryLevel } from '../src/level/level.store.ts';
import { confirmedFile, writeProposed } from '../src/auto/auto.store.ts';
import { POLICY_CONFIRM, policyListOf } from '../src/auto/auto.verb.ts';
import { ruleWords } from '../src/auto/auto.ts';
import { RunDoor } from '../src/runs/runs.store.ts';
import { FactoryDoor } from '../src/factory/door/factories.store.ts';
import { FactoryName } from '../src/factory/factory.model.ts';
import { FACTORY_INSTRUCT } from '../src/factory/instruction.verb.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-proposals-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
type Caller = import('../src/caller/caller.ts').ProposalCaller;
type Rule = import('../src/auto/auto.ts').ProposalPolicyRule;

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer, ENV);
const e = () => engineOf(engine().layer);
const PLACE = { home: ROOT, repo: ROOT };

/** A program run over this test's engine, place and store. */
const run = <A, E>(program: Effect.Effect<A, E, any>): Promise<A> => runWith(e(), program);

/** The refusal a program fails with, as it was: `_tag`, `exitCode` and, for `Forbidden`, its reason. */
const refusalOf = async (program: Effect.Effect<unknown, unknown, any>) =>
  (await run(Effect.flip(program))) as { _tag: string; exitCode?: number; reason?: string; message?: string };

const STEP = '---\nplace: folder\nbudget: 5\n---\nPlan the change.\n';

/**
 * A factory `name` made from a template, its tree rendered: one workflow `dev` with a step `plan`, and an agent `implementer` beside it.
 * Its level as given.
 */
function factory(name: string, level: 'manual' | 'semi-auto' | 'auto' = 'manual'): string {
  const repo = scratch(`wf-proposals-repo-${name}-`);
  const factories = path.join(ROOT, 'factories');
  fs.mkdirSync(factories, { recursive: true });
  fs.writeFileSync(
    path.join(factories, `${name}.json`),
    JSON.stringify({ repos: [repo], template: { source: '/t/team', version: '0.1.0', params: {} } }),
  );
  const tree = path.join(factories, name, 'tree');
  fs.mkdirSync(path.join(tree, 'workflows', 'dev'), { recursive: true });
  fs.mkdirSync(path.join(tree, 'workflows', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'factory.json'), JSON.stringify({ workflows: ['dev'], hires: {} }));
  fs.writeFileSync(path.join(tree, 'workflows', 'dev', 'README.md'), '# dev\n\nPlan.\n');
  fs.writeFileSync(path.join(tree, 'workflows', 'dev', 'plan.md'), STEP);
  fs.writeFileSync(
    path.join(tree, 'workflows', 'agents', 'implementer.md'),
    '---\nrole: Architect\nallowedTools: Read\n---\nDesign the change.\n',
  );
  writeFactoryLevel(ROOT, name, { level, since: '2026-11-01T00:00:00.000Z' });
  return tree;
}

/** The run `id`'s record, started in `factoryName`, planted through the Run door: a proposal's run need only be there. */
const plantRun = (id: string, factoryName: string) =>
  run(
    Effect.flatMap(RunDoor, (d) =>
      d.runs.create({
        id,
        workspace: ROOT,
        brief: `The brief of ${id}`,
        createdAt: '2026-11-01T08:00:00.000Z',
        workflowDir: path.join(ROOT, 'no-such-workflow'),
        place: { kind: 'folder' },
        workflow: [{ name: 'design', after: [], body: 'Design it.' }],
        steps: {},
        factory: factoryName,
      } as never),
    ),
  );

/** The text of the plan step in `tree`. */
const planIn = (tree: string): string => fs.readFileSync(path.join(tree, 'workflows', 'dev', 'plan.md'), 'utf8');

/** A caller as `sessionCaller` answers a live token: what the api hands the programs as it is, with no mapping. */
type FromToken = Exclude<import('../src/token/caller.verb.ts').CallerOf, { kind: 'refused' }>;

/** An agent's session of `agent` in `factory`, a run's step where `run` is given, as `sessionCaller` answers its token. */
const agentOf = (agent: string, factoryName: string, runId?: string): Caller => {
  const answered: FromToken = {
    kind: 'agent',
    agent,
    factory: factoryName,
    run: runId ?? null,
    step: runId === undefined ? null : 'design',
  };
  return answered;
};

/** The `dev` workflow of `factory` as it is, its plan step's body replaced by `body`, at the version it was read. */
async function devChanged(factoryName: string, body: string): Promise<ProposedObject> {
  const now = await run(currentOf(PLACE, factoryName, 'Workflow', 'dev'));
  const spec = now.spec as { readme?: string; steps: { name: string; keys: Record<string, unknown>; body: string }[] };
  return {
    kind: 'Workflow',
    metadata: { name: 'dev', resourceVersion: now.version ?? undefined },
    spec: { ...spec, steps: spec.steps.map((s) => (s.name === 'plan' ? { ...s, body } : s)) },
  };
}

/** `agent`'s delegation in `factory` granting `resources` with `verbs`, written by the person. */
const delegated = (factoryName: string, agent: string, resources: string[], verbs: ('create' | 'update' | 'delete')[]) =>
  run(delegationPut(PERSON, factoryName, agent, { rules: [{ resources, resourceNames: [], verbs }] }));

/** `agent`'s proposal rule over `factory`, proposed and confirmed as the person reads it. */
async function ruleConfirmed(agent: string, rule: Omit<Rule, 'answer' | 'id'>): Promise<void> {
  const full: Rule = { id: `take-${rule.factory}`, answer: 'approve-proposal', ...rule };
  writeProposed(ROOT, agent, { at: new Date().toISOString(), rules: [full], guidance: [], digest: null });
  await run(POLICY_CONFIRM.handler({ name: agent, id: full.id, words: ruleWords(full) }));
}

test('the proposal story: an agent proposes, the person approves, it is applied as a new revision, and undone by proposing it back', async (t) => {
  const tree = factory('story');
  const was = planIn(tree);
  const proposed = await run(
    proposeProgram(agentOf('implementer', 'story'), 'story', { objects: [await devChanged('story', 'Plan it twice.\n')] }, PLACE),
  );
  await t.test('proposed: waiting, named by its proposer, proposed by the caller, its change an update of workflows/dev', () => {
    assert.equal(proposed.status.phase, 'waiting');
    assert.match(proposed.metadata.name, /^implementer-[a-z0-9]{5}$/);
    assert.deepEqual(proposed.status.proposedBy, { agent: 'implementer' });
    assert.deepEqual(
      proposed.status.changes.map(({ resource, name, verb }) => [resource, name, verb]),
      [['workflows', 'dev', 'update']],
    );
    assert.equal(planIn(tree), was, 'nothing is written while it waits');
  });
  const applied = await run(approveProgram(PERSON, 'story', proposed.metadata.name, PLACE));
  await t.test(
    'approved by the person: applied at once, the tree written, a revision named, and what the workflow held before kept',
    () => {
      assert.equal(applied.status.phase, 'applied', applied.status.message);
      assert.equal(applied.status.approvedBy?.by, 'person');
      assert.match(planIn(tree), /Plan it twice\./);
      assert.equal(applied.status.revisions?.length, 1);
      assert.match(applied.status.revisions?.[0] ?? '', /^workflows\/dev#\d+$/);
      const before = applied.status.before?.[0]?.spec as { steps: { name: string; body: string }[] };
      assert.equal(before.steps.find((s) => s.name === 'plan')?.body.trim(), 'Plan the change.');
    },
  );
  await t.test('undone: a new proposal of the workflow as it stood, approved and applied, the tree back as it was', async () => {
    const undo = await run(undoProgram(PERSON, 'story', applied.metadata.name, PLACE));
    assert.equal(undo.status.phase, 'waiting');
    assert.notEqual(undo.metadata.name, applied.metadata.name);
    const back = await run(approveProgram(PERSON, 'story', undo.metadata.name, PLACE));
    assert.equal(back.status.phase, 'applied');
    assert.equal(planIn(tree), was);
  });
  await t.test('REFUSED: an undo of what was not applied (Conflict), a decline of what is applied (Conflict)', async () => {
    const waiting = await run(proposeProgram(PERSON, 'story', { objects: [await devChanged('story', 'Again.\n')] }, PLACE));
    assert.equal((await refusalOf(undoProgram(PERSON, 'story', waiting.metadata.name, PLACE)))._tag, 'Conflict');
    assert.equal((await refusalOf(declineProgram(PERSON, 'story', applied.metadata.name)))._tag, 'Conflict');
    const declined = await run(declineProgram(PERSON, 'story', waiting.metadata.name));
    assert.equal(declined.status.phase, 'declined');
  });
});

test('REFUSED stale: the workflow written between propose and approve leaves the proposal stale and the tree as the other write left it', async () => {
  const tree = factory('stale');
  const proposed = await run(
    proposeProgram(agentOf('implementer', 'stale'), 'stale', { objects: [await devChanged('stale', 'Mine.\n')] }, PLACE),
  );
  fs.writeFileSync(path.join(tree, 'workflows', 'dev', 'plan.md'), '---\nplace: folder\nbudget: 5\n---\nSomeone else wrote this.\n');
  const after = await run(approveProgram(PERSON, 'stale', proposed.metadata.name, PLACE));
  assert.equal(after.status.phase, 'stale');
  assert.match(planIn(tree), /Someone else wrote this\./);
  assert.equal((await refusalOf(approveProgram(PERSON, 'stale', proposed.metadata.name, PLACE))).reason, 'not-waiting');
});

/** The Factory `name` read now, proposed with its parts `spec` names over it, at the version it was read. */
async function factoryChanged(name: string, spec: { rules?: string; instruction?: string }): Promise<ProposedObject> {
  const now = await run(currentOf(PLACE, name, 'Factory', name));
  return { kind: 'Factory', metadata: { name, resourceVersion: now.version ?? undefined }, spec };
}

/** The person's rules of the factory `name` written, as `nemia factory rules` writes them. */
const personRules = (name: string, words: string) => run(Effect.flatMap(FactoryDoor, (d) => d.rules.write(FactoryName.read(name), words)));

/** The person's instruction of the factory `name` written, as `nemia factory instruct` writes it. */
const personInstruction = (name: string, words: string) => run(FACTORY_INSTRUCT.handler({ factory: name, words }));

/** What the factory `name` keeps of its rules and its instruction, each read off its tree. */
const factoryParts = (tree: string) => ({
  rules: fs.readFileSync(path.join(tree, 'RULES.md'), 'utf8').trim(),
  instruction: fs.readFileSync(path.join(tree, 'NEMIA.md'), 'utf8').trim(),
});

test('a Factory proposal read and approved with nothing moved between applies its rules; one read before the rules moved is refused at filing', async () => {
  const tree = factory('wired');
  const object = await factoryChanged('wired', { rules: 'Ours.' });
  const proposed = await run(proposeProgram(agentOf('implementer', 'wired'), 'wired', { objects: [object] }, PLACE));
  assert.equal((await run(approveProgram(PERSON, 'wired', proposed.metadata.name, PLACE))).status.phase, 'applied');
  assert.equal(fs.readFileSync(path.join(tree, 'RULES.md'), 'utf8').trim(), 'Ours.');
  const before = await factoryChanged('wired', { rules: 'Theirs.' });
  await personRules('wired', 'The person wrote these.');
  const late = await refusalOf(proposeProgram(agentOf('implementer', 'wired'), 'wired', { objects: [before] }, PLACE));
  assert.equal(late._tag, 'Conflict');
});

test("REFUSED stale: the rules or the instruction written after the Factory was read leave its proposal stale and the person's words standing", async () => {
  const tree = factory('edited');
  await personRules('edited', 'First rules.');
  await personInstruction('edited', 'First instruction.');
  for (const [part, write] of [
    ['rules', () => personRules('edited', 'The person wrote these.')],
    ['instruction', () => personInstruction('edited', 'The person wrote this.')],
  ] as const) {
    const object = await factoryChanged('edited', { [part]: 'Mine.' });
    const proposed = await run(proposeProgram(agentOf('implementer', 'edited'), 'edited', { objects: [object] }, PLACE));
    const was = factoryParts(tree);
    await write();
    const written = factoryParts(tree);
    assert.notDeepEqual(written, was, part);
    const after = await run(approveProgram(PERSON, 'edited', proposed.metadata.name, PLACE));
    assert.equal(after.status.phase, 'stale', part);
    assert.deepEqual(factoryParts(tree), written, `the person's ${part} stands`);
  }
});

test("a status move alone makes a Factory proposal stale: its version is the served object's, status and all", async () => {
  factory('moving');
  const object = await factoryChanged('moving', { rules: 'Mine.' });
  const proposed = await run(proposeProgram(agentOf('implementer', 'moving'), 'moving', { objects: [object] }, PLACE));
  fs.writeFileSync(
    path.join(ROOT, 'factories', 'moving', 'status.json'),
    JSON.stringify({
      version: '0.1.0',
      digest: null,
      params: {},
      conditions: [{ type: 'Applied', status: 'True', reason: 'Rendered', message: 'ok', lastTransitionTime: '2026-11-09T00:00:00.000Z' }],
      observedGeneration: 1,
    }),
  );
  assert.equal((await run(approveProgram(PERSON, 'moving', proposed.metadata.name, PLACE))).status.phase, 'stale');
});

test('REFUSED as it is written: a workflow the Workflow door refuses leaves the proposal failed, naming nothing written, and the tree as it was', async () => {
  const tree = factory('failing');
  const was = planIn(tree);
  const object = await devChanged('failing', 'x\n');
  const spec = object.spec as { steps: { name: string; keys: Record<string, unknown>; body: string }[] };
  const placeless = { ...object, spec: { ...spec, steps: spec.steps.map((st) => ({ ...st, keys: { budget: 5 } })) } };
  const p = await run(proposeProgram(PERSON, 'failing', { objects: [placeless] }, PLACE));
  const after = await run(approveProgram(PERSON, 'failing', p.metadata.name, PLACE));
  assert.equal(after.status.phase, 'failed');
  assert.deepEqual(after.status.written, []);
  assert.equal(planIn(tree), was);
  assert.deepEqual(await run(proposalsPass(PLACE, () => undefined)), [], 'no pass applies a failed proposal again');
});

test('a run-end proposal stays approved while its run goes or sits failed, applies on the pass after it succeeds, and is dropped once its run is called off', async () => {
  const tree = factory('runend');
  await plantRun('r1', 'runend');
  const make = async (body: string) =>
    run(
      proposeProgram(
        agentOf('implementer', 'runend', 'r1'),
        'runend',
        { objects: [await devChanged('runend', body)], applyAt: 'run-end' },
        PLACE,
      ),
    );
  const p = await make('At the end.\n');
  assert.deepEqual(p.status.proposedBy, { agent: 'implementer', run: 'r1', step: 'design' });
  const approved = await run(approveProgram(PERSON, 'runend', p.metadata.name, PLACE));
  assert.equal(approved.status.phase, 'approved', 'its run is read on a pass, not at approval');
  for (const state of ['running', 'waiting', 'failed', undefined] as const) {
    assert.deepEqual(await run(proposalsPass(PLACE, () => state)), [], `${state ?? 'unread'}: nothing moves`);
    assert.equal((await run(proposalGet('runend', p.metadata.name))).status.phase, 'approved');
  }
  assert.doesNotMatch(planIn(tree), /At the end/);
  assert.deepEqual(await run(proposalsPass(PLACE, () => 'succeeded')), [`runend/${p.metadata.name}`]);
  assert.equal((await run(proposalGet('runend', p.metadata.name))).status.phase, 'applied');
  assert.match(planIn(tree), /At the end\./);

  const q = await make('Never.\n');
  await run(approveProgram(PERSON, 'runend', q.metadata.name, PLACE));
  await run(proposalsPass(PLACE, () => 'cancelled'));
  assert.equal((await run(proposalGet('runend', q.metadata.name))).status.phase, 'dropped');
  assert.doesNotMatch(planIn(tree), /Never/);
});

test('an agent approves at auto within its delegation under a confirmed rule; its delegation taken back sends the proposal back to the person', async () => {
  const tree = factory('deleg', 'auto');
  await plantRun('r2', 'deleg');
  await delegated('deleg', 'reviewer', ['workflows'], ['update']);
  await ruleConfirmed('reviewer', {
    factory: 'deleg',
    resources: ['workflows'],
    resourceNames: [],
    verbs: ['update'],
    widens: false,
    proposedBy: [],
  });
  const make = async (body: string) =>
    run(
      proposeProgram(
        agentOf('implementer', 'deleg', 'r2'),
        'deleg',
        { objects: [await devChanged('deleg', body)], applyAt: 'run-end' },
        PLACE,
      ),
    );
  const p = await make('Approved by reviewer.\n');
  const approved = await run(approveProgram(agentOf('reviewer', 'deleg'), 'deleg', p.metadata.name, PLACE));
  assert.equal(approved.status.phase, 'approved');
  assert.deepEqual([approved.status.approvedBy?.by, approved.status.approvedBy?.agent], ['rule', 'reviewer']);
  await run(delegationRemove(PERSON, 'deleg', 'reviewer'));
  await run(proposalsPass(PLACE, () => 'succeeded'));
  const back = await run(proposalGet('deleg', p.metadata.name));
  assert.equal(back.status.phase, 'waiting');
  assert.equal(back.status.approvedBy, undefined);
  assert.doesNotMatch(planIn(tree), /Approved by reviewer/);
  assert.equal((await refusalOf(approveProgram(agentOf('reviewer', 'deleg'), 'deleg', p.metadata.name, PLACE))).reason, 'not-delegated');
});

test("REFUSED own-agent: a session of an agent approving its own agent's proposal, even with a delegation and a rule that cover it", async () => {
  factory('own', 'auto');
  await delegated('own', 'implementer', ['workflows'], ['update']);
  await ruleConfirmed('implementer', {
    factory: 'own',
    resources: ['workflows'],
    resourceNames: [],
    verbs: ['update'],
    widens: true,
    proposedBy: [],
  });
  const p = await run(proposeProgram(agentOf('implementer', 'own', 'r3'), 'own', { objects: [await devChanged('own', 'Mine.\n')] }, PLACE));
  const refused = await refusalOf(approveProgram(agentOf('implementer', 'own', 'r4'), 'own', p.metadata.name, PLACE));
  assert.deepEqual([refused._tag, refused.reason, refused.exitCode], ['Forbidden', 'own-agent', 2]);
  assert.equal((await run(proposalGet('own', p.metadata.name))).status.phase, 'waiting');
});

test('REFUSED not-auto: an agent at semi-auto, with a delegation and a rule that cover the proposal', async () => {
  factory('semi', 'semi-auto');
  await delegated('semi', 'reviewer', ['workflows'], ['update']);
  await ruleConfirmed('reviewer', {
    factory: 'semi',
    resources: ['workflows'],
    resourceNames: [],
    verbs: ['update'],
    widens: false,
    proposedBy: [],
  });
  const p = await run(proposeProgram(agentOf('implementer', 'semi'), 'semi', { objects: [await devChanged('semi', 'Semi.\n')] }, PLACE));
  const refused = await refusalOf(approveProgram(agentOf('reviewer', 'semi'), 'semi', p.metadata.name, PLACE));
  assert.deepEqual([refused._tag, refused.reason], ['Forbidden', 'not-auto']);
});

test('widening: an Agent proposal adding an allowedTools rule widens, a rule that takes no widening does not approve it, and the person still does', async () => {
  const tree = factory('widen', 'auto');
  await delegated('widen', 'reviewer', ['agents'], ['update']);
  await ruleConfirmed('reviewer', {
    factory: 'widen',
    resources: ['agents'],
    resourceNames: [],
    verbs: ['update'],
    widens: false,
    proposedBy: [],
  });
  const now = await run(currentOf(PLACE, 'widen', 'Agent', 'implementer'));
  const spec = now.spec as { keys: Record<string, unknown> };
  const wider: ProposedObject = {
    kind: 'Agent',
    metadata: { name: 'implementer', resourceVersion: now.version ?? undefined },
    spec: { ...spec, keys: { ...spec.keys, allowedTools: 'Read, Bash(git diff *)' } },
  };
  const p = await run(proposeProgram(agentOf('shipper', 'widen'), 'widen', { objects: [wider] }, PLACE));
  assert.equal(p.status.widens, true);
  assert.deepEqual(
    p.status.changes.map((c) => [c.resource, c.access]),
    [['agents', 'widens']],
  );
  assert.equal((await refusalOf(approveProgram(agentOf('reviewer', 'widen'), 'widen', p.metadata.name, PLACE))).reason, 'no-rule');
  const applied = await run(approveProgram(PERSON, 'widen', p.metadata.name, PLACE));
  assert.equal(applied.status.phase, 'applied');
  assert.match(fs.readFileSync(path.join(tree, 'workflows', 'agents', 'implementer.md'), 'utf8'), /git diff/);

  const narrower = await run(currentOf(PLACE, 'widen', 'Agent', 'implementer'));
  const same: ProposedObject = {
    kind: 'Agent',
    metadata: { name: 'implementer', resourceVersion: narrower.version ?? undefined },
    spec: { ...(narrower.spec as object), instructions: 'Design it well.\n' },
  };
  const q = await run(proposeProgram(agentOf('shipper', 'widen'), 'widen', { objects: [same] }, PLACE));
  assert.equal(q.status.widens, false);
  assert.equal((await run(approveProgram(agentOf('reviewer', 'widen'), 'widen', q.metadata.name, PLACE))).status.phase, 'applied');
});

test("REFUSED at confirm: a proposal rule past the agent's delegation (Invalid), and one within it goes on", async () => {
  factory('confirm', 'auto');
  await delegated('confirm', 'shipper', ['workflows'], ['update']);
  const past: Rule = {
    id: 'too-far',
    answer: 'approve-proposal',
    factory: 'confirm',
    resources: ['workflows', 'agents'],
    resourceNames: [],
    verbs: ['update'],
    widens: false,
    proposedBy: [],
  };
  writeProposed(ROOT, 'shipper', { at: new Date().toISOString(), rules: [past], guidance: [], digest: null });
  const refused = await refusalOf(POLICY_CONFIRM.handler({ name: 'shipper', id: 'too-far', words: ruleWords(past) }));
  assert.deepEqual([refused._tag, refused.exitCode], ['Invalid', 2]);
  assert.equal(fs.existsSync(confirmedFile(ROOT, 'shipper')), false, 'nothing is confirmed');
  const within = { ...past, id: 'workflows-only', resources: ['workflows'] };
  writeProposed(ROOT, 'shipper', { at: new Date().toISOString(), rules: [within], guidance: [], digest: null });
  await run(POLICY_CONFIRM.handler({ name: 'shipper', id: 'workflows-only', words: ruleWords(within) }));
  assert.equal(fs.existsSync(confirmedFile(ROOT, 'shipper')), true);
  const list = policyListOf(ROOT, 'shipper', undefined);
  assert.deepEqual(
    list.proposalRules.map((r) => r.id),
    ['workflows-only'],
    'said apart from the gate rules, which a reader of a gate reads alone',
  );
  assert.equal(
    list.rules.some((r) => r.id === 'workflows-only'),
    false,
  );
});

test("REFUSED at propose: another factory's session (Forbidden), the person's settings, a spec its kind does not read, a stale read, a decline or a delegation by an agent", async () => {
  factory('refuse');
  factory('other');
  const object = await devChanged('refuse', 'x\n');
  const elsewhere = await refusalOf(proposeProgram(agentOf('implementer', 'other'), 'refuse', { objects: [object] }, PLACE));
  assert.deepEqual([elsewhere._tag, elsewhere.reason], ['Forbidden', 'other-factory']);
  const settings: ProposedObject = {
    kind: 'Factory',
    metadata: { name: 'refuse', resourceVersion: 'x' },
    spec: { repos: ['/x'] },
    verb: 'update',
  };
  assert.equal((await refusalOf(proposeProgram(PERSON, 'refuse', { objects: [settings] }, PLACE)))._tag, 'Invalid');
  const level: ProposedObject = { ...settings, spec: { level: 'auto' } };
  assert.equal((await refusalOf(proposeProgram(PERSON, 'refuse', { objects: [level] }, PLACE)))._tag, 'Invalid');
  const lined: ProposedObject = { ...settings, spec: { costLines: { build: 80 } } };
  const costLines = await refusalOf(proposeProgram(PERSON, 'refuse', { objects: [lined] }, PLACE));
  assert.equal(costLines._tag, 'Invalid');
  assert.ok(costLines.message?.includes('nemia factory cost-line'), costLines.message);
  const shapeless: ProposedObject = { ...object, spec: { steps: 'none' } };
  assert.equal((await refusalOf(proposeProgram(PERSON, 'refuse', { objects: [shapeless] }, PLACE)))._tag, 'Invalid');
  const moved: ProposedObject = { ...object, metadata: { ...object.metadata, resourceVersion: 'not-it' } };
  assert.equal((await refusalOf(proposeProgram(PERSON, 'refuse', { objects: [moved] }, PLACE)))._tag, 'Conflict');
  assert.equal((await refusalOf(proposeProgram(PERSON, 'default', { objects: [object] }, PLACE)))._tag, 'Invalid');
  const p = await run(proposeProgram(agentOf('implementer', 'refuse'), 'refuse', { objects: [object] }, PLACE));
  const decline = await refusalOf(declineProgram(agentOf('reviewer', 'refuse'), 'refuse', p.metadata.name));
  assert.deepEqual([decline._tag, decline.reason], ['Forbidden', 'person-only']);
  const put = await refusalOf(delegationPut(agentOf('reviewer', 'refuse'), 'refuse', 'reviewer', { rules: [] }));
  assert.deepEqual([put._tag, put.reason], ['Forbidden', 'person-only']);
  const every = { resources: ['*'], resourceNames: [], verbs: ['update' as const] };
  assert.equal(
    (await refusalOf(delegationPut(PERSON, 'refuse', 'reviewer', { rules: [every] })))._tag,
    'Invalid',
    'a resource no proposal changes',
  );
  const plain = path.join(ROOT, 'factories', 'plain.json');
  fs.writeFileSync(plain, JSON.stringify({ repos: [scratch('wf-proposals-plain-')] }));
  const untemplated = await refusalOf(
    proposeProgram(PERSON, 'plain', { objects: [{ ...object, metadata: { name: 'dev' }, verb: 'create' }] }, PLACE),
  );
  assert.equal(untemplated._tag, 'Invalid', 'a factory made from no template has no tree a proposal writes');
  assert.doesNotMatch(String(untemplated.message), /nemia propose yours/, 'it names no command that is not there');
  assert.equal(
    await run(applyProgram('refuse', 'no-such-1', PLACE, () => Effect.succeed(undefined))),
    undefined,
    'no proposal: none acted on',
  );
});
