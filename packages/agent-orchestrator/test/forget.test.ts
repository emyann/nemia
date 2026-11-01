/**
 * `nemia rm`, told as a person's stories on `story(t)` and the stage (`staged`): a run that landed, freed by the daemon's sweep, its files
 * pruned and then forgotten whole — its tasks on the engine, its record and every file under its id — its branches as asked, and a second
 * `nemia rm` that finds no such run; runs `nemia rm` refuses, each by name and with its fix, exit 2, then forgets once what held each is
 * gone; and an engine that does not forget at once — a task not settled, a refusal whole or of one task — whose marker the passes finish
 * or warn of. What `nemia rm` refuses before anything is read is a table.
 *
 * What `forgetRefusal`, `forgetLine` and their neighbours decide is pure, in `src/forget/forget.test.ts`. A pass that read a run before
 * `nemia rm` forgot it stays focused in `store.test.ts` (the races there); what the runtime itself counts of what it forgot, and its own
 * words for a harness it lacks, in `forget-runtime.boundary.test.ts`; a worktree held on git in `rm-held`, `rm-signal` and `rm-walk`.
 *
 * The engine's stand-in moves no task by itself: a story settles each one, and a whole-store pass is given an engine pass that reports
 * nothing (`QUIET`) and a `close` that holds a task as it signed, since a stand-in keeps neither. `WF_ROOT` is set before the runner is
 * imported, which reads it as it loads; `WF_DEFAULT_FACTORY_STARTS` beside it starts runs in repositories no factory holds.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { ForgetRefused } from 'agent-runtime';
import type { Engine } from '../src/runtime-client.ts';
import type { Run } from '../src/run.ts';
import type { ForgetHow } from '../src/forget/forget.ts';
import { scratch } from './scratch.ts';
import { staged, story, type Board } from './story.ts';
import { names } from './assessed.ts';
import { placeOver, unreadBy } from './place-over.ts';

const ROOT = scratch('wf-forget-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
delete process.env.WF_KEEP_WORKTREES;
const { advanceRun, cancelRun, forgetRun, prune, retryRun, runsForgetting, startRun, stepsOf, runWith } = await import('../src/runner.ts');
const { listRuns, markCancelled, readRun } = await import('../src/record/record.store.ts');
const { runTasks } = await import('../src/record/record.ts');
const { runStore } = await import('../src/record/files.store.ts');
const { LINE_NAME } = await import('../src/run.ts');
const { tickRun } = await import('../src/tick/tick.verb.ts');
const { freeOnce, freshFreeMemory } = await import('../src/prune/free.verb.ts');
const { PlaceService } = await import('../src/place/place.store.ts');
const { Invalid } = await import('../src/refusal/refusal.ts');
const { idRefusal } = await import('../src/forget/forget.ts');
const { EngineService, engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });
const world = () => stage.place().world;

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const BLOCKED = { outcome: 'blocked', summary: 'two flags could be meant', artifacts: [], needs: 'which flag: --dry-run or --force?' };

/** What the engine's own pass answers here: nothing admitted, nothing started, no view — every task is read off the stand-in. */
const QUIET = { tasks: 0, actions: [], running: {}, views: [] };

/** What a test makes the engine's `forget` refuse, while set: every call whole, in `whole`'s words, or one task by name. */
const refusing: { whole?: string; task?: { taskId: string; message: string } } = {};

/** The boards whose engine was given its pass, its `close` and its refusals. */
const ready = new WeakSet<Board>();

/**
 * The stage's engine, given what a stand-in keeps none of: a pass that reports nothing (`QUIET`), no tally, a `close` that holds the task
 * as it signed (each counted on `closed`), and a `forget` that refuses as `refusing` says before the stand-in's own answers.
 */
const board = () => {
  const b = stage.board();
  if (!ready.has(b)) {
    ready.add(b);
    const forget = b.e.forget;
    Object.assign(b.e, {
      tick: () => Effect.succeed(QUIET),
      tallied: undefined,
      close: (id: string) => Effect.sync(() => void closed.push(id)),
      forget: (taskIds: readonly string[], options?: { yes?: boolean }) => {
        if (refusing.whole !== undefined) {
          b.forgets.push({ taskIds: [...taskIds], yes: options?.yes === true });
          return Effect.fail(new ForgetRefused({ message: refusing.whole }));
        }
        if (refusing.task && taskIds.includes(refusing.task.taskId)) {
          b.forgets.push({ taskIds: [...taskIds], yes: options?.yes === true });
          return Effect.fail(new ForgetRefused(refusing.task));
        }
        return forget(taskIds, options);
      },
    });
  }
  return b;
};
const closed: string[] = [];
const e = () => board().e;

/** A repository of the stage's place with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  world().repository(repo, { 'README.md': 'readme\n' });
  return repo;
};
/** A workflow folder: `implement`, with whatever frontmatter it is given, and `review` after it. */
const folder = (implementKeys = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\nplace: git\n${implementKeys ? `${implementKeys}\n` : ''}---\nimplement it\n`);
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};
/** A workflow of one step, `implement`, with the frontmatter lines it is given: its branch is the run's result. */
const oneStep = (lines = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(
    path.join(dir, 'implement.md'),
    `---\n${/^place:/m.test(lines) ? '' : 'place: git\n'}${lines ? `${lines}\n` : ''}---\nimplement it\n`,
  );
  return dir;
};
/** One pass over the run `id` on the stage's engine. */
const pass = (id: string) => stage.runWith(e(), advanceRun(readRun(id)));
/** A whole-store pass of the tick, as the daemon makes it. */
const tick = () => stage.runWith(e(), tickRun({ repo: ROOT }));
const under = (...parts: string[]) => fs.existsSync(path.join(ROOT, ...parts));
const hasBranch = (repo: string, branch: string) => world().tip(repo, branch) !== null;
const markerOf = (id: string) => path.join(ROOT, 'forgetting', `${id}.json`);
/** The ids of the tasks the engine has a record of. */
const listed = async (): Promise<string[]> => (await Effect.runPromise(e().list())).views.map((v) => v.id);
/** The directories `repo` has a checkout in under the store's worktrees, as its place lists them. */
const worktreesOf = (repo: string): string[] => {
  const outcome = stage.place().place.askNow('inventory', { repo, under: path.join(ROOT, 'worktrees'), run: 'r', base: 'main' });
  assert.ok('answer' in outcome, `the inventory of ${repo}`);
  return outcome.answer.workspaces.map((w) => w.path);
};

/**
 * A run another may wait on: started on `repo` with worktrees, its step filed — with `work`, a file committed on its branch, and with
 * `signed` (by default, when there is work) its step signed off.
 */
const aParent = async (repo: string, { work, signed = Boolean(work) }: { work?: string; signed?: boolean } = {}) => {
  const run = await stage.runPlaced(startRun({ brief: 'the parent', repo, workflowDir: oneStep() }));
  await pass(run.id);
  const wt = readRun(run.id).steps.implement.workspace!;
  if (work) {
    fs.writeFileSync(path.join(wt, work), `${work}\n`);
    world().commit(wt, `add ${work}`);
  }
  if (signed) board().settle(`${run.id}-implement`, 'succeeded', SIGNED);
  return { run, wt, branch: readRun(run.id).steps.implement.branch! };
};

/** `nemia <argv>`, through the CLI, as a person types it: the lines it printed, and the error it ended with, if it did. */
const typed = async (t: TestContext, ...argv: string[]) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => void printed.push(a.join(' ')));
  try {
    await stage.main(argv, e());
    return { printed, error: undefined };
  } catch (err) {
    return { printed, error: err as Error & { exitCode?: number; _tag?: string } };
  } finally {
    log.mock.restore();
  }
};

test('after a landing: the sweep frees the run, `nemia prune --artifacts --yes` takes its files, `nemia rm` forgets the rest of it and its tasks, and a second `nemia rm` finds no such run', async (t) => {
  const s = story(t);
  let repo = '';
  let id = '';
  let tasks: string[] = [];
  let kept = '';
  await s.test('a run lands: blocked, tried again with a word, signed and checked, merged by hand — three tasks, and at rest', async () => {
    repo = aRepo();
    const run = await stage.runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: oneStep('harness: codex\ncheck: "true"') }));
    id = run.id;
    assert.deepEqual((await pass(id)).filed, ['implement']);
    const wt = readRun(id).steps.implement.workspace!;
    board().settle(`${id}-implement`, 'succeeded', BLOCKED);
    await pass(id);
    await stage.runWith(e(), retryRun(id, 'implement', { mode: 'continue', message: 'the --dry-run flag' }));
    await pass(id);
    fs.writeFileSync(path.join(wt, 'flag.ts'), 'export const dryRun = true;\n');
    world().commit(wt, 'add the flag');
    board().settle(`${id}-implement-try2`, 'succeeded', SIGNED);
    assert.deepEqual((await pass(id)).checked, ['implement']);
    board().settle(`${id}-implement-try2-check`, 'succeeded', undefined, 0);
    assert.equal((await pass(id)).status, 'succeeded');
    tasks = runTasks(readRun(id));
    assert.deepEqual(
      [...tasks].sort(),
      [`${id}-implement`, `${id}-implement-try2`, `${id}-implement-try2-check`],
      'its tries and its check',
    );
    world().stage(repo, readRun(id).steps.implement.branch!);
    world().commit(repo, `merge ${id}`);
    const other = await stage.runPlaced(startRun({ brief: 'another run', repo: aRepo(), workflowDir: oneStep() }));
    await pass(other.id);
    kept = `${other.id}-implement`;
  });

  await s.test('the sweep after the pass that found it at rest removes its worktree, and marks the run pruned', async () => {
    const wt = readRun(id).steps.implement.workspace!;
    const answers = (await tick()).runs.filter((a) => a.run.id === id);
    assert.equal(answers[0]?.feed.atRest, true, 'at rest: what a sweep is fed');
    const done = await stage.runWith(e(), freeOnce(answers, freshFreeMemory()));
    assert.deepEqual(
      done.freed.map((p) => [p.id, p.kind]),
      [[id, 'pruned']],
    );
    assert.ok(!fs.existsSync(wt) && !under('worktrees', id), 'its worktree is gone');
    assert.ok(hasBranch(repo, readRun(id).steps.implement.branch!), 'its branch kept');
    assert.ok(under('runs', `${id}.json`), 'and its record');
  });

  await s.test(
    '`nemia prune --artifacts` lists its files and what `nemia rm` would forget of the engine, asked dry; `--yes` removes them alone',
    async () => {
      const shot = path.join(ROOT, 'runs', id, 'artifacts', 'implement', 'shot.png');
      fs.mkdirSync(path.dirname(shot), { recursive: true });
      fs.writeFileSync(shot, 'p'.repeat(32 * 1024));
      fs.mkdirSync(path.join(ROOT, 'runs', id, 'inputs'), { recursive: true });
      fs.writeFileSync(path.join(ROOT, 'runs', id, 'inputs', 'kept.md'), 'kept\n');
      const before = board().forgets.length;
      const dry = await typed(t, 'prune', id, '--artifacts');
      assert.equal(dry.error, undefined);
      names(dry.printed.join('\n'), `${id}  would remove its files`, path.join(ROOT, 'runs', id, 'artifacts'), `nemia rm ${id}`, '--yes');
      assert.ok(
        board()
          .forgets.slice(before)
          .every((f) => !f.yes && f.taskIds.length === 3),
        'what rm would forget is counted dry, over its three tasks',
      );
      const done = await stage.runWith(e(), prune(id, { artifacts: true, yes: true }));
      assert.deepEqual([done.kind, done.worktrees], ['pruned', []]);
      assert.ok(!under('runs', id, 'artifacts') && under('runs', id, 'inputs', 'kept.md') && under('runs', `${id}.json`));
      assert.ok(readRun(id).pruned?.artifacts, 'the mark says its files went');
      assert.deepEqual(
        tasks.filter((task) => !board().tasks.has(task)),
        [],
        'and the engine keeps every task of it',
      );
    },
  );

  await s.test(
    '`nemia rm` forgets its tasks — its first try, its second and its check — in one call, its record and every file, keeps its branch, and says so',
    async () => {
      const branch = readRun(id).steps.implement.branch!;
      const before = board().forgets.length;
      const said = await typed(t, 'rm', id);
      assert.equal(said.error, undefined);
      names(said.printed[0], `${id}  forgotten`, `runs/${id}.json`, `kept ${branch}`, '--delete-branches', 'the engine forgot 3 tasks');
      assert.deepEqual(board().forgets.slice(before), [{ taskIds: tasks, yes: true }], 'one call, over its tasks');
      const left = await listed();
      assert.deepEqual(
        tasks.filter((task) => left.includes(task)),
        [],
        'the engine lists none of them',
      );
      assert.ok(left.includes(kept), "another run's task is the engine's still");
      assert.ok(!fs.existsSync(markerOf(id)), 'no marker is left');
      assert.ok(
        !under('runs', `${id}.json`) && !under('runs', id) && !under('runs', `${id}.pruned`),
        'its record, files and mark are gone',
      );
      assert.ok(hasBranch(repo, branch), 'its branch is kept');
    },
  );

  await s.test('a second `nemia rm` finds no such run, and is no refusal', async () => {
    const again = await typed(t, 'rm', id);
    assert.deepEqual([again.error, again.printed], [undefined, [`${id}  no such run — nothing to forget`]]);
  });

  await s.test(
    "`nemia rm --delete-branches` deletes a branch merged into its run's base and keeps one that is not; `--force-unmerged` deletes that too; a `--no-worktree` run's base is never touched",
    async () => {
      const at = aRepo();
      const merged = await aParent(at, { work: 'merged.txt' });
      world().stage(at, merged.branch);
      world().commit(at, 'Merge it');
      const unmerged = await aParent(at, { work: 'unmerged.txt' });
      const forced = await aParent(at, { work: 'forced.txt' });
      const one = await typed(t, 'rm', merged.run.id, unmerged.run.id, '--delete-branches');
      assert.equal(one.error, undefined);
      names(one.printed[0], `deleted ${merged.branch} (merged into main)`, 'the engine forgot 1 task');
      names(one.printed[1], `kept ${unmerged.branch}: not merged into main`, '--force-unmerged');
      assert.deepEqual([hasBranch(at, merged.branch), hasBranch(at, unmerged.branch)], [false, true]);
      const two = await typed(t, 'rm', forced.run.id, '--force-unmerged', '--delete-branches');
      names(two.printed[0], `deleted ${forced.branch} (not merged into main, forced)`);
      assert.equal(hasBranch(at, forced.branch), false);

      const direct = await stage.runPlaced(startRun({ brief: 'on the base itself', repo: at, workflowDir: oneStep(), isolate: false }));
      await pass(direct.id);
      board().settle(`${direct.id}-implement`, 'succeeded', SIGNED);
      const three = await typed(t, 'rm', direct.id, '--delete-branches', '--force-unmerged');
      names(three.printed[0], `${direct.id}  forgotten`, 'no worktrees', at, `runs/${direct.id}.json`, 'no branch of its own');
      assert.equal(three.printed.length, 1);
      assert.ok(
        hasBranch(at, 'main') && world().head(at) === world().tip(at, 'main'),
        'the base branch and the repository are where they were',
      );
    },
  );

  await s.test(
    'REFUSED: `nemia rm --delete-branches` never deletes a branch its hand-off just committed onto — read merged, at its base — and says it kept it',
    async () => {
      const at = aRepo();
      const p = await aParent(at, { signed: true });
      fs.writeFileSync(path.join(p.wt, 'left.txt'), 'left uncommitted\n');
      const forgot = await stage.runWith(e(), forgetRun(p.run.id, { deleteBranches: true }));
      assert.equal(forgot.kind, 'forgotten');
      assert.deepEqual(
        forgot.handedOff.map((h) => h.branch),
        [p.branch],
      );
      assert.ok(hasBranch(at, p.branch), 'the branch with the work the hand-off committed is kept');
      assert.equal(world().changed(at, p.branch).join('\n'), 'left.txt');
      assert.deepEqual(
        forgot.branches.map((b) => [b.branch, b.deleted, b.why]),
        [[p.branch, false, 'unmerged']],
      );
    },
  );

  await s.test("`nemia rm`'s program, given the engine as a service, answers what its plain face answers", async () => {
    const run = await stage.runPlaced(startRun({ brief: 'forgotten through its program', repo: aRepo(), workflowDir: folder() }));
    await pass(run.id);
    const program = (how: ForgetHow) => stage.runPlaced(forgetRun(run.id, how).pipe(Effect.provide(EngineService.layer(e()))));
    const refused = await program({});
    assert.equal(refused.kind, 'refused', 'a step in flight: nothing is touched');
    assert.deepStrictEqual(refused, await stage.runWith(e(), forgetRun(run.id)));
    const wt = readRun(run.id).steps.implement.workspace!;
    board().settle(`${run.id}-implement`, 'failed');
    await pass(run.id);
    const forgot = await program({ deleteBranches: true, forceUnmerged: true });
    assert.deepEqual([forgot.kind, forgot.removed], ['forgotten', [wt]]);
    assert.deepEqual(
      forgot.branches.map((f) => [f.branch, f.deleted]),
      [[`wf/${run.id}/${LINE_NAME}`, true]],
      'what it was asked, honoured',
    );
    assert.ok(!under('runs', `${run.id}.json`) && !under('worktrees', run.id));
    assert.deepStrictEqual(await stage.runWith(e(), forgetRun(run.id)), await program({}), 'no record left: both say so the same');
  });

  await s.test('a folder run is forgotten with its folders, and its task on the engine', async () => {
    const run = await stage.runPlaced(
      startRun({
        brief: 'a note',
        repo: fs.mkdtempSync(path.join(ROOT, 'plain-')),
        workflowDir: oneStep('harness: codex\nplace: folder\npermissionMode: workspace-write'),
      }),
    );
    await pass(run.id);
    board().settle(`${run.id}-implement`, 'succeeded', SIGNED);
    await pass(run.id);
    assert.equal(readRun(run.id).steps.implement.workspace?.startsWith(path.join(ROOT, 'runs', run.id)), true, 'a folder run');
    const forgot = await stage.runWith(e(), forgetRun(run.id));
    assert.deepEqual([forgot.kind, forgot.folder, forgot.engine?.forgotten], ['forgotten', true, [`${run.id}-implement`]]);
    assert.ok(!(await listed()).includes(`${run.id}-implement`) && !fs.existsSync(markerOf(run.id)));
  });

  await s.test(
    'a run whose tasks the engine no longer knows is forgotten; so is a record that froze no workflow and whose folder is gone; a run with no record is no such run, and what was left under its id removed',
    async () => {
      const legacyDir = fs.mkdtempSync(path.join(ROOT, 'legacy-'));
      fs.writeFileSync(path.join(legacyDir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
      const legacy: Run = {
        id: 'legacy-run-9z9z',
        repo: '/repo',
        workspace: '/repo',
        baseRef: 'abc123',
        branch: 'main',
        isolate: false,
        brief: 'add a flag',
        workflowDir: legacyDir,
        steps: { implement: { taskId: 'legacy-run-9z9z-implement' } },
        createdAt: '2026-01-01T00:00:00Z',
      };
      fs.writeFileSync(path.join(ROOT, 'runs', `${legacy.id}.json`), JSON.stringify(legacy, null, 2));
      assert.equal(stepsOf(readRun(legacy.id)).length, 1, 'read from the folder, since the record froze nothing');
      fs.rmSync(legacyDir, { recursive: true });
      assert.throws(
        () => stepsOf(readRun(legacy.id)),
        (err: Error) => err.message.includes(legacy.id) && err.message.includes(legacyDir),
      );
      const said = await typed(t, 'rm', legacy.id);
      assert.equal(said.error, undefined);
      names(said.printed[0], `${legacy.id}  forgotten`, 'no worktrees', `runs/${legacy.id}.json`, 'never frozen', legacyDir);

      fs.writeFileSync(path.join(ROOT, 'runs', 'gone-run-3c4d.cancelled'), '2026-09-16T00:00:00.000Z');
      fs.mkdirSync(path.join(ROOT, 'runs', 'gone-run-3c4d.asks', 'done'), { recursive: true });
      const leftover = await typed(t, 'rm', 'gone-run-3c4d');
      assert.equal(leftover.error, undefined, 'no record is no refusal');
      assert.equal(leftover.printed.length, 1);
      names(leftover.printed[0], 'gone-run-3c4d  no such run', 'runs/gone-run-3c4d.cancelled', 'runs/gone-run-3c4d.asks/');
      assert.ok(!under('runs', 'gone-run-3c4d.asks') && !under('runs', 'gone-run-3c4d.cancelled'));
    },
  );

  await s.test("a run with no record takes no live run's check logs, nor those of a run whose record does not read", async (tt) => {
    const live = await aParent(aRepo());
    const id = live.run.id;
    fs.mkdirSync(path.join(ROOT, 'checks'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'checks', `${id}-implement-check.stderr`), "the live run's\n");
    const sibling = await typed(t, 'rm', `${id}-implement`);
    assert.deepEqual([sibling.error, sibling.printed], [undefined, [`${id}-implement  no such run — nothing to forget`]]);
    assert.ok(under('checks', `${id}-implement-check.stderr`), "the live run's check log stays");
    const torn = 'torn-record-x2';
    fs.writeFileSync(path.join(ROOT, 'runs', `${torn}.json`), '{ "id": ');
    fs.writeFileSync(path.join(ROOT, 'checks', `${torn}-review-check.stderr`), "a torn run's\n");
    tt.after(() => fs.rmSync(path.join(ROOT, 'runs', `${torn}.json`), { force: true }));
    const prefix = await typed(t, 'rm', 'torn-record');
    assert.deepEqual([prefix.error, prefix.printed], [undefined, ['torn-record  no such run — nothing to forget']]);
    assert.ok(under('checks', `${torn}-review-check.stderr`), 'nor a run whose record does not read');
    board().settle(`${id}-implement`, 'succeeded', SIGNED);
    await pass(id);
    assert.equal((await stage.runWith(e(), forgetRun(id))).kind, 'forgotten');
    fs.rmSync(path.join(ROOT, 'runs', `${torn}.json`), { force: true });
  });
});

test('`nemia rm` refused, then allowed: each run that holds it named on its line with its fix, nothing of it removed, exit 2, a run beside them forgotten; and once what held each is gone, forgotten', async (t) => {
  const s = story(t);
  let repo = '';
  const ids: Record<string, string> = {};
  await s.test(
    'REFUSED: a step in flight, a step ready, an unspent ask and a child not started — each on its line, exit 2 — while a run beside them is forgotten',
    async () => {
      repo = aRepo();
      const running = await stage.runPlaced(startRun({ brief: 'still running', repo, workflowDir: folder() }));
      await pass(running.id);
      const readyRun = await stage.runPlaced(startRun({ brief: 'review is ready', repo, workflowDir: folder() }));
      await pass(readyRun.id);
      board().settle(`${readyRun.id}-implement`, 'succeeded', SIGNED);
      const asked = await stage.runPlaced(startRun({ brief: 'a try asked for', repo, workflowDir: folder() }));
      await pass(asked.id);
      board().settle(`${asked.id}-implement`, 'succeeded');
      await stage.runWith(e(), retryRun(asked.id, 'implement', { mode: 'continue' }));
      const parent = await aParent(repo, { work: 'parent.txt' });
      const child = await stage.runPlaced(startRun({ brief: 'the child', repo, workflowDir: folder(), after: [parent.run.id] }));
      const over = await aParent(repo, { work: 'over.txt' });
      Object.assign(ids, { running: running.id, ready: readyRun.id, asked: asked.id, parent: parent.run.id, child: child.id });

      const { printed, error } = await typed(t, 'rm', running.id, readyRun.id, asked.id, parent.run.id, over.run.id);
      assert.equal(error?.exitCode, 2, error?.message);
      names(error?.message, running.id, readyRun.id, asked.id, parent.run.id);
      assert.ok(!error?.message.includes(over.run.id), 'the run forgotten is not among them');
      names(printed[0], `${running.id}  not forgotten`, 'implement is pending', `nemia cancel ${running.id}`, `nemia ls ${running.id}`);
      names(printed[1], `${readyRun.id}  not forgotten`, 'review is ready to be filed', `nemia cancel ${readyRun.id}`);
      names(printed[2], `${asked.id}  not forgotten`, 'try 2 of implement is due', 'nemia retry --continue', `nemia cancel ${asked.id}`);
      names(printed[3], `${parent.run.id}  not forgotten`, `${child.id} waits on it`, `nemia cancel ${child.id}`);
      names(printed[4], `${over.run.id}  forgotten`, 'removed 1 worktree');
      for (const id of [running.id, readyRun.id, asked.id, parent.run.id])
        assert.ok(under('runs', `${id}.json`) && under('worktrees', id, LINE_NAME), `${id}: record and worktree kept`);
      assert.ok(under('runs', `${asked.id}.asks`, 'retry-implement-2'), 'and the ask');
      assert.deepEqual(board().stopped, [], 'nothing stopped: cancelling is its own verb');
    },
  );

  await s.test(
    "REFUSED at shipped defaults: a run in flight writes no marker, asks the engine to forget nothing, and its task stays the engine's",
    async () => {
      const before = board().forgets.length;
      const forgot = await stage.runWith(e(), forgetRun(ids.running));
      assert.deepEqual([forgot.kind, forgot.engine], ['refused', undefined]);
      assert.equal(board().forgets.length, before, 'no forget asked');
      assert.ok(!fs.existsSync(markerOf(ids.running)), 'and no marker written');
      assert.ok((await listed()).includes(`${ids.running}-implement`));
    },
  );

  await s.test(
    'cancelled, a run whose task a tick still stops waits for it, then is forgotten; cancelled runs file nothing, honour no ask, and strand nothing',
    async () => {
      await stage.runWith(e(), cancelRun(ids.running));
      const pending = (await stage.runWith(e(), forgetRun(ids.running))).refusal;
      names(pending, 'implement is pending', 'cancelled at', `nemia rm ${ids.running}`);
      board().settle(`${ids.running}-implement`, 'stopped');
      assert.equal((await stage.runWith(e(), forgetRun(ids.running))).kind, 'forgotten', 'once it has settled, not before');
      for (const id of [ids.ready, ids.asked, ids.child]) await stage.runWith(e(), cancelRun(id));
      for (const id of [ids.ready, ids.asked, ids.parent])
        assert.equal(
          (await stage.runWith(e(), forgetRun(id))).kind,
          'forgotten',
          `${id}: a cancelled run files nothing, a child called off strands nothing`,
        );
      assert.ok(!under('runs', `${ids.asked}.asks`) && !under('runs', `${ids.asked}.cancelled`), 'its ask and its cancellation go with it');
    },
  );

  await s.test(
    'REFUSED: a check, or a step, a pass filed and died before writing down is in flight too — on a cancelled run it holds `nemia rm` until it settles; a tick stops the step and files nothing',
    async () => {
      const run = await stage.runPlaced(
        startRun({ brief: 'a check nobody wrote down', repo: aRepo(), workflowDir: folder('check: npm test') }),
      );
      await pass(run.id);
      board().settle(`${run.id}-implement`, 'succeeded', SIGNED);
      await Effect.runPromise(e().file({ id: `${run.id}-implement-check`, brief: 'npm test', cwd: '/', harness: 'check' }));
      markCancelled(run.id);
      assert.equal(readRun(run.id).steps.implement.check, undefined, 'the check is filed, and the record never says so');
      names((await stage.runWith(e(), forgetRun(run.id))).refusal, "implement's check is pending", 'cancelled at', `nemia ls ${run.id}`);
      assert.ok(under('runs', `${run.id}.json`) && under('worktrees', run.id, LINE_NAME));
      board().settle(`${run.id}-implement-check`, 'stopped');
      assert.equal((await stage.runWith(e(), forgetRun(run.id))).kind, 'forgotten');

      const step = await stage.runPlaced(startRun({ brief: 'filed and never written down', repo: aRepo(), workflowDir: folder() }));
      const taskId = `${step.id}-implement`;
      await Effect.runPromise(e().file({ id: taskId, brief: 'implement it', cwd: '/' }));
      markCancelled(step.id);
      assert.equal(readRun(step.id).steps.implement.taskId, null, 'the pass that filed it died there: the record never names it');
      names((await stage.runWith(e(), forgetRun(step.id))).refusal, 'implement is pending', 'cancelled at', `nemia rm ${step.id}`);
      const stoppedBefore = board().stopped.length;
      const filings = board().filings.length;
      assert.deepEqual((await pass(step.id)).filed, [], 'nothing filed');
      assert.deepEqual([board().stopped.slice(stoppedBefore), board().filings.length], [[taskId], filings], 'and the step stopped');
      board().settle(taskId, 'stopped');
      assert.equal((await stage.runWith(e(), forgetRun(step.id))).kind, 'forgotten');
    },
  );

  await s.test(
    "REFUSED: a place whose inventory is not heard refuses `nemia rm` as not read — its worktree with the step's work, its branch, its record and cancellation stay, and no task is written down to forget",
    async () => {
      const at = aRepo();
      const p = await aParent(at, { work: 'kept.txt' });
      fs.writeFileSync(path.join(p.wt, 'uncommitted.txt'), 'work\n');
      markCancelled(p.run.id);
      const deaf = PlaceService.layer(placeOver(stage.place().place, { inventory: () => unreadBy('inventory', 'the inventory broke') }));
      const forgot = await stage.runWith(e(), forgetRun(p.run.id).pipe(Effect.provide(deaf)));
      assert.equal(forgot.kind, 'refused');
      names(forgot.refusal, at, 'the inventory broke', `nemia rm ${p.run.id} again`);
      assert.ok(fs.existsSync(path.join(p.wt, 'uncommitted.txt')) && worktreesOf(at).includes(p.wt), 'the worktree and its work stay');
      assert.ok(hasBranch(at, p.branch), 'the branch stays');
      assert.ok(under('runs', `${p.run.id}.json`) && under('runs', `${p.run.id}.cancelled`), 'the record and its cancellation stay');
      assert.ok(!under('forgetting', `${p.run.id}.json`), 'no task written down to forget');
      assert.equal((await stage.runWith(e(), forgetRun(p.run.id))).kind, 'forgotten', 'the place reads it, and the run is forgotten');
    },
  );

  await s.test(
    'REFUSED: a directory in its worktrees its place does not know holds the run — no forget asked, its marker lifted, its record and task kept — until it is gone',
    async () => {
      const p = await aParent(aRepo(), { work: 'done.txt' });
      const stray = path.join(ROOT, 'worktrees', p.run.id, 'stray');
      fs.mkdirSync(stray, { recursive: true });
      fs.writeFileSync(path.join(stray, 'notes.txt'), 'mine');
      const before = board().forgets.length;
      const forgot = await stage.runWith(e(), forgetRun(p.run.id));
      assert.equal(forgot.kind, 'held', forgot.refusal);
      assert.ok(
        forgot.left.some((l) => l.path === stray && 'unknown' in l),
        JSON.stringify(forgot.left),
      );
      assert.deepEqual([forgot.engine, board().forgets.length], [undefined, before], 'no forget asked');
      assert.ok(!fs.existsSync(markerOf(p.run.id)), 'its marker lifted');
      assert.ok(under('runs', `${p.run.id}.json`) && (await listed()).includes(`${p.run.id}-implement`), 'its record and its task kept');
      fs.rmSync(stray, { recursive: true });
      assert.equal((await stage.runWith(e(), forgetRun(p.run.id))).kind, 'forgotten');
    },
  );

  await s.test(
    "REFUSED: a name that is a live run's id with one of its files' suffix — exit 2, told the id to give — and its record, cancellation and ask stay",
    async () => {
      const live = await aParent(aRepo());
      const id = live.run.id;
      markCancelled(id);
      const asks = path.join(ROOT, 'runs', `${id}.asks`);
      fs.mkdirSync(asks, { recursive: true });
      fs.writeFileSync(
        path.join(asks, 'retry-implement-2'),
        JSON.stringify({ step: 'implement', try: 2, mode: 'continue', at: '2026-09-16T00:00:00.000Z' }),
      );
      for (const suffix of ['.json', '.cancelled', '.asks']) {
        const { printed, error } = await typed(t, 'rm', `${id}${suffix}`);
        assert.equal(error?.exitCode, 2, suffix);
        assert.equal(printed.length, 1);
        names(printed[0], `${id}${suffix}  not forgotten`, suffix, `nemia rm ${id}.`);
      }
      assert.ok(under('runs', `${id}.json`) && under('runs', `${id}.cancelled`) && under('runs', `${id}.asks`, 'retry-implement-2'));
      assert.ok(readRun(id).cancelledAt);
    },
  );

  await s.test(
    'REFUSED: `nemia rm` of an id that is not a name fails with the `Invalid` itself, exit 2, before the store or the engine is read',
    async () => {
      fs.writeFileSync(path.join(ROOT, 'climbed.json'), '{}');
      const untouched = Object.fromEntries(Object.keys(e()).map((verb) => [verb, () => assert.fail(`the engine was asked \`${verb}\``)]));
      const err = await stage.runWith(untouched as unknown as Engine, forgetRun('../climbed')).then(
        () => assert.fail('nemia rm of ../climbed resolved'),
        (x: unknown) => x,
      );
      assert.ok(err instanceof Invalid, `an Invalid, not ${String(err)}`);
      assert.equal(err.exitCode, 2);
      assert.equal(err.message, idRefusal('../climbed'));
      assert.ok(fs.existsSync(path.join(ROOT, 'climbed.json')), 'the record its path climbs to is not read, nor removed');
      fs.rmSync(path.join(ROOT, 'climbed.json'));
    },
  );

  await s.test(
    "`nemia rm`'s refusal is its program's typed failure, a store's refusal among them; anything else is a defect, rejected as it was thrown",
    async () => {
      const recovered = (engine: Engine, id: string) =>
        stage.runPlaced(
          forgetRun(id, {}).pipe(
            Effect.catchTag('Invalid', (r) => Effect.succeed(r.message)),
            Effect.provide(EngineService.layer(engine)),
          ),
        );
      names(String(await recovered(e(), '../x')), '"../x"', 'nemia rm add-a-flag-x1y2');
      fs.writeFileSync(path.join(ROOT, 'runs', 'garbled.json'), '{ not json');
      names(String(await recovered(e(), 'garbled')), 'is not JSON');
      assert.ok(under('runs', 'garbled.json'), 'and nothing removed');
      fs.rmSync(path.join(ROOT, 'runs', 'garbled.json'));

      const run = await stage.runPlaced(startRun({ brief: 'its journal will not read', repo: aRepo(), workflowDir: folder() }));
      await pass(run.id);
      const boom = new Error('journal');
      const broken = { ...e(), view: () => Effect.die(boom) };
      const died = await recovered(broken, run.id).then(
        () => assert.fail('a defect recovered as a refusal'),
        (x: unknown) => x,
      );
      assert.equal(died, boom, 'not a failure the program may catch by its tag: the error itself');
      const uncaught = await stage
        .runPlaced(
          forgetRun(run.id, {}).pipe(
            Effect.catch(() => Effect.succeed('caught')),
            Effect.provide(EngineService.layer(broken)),
          ),
        )
        .then(
          () => assert.fail('a defect caught as a failure'),
          (x: unknown) => x,
        );
      assert.equal(uncaught, boom, 'nor any failure at all');
      const face = await stage.runWith(broken, forgetRun(run.id)).then(
        () => assert.fail('nemia rm over a journal that does not read resolved'),
        (x: unknown) => x,
      );
      assert.equal(face, boom);
      assert.ok(under('runs', `${run.id}.json`), 'nothing removed');
      board().settle(`${run.id}-implement`, 'succeeded', SIGNED);
    },
  );
});

test('REFUSED before any run is read: what `nemia rm` does not take, each refused by kind and exit 2, naming its fix, with nothing printed and nothing removed', async (t) => {
  const repo = aRepo();
  const p = await aParent(repo, { work: 'kept.txt' });
  const refused = async (args: string[], ...facts: string[]) => {
    const { printed, error } = await typed(t, 'rm', ...args);
    assert.deepEqual([error?._tag, error?.exitCode], ['Invalid', 2], `${args.join(' ')}: ${error?.message}`);
    names(error?.message, ...facts);
    assert.deepEqual(printed, [], 'refused before any run is read');
    assert.ok(under('runs', `${p.run.id}.json`) && hasBranch(repo, p.branch));
  };
  await t.test('`--force-unmerged` alone, which would delete nothing', () =>
    refused([p.run.id, '--force-unmerged'], '--force-unmerged', '--delete-branches'),
  );
  await t.test('a flag it does not take', () => refused([p.run.id, '--force'], '--force', 'nemia rm <runId>'));
  await t.test('a switch with no run to forget', () => refused(['--delete-branches'], 'nemia rm <runId>', 'nemia ls'));
  for (const id of ['..', '.', 'runs/../..', '', 'R-XYZ', 'r_xyz', 'r.xyz'])
    await t.test(
      `an id that is not a name, ${JSON.stringify(id)}: its line says what an id is, and the store is where it was`,
      async () => {
        const { printed, error } = await typed(t, 'rm', id);
        assert.equal(error?.exitCode, 2, '`..` would be the store itself');
        assert.equal(printed.length, 1);
        names(printed[0], `${id}  not forgotten`, JSON.stringify(id), 'WF_ROOT', 'nemia rm add-a-flag-x1y2');
        assert.ok(under('runs', `${p.run.id}.json`) && under('worktrees', p.run.id, LINE_NAME));
      },
    );
});

test('the engine refuses to forget: a task left unsettled waits with its marker until a pass forgets it, a refusal whole or of one task is said and asked again each pass, and a pass lifts the marker once it clears', async (t) => {
  const s = story(t);
  await s.test(
    "`nemia rm` of a run whose step waits for a word closes its task, which has not settled: it waits with the run's marker; a second `nemia rm` exits 0 and says so",
    async () => {
      const run = await stage.runPlaced(startRun({ brief: 'a word asked', repo: aRepo(), workflowDir: oneStep('harness: claude') }));
      await pass(run.id);
      const task = `${run.id}-implement`;
      board().settle(task, 'input-required', BLOCKED);
      await pass(run.id);
      const forgot = await stage.runWith(e(), forgetRun(run.id));
      assert.equal(forgot.kind, 'forgotten', forgot.refusal);
      assert.ok(closed.includes(task), 'its task held open is closed');
      assert.deepEqual([forgot.engine?.forgotten, forgot.engine?.waiting, forgot.engine?.marker], [[], [task], markerOf(run.id)]);
      assert.deepEqual(runStore.forgetting.read(run.id), [task], 'the marker keeps its id');
      const said = await typed(t, 'rm', run.id);
      assert.equal(said.error, undefined, 'a second rm, the record gone, exits 0');
      names(said.printed[0], `${run.id}  no such run`, `${task} has not settled yet`);
      assert.ok(fs.existsSync(markerOf(run.id)), 'it is still not settled: the marker stands');

      board().settle(task, 'succeeded', BLOCKED);
      const done = await tick();
      assert.equal(done.forgetting?.length, 1, JSON.stringify(done.forgetting));
      names(done.forgetting?.[0]?.text, `${run.id} (removed)`, 'the engine forgot 1 task');
      assert.equal(done.forgetting?.[0]?.warn, undefined);
      assert.ok(!(await listed()).includes(task) && !fs.existsSync(markerOf(run.id)), 'forgotten on the engine, and the marker lifted');
      assert.equal((await tick()).forgetting, undefined, 'a pass with no marker says nothing of it');
    },
  );

  await s.test('a marker whose task settles is finished by `nemia rm` again, the record gone, as by a pass', async () => {
    const run = await stage.runPlaced(startRun({ brief: 'a word asked', repo: aRepo(), workflowDir: oneStep('harness: claude') }));
    await pass(run.id);
    const task = `${run.id}-implement`;
    board().settle(task, 'input-required', BLOCKED);
    assert.deepEqual((await stage.runWith(e(), forgetRun(run.id))).engine?.waiting, [task]);
    board().settle(task, 'succeeded', BLOCKED);
    const again = await stage.runWith(e(), forgetRun(run.id));
    assert.deepEqual([again.kind, again.engine?.forgotten, again.engine?.waiting], ['missing', [task], []]);
    assert.ok(!(await listed()).includes(task) && !fs.existsSync(markerOf(run.id)));
  });

  await s.test(
    "a marker beside the run's record is a `nemia rm` not finished: a pass forgets nothing of it; one that does not read is said each pass, with how a person removes it",
    async () => {
      const p = await aParent(aRepo(), { work: 'done.txt' });
      runStore.forgetting.write(p.run.id, runTasks(readRun(p.run.id)));
      const before = board().forgets.length;
      assert.equal((await tick()).forgetting, undefined);
      assert.equal(board().forgets.length, before, 'the engine is not asked');
      assert.ok((await listed()).includes(`${p.run.id}-implement`));
      runStore.forgetting.lift(p.run.id);

      fs.writeFileSync(markerOf('garbled-a1b2'), '{ not json');
      const done = await tick();
      assert.equal(done.forgetting?.length, 1);
      assert.equal(done.forgetting?.[0]?.warn, true);
      names(done.forgetting?.[0]?.text, markerOf('garbled-a1b2'), 'garbled-a1b2', `rm ${markerOf('garbled-a1b2')}`);
      fs.rmSync(markerOf('garbled-a1b2'));
      await stage.runWith(e(), forgetRun(p.run.id));
    },
  );

  await s.test(
    'an engine that refuses to forget whole: `nemia rm` removes the run, exits 0 and says so, the marker kept; each pass asks again and warns; once it forgets, a pass lifts it',
    async () => {
      const p = await aParent(aRepo(), { work: 'done.txt' });
      const task = `${p.run.id}-implement`;
      const marker = markerOf(p.run.id);
      refusing.whole = 'forget: the store is read-only.';
      try {
        const said = await typed(t, 'rm', p.run.id);
        assert.equal(said.error, undefined, 'exit 0: the run is removed');
        names(said.printed[0], `${p.run.id}  `, 'forget: the store is read-only.', marker, `rm ${marker}`);
        assert.ok(said.printed[0].endsWith(`rm ${marker}`), said.printed[0]);
        assert.ok(!under('runs', `${p.run.id}.json`), 'the record is gone');
        assert.deepEqual(runStore.forgetting.read(p.run.id), [task], 'the marker keeps its id');
        const before = board().forgets.length;
        const done = await tick();
        assert.equal(board().forgets.length, before + 1, 'a pass asks again');
        assert.deepEqual([done.forgetting?.length, done.forgetting?.[0].warn], [1, true]);
        names(done.forgetting?.[0]?.text, `${p.run.id} (removed)`, 'forget: the store is read-only.', `rm ${marker}`);
        assert.ok(fs.existsSync(marker), 'the marker stands');
      } finally {
        delete refusing.whole;
      }
      await tick();
      assert.ok(!fs.existsSync(marker) && !(await listed()).includes(task), 'once the engine forgets, a pass lifts it');
    },
  );

  await s.test(
    'a settled task the engine refuses by name is said refused, not waiting, the rest forgotten in a second call; each pass warns and asks again, and lifts the marker once it clears',
    async () => {
      const run = await stage.runPlaced(
        startRun({ brief: 'tried twice', repo: aRepo(), workflowDir: oneStep('harness: codex\ncheck: "true"') }),
      );
      await pass(run.id);
      board().settle(`${run.id}-implement`, 'succeeded', BLOCKED);
      await pass(run.id);
      await stage.runWith(e(), retryRun(run.id, 'implement', { mode: 'continue', message: 'the --dry-run flag' }));
      await pass(run.id);
      board().settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
      await pass(run.id);
      board().settle(`${run.id}-implement-try2-check`, 'succeeded', undefined, 0);
      assert.equal((await pass(run.id)).status, 'succeeded');
      const tasks = runTasks(readRun(run.id));
      const [refused, ...rest] = tasks;
      const marker = markerOf(run.id);
      const message = `task ${refused}'s harness, \`codex\`, still holds session s-1; the next pass lets a finished session go.`;
      refusing.task = { taskId: refused, message };
      try {
        const before = board().forgets.length;
        const said = await typed(t, 'rm', run.id);
        assert.equal(said.error, undefined, 'exit 0: the run is removed');
        assert.deepEqual(
          board().forgets.slice(before),
          [
            { taskIds: tasks, yes: true },
            { taskIds: rest, yes: true },
          ],
          'all of them, then the rest',
        );
        names(said.printed[0], 'the engine forgot 2 tasks', 'refused to forget 1 task', message, `rm ${marker}`);
        assert.ok(!said.printed[0].includes('waits'), said.printed[0]);
        const left = await listed();
        assert.deepEqual([left.includes(refused), rest.filter((id) => left.includes(id))], [true, []], 'the rest forgotten');
        assert.deepEqual(runStore.forgetting.read(run.id), tasks, 'the marker keeps their ids');
        const done = await tick();
        assert.deepEqual([done.forgetting?.length, done.forgetting?.[0].warn], [1, true], JSON.stringify(done.forgetting));
        names(done.forgetting?.[0]?.text, `${run.id} (removed)`, message, `rm ${marker}`);
        assert.ok(fs.existsSync(marker), 'the marker stands');
      } finally {
        delete refusing.task;
      }
      const cleared = await tick();
      names(cleared.forgetting?.[0]?.text, `${run.id} (removed)`, 'the engine forgot 1 task');
      assert.equal(cleared.forgetting![0].warn, undefined);
      assert.ok(!(await listed()).includes(refused) && !fs.existsSync(marker), 'once the refusal clears, a pass lifts it');
    },
  );

  await s.test(
    '`nemia prune` of N runs asks the engine once, dry, over all their tasks, says what rm would forget of each, and forgets nothing — a step a pass filed and never wrote down among them',
    async () => {
      const runs = [(await aParent(aRepo(), { work: 'a.txt' })).run, (await aParent(aRepo(), { work: 'b.txt' })).run];
      for (const r of runs) await pass(r.id);
      const tasks = runs.map((r) => `${r.id}-implement`);
      const before = board().forgets.length;
      const { counted } = await stage.runWith(e(), runsForgetting(runs.map((r) => r.id)));
      assert.deepEqual(board().forgets.slice(before), [{ taskIds: tasks, yes: false }], 'one dry call, over the union');
      for (const [i, r] of runs.entries()) assert.deepEqual(counted.get(r.id)?.forgotten, [tasks[i]], 'each run its own share');
      const dry = await typed(t, 'prune', ...runs.map((r) => r.id), '--unmerged');
      assert.equal(dry.error, undefined);
      assert.equal(board().forgets.length, before + 2, 'the CLI asks once more, for both');
      for (const r of runs)
        assert.ok(
          dry.printed.some((l) => l.startsWith('   the engine keeps 1 task of it') && l.endsWith(`nemia rm ${r.id} forgets them`)),
          dry.printed.join('\n'),
        );
      const left = await listed();
      assert.deepEqual(
        tasks.filter((id) => !left.includes(id)),
        [],
        'the engine keeps them all',
      );

      const unfiled = await stage.runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: oneStep() }));
      const record = path.join(ROOT, 'runs', `${unfiled.id}.json`);
      const written = fs.readFileSync(record, 'utf8');
      assert.deepEqual((await pass(unfiled.id)).filed, ['implement']);
      board().settle(`${unfiled.id}-implement`, 'succeeded', SIGNED);
      await pass(unfiled.id);
      fs.writeFileSync(record, written);
      assert.deepEqual(runTasks(readRun(unfiled.id)), [], 'the record names no task');
      const step = await stage.runWith(e(), runsForgetting([unfiled.id]));
      assert.deepEqual(step.counted.get(unfiled.id)?.forgotten, [`${unfiled.id}-implement`], 'prune counts the step adopted');
      const forgot = await stage.runWith(e(), forgetRun(unfiled.id));
      assert.equal(forgot.kind, 'forgotten', forgot.refusal);
      assert.deepEqual(forgot.engine?.forgotten, step.counted.get(unfiled.id)?.forgotten, 'what rm forgets is what prune counted');
      for (const r of runs) await stage.runWith(e(), forgetRun(r.id));
    },
  );

  await s.test(
    '`nemia prune` says of a run whose record does not read that it was not counted, and why, and counts the other runs',
    async () => {
      const p = await aParent(aRepo(), { work: 'c.txt' });
      const file = path.join(ROOT, 'runs', 'garbled-c3d4.json');
      fs.writeFileSync(file, '{ not json');
      try {
        const { counted, uncounted } = await stage.runWith(e(), runsForgetting(['garbled-c3d4', p.run.id]));
        assert.deepEqual([...counted.keys()], [p.run.id]);
        assert.deepEqual(counted.get(p.run.id)?.forgotten, [`${p.run.id}-implement`]);
        assert.equal(uncounted.length, 1);
        names(uncounted[0].text, 'garbled-c3d4', 'nemia rm', 'not counted');
        assert.ok(uncounted[0].text.length > 'garbled-c3d4: '.length + 60, 'and why');
      } finally {
        fs.rmSync(file);
      }
      await stage.runWith(e(), forgetRun(p.run.id));
      assert.deepEqual(
        listRuns().filter((r) => r.id === p.run.id),
        [],
      );
    },
  );
});
