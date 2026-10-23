/**
 * `nemia prune` on git itself, for what the test place does not model and `prune.test.ts` cannot tell: a worktree's `node_modules`, which
 * git ignores, removed with it, a link in it not followed and a file of main's hardlinked into it not counted nor touched; a worktree on
 * no branch and a locked one, each refused with the command that clears it; and a worktree detached since a prompt's listing, judged
 * again and kept. On `gitPlaceLayer` and the engine's stand-in; a file of its own, since `WF_ROOT` is read once, as the package loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import type { Place } from '../src/place/place.store.ts';
import type { PlaceRequests, PlaceVerb } from '../src/place/place.ts';
import { scratch } from './scratch.ts';
import { names } from './assessed.ts';
import { eachTest, runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-prune-git-');
process.env.WF_ROOT = ROOT;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, prune, startRun, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const { readRun } = await import('../src/record/record.store.ts');
const { freeingMany, judgingMany } = await import('../src/prune/prune.verb.ts');
const { PlaceService } = await import('../src/place/place.store.ts');
const { shippedGitPlace } = await import('../src/place/shipped.store.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const under = (...parts: string[]) => fs.existsSync(path.join(ROOT, ...parts));

/** A repository with one commit, whose `.gitignore` names what a worktree is given: `node_modules`. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n');
  fs.writeFileSync(path.join(repo, 'README.md'), 'readme\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
};

const ONE_STEP = (() => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
})();

/**
 * A run that is over, merged into `main`: its one step filed in a worktree, `work` committed on its branch, signed off and handed off by
 * a pass — with a `node_modules` in the worktree that git ignores, holding a link out of it and a megabyte of main's, hardlinked as the
 * run provisions a package, which removing the worktree does not free.
 */
const aFinished = async (repo = aRepo(), work = 'fix.ts') => {
  const e = engineOf(engine().layer);
  const run = await runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: ONE_STEP }));
  await runWith(e, advanceRun(readRun(run.id)));
  const wt = readRun(run.id).steps.implement.workspace!;
  fs.writeFileSync(path.join(wt, work), 'export const fixed = true;\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', `add ${work}`);
  fs.mkdirSync(path.join(wt, 'node_modules', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(wt, 'node_modules', 'pkg', 'index.js'), 'x'.repeat(64 * 1024));
  const outside = fs.mkdtempSync(path.join(ROOT, 'outside-'));
  fs.writeFileSync(path.join(outside, 'precious.txt'), 'keep me\n');
  fs.symlinkSync(outside, path.join(wt, 'node_modules', 'linked'));
  fs.mkdirSync(path.join(repo, 'node_modules', 'big'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'node_modules', 'big', 'index.js'), 'y'.repeat(1024 * 1024));
  fs.mkdirSync(path.join(wt, 'node_modules', 'big'), { recursive: true });
  if (!fs.existsSync(path.join(wt, 'node_modules', 'big', 'index.js')))
    fs.linkSync(path.join(repo, 'node_modules', 'big', 'index.js'), path.join(wt, 'node_modules', 'big', 'index.js'));
  engine().settle(`${run.id}-implement`, 'succeeded', { closeout: { outcome: 'done', summary: 'did it', artifacts: [], needs: null } });
  await runWith(e, advanceRun(readRun(run.id)));
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', readRun(run.id).steps.implement.branch!);
  return { e, run, repo, wt, outside };
};

/** A worktree put on no branch, holding a commit no branch has: its HEAD. */
const detach = (wt: string) => {
  git(wt, 'checkout', '-q', '--detach');
  fs.writeFileSync(path.join(wt, 'lost.ts'), 'lost\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', 'on no branch');
  return git(wt, 'rev-parse', 'HEAD');
};

test("a shipped run's worktree is removed through git with what git ignores, counted without a file main still holds, and nothing a link or a hardlink leads to is touched", async () => {
  const { e, run, repo, wt, outside } = await aFinished();
  const measured = (await runWith(e, prune(run.id))).worktrees[0].bytes;
  assert.ok(measured >= 64 * 1024, `what node_modules holds is counted (${measured})`);
  assert.ok(measured < 1024 * 1024, `and not a file main still holds, which removing the worktree does not free (${measured})`);
  assert.equal((await runWith(e, prune(run.id, { yes: true }))).kind, 'pruned');
  assert.ok(!fs.existsSync(wt), 'the worktree is gone, its node_modules with it');
  const listed = git(repo, 'worktree', 'list', '--porcelain');
  const trees = listed.split('\n').flatMap((l) => (l.startsWith('worktree ') ? [fs.realpathSync(l.slice('worktree '.length))] : []));
  assert.deepEqual(trees, [fs.realpathSync(repo)], 'git lists it no more: the repository alone');
  assert.equal(fs.readFileSync(path.join(outside, 'precious.txt'), 'utf8'), 'keep me\n', 'a link in node_modules is not followed');
  assert.equal(
    fs.statSync(path.join(repo, 'node_modules', 'big', 'index.js')).size,
    1024 * 1024,
    "nor is main's file, hardlinked, touched",
  );
});

test('REFUSED at shipped defaults: a worktree on no branch, holding a commit no branch has, and a locked one — each named, with the command that clears it', async () => {
  const detached = await aFinished();
  const head = detach(detached.wt);
  const d = await runWith(detached.e, prune(detached.run.id, { yes: true, unmerged: true }));
  assert.equal(d.kind, 'refused');
  names(d.refusal, detached.wt, head.slice(0, 7), `git -C ${detached.wt} switch -c <branch>`, `nemia prune ${detached.run.id} --unmerged`);
  assert.ok(fs.existsSync(detached.wt) && !under('runs', `${detached.run.id}.pruned`));

  const locked = await aFinished();
  git(locked.repo, 'worktree', 'lock', '--reason', 'on a stick', locked.wt);
  const l = await runWith(locked.e, prune(locked.run.id, { yes: true, unmerged: true }));
  assert.equal(l.kind, 'refused');
  names(l.refusal, locked.wt, 'on a stick', `git -C ${locked.repo} worktree unlock ${locked.wt}`);
  assert.ok(fs.existsSync(locked.wt) && !under('runs', `${locked.run.id}.pruned`));
});

test('after a prompt each run is judged again before its removal: one whose worktree was detached on a commit no branch has since the listing is refused and kept, and the other is pruned', async () => {
  const repo = aRepo();
  const first = await aFinished(repo, 'fix-0.ts');
  const second = await aFinished(repo, 'fix-1.ts');
  const ids = [first.run.id, second.run.id];
  const asked: Array<{ verb: PlaceVerb; request: PlaceRequests[PlaceVerb] }> = [];
  const counting: Place = {
    declared: shippedGitPlace.declared,
    ask: (verb, request, options) => {
      asked.push({ verb, request });
      return shippedGitPlace.ask(verb, request, options);
    },
    askNow: (verb, request, options) => {
      asked.push({ verb, request });
      return shippedGitPlace.askNow(verb, request, options);
    },
  };
  const place = PlaceService.layer(counting);
  const e = first.e;
  const listed = await runEngine(e, judgingMany(ids).pipe(Effect.provide(place)));
  detach(first.wt);
  const done = await runEngine(e, freeingMany(listed, { yes: false }).pipe(Effect.provide(place)));
  assert.deepEqual(
    done.map((d) => ('failed' in d ? 'failed' : d.pruning.kind)),
    ['refused', 'pruned'],
  );
  names('pruning' in done[0] ? done[0].pruning.refusal : undefined, first.wt, 'git -C', 'switch -c <branch>');
  assert.ok(fs.existsSync(first.wt) && !under('runs', `${ids[0]}.pruned`), 'the detached worktree stands, and its run is not marked');
  assert.ok(!fs.existsSync(second.wt));
  const inventoried = asked.flatMap((a) =>
    a.verb === 'inventory' ? [path.basename((a.request as PlaceRequests['inventory']).under)] : [],
  );
  assert.deepEqual(inventoried.sort(), [...ids, ...ids].sort(), 'each run judged for the listing, and again for its removal');
  const removes = asked.flatMap((a) => (a.verb === 'remove' ? [a.request as PlaceRequests['remove']] : []));
  assert.deepEqual(
    removes.map((r) => r.workspaces),
    [[second.wt]],
    'the run refused is in no remove',
  );
});
