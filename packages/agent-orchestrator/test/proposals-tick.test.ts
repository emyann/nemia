/**
 * The tick acts on proposals as the daemon runs it (`withProposalsPass`, the one way `up` gives a pass its proposals pass): a run-end
 * proposal of a real run stays approved while the tick judges its run at work, and applies on the pass after the tick judges it
 * succeeded. The deciders and each rule are `proposals.test.ts`'s; this file holds the wiring alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { ProposedObject } from 'objects';
import { scratch } from './scratch.ts';
import { staged } from './story.ts';

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

/** One pass of the tick over the whole store, with the proposals pass the daemon gives it. */
const tick = () => {
  const b = stage.board();
  Object.assign(b.e, { tick: () => Effect.succeed({ tasks: 0, actions: [], running: {}, views: [] }), tallied: undefined });
  return stage.runWith(b.e, withProposalsPass(tickRun()));
};

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
