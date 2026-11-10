/**
 * The tick acts on proposals as the daemon runs it (`withProposalsPass`, the one way a program running the pass is given its proposals
 * pass): a run-end proposal of a real run stays approved while the tick judges its run at work, and applies on the pass after the tick
 * judges it succeeded — and `nemia tick`, a person's one pass, applies it as the daemon's loop does. The deciders and each rule are
 * `proposals.test.ts`'s; this file holds the wiring alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { ProposedObject } from 'objects';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';

const ROOT = scratch('wf-proposals-tick-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const { startRun, tickRun, runWith } = await import('../src/runner.ts');
const { main } = await import('../src/cli/main.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { proposeProgram } = await import('../src/propose/propose.verb.ts');
const { approveProgram, proposalGet } = await import('../src/approval/approve.verb.ts');
const { withProposalsPass } = await import('../src/apply/pass.verb.ts');
const { currentOf } = await import('../src/propose/current.verb.ts');
const { PERSON } = await import('../src/caller/caller.ts');
const stage = staged({ runWith, main, engineOf });

const PLACE = { home: ROOT, repo: ROOT };
const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** The stage's engine, its own tick answering no task, so a pass reads only the store. */
const quiet = () => {
  const b = stage.board();
  Object.assign(b.e, { tick: () => Effect.succeed({ tasks: 0, actions: [], running: {}, views: [] }), tallied: undefined });
  return b.e;
};

/** One pass of the tick over the whole store, with the proposals pass the daemon gives it. */
const tick = () => stage.runWith(quiet(), withProposalsPass(tickRun()));

/** A program run on the stage's engine and place. */
const run = <A, E>(program: Effect.Effect<A, E, any>): Promise<A> => stage.runWith(stage.board().e, program);

/** A templated factory `name` whose tree holds the workflow `dev` of one step, `plan`: its tree. */
function factory(name: string): string {
  const factories = path.join(ROOT, 'factories');
  fs.mkdirSync(factories, { recursive: true });
  fs.writeFileSync(
    path.join(factories, `${name}.json`),
    JSON.stringify({ repos: [scratch('wf-proposals-tick-repo-')], template: { source: '/t/team', version: '0.1.0', params: {} } }),
  );
  const tree = path.join(factories, name, 'tree');
  fs.mkdirSync(path.join(tree, 'workflows', 'dev'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'factory.json'), JSON.stringify({ workflows: ['dev'], hires: {} }));
  fs.writeFileSync(path.join(tree, 'workflows', 'dev', 'plan.md'), '---\nplace: folder\n---\nPlan the change.\n');
  return tree;
}

/** The run `started` of a workflow of one step, `plan`, in a repository of the stage's place, and its run-end proposal approved. */
async function approvedAtRunEnd(factoryName: string): Promise<{ run: string; proposal: string }> {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'plan.md'), '---\nplace: git\n---\nplan it\n');
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  const started = await stage.runPlaced(startRun({ brief: 'the proposing run', repo, workflowDir: dir, isolate: false }));
  await tick();
  const now = await run(currentOf(PLACE, factoryName, 'Workflow', 'dev'));
  const spec = now.spec as { steps: { name: string; body: string }[] };
  const object: ProposedObject = {
    kind: 'Workflow',
    metadata: { name: 'dev', resourceVersion: now.version ?? undefined },
    spec: { ...spec, steps: spec.steps.map((s) => (s.name === 'plan' ? { ...s, body: 'At the end.\n' } : s)) },
  };
  const caller = { kind: 'agent', agent: 'implementer', factory: factoryName, run: started.id, step: 'plan' } as const;
  const p = await run(proposeProgram(caller, factoryName, { objects: [object], applyAt: 'run-end' }, PLACE));
  await run(approveProgram(PERSON, factoryName, p.metadata.name, PLACE));
  return { run: started.id, proposal: p.metadata.name };
}

test('nemia tick applies an approved proposal whose run succeeded, as the daemon does: every tick acts on proposals', async (t) => {
  const s = story(t);
  const tree = factory('typed');
  const { run: id, proposal } = await approvedAtRunEnd('typed');
  await s.test('its run at work, nemia tick leaves the proposal approved', async () => {
    await stage.main(['tick'], quiet());
    assert.equal((await run(proposalGet('typed', proposal))).status.phase, 'approved');
  });
  await s.test('its run succeeded, nemia tick applies it, and the workflow says what it proposed', async () => {
    stage.board().settle(`${id}-plan`, 'succeeded', SIGNED);
    await stage.main(['tick'], quiet());
    await stage.main(['tick'], quiet());
    assert.equal((await run(proposalGet('typed', proposal))).status.phase, 'applied');
    assert.match(fs.readFileSync(path.join(tree, 'workflows', 'dev', 'plan.md'), 'utf8'), /At the end\./);
  });
});

test('a run-end proposal applies on the tick after its run is judged succeeded, through the proposals pass the daemon gives the tick', async () => {
  const tree = factory('ticked');
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'plan.md'), '---\nplace: git\n---\nplan it\n');
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  const started = await stage.runPlaced(startRun({ brief: 'the proposing run', repo, workflowDir: dir, isolate: false }));
  await tick();

  const now = await run(currentOf(PLACE, 'ticked', 'Workflow', 'dev'));
  const spec = now.spec as { steps: { name: string; body: string }[] };
  const object: ProposedObject = {
    kind: 'Workflow',
    metadata: { name: 'dev', resourceVersion: now.version ?? undefined },
    spec: { ...spec, steps: spec.steps.map((s) => (s.name === 'plan' ? { ...s, body: 'At the end.\n' } : s)) },
  };
  const caller = { kind: 'agent', agent: 'implementer', factory: 'ticked', run: started.id, step: 'plan' } as const;
  const p = await run(proposeProgram(caller, 'ticked', { objects: [object], applyAt: 'run-end' }, PLACE));
  await run(approveProgram(PERSON, 'ticked', p.metadata.name, PLACE));

  await tick();
  assert.equal((await run(proposalGet('ticked', p.metadata.name))).status.phase, 'approved', 'its run is at work');

  stage.board().settle(`${started.id}-plan`, 'succeeded', SIGNED);
  await tick();
  await tick();
  assert.equal((await run(proposalGet('ticked', p.metadata.name))).status.phase, 'applied', 'applied once the tick judged its run');
  assert.match(fs.readFileSync(path.join(tree, 'workflows', 'dev', 'plan.md'), 'utf8'), /At the end\./);
});
