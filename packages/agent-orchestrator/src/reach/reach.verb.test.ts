/**
 * `nemia policy reach`, told as a person's story over a scratch store: a factory at auto with the tests' team attached (its `ship`, an
 * ending approved before it runs) and a workflow of one gated step with no check, read with nothing confirmed, then with a suggestion
 * proposed and one confirmed; a workflow attached that does not load; a run's own gates, a gate added at its start among them, with what
 * keeps a rule now; and what the verb refuses. What reach decides off a step is `reach.test.ts`'s, and its laws its contract's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { staged } from '../../test/story.ts';
import { eachTest } from '../../test/placed.ts';
import { TEAM } from '../../test/team.ts';
import type { Run } from '../record/record.ts';
import { POLICY_REACH, type WordedRule } from './reach.verb.ts';
import { TABLE } from '../command/commands.verb.ts';
import { nemiaFence } from '../admission/fence.ts';
import { attachWorkflowAt, createFactoryAt } from '../factory/factory.store.ts';
import { writeFactoryLevel } from '../level/level.store.ts';
import { confirmRule, readProposed, writeProposed } from '../auto/auto.store.ts';
import { POLICY_PROPOSE } from '../auto/auto.verb.ts';
import { ruleWords } from '../auto/auto.ts';
import { engineOf, runWith } from '../runtime-client.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { runDoorMemory } from '../runs/memory.store.ts';
import { main } from '../cli/main.ts';
import type { Env } from '../config/config.store.ts';

const ROOT = scratch('wf-policy-reach-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
const stage = staged({ runWith, main, engineOf, env: ENV });
const door = eachTest(runDoorMemory);

/** A repository whose `workflows/` holds the tests' team and `plain`, one gated step with no check. */
function repoWithWorkflows(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const workflows = path.join(repo, 'workflows');
  fs.cpSync(TEAM, workflows, { recursive: true });
  fs.mkdirSync(path.join(workflows, 'plain'));
  fs.writeFileSync(path.join(workflows, 'plain', 'draft.md'), '---\nplace: git\nagent: implementer\ngate: true\n---\nDraft it.\n');
  return repo;
}

/** `nemia policy reach` with `args`, read in the store, over the test's run door. */
const reach = (args: Record<string, unknown>) =>
  stage.runWith(stage.board().e, Effect.provide(POLICY_REACH.handler({ name: 'nemia', ...args }), door()));

/** The kind a read is refused with. */
const refusedKind = async (args: Record<string, unknown>): Promise<string> => {
  try {
    await reach(args);
  } catch (err) {
    return (err as { _tag?: string })._tag ?? String(err);
  }
  return assert.fail('no refusal');
};

test('`nemia policy reach`: which steps at their gate her rules can approve in a factory and a run, why not, and what would', async (t) => {
  const repo = repoWithWorkflows();
  createFactoryAt(ROOT, { name: 'f', repos: [repo], workflows: [], hires: {}, schedules: {} });
  for (const workflow of ['dev', 'plain']) attachWorkflowAt(ROOT, { factory: 'f', workflow });
  writeFactoryLevel(ROOT, 'f', { level: 'auto', since: '2026-11-05T00:00:00.000Z' });

  let suggested: WordedRule[] = [];
  await t.test('nothing confirmed: the default reaches neither step, each said why, and a rule suggested for each', async () => {
    const read = await reach({ factory: 'f' });
    assert.equal(read.level, 'auto');
    assert.equal(read.reach, 'none');
    const ship = read.gates.find((g) => g.step === 'ship');
    const draft = read.gates.find((g) => g.step === 'draft');
    assert.deepEqual(
      ship?.misses.map((m) => [m.why, m.why === 'never-holds' ? m.because : null]),
      [['never-holds', 'approved-before-it-runs']],
    );
    assert.deepEqual(
      draft?.misses.map((m) => [m.why, m.why === 'never-holds' ? m.condition : null]),
      [['never-holds', 'checked']],
    );
    assert.deepEqual(read.suggested.map((s) => s.id).sort(), ['approve-draft', 'approve-ship']);
    for (const s of read.suggested) assert.equal(s.words, ruleWords(s), 'its words are the words a confirm checks');
    suggested = read.suggested;
  });

  await t.test('the proposal it gives keeps what was proposed, rules and guidance, with the suggestions added', async () => {
    const tries = { id: 'tries', answer: 'retry' as const, steps: ['implement'], when: ['checked' as const] };
    writeProposed(ROOT, 'nemia', { at: '2026-11-05T00:00:00.000Z', rules: [tries], guidance: ['be kind'], digest: null });
    const read = await reach({ factory: 'f' });
    await stage.runWith(stage.board().e, POLICY_PROPOSE.handler({ name: 'nemia', words: JSON.stringify(read.proposal) }));
    const after = readProposed(ROOT, 'nemia');
    assert.deepEqual(after?.rules.map((r) => r.id).sort(), ['approve-draft', 'approve-ship', 'tries']);
    assert.deepEqual(after?.guidance, ['be kind']);
  });

  await t.test('a suggestion proposed shows on the row it would reach; once confirmed, it reaches it and the reach is some', async () => {
    const ship = suggested.find((s) => s.id === 'approve-ship');
    assert.ok(ship);
    const { words, ...rule } = ship;
    writeProposed(ROOT, 'nemia', { at: '2026-11-05T00:00:00.000Z', rules: [rule], guidance: [], digest: null });
    const proposedRead = await reach({ factory: 'f' });
    assert.deepEqual(proposedRead.gates.find((g) => g.step === 'ship')?.proposedBy, ['approve-ship']);
    confirmRule(ROOT, 'nemia', 'approve-ship', words, new Date('2026-11-05T00:00:00.000Z'));
    const confirmed = await reach({ factory: 'f' });
    assert.equal(confirmed.reach, 'some');
    assert.ok(confirmed.gates.find((g) => g.step === 'ship')?.reachedBy.includes('approve-ship'));
    assert.deepEqual(
      confirmed.suggested.map((s) => s.id),
      ['approve-draft'],
    );
  });

  await t.test('a workflow attached that does not load is said, and the read still answers', async () => {
    attachWorkflowAt(ROOT, { factory: 'f', workflow: 'gone' });
    const read = await reach({ factory: 'f' });
    assert.deepEqual(
      read.unloaded.map((u) => u.workflow),
      ['gone'],
    );
    assert.equal(read.gates.length, 2);
  });

  await t.test("a run's own gates, one added at its start among them, with what keeps a rule that reaches one now", async () => {
    const workflow = [
      { name: 'build', after: [], body: 'Build it.', harness: 'codex', check: 'true' },
      { name: 'ship', after: ['build'], body: 'Ship it.', harness: 'codex', workspace: 'base', gate: true },
    ];
    await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(RunDoor, (d) =>
          d.runs.create({
            id: 'r-1',
            workspace: ROOT,
            brief: 'The brief of r-1',
            createdAt: '2026-11-05T00:00:00.000Z',
            workflowDir: path.join(ROOT, 'no-such-workflow'),
            place: { kind: 'folder' },
            workflow,
            steps: {},
            gates: ['build'],
            factory: 'f',
          } as Run),
        ),
        door(),
      ),
    );
    const read = await reach({ runId: 'r-1' });
    assert.deepEqual(read.gates.map((g) => g.step).sort(), ['build', 'ship'], 'the gate added at its start among them');
    const build = read.gates.find((g) => g.step === 'build');
    assert.ok(build?.reachedBy.includes('default'), 'the default reaches a step with a check that runs before its gate');
    assert.ok(
      build?.now?.some((n) => n.rule === 'default' && n.unmet.conditions.includes('checked')),
      'its check has not run, so it does not hold now',
    );
  });

  await t.test('refused: neither flag, both, and a factory the store does not have', async () => {
    assert.ok(POLICY_REACH.check?.({ name: 'nemia' }), 'neither flag');
    assert.ok(POLICY_REACH.check?.({ name: 'nemia', factory: 'f', runId: 'r-1' }), 'both');
    assert.equal(POLICY_REACH.check?.({ name: 'nemia', factory: 'f' }), null);
    assert.equal(await refusedKind({ factory: 'nope' }), 'Missing');
  });

  await t.test('a read: an agent runs it unasked, bare and with any words', () => {
    const fence = nemiaFence(TABLE);
    assert.ok(fence.allow.includes('Bash(nemia policy reach:*)'), fence.allow.join('\n'));
    const named = (rule: string) => rule.startsWith('Bash(nemia policy reach');
    assert.deepEqual([...fence.ask, ...fence.deny].filter(named), [], 'no rule asks or refuses it');
  });
});
