/**
 * Costs told to the step that reads them, as one story on the stage (`story.ts`): a step whose `reads:` names `costs` is told, on each
 * new session's brief, what the newest finished runs of its workflow in its factory cost (`costsRead`, `costsSection`) — after what was
 * asked for and a person's approval, before where to look; read off the store's records, newest first by when they were started, as many
 * as the window holds (`RECENT_RUNS`), a run unfinished or whose journal does not read passed over, and a run of another workflow or
 * factory never counted. A step without the line is told none, and a try or a round that continues the last session neither reads them
 * nor is told them again; a fresh try and a round on a new session are told them. What `costsOf` folds and the words of the section are
 * `src/costs/costs.test.ts`'s tables.
 *
 * Told on the engine's stand-in: the finished runs before it are planted by hand, their records as `nemia start` writes one and their
 * tasks filed and settled measured on the stand-in, as the stats read them; the run that reads them is the tick's. The stage's engine
 * is read through `tapped`, which notes each task viewed and fails the view of a spoiled task as a journal that does not read fails it.
 * `WF_ROOT` is set before the runner is imported: it is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { JournalError } from 'agent-runtime';
import { scratch } from './scratch.ts';
import { staged, story } from './story.ts';

const ROOT = scratch('wf-costs-brief-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, approveRun, retryRun, startRun, runWith } = await import('../src/runner.ts');
const { readRun } = await import('../src/record/record.store.ts');
const { RECENT_RUNS } = await import('../src/costs/index.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const SECTION = '## What runs of this workflow cost';

/** Every task the stage's engine was asked to view through `tapped`, in order. */
const viewed: string[] = [];
/** Every task whose journal does not read. */
const spoiled = new Set<string>();

/** The stage's engine, each view noted, a spoiled task's view failing as a journal that does not read fails it. */
const tapped = () => {
  const e = stage.board().e;
  return {
    ...e,
    view: (taskId: string) => {
      viewed.push(taskId);
      return spoiled.has(taskId)
        ? Effect.fail(new JournalError({ taskId, message: `the journal of ${taskId} does not read` }))
        : e.view(taskId);
    },
  };
};

/** The engine's pass is the stand-in's to make; the run's, as the daemon makes it, over the tapped engine. */
const tick = (id: string) => stage.runWith(tapped(), advanceRun(readRun(id)));
/** The task the record names for `step` now. */
const taskOf = (id: string, step: string): string => readRun(id).steps[step].taskId!;
/** The brief the task `taskId` was filed with. */
const briefOf = (taskId: string): string => stage.board().tasks.get(taskId)!.spec.brief;
/** The tasks viewed since the mark that belong to no run but `id`. */
const othersViewed = (id: string) => viewed.filter((taskId) => !taskId.startsWith(id));

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  return repo;
};

/** The workflow folder `costed`: `design`, gated, then `implement`, reading `costs`. */
const WORKFLOW = path.join(ROOT, 'costed');
fs.mkdirSync(WORKFLOW);
fs.writeFileSync(path.join(WORKFLOW, 'design.md'), '---\nplace: git\ngate: true\n---\nDesign it.\n');
fs.writeFileSync(path.join(WORKFLOW, 'implement.md'), '---\nafter: design\nplace: git\nreads: costs\n---\nBuild it.\n');

/**
 * The same workflow `costed`, in another folder, as a loop: `implement`, reading `costs`, then `review`, which may send it back twice
 * (`rounds: 3`).
 */
const LOOPED = path.join(ROOT, 'looped', 'costed');
fs.mkdirSync(LOOPED, { recursive: true });
fs.writeFileSync(path.join(LOOPED, 'implement.md'), '---\nplace: git\nreads: costs\n---\nBuild it.\n');
fs.writeFileSync(
  path.join(LOOPED, 'review.md'),
  '---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\nrounds: 3\n---\nReview it.\n',
);
fs.writeFileSync(
  path.join(LOOPED, 'review.schema.json'),
  JSON.stringify({ type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false }),
);

/** The hour `i` from the first run's start, as a record and the stand-in stamp it. */
const hour = (i: number) => new Date(Date.UTC(2026, 8, 1, i)).toISOString();

/**
 * A run of `costed`'s one step `design`, started at hour `i` and, where `settled`, ended an hour later measured at `costUsd`: its record
 * frozen as `nemia start` writes one, of `workflowDir` and in `factory`, and its task filed on the stand-in and settled there.
 */
async function aRun(id: string, i: number, costUsd: number, more: { settled?: boolean; workflowDir?: string; factory?: string } = {}) {
  const taskId = `${id}-design`;
  const board = stage.board();
  await Effect.runPromise(board.e.file({ id: taskId, brief: 'Design it.', cwd: ROOT, harness: 'codex' }));
  board.tasks.get(taskId)!.filedAt = hour(i);
  if (more.settled !== false)
    board.end(taskId, 'succeeded', {
      startedAt: hour(i),
      spawnedAt: hour(i),
      endedAt: hour(i + 1),
      closeout: { outcome: 'done', summary: 'Did it.', needs: null, artifacts: [] },
      usage: { costUsd },
    });
  fs.writeFileSync(
    path.join(ROOT, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/repos/home',
      baseRef: 'abc',
      workspace: '/repos/home',
      branch: 'main',
      isolate: true,
      brief: `The brief of ${id}`,
      createdAt: hour(i),
      workflowDir: more.workflowDir ?? '/elsewhere/costed',
      ...(more.factory ? { factory: more.factory } : {}),
      workflow: [{ name: 'design', after: [], body: 'Design it.', harness: 'codex', reads: ['costs'] }],
      steps: { design: { taskId } },
    }),
  );
}

test('Costs told to the step that reads them: after the approval and before where to look, the window of finished runs, never again to a session continued', async (t) => {
  const s = story(t);
  let id = '';

  await s.test(
    'the store holds RECENT_RUNS + 1 finished runs of costed, c00 the oldest at $1 to c20 at $21; newer, one unfinished, one whose journal does not read, and one each of another workflow and another factory at $1000',
    async () => {
      for (let i = 0; i <= RECENT_RUNS; i++) await aRun(`c${String(i).padStart(2, '0')}`, i, i + 1);
      await aRun('z-moving', 40, 1000, { settled: false });
      await aRun('z-spoiled', 41, 1000);
      spoiled.add('z-spoiled-design');
      await aRun('z-intake', 42, 1000, { workflowDir: '/elsewhere/intake' });
      await aRun('z-other', 43, 1000, { factory: 'other' });
    },
  );

  await s.test('a step without the line is told none, and its pass reads no other run', async () => {
    id = (await stage.runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: WORKFLOW, isolate: false }))).id;
    viewed.length = 0;
    assert.deepEqual((await tick(id)).filed, ['design']);
    assert.equal(briefOf(taskOf(id, 'design')).includes(SECTION), false);
    assert.deepEqual(othersViewed(id), []);
  });

  await s.test(
    'once design is approved, implement is told what the newest twenty finished runs of costed cost in its factory, after the approval and before where to look; the reader stops at the window',
    async () => {
      stage.board().settle(taskOf(id, 'design'), 'succeeded', SIGNED);
      await tick(id);
      await stage.runWith(tapped(), approveRun(id, 'design', 'go'));
      viewed.length = 0;
      assert.deepEqual((await tick(id)).filed, ['implement']);
      assert.ok(viewed.includes('c01-design'), 'the oldest run in the window is read');
      assert.equal(viewed.includes('c00-design'), false, 'the reader stops at the window: no run older than it is read');
      const brief = briefOf(taskOf(id, 'implement'));
      const asked = brief.indexOf('## What was asked for');
      const approved = brief.indexOf('## Approved');
      const costs = brief.indexOf(SECTION);
      const look = brief.indexOf('## Where to look');
      assert.ok(asked >= 0 && approved > asked && costs > approved && look > costs, brief);
      assert.ok(brief.includes(`Over the last ${RECENT_RUNS} finished runs of \`costed\` in this factory, since 2026-09-01,`), brief);
      assert.ok(
        brief.includes('- design: median 11.50, p90 19.00; tries a run median 1, max 1\n'),
        `the newest twenty, $2 to $21, and none of the rest:\n${brief}`,
      );
      assert.ok(brief.includes('- the whole run: median 11.50, p90 19.00; no loop ran to acceptance'), brief);
    },
  );

  await s.test('a fresh try of the step is told the costs again, read afresh', async () => {
    stage.board().settle(taskOf(id, 'implement'), 'failed');
    await tick(id);
    await stage.runWith(tapped(), retryRun(id, 'implement', { mode: 'fresh' }));
    viewed.length = 0;
    await tick(id);
    const fresh = taskOf(id, 'implement');
    assert.notEqual(fresh, `${id}-implement`);
    assert.ok(viewed.includes('c20-design'), 'the pass that files a fresh try reads the newest run');
    assert.ok(briefOf(fresh).includes(SECTION), briefOf(fresh));
  });

  await s.test("a try that continues the last session neither reads nor is told them: it was, on that session's first brief", async () => {
    const fresh = taskOf(id, 'implement');
    stage.board().settle(fresh, 'failed');
    await tick(id);
    await stage.runWith(tapped(), retryRun(id, 'implement', { mode: 'continue', message: 'once more' }));
    viewed.length = 0;
    await tick(id);
    const nudged = taskOf(id, 'implement');
    assert.notEqual(nudged, fresh);
    assert.deepEqual(othersViewed(id), [], 'the pass that files a continued session reads no other run');
    assert.equal(briefOf(nudged).includes(SECTION), false, briefOf(nudged));
  });

  await s.test('a round whose target starts a new session is told the costs', async () => {
    id = (await stage.runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: LOOPED, isolate: false }))).id;
    assert.deepEqual((await tick(id)).filed, ['implement']);
    const first = taskOf(id, 'implement');
    assert.ok(briefOf(first).includes(SECTION), 'the first session is told them');
    stage.board().end(first, 'succeeded', { closeout: SIGNED, nativeId: null });
    assert.deepEqual((await tick(id)).filed, ['review']);
    stage.board().settle(taskOf(id, 'review'), 'succeeded', { ...SIGNED, again: true });
    viewed.length = 0;
    await tick(id);
    const cold = taskOf(id, 'implement');
    assert.notEqual(cold, first, 'the round is filed');
    assert.ok(viewed.includes('c20-design'), 'the pass that files a round on a new session reads the newest run');
    assert.ok(briefOf(cold).includes(SECTION), briefOf(cold));
  });

  await s.test('a round that continues the last session neither reads nor is told them', async () => {
    const cold = taskOf(id, 'implement');
    stage.board().settle(cold, 'succeeded', { ...SIGNED, replies: [{ finding: 'review', answer: 'fixed', why: 'did it' }] });
    assert.deepEqual((await tick(id)).filed, ['review']);
    stage.board().settle(taskOf(id, 'review'), 'succeeded', { ...SIGNED, again: true });
    viewed.length = 0;
    await tick(id);
    const continued = taskOf(id, 'implement');
    assert.notEqual(continued, cold, 'the second round is filed');
    assert.deepEqual(othersViewed(id), [], 'the pass that files a round on a continued session reads no other run');
    assert.equal(briefOf(continued).includes(SECTION), false, briefOf(continued));
  });
});
