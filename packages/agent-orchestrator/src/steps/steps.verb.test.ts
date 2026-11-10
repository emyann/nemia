/**
 * A run's steps as a program (`stepsOf`, `steps.verb.ts`): a frozen record's read with no door and no root; an unfrozen one's folder read
 * through the Workflow door the program is given, at the store's root it is given, its agents found through the Agent door — never the
 * disk at the module's root — and refused `UnloadedFolder` where it does not load, a defect of the read included; refused `Invalid`, and
 * not as a folder that does not load, where no root was given. `stepsOrNone` and `unloadedOf` read the refusal alone, and `stepsOrWhy`
 * keeps its reason, as `parentRecord` does for a run waited on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit, Layer } from 'effect';
import { scratch } from 'test-kit/scratch';
import { doorFrom, done } from '../../test/door-walks.ts';
import { aRun } from '../../test/run-walks.ts';
import { anAgent } from '../../test/agent-walks.ts';
import { aStep, aWorkflow } from '../../test/workflow-walks.ts';
import { StoreRoot } from '../config/root.store.ts';
import { WorkflowDoor } from '../workflows/workflows.store.ts';
import { workflowDoorMemory } from '../workflows/memory.store.ts';
import { AgentDoor } from '../agents/agent-door.store.ts';
import { agentDoorMemory } from '../agents/agent-memory.store.ts';
import { AgentName } from '../agents/agents.model.ts';
import { WorkflowDir } from '../folder/folder.model.ts';
import { Invalid } from '../refusal/refusal.ts';
import { isRepositoryRun, type Run } from '../record/record.ts';
import { UnloadedFolder, unloadedFolder } from './steps.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { runDoorMemory } from '../runs/memory.store.ts';
import { NOTHING_READ, standingReader } from '../standing/standing.verb.ts';
import { parentRecord, stepsOf, stepsOrNone, stepsOrWhy, unloadedOf } from './steps.verb.ts';

/** `run`'s record with no frozen workflow, its folder `dir`: what a record written before `nemia start` froze one holds. */
const unfrozen = (dir: string): Run => {
  const base = aRun('r-unfrozen');
  assert.ok(isRepositoryRun(base));
  const run: Run = { ...base, repo: path.dirname(dir), workflowDir: dir };
  delete run.workflow;
  return run;
};

/** The failure `program` ends with, or the defect it dies of; fails the test where it succeeds. */
const failureOf = <A, E>(program: Effect.Effect<A, E>): unknown => {
  const exit = Effect.runSync(Effect.exit(program));
  assert.ok(Exit.isFailure(exit), 'the read was refused');
  return exit.cause.reasons[0] && 'error' in exit.cause.reasons[0] ? exit.cause.reasons[0].error : exit.cause;
};

test('an unfrozen record whose folder only the Workflow door holds reads its steps from the door, in run order', () => {
  const root = scratch('wf-steps-memory-');
  const memory = workflowDoorMemory();
  const dir = WorkflowDir.read(path.join(root, 'workflows', 'dev'));
  const write = doorFrom(WorkflowDoor, memory).workflows.write(dir, aWorkflow([aStep('build', ['plan']), aStep('plan')]), undefined);
  done(Effect.provideService(write, StoreRoot, root));
  assert.equal(fs.existsSync(dir), false, 'no folder on disk');
  const steps = done(Effect.provide(Effect.provideService(stepsOf(unfrozen(dir)), StoreRoot, root), memory));
  assert.deepEqual(
    steps.map((s) => s.name),
    ['plan', 'build'],
  );
});

test('an unfrozen record on the files whose step names an agent only the Agent door holds reads with its keys resolved', () => {
  const root = scratch('wf-steps-agent-');
  const agents = agentDoorMemory();
  done(
    doorFrom(AgentDoor, agents).agents.write(
      AgentName.read('scribe'),
      anAgent('scribe', { keys: { model: 'sonnet', tools: 'Read, Write' } }),
      undefined,
      { dir: path.join(root, 'workflows', 'agents'), anywhere: true },
    ),
  );
  const dir = path.join(root, 'workflows', 'dev');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'build.md'), '---\nplace: git\nagent: scribe\n---\nBuild it.\n');
  const steps = done(Effect.provide(Effect.provideService(stepsOf(unfrozen(dir)), StoreRoot, root), Layer.mergeAll(agents)));
  assert.deepEqual(
    steps.map((s) => [s.name, s.agent?.name, s.model, s.tools]),
    [['build', 'scribe', 'sonnet', ['Read', 'Write']]],
  );
});

test('a frozen record reads in run order with no door and no root given', () => {
  const run: Run = { ...aRun('r-frozen'), workflow: [...(aRun('r-frozen').workflow ?? [])].reverse() };
  assert.deepEqual(
    Effect.runSync(stepsOf(run)).map((s) => s.name),
    ['implement', 'review'],
  );
});

test('an unfrozen record read with no store root is refused Invalid, never as a folder that does not load', () => {
  const err = failureOf(stepsOf(unfrozen(path.join(scratch('wf-steps-unrooted-'), 'workflows', 'dev'))));
  assert.ok(err instanceof Invalid);
  assert.equal(unloadedFolder(err), undefined);
});

test('an unfrozen folder the read dies of is refused UnloadedFolder, naming the run and the folder', () => {
  const root = scratch('wf-steps-defect-');
  const dir = path.join(root, 'workflows', 'dev');
  fs.mkdirSync(path.join(dir, 'build.md'), { recursive: true });
  const err = failureOf(Effect.provideService(stepsOf(unfrozen(dir)), StoreRoot, root));
  assert.ok(err instanceof UnloadedFolder);
  assert.ok(err.message.includes('r-unfrozen'));
  assert.ok(err.message.includes(dir));
});

test('an unfrozen record whose folder is gone reads no steps, and is left out in the refusal’s words', () => {
  const root = scratch('wf-steps-gone-');
  const run = unfrozen(path.join(root, 'workflows', 'gone'));
  const rooted = <A, E>(program: Effect.Effect<A, E>) => Effect.runSync(Effect.provideService(program, StoreRoot, root));
  assert.deepEqual(rooted(stepsOrNone(run)), []);
  const why = rooted(unloadedOf(run));
  assert.ok(why?.includes(run.workflowDir));
});

test('stepsOrWhy: an unfrozen folder that does not load is answered with its reason, a frozen record with its steps, no root refused', () => {
  const root = scratch('wf-steps-why-');
  const run = unfrozen(path.join(root, 'workflows', 'gone'));
  const rooted = <A, E>(program: Effect.Effect<A, E>) => Effect.runSync(Effect.provideService(program, StoreRoot, root));
  const read = rooted(stepsOrWhy(run));
  assert.ok('unloaded' in read, 'the folder that does not load is answered, not refused');
  const refusal = failureOf(Effect.provideService(stepsOf(run), StoreRoot, root));
  assert.ok(refusal instanceof UnloadedFolder);
  assert.equal(read.unloaded, refusal.why, "the reason is the refusal's own");
  const frozen = aRun('r-frozen');
  const steps = Effect.runSync(stepsOrWhy(frozen));
  assert.ok('steps' in steps);
  assert.equal(failureOf(stepsOrWhy(unfrozen(path.join(root, 'workflows', 'dev')))) instanceof Invalid, true, 'no root is no reason');
});

test('parentRecord: a run waited on whose unfrozen folder does not load says why (unread), never a run with no branches', () => {
  const root = scratch('wf-steps-parent-');
  const run = unfrozen(path.join(root, 'workflows', 'gone'));
  const program = Effect.gen(function* () {
    yield* (yield* RunDoor).runs.create(run);
    return yield* parentRecord(run.id, standingReader(NOTHING_READ));
  });
  const known = Effect.runSync(Effect.provide(Effect.provideService(program, StoreRoot, root), runDoorMemory()));
  assert.equal(known.record?.id, run.id, 'the record is read');
  const refusal = failureOf(Effect.provideService(stepsOf(run), StoreRoot, root));
  assert.ok(refusal instanceof UnloadedFolder);
  assert.equal(known.unread, refusal.why, "the reason is the refusal's own, as stepsOrWhy keeps it");
  assert.equal(known.gone, undefined, 'no branch is called gone');
});
