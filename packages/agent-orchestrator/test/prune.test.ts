/**
 * `nemia prune`: a run's worktrees removed, and nothing else of it — over a store and repositories of its own, with git for real. A file of
 * its own, since `WF_ROOT` is read once, as the package loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from '../src/runtime-client.ts';
import type { TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { decideScreen } from './screens.ts';
import { promised } from './promised.ts';
import { Effect } from 'effect';
import { runGiven, runOver } from './placed.ts';
import { placeHeld, placeOver, unreadBy } from './place-over.ts';
import { until, WAITED } from 'agent-runtime/testing';
import type { Place } from '../src/place/place.store.ts';
import type { PlaceRequests, PlaceVerb } from '../src/place/place.ts';
import type { Turned } from '../src/runner.ts';

const ROOT = scratch('wf-prune-');
process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const {
  acceptRun,
  advanceRun,
  approveRun,
  decideRun,
  forgetRun,
  idRefusal,
  prune,
  pruneLines,
  retryRun,
  roundRun,
  sizeOf,
  startRun,
  runWith: runEngine,
  gitPlaceLayer,
} = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { listRuns, readRun } = await import('../src/record/record.store.ts');
const { runStore } = await import('../src/record/files.store.ts');
const { freeing, freeingMany, judging, judgingMany, PRUNE_A_TURN, sized } = await import('../src/prune/prune.verb.ts');
const { PlaceService } = await import('../src/place/place.store.ts');
const { shippedGitPlace } = await import('../src/place/shipped.store.ts');
const { main } = await import('../src/cli/main.ts');

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

/** A workflow of one step, `implement`, whose closeout names a file it leaves in its workspace — with a `budget:`, when given one. */
const oneStep = (budget?: number) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(
    path.join(dir, 'implement.md'),
    `---\nplace: git\n${budget === undefined ? '' : `budget: ${budget}\n`}---\nimplement it\n`,
  );
  return dir;
};

/**
 * Just enough engine: each task's phase, and its closeout on its one attempt once it has one, with what that attempt cost when it says;
 * and a `forget` that counts, each call on `forgets`, and removes nothing.
 */
const board = () => {
  const tasks = new Map<string, { phase: TaskPhase; closeout?: unknown; usage?: object }>();
  const filings: string[] = [];
  const forgets: { taskIds: string[]; yes: boolean }[] = [];
  const e = promised({
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        state: {
          brief: t ? 'filed' : '',
          settled,
          stopRequested: false,
          said: [],
          attempts:
            !t || t.phase === 'pending'
              ? []
              : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: null, usage: t.usage ?? null }],
        },
      };
    },
    file: async (spec: { id: string }) => {
      filings.push(spec.id);
      tasks.set(spec.id, { phase: 'pending' });
      return spec.id;
    },
    stop: async () => {},
    forget: async (ids: string[], options?: { yes?: boolean }) => {
      forgets.push({ taskIds: [...ids], yes: options?.yes === true });
      return { forgotten: false, tasks: ids.map((taskId) => ({ taskId, journalBytes: 1024, feedLines: 2, sessions: [] })) };
    },
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, usage?: object) => tasks.set(id, { phase, closeout, usage });
  return { e, filings, forgets, settle };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/**
 * A run that is over: started for real, its one step filed in a worktree of its own, `work` committed on its branch, signed off, and handed
 * off by a pass, which leaves nothing uncommitted — with a `node_modules` in the worktree that git ignores, holding a link out of it and a
 * megabyte of main's, hardlinked as the run provisions a package, which removing the worktree does not free. Merged into `main` with
 * `merged`; in the repository `repo`, when given one, else in one of its own.
 */
const aFinished = async (
  b: ReturnType<typeof board>,
  {
    merged = false,
    work = 'fix.ts',
    budget,
    costUsd,
    closeout = SIGNED,
    repo = aRepo(),
  }: {
    merged?: boolean;
    work?: string;
    budget?: number;
    costUsd?: number;
    closeout?: object | ((id: string) => object);
    repo?: string;
  } = {},
) => {
  const run = await runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: oneStep(budget) }));
  await runWith(b.e, advanceRun(readRun(run.id)));
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
  const said = typeof closeout === 'function' ? closeout(run.id) : closeout;
  for (const named of (said as { artifacts?: string[] }).artifacts ?? []) if (path.isAbsolute(named)) aShot(run.id, path.basename(named));
  b.settle(`${run.id}-implement`, 'succeeded', said, costUsd === undefined ? undefined : { costUsd });
  await runWith(b.e, advanceRun(readRun(run.id)));
  const branch = `wf/${run.id}/implement`;
  if (merged) git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', branch);
  return { run, repo, wt, branch, outside };
};

/** `nemia <verb>`, through the CLI, as a person types it: the lines it printed, and the error it ended with, if it did. */
const typed = async (t: TestContext, e: Engine, ...argv: string[]) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => {
    printed.push(a.join(' '));
  });
  try {
    await main(argv, e);
    return { printed, error: undefined };
  } catch (err) {
    return { printed, error: err as Error & { exitCode?: number } };
  } finally {
    log.mock.restore();
  }
};

const worktreesOf = (repo: string) =>
  git(repo, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => fs.realpathSync(l.slice('worktree '.length)));

test('`nemia prune` on a run that shipped: listed with its size and nothing removed, until --yes — then its worktree is removed through git, what git ignores with it and nothing a link leads to; its record, closeout, branch, files and asks are kept; `nemia ls` and `nemia decide` say it is pruned, and a second prune has nothing to do', async (t) => {
  const b = board();
  const { run, repo, wt, branch, outside } = await aFinished(b, { merged: true });
  fs.mkdirSync(path.join(ROOT, 'runs', run.id, 'artifacts', 'implement'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'runs', run.id, 'artifacts', 'implement', 'report.md'), 'report\n');
  fs.mkdirSync(path.join(ROOT, 'runs', `${run.id}.asks`, 'done'), { recursive: true });

  const dry = await typed(t, b.e, 'prune', run.id);
  assert.equal(
    dry.error,
    undefined,
    'a dry run, as the CLI says it with nobody at a terminal: the worktree and its size, and how to remove it',
  );
  assert.match(dry.printed[0], new RegExp(`^${run.id}  would remove 1 worktree, \\d+\\.\\d KB$`));
  assert.match(dry.printed[1], new RegExp(`^   ${wt.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}  \\d+\\.\\d KB$`));
  assert.equal(
    dry.printed[2],
    `   the engine keeps 1 task of it (1.0 KB of journal, 2 feed lines): nemia rm ${run.id} forgets them`,
    'and what nemia rm would forget of the engine, counted without removing it',
  );
  assert.match(dry.printed[3], /^1 run to prune, \d+\.\d KB in all$/);
  assert.equal(dry.printed[4], `nothing removed: nemia prune ${run.id} --yes removes them`);
  assert.ok(b.forgets.length && b.forgets.every((f) => !f.yes), 'the engine is asked dry: nemia prune forgets nothing of it');
  assert.ok(fs.existsSync(wt) && !under('runs', `${run.id}.pruned`), 'a dry run touches nothing');
  const measured = (await runWith(b.e, prune(run.id))).worktrees[0].bytes;
  assert.ok(measured >= 64 * 1024, `what node_modules holds is counted (${measured})`);
  assert.ok(measured < 1024 * 1024, `and not a file main still holds, which removing the worktree does not free (${measured})`);

  const done = await typed(t, b.e, 'prune', run.id, '--yes');
  assert.equal(done.error, undefined);
  assert.match(
    done.printed.at(-2)!,
    new RegExp(`^${run.id}  pruned: removed 1 worktree, \\d+\\.\\d KB freed; its record, branches and files are kept$`),
  );
  assert.ok(!fs.existsSync(wt) && !under('worktrees', run.id), "the worktree, and the run's directory of them, are gone");
  assert.ok(!worktreesOf(repo).includes(fs.realpathSync(ROOT) + wt.slice(ROOT.length)), 'git lists it no more');
  assert.equal(fs.readFileSync(path.join(outside, 'precious.txt'), 'utf8'), 'keep me\n', 'a link in node_modules is not followed');
  assert.equal(
    fs.statSync(path.join(repo, 'node_modules', 'big', 'index.js')).size,
    1024 * 1024,
    "nor is main's file, hardlinked, touched",
  );
  assert.ok(git(repo, 'branch', '--list', branch), 'the branch is kept');
  assert.ok(
    under('runs', `${run.id}.json`) &&
      under('runs', run.id, 'artifacts', 'implement', 'report.md') &&
      under('runs', `${run.id}.asks`, 'done'),
  );
  const pruned = readRun(run.id).pruned!;
  assert.equal(pruned.worktrees.length, 1);
  assert.equal(pruned.worktrees[0].path, wt);
  assert.ok(
    !('pruned' in JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8'))),
    'the record itself never holds it',
  );

  const ls = await typed(t, b.e, 'ls', run.id);
  assert.match(ls.printed[0], new RegExp(`^${run.id}  add a flag  \\(pruned\\)`), 'still on the board, as it was, with the word beside it');
  const d = await runWith(b.e, decideRun(run.id));
  assert.equal(d.decision.kind, 'shipped');
  assert.equal((d.closeouts.implement as { summary?: string }).summary, 'did it', "its closeout is the engine's, and still read");
  const screen = await typed(t, b.e, 'decide', run.id);
  assert.equal(
    screen.printed.join('\n').split('\n')[1],
    `  pruned at ${pruned.at} — its worktrees were removed (nemia prune); its branches, record and files are kept`,
  );

  const filings = [...b.filings];
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(b.filings, filings, 'a tick after it files nothing');

  const again = await runWith(b.e, prune(run.id, { yes: true }));
  assert.deepEqual([again.kind, again.nothing], ['nothing', `its worktrees were removed at ${pruned.at} (nemia prune)`]);
  assert.equal(readRun(run.id).pruned!.at, pruned.at, 'a prune with nothing to do leaves the marker as it was');

  assert.equal((await runWith(b.e, forgetRun(run.id))).kind, 'forgotten', '`nemia rm` still forgets it');
  assert.ok(!under('runs', `${run.id}.pruned`), 'and the marker goes with it');
});

test('REFUSED at shipped defaults: a run not over — named, and told to cancel first; nothing removed, exit 2', async (t) => {
  const b = board();
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'still running', repo, workflowDir: oneStep() }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const wt = readRun(run.id).steps.implement.workspace!;
  const { printed, error } = await typed(t, b.e, 'prune', run.id, '--yes', '--unmerged');
  assert.equal(error?.exitCode, 2);
  assert.equal(
    printed[0],
    `${run.id}  not pruned: it is not over — nemia decide ${run.id} says it is still running. Pruning is not cancelling: nemia cancel ${run.id} files nothing more, then nemia prune ${run.id} --unmerged once what was in flight has settled.`,
  );
  assert.ok(fs.existsSync(wt) && !under('runs', `${run.id}.pruned`));
});

test('REFUSED at shipped defaults: a finished run not merged — pruned, it could not be tried again — unless --unmerged; with it, pruned, and the branch with its work kept', async () => {
  const b = board();
  const { run, repo, wt, branch } = await aFinished(b);
  const refused = await runWith(b.e, prune(run.id, { yes: true }));
  assert.equal(refused.kind, 'refused');
  assert.equal(
    refused.refusal,
    `it finished and is not merged into main: pruned, none of its steps can be tried again, sent round or approved, and its branch is the one place its work is left. Merge it first, or prune it all the same: nemia prune ${run.id} --unmerged.`,
  );
  assert.ok(fs.existsSync(wt) && !under('runs', `${run.id}.pruned`));

  const done = await runWith(b.e, prune(run.id, { yes: true, unmerged: true }));
  assert.deepEqual([done.kind, done.left], ['pruned', []]);
  assert.ok(!fs.existsSync(wt));
  assert.equal(git(repo, 'show', '--name-only', '--format=', branch), 'fix.ts', 'the work is on its branch');
});

test('REFUSED at shipped defaults: a worktree with a change no commit has — untracked, or modified — is named with its files, and nothing of the run is removed', async () => {
  for (const change of ['untracked', 'modified'] as const) {
    const b = board();
    const { run, wt } = await aFinished(b, { merged: true });
    if (change === 'untracked') fs.writeFileSync(path.join(wt, 'notes.md'), 'notes\n');
    else fs.appendFileSync(path.join(wt, 'README.md'), 'more\n');
    const refused = await runWith(b.e, prune(run.id, { yes: true }));
    assert.equal(refused.kind, 'refused', change);
    assert.equal(
      refused.refusal,
      `${wt} holds changes no commit has (${change === 'untracked' ? 'notes.md' : 'README.md'}), and they would be lost with it: commit them on its branch, or discard them (git -C ${wt} status), then nemia prune ${run.id}.`,
    );
    assert.ok(fs.existsSync(wt) && !under('runs', `${run.id}.pruned`), change);
  }
});

test('REFUSED at shipped defaults: a worktree on no branch, holding a commit no branch has, and a locked one — each named, with the command that clears it', async () => {
  const b = board();
  const detached = await aFinished(b, { merged: true });
  git(detached.wt, 'checkout', '-q', '--detach');
  fs.writeFileSync(path.join(detached.wt, 'lost.ts'), 'lost\n');
  git(detached.wt, 'add', '-A');
  git(detached.wt, 'commit', '-q', '-m', 'on no branch');
  const head = git(detached.wt, 'rev-parse', 'HEAD');
  const d = await runWith(b.e, prune(detached.run.id, { yes: true, unmerged: true }));
  assert.equal(
    d.refusal,
    `${detached.wt} is on no branch — its HEAD is detached at ${head.slice(0, 7)} — and removing it would leave what it holds on none: put it on one (git -C ${detached.wt} switch -c <branch>), then nemia prune ${detached.run.id} --unmerged.`,
  );
  assert.ok(fs.existsSync(detached.wt));

  const locked = await aFinished(b, { merged: true });
  git(locked.repo, 'worktree', 'lock', '--reason', 'on a stick', locked.wt);
  const l = await runWith(b.e, prune(locked.run.id, { yes: true, unmerged: true }));
  assert.equal(
    l.refusal,
    `${locked.wt} is locked (on a stick), and git will not remove it — unlock it if nothing needs it: git -C ${locked.repo} worktree unlock ${locked.wt}.`,
  );
  assert.ok(fs.existsSync(locked.wt) && !under('runs', `${locked.run.id}.pruned`));
});

/** The package's place whose `inventory` is not heard, in `said`, as a place that cannot read its repository answers. */
const placeUnread = (said: string) => PlaceService.layer(placeOver(shippedGitPlace, { inventory: () => unreadBy('inventory', said) }));

test('REFUSED at shipped defaults: a place whose inventory is not heard refuses `nemia prune` as not read, never as nothing left to prune — its worktree stays and the run is not marked pruned', async () => {
  const b = board();
  const { run, repo, wt } = await aFinished(b, { merged: true });
  const planted = placeUnread('the inventory broke');
  const refused = await runWith(b.e, prune(run.id, { yes: true }).pipe(Effect.provide(planted)));
  assert.equal(refused.kind, 'refused');
  assert.equal(
    refused.refusal,
    `its place's inventory of what it left in ${repo} was not heard — the inventory broke; nothing was touched, as nothing says what is there: nemia prune ${run.id} again once the place reads it`,
  );
  assert.ok(fs.existsSync(wt) && worktreesOf(repo).includes(fs.realpathSync(wt)) && !under('runs', `${run.id}.pruned`));
  assert.equal((await runWith(b.e, prune(run.id, { yes: true }))).kind, 'pruned', 'the shipped place reads it');
});

test('REFUSED at shipped defaults: a hand-off still owed — a step settled and no pass since — until a tick has handed it off', async () => {
  const b = board();
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'owed', repo, workflowDir: oneStep() }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const wt = readRun(run.id).steps.implement.workspace!;
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  const refused = await runWith(b.e, prune(run.id, { yes: true, unmerged: true }));
  assert.equal(
    refused.refusal,
    `implement is still to be handed off — a pass commits what it left, and collects its files, from the worktree: let a tick run (nemia tick), then nemia prune ${run.id} --unmerged.`,
  );
  assert.ok(fs.existsSync(wt));
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.equal((await runWith(b.e, prune(run.id, { yes: true, unmerged: true }))).kind, 'pruned');
});

test('REFUSED at shipped defaults: a folder run — its folders are its work, kept until `nemia rm`', async () => {
  const b = board();
  const team = fs.mkdtempSync(path.join(ROOT, 'team-'));
  fs.writeFileSync(path.join(team, 'write.md'), '---\nworkspace: folder\npermissionMode: dontAsk\n---\nwrite the note\n');
  const run = await runPlaced(startRun({ brief: 'a note', repo: fs.mkdtempSync(path.join(ROOT, 'not-a-repo-')), workflowDir: team }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-write`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  const refused = await runWith(b.e, prune(run.id, { yes: true, unmerged: true }));
  assert.deepEqual(
    [refused.kind, refused.refusal],
    [
      'refused',
      `a folder run: its steps' folders are its work, kept with the run until it is forgotten — no worktree to prune. nemia rm ${run.id} forgets it with them.`,
    ],
  );
  assert.ok(!under('runs', `${run.id}.pruned`));
});

test('REFUSED at shipped defaults: whatever holds `nemia rm` — a step waiting at its gate, named with the approval that answers it, and an ask no pass has spent, named with the file that takes it back', async (t) => {
  const b = board();
  const gated = fs.mkdtempSync(path.join(ROOT, 'gated-'));
  fs.writeFileSync(path.join(gated, 'implement.md'), '---\nplace: git\ngate: true\n---\nimplement it\n');
  fs.writeFileSync(path.join(gated, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  const run = await runPlaced(startRun({ brief: 'at its gate', repo: aRepo(), workflowDir: gated }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const wt = readRun(run.id).steps.implement.workspace!;
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.equal((await runWith(b.e, decideRun(run.id))).decision.kind, 'awaiting', 'over, as `decide` reads it: not refused as running');
  const gateWords = (flags: string) =>
    `implement waits at its gate for your approval, and what waits on it is filed once it is approved: nemia approve ${run.id} implement. Pruning is not cancelling: nemia cancel ${run.id} files nothing more, then nemia prune ${run.id}${flags}.`;
  const atGate = await runWith(b.e, prune(run.id, { yes: true, unmerged: true }));
  assert.equal(
    atGate.kind,
    'refused',
    'a gated step that signed off: the run is not running, and not merged, so --unmerged is given, and the gate alone holds it',
  );
  assert.equal(
    atGate.refusal,
    gateWords(' --unmerged'),
    'the prune it names is the one given, --unmerged kept: this run is not merged, and without it the next prune is refused in turn',
  );
  const bare = await runWith(b.e, prune(run.id, { yes: true }));
  assert.equal(bare.refusal, gateWords(''), 'without --unmerged, the gate alone is said');
  assert.doesNotMatch(
    bare.refusal,
    /--unmerged/,
    '--unmerged gets past no gate, so offering it would name a command that is refused in turn',
  );
  assert.ok(fs.existsSync(wt) && !under('runs', `${run.id}.pruned`));

  const shipped = await aFinished(b, { merged: true });
  const asks = path.join(ROOT, 'runs', `${shipped.run.id}.asks`);
  fs.mkdirSync(asks, { recursive: true });
  fs.writeFileSync(path.join(asks, 'retry-implement-2'), JSON.stringify({ mode: 'nudge' }));
  assert.equal((await runWith(b.e, decideRun(shipped.run.id))).decision.kind, 'shipped');
  const asked = await runWith(b.e, prune(shipped.run.id, { yes: true }));
  assert.equal(
    asked.kind,
    'refused',
    'a retry asked of a step that shipped, which no pass files: the run is over and merged, and the ask alone holds it',
  );
  assert.equal(
    asked.refusal,
    `try 2 of implement is asked for, and no pass files it as the run stands. Take that ask back, then nemia prune ${shipped.run.id}: rm ${path.join(asks, 'retry-implement-2')}.`,
  );
  assert.ok(fs.existsSync(shipped.wt) && !under('runs', `${shipped.run.id}.pruned`));
  fs.rmSync(path.join(asks, 'retry-implement-2'));
  assert.equal((await runWith(b.e, prune(shipped.run.id, { yes: true }))).kind, 'pruned', 'until the ask is taken back');

  assert.equal((await typed(t, b.e, 'cancel', run.id)).error, undefined);
  assert.equal(
    (await runWith(b.e, prune(run.id, { yes: true }))).kind,
    'pruned',
    'called off at its gate, the run that is not merged prunes with no word more, since a cancelled run is never tried again; the gate no longer holds',
  );
});

test('REFUSED after a prune: a retry, a round, an approval and an acceptance — each would file work into a worktree that is gone — and a pass files nothing on an ask a person wrote by hand', async (t) => {
  const b = board();
  const { run } = await aFinished(b);
  b.settle(`${run.id}-implement`, 'succeeded', { ...SIGNED, outcome: 'blocked', needs: 'a word' });
  assert.equal(
    (await runWith(b.e, decideRun(run.id))).answering.implement !== undefined,
    true,
    'a step that signed off blocked: a person may try it again, and an answer is offered before the run is pruned',
  );
  assert.match((await typed(t, b.e, 'ls', run.id)).printed.join('\n'), /waiting on you: implement/, 'and `nemia ls` says it waits on you');
  assert.equal((await runWith(b.e, prune(run.id, { yes: true, unmerged: true }))).kind, 'pruned');
  const at = readRun(run.id).pruned!.at;
  const said = `${run.id} was pruned at ${at}: its worktrees were removed (nemia prune), and`;

  await assert.rejects(runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge' })), (err: Error) =>
    err.message.startsWith(`${said} a retry would file work into one of them.`),
  );
  await assert.rejects(runWith(b.e, roundRun(run.id, 'implement')), (err: Error) =>
    err.message.startsWith(`${said} a round would file work into one of them.`),
  );
  await assert.rejects(runWith(b.e, approveRun(run.id, 'implement')), (err: Error) =>
    err.message.startsWith(`${said} an approval would file work into one of them.`),
  );
  await assert.rejects(runWith(b.e, acceptRun(run.id, 'implement', 'as it stands')), (err: Error) =>
    err.message.startsWith(`${said} an acceptance would file work into one of them.`),
  );
  const d = await runWith(b.e, decideRun(run.id));
  assert.deepEqual([d.retrying, d.rounding, d.offers, d.answering], [[], [], [], {}], 'and nothing is offered');
  assert.doesNotMatch((await typed(t, b.e, 'ls', run.id)).printed.join('\n'), /waiting on you/, 'and `nemia ls` waits on nobody');

  const asks = path.join(ROOT, 'runs', `${run.id}.asks`);
  fs.mkdirSync(asks, { recursive: true });
  fs.writeFileSync(path.join(asks, 'retry-implement-2'), JSON.stringify({ mode: 'nudge' }));
  const filings = [...b.filings];
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(
    b.filings,
    filings,
    'nothing filed of an ask written by hand: the verbs are one writer of the asks, a person with a text editor another, and the pass is the guard that holds',
  );
  assert.doesNotMatch(
    (await typed(t, b.e, 'ls', run.id)).printed.join('\n'),
    /asked|due|files it/,
    '`nemia ls` says no try is coming of the ask written by hand',
  );
});

test('REFUSED after a prune: a step over its budget is offered no raise — `decide`, `nemia decide` and the api say the run was pruned where they said it waits on you, as `nemia ls` does', async (t) => {
  const b = board();
  const { run } = await aFinished(b, { budget: 3, costUsd: 3.4, closeout: { ...SIGNED, outcome: 'blocked', needs: 'a word' } });
  const before = await runWith(b.e, decideRun(run.id));
  assert.equal(
    before.overBudgetLine,
    'OVER BUDGET, waiting on you: implement ($3.40 of $3)  — the run files nothing more for it on its own; nothing after it ran',
  );
  assert.match(before.offers.join('\n'), new RegExp(`:  nemia retry ${run.id} implement --budget <amount>`), 'its raise is offered before');
  assert.equal(
    before.answering.implement,
    `to answer it, its cap raised above $3.40:  nemia retry ${run.id} implement --budget <amount> --message "<answer>"`,
  );
  assert.match((await typed(t, b.e, 'ls', run.id)).printed.join('\n'), /waiting on you: implement/);
  assert.equal(
    (await runWith(b.e, prune(run.id, { yes: true, unmerged: true }))).kind,
    'pruned',
    'signed off blocked past its budget, finished and not merged: nothing about a budget holds `nemia prune` under --unmerged',
  );
  const at = readRun(run.id).pruned!.at;

  const d = await runWith(b.e, decideRun(run.id));
  assert.equal(d.decision.kind, 'awaiting', 'still a run to decide: its branch holds its work');
  assert.equal(
    d.overBudgetLine,
    `OVER BUDGET: implement ($3.40 of $3)  — nothing more is filed for it, raised or not, since the run was pruned at ${at} — its worktrees were removed (nemia prune); nothing after it ran`,
  );
  assert.deepEqual([d.offers, d.answering, d.gates], [[], {}, {}]);
  await assert.rejects(
    runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge', budget: 5 })),
    /was pruned at/,
    'the raise the line used to point to is refused',
  );

  const screen = (await typed(t, b.e, 'decide', run.id)).printed.join('\n');
  assert.ok(screen.includes(`\n  ${d.overBudgetLine}\n`), screen);
  assert.doesNotMatch(screen, /waiting on you/, screen);
  assert.doesNotMatch(screen, /nemia (retry|round|accept|approve) /, 'no verb a pruned run refuses');
  assert.doesNotMatch((await typed(t, b.e, 'ls', run.id)).printed.join('\n'), /waiting on you/, 'and `nemia ls` agrees');
});

test('`nemia prune` with no run reads every run: one not over is summed up on a line, one with nothing to prune is not said, and the rest are listed with the total', async (t) => {
  const b = board();
  const merged = await aFinished(b, { merged: true });
  const running = await runPlaced(startRun({ brief: 'running', repo: aRepo(), workflowDir: oneStep() }));
  await runWith(b.e, advanceRun(readRun(running.id)));
  const inPlace = await runPlaced(startRun({ brief: 'in place', repo: aRepo(), workflowDir: oneStep(), isolate: false }));
  await runWith(b.e, advanceRun(readRun(inPlace.id)));
  b.settle(`${inPlace.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(inPlace.id)));

  const { printed, error } = await typed(t, b.e, 'prune');
  assert.equal(error, undefined, 'a run refused is not an error when none was named');
  const text = printed.join('\n');
  assert.match(text, new RegExp(`^${merged.run.id}  would remove 1 worktree, `, 'm'));
  assert.match(text, new RegExp(`^\\d+ runs? not over, not pruned: .*${running.id}`, 'm'));
  assert.doesNotMatch(text, new RegExp(`^${inPlace.id} `, 'm'), 'a run that cut no worktree is not a line');
  assert.match(text, /^nothing removed: nemia prune --yes removes them$/m);
  assert.ok(listRuns().some((r) => r.id === merged.run.id) && fs.existsSync(merged.wt));
});

test('REFUSED before anything is read: a flag `nemia prune` does not take, and an id that is not a name', async (t) => {
  const b = board();
  const flag = await typed(t, b.e, 'prune', '--force');
  assert.equal(flag.error?.exitCode, 2);
  assert.match(flag.error.message, /^nemia prune does not take --force\./);
  for (const id of ['../x', 'r-1.pruned']) {
    assert.match(idRefusal(id, 'prune')!, /nemia prune/);
    await assert.rejects(
      runWith(b.e, prune(id)),
      (err: Error & { exitCode?: number }) => err.exitCode === 2 && /nemia prune/.test(err.message),
      id,
    );
  }
});

/** A file in a run's files directory, as a step's check leaves one: its absolute path. */
const aShot = (id: string, name = 'shot.png', bytes = 32 * 1024): string => {
  const at = path.join(ROOT, 'runs', id, 'artifacts', 'implement', name);
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, 'p'.repeat(bytes));
  return at;
};

/** Runs the prune a refusal offers, as a person would type it, with `--yes`: the command is read off the refusal, never written here. */
const followed = async (t: TestContext, e: Engine, refusal: string) => {
  const command = /(nemia prune \S+(?: --[a-z]+)*)\.$/.exec(refusal)?.[1];
  assert.ok(command, `a refusal that offers a prune: ${refusal}`);
  return { command, ...(await typed(t, e, ...command.split(' ').slice(1), '--yes')) };
};
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

test('`nemia prune --artifacts` on a run that shipped: its worktree and its files, listed with their sizes until --yes, then removed — a link among the files as a link — and what freed said; its record, asks, inputs and rendered prompts are kept; `nemia decide` reads it and says the files went; a second prune has nothing to do', async (t) => {
  const b = board();
  const shotOf = (id: string) => path.join(ROOT, 'runs', id, 'artifacts', 'implement', 'shot.png');
  const run0 = await aFinished(b, { merged: true, closeout: (id) => ({ ...SIGNED, artifacts: [shotOf(id)] }) });
  const id = run0.run.id;
  const shot = aShot(id);
  assert.equal(shot, shotOf(id), "the closeout names a shot in the step's files directory, as a step names a screenshot it took");
  const outside = fs.mkdtempSync(path.join(ROOT, 'outside-'));
  fs.writeFileSync(path.join(outside, 'precious.png'), 'keep me\n');
  fs.symlinkSync(outside, path.join(ROOT, 'runs', id, 'artifacts', 'implement', 'linked'));
  for (const kept of ['inputs', 'agents']) {
    fs.mkdirSync(path.join(ROOT, 'runs', id, kept), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'runs', id, kept, 'kept.md'), 'kept\n');
  }
  fs.mkdirSync(path.join(ROOT, 'runs', `${id}.asks`, 'done'), { recursive: true });
  const files = path.join(ROOT, 'runs', id, 'artifacts');

  const dry = await typed(t, b.e, 'prune', id, '--artifacts');
  assert.equal(dry.error, undefined);
  assert.match(dry.printed[0], new RegExp(`^${id}  would remove 1 worktree and its files, \\d+\\.\\d KB$`));
  assert.match(dry.printed[1], new RegExp(`^   ${escaped(run0.wt)}  \\d+\\.\\d KB$`));
  assert.match(dry.printed[2], new RegExp(`^   ${escaped(files)}  \\d+\\.\\d KB$`));
  assert.equal(dry.printed[3], `   the engine keeps 1 task of it (1.0 KB of journal, 2 feed lines): nemia rm ${id} forgets them`);
  assert.equal(dry.printed[5], `nothing removed: nemia prune ${id} --artifacts --yes removes them`);
  assert.ok(fs.existsSync(shot) && !under('runs', `${id}.pruned`), 'a dry run touches nothing');
  const measured = (await runWith(b.e, prune(id, { artifacts: true }))).artifacts!.bytes;
  assert.ok(measured >= 32 * 1024, `what the files hold is counted (${measured})`);

  assert.equal((await runWith(b.e, prune(id))).artifacts, undefined, 'without the flag, the files are not offered: the worktree alone');

  const done = await typed(t, b.e, 'prune', id, '--artifacts', '--yes');
  assert.equal(done.error, undefined);
  assert.match(
    done.printed.join('\n'),
    new RegExp(`^${id}  pruned: removed 1 worktree and its files, \\d+\\.\\d KB freed; its record and branches are kept$`, 'm'),
  );
  assert.ok(!fs.existsSync(files) && !fs.existsSync(run0.wt), 'the files and the worktree are gone');
  assert.equal(fs.readFileSync(path.join(outside, 'precious.png'), 'utf8'), 'keep me\n', 'a link among the files is not followed');
  for (const kept of ['inputs', 'agents']) assert.ok(under('runs', id, kept, 'kept.md'), `${kept} is kept`);
  assert.ok(under('runs', `${id}.json`) && under('runs', `${id}.asks`, 'done'), 'the record and the asks are kept');
  assert.ok(git(run0.repo, 'branch', '--list', run0.branch), 'and the branch');
  const pruned = readRun(id).pruned!;
  assert.equal(pruned.worktrees.length, 1);
  assert.equal(pruned.artifacts?.bytes, measured, 'the marker says what the files freed');
  assert.ok(pruned.artifacts?.at);

  const d = await runWith(b.e, decideRun(id));
  assert.equal(d.decision.kind, 'shipped');
  const screen = await typed(t, b.e, 'decide', id);
  assert.equal(screen.error, undefined, 'nemia decide reads it');
  const text = screen.printed.join('\n');
  assert.equal(
    text.split('\n')[1],
    `  pruned at ${pruned.at} — its worktrees were removed (nemia prune), and its files were removed at ${pruned.artifacts.at} (nemia prune --artifacts); its branches and record are kept`,
  );
  assert.doesNotMatch(text, /not kept|missing/, 'a shipped run is said shipped, as before');

  const open = await aFinished(b, { closeout: (id) => ({ ...SIGNED, artifacts: [shotOf(id)] }) });
  const openShot = aShot(open.run.id);
  assert.equal((await runWith(b.e, prune(open.run.id, { artifacts: true, unmerged: true, yes: true }))).kind, 'pruned');
  const openAt = readRun(open.run.id).pruned!.artifacts!.at;
  const read = await typed(t, b.e, 'decide', open.run.id);
  assert.equal(read.error, undefined, 'nemia decide reads it');
  const openText = read.printed.join('\n');
  assert.ok(
    openText.includes(`    !! not kept: ${openShot}  — its files were removed at ${openAt} (nemia prune --artifacts)`),
    `a run a person agreed to prune unmerged is still decided on its closeouts: a file its step named reads as pruned, not as never made:\n${openText}`,
  );
  assert.doesNotMatch(openText, /!! missing|not there/, 'the file is not said to be missing as if never written');
  assert.ok(shot, 'the shot the shipped run named went too');

  const again = await runWith(b.e, prune(id, { artifacts: true, yes: true }));
  assert.deepEqual(
    [again.kind, again.nothing],
    [
      'nothing',
      `its worktrees were removed at ${pruned.at} (nemia prune), and its files were removed at ${pruned.artifacts.at} (nemia prune --artifacts)`,
    ],
  );
  assert.deepEqual(readRun(id).pruned, pruned, 'a prune with nothing to do leaves the marker as it was');
  await assert.rejects(runWith(b.e, retryRun(id, 'implement', { mode: 'nudge' })), (err: Error) =>
    err.message.startsWith(
      `${id} was pruned at ${pruned.at}: its worktrees were removed (nemia prune), its files at ${pruned.artifacts!.at} (nemia prune --artifacts), and a retry would file work into one of them.`,
    ),
  );
});

test("`nemia prune --artifacts` of a run whose worktrees a plain prune already removed: its files alone, the worktrees' time kept; and of a run that cut none, its files alone, which then reads pruned", async (t) => {
  const b = board();
  const { run } = await aFinished(b, { merged: true });
  aShot(run.id);
  assert.equal((await runWith(b.e, prune(run.id, { yes: true }))).kind, 'pruned');
  const first = readRun(run.id).pruned!;
  assert.ok(under('runs', run.id, 'artifacts', 'implement', 'shot.png'), 'a plain prune keeps the files');
  const files = await runWith(b.e, prune(run.id, { artifacts: true, yes: true }));
  assert.deepEqual([files.kind, files.worktrees, files.left], ['pruned', [], []]);
  assert.ok(files.artifacts!.bytes >= 32 * 1024);
  assert.deepEqual(
    pruneLines(files)[0],
    `${run.id}  pruned: removed its files, ${sizeOf(files.artifacts!.bytes)} freed; its record and branches are kept`,
  );
  const after = readRun(run.id).pruned!;
  assert.deepEqual([after.at, after.worktrees], [first.at, first.worktrees], 'when the worktrees went, and which, is as it was');
  assert.ok(after.artifacts && !under('runs', run.id, 'artifacts'));

  const inPlace = await runPlaced(startRun({ brief: 'in place', repo: aRepo(), workflowDir: oneStep(), isolate: false }));
  await runWith(b.e, advanceRun(readRun(inPlace.id)));
  b.settle(`${inPlace.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(inPlace.id)));
  aShot(inPlace.id);
  assert.deepEqual(
    [(await runWith(b.e, prune(inPlace.id))).kind, (await runWith(b.e, prune(inPlace.id))).nothing],
    ['nothing', `it cut no worktree — it worked in ${inPlace.repo} itself`],
    'a run that worked in its repository itself has nothing but its files to give back: without the flag, nothing',
  );
  assert.equal(
    (await runWith(b.e, prune(inPlace.id, { artifacts: true, yes: true }))).refusal,
    `it finished on main itself and waits on your decision: pruned, none of its steps can be tried again, sent round or approved, and its files are part of what you read to decide it. Decide it first, or prune it all the same: nemia prune ${inPlace.id} --unmerged --artifacts.`,
  );
  assert.ok(
    under('runs', inPlace.id, 'artifacts', 'implement', 'shot.png') && !under('runs', `${inPlace.id}.pruned`),
    'refused: its files kept, and no mark',
  );
  const bare = await followed(t, b.e, (await runWith(b.e, prune(inPlace.id, { artifacts: true, yes: true }))).refusal!);
  assert.equal(
    bare.error,
    undefined,
    `${bare.command}: the command it offers is the one that prunes them, since the plain --unmerged of a run that cut no worktree has nothing to prune`,
  );
  assert.ok(
    bare.printed.includes(`${inPlace.id}  pruned: removed its files, 44.0 KB freed; its record and branches are kept`),
    bare.printed.join('\n'),
  );
  assert.ok(!under('runs', inPlace.id, 'artifacts'), 'its files gone');
  const marked = readRun(inPlace.id).pruned!;
  assert.deepEqual(marked.worktrees, []);
  assert.equal(marked.at, marked.artifacts!.at, 'pruned once its files go');
  await assert.rejects(runWith(b.e, retryRun(inPlace.id, 'implement', { mode: 'nudge' })), (err: Error) =>
    err.message.startsWith(
      `${inPlace.id} was pruned at ${marked.at}: its files were removed (nemia prune --artifacts), and a retry would file work`,
    ),
  );
  const screen = await typed(t, b.e, 'decide', inPlace.id);
  assert.equal(screen.error, undefined);
  assert.equal(
    screen.printed.join('\n').split('\n')[1],
    `  pruned at ${marked.at} — its files were removed at ${marked.at} (nemia prune --artifacts); its branches and record are kept`,
  );
  assert.equal(
    (await runWith(b.e, prune(inPlace.id, { artifacts: true }))).nothing,
    `it cut no worktree — it worked in ${inPlace.repo} itself, and its files were removed at ${marked.at} (nemia prune --artifacts)`,
  );
});

test('`nemia prune --artifacts` marks the run before its files go, and a prune that removed nothing takes the mark back — gone on a run never pruned, as it was on one that was', async (t) => {
  const b = board();
  const { run } = await aFinished(b, { merged: true });
  aShot(run.id);
  const rm = fs.rmSync;
  let seen: unknown;
  const mocked = t.mock.method(fs, 'rmSync', (at: fs.PathLike, opts?: fs.RmOptions) => {
    if (String(at).endsWith(path.join(run.id, 'artifacts')))
      seen = JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.pruned`), 'utf8'));
    return rm(at, opts);
  });
  assert.equal((await runWith(b.e, prune(run.id, { artifacts: true, yes: true }))).kind, 'pruned');
  mocked.mock.restore();
  assert.ok(
    (seen as { artifacts?: unknown } | undefined)?.artifacts,
    `marked before the removal, as seen from inside it: ${JSON.stringify(seen)}`,
  );

  if (process.getuid?.() === 0) return t.skip('root removes what a mode forbids');
  const locked = (id: string) => {
    aShot(id);
    fs.chmodSync(path.join(ROOT, 'runs', id, 'artifacts', 'implement'), 0o555);
    t.after(() => fs.chmodSync(path.join(ROOT, 'runs', id, 'artifacts', 'implement'), 0o755));
  };
  const inPlace = await runPlaced(startRun({ brief: 'in place', repo: aRepo(), workflowDir: oneStep(), isolate: false }));
  await runWith(b.e, advanceRun(readRun(inPlace.id)));
  b.settle(`${inPlace.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(inPlace.id)));
  locked(inPlace.id);
  const never = await runWith(b.e, prune(inPlace.id, { artifacts: true, yes: true, unmerged: true }));
  assert.equal(never.kind, 'pruned');
  assert.equal(never.artifacts, undefined, 'nothing freed');
  assert.equal(never.left.length, 1, 'files in a directory nobody may write in, of a run with no worktree to remove, will not go');
  assert.match(
    pruneLines(never).at(-1)!,
    new RegExp(
      `^   kept what is left in ${escaped(path.join(ROOT, 'runs', inPlace.id, 'artifacts'))}: .*EACCES.* — what is still there is kept, and read as it is; nemia prune ${inPlace.id} --unmerged --artifacts removes it once it can be$`,
    ),
  );
  assert.ok(!under('runs', `${inPlace.id}.pruned`), 'a run never pruned is not marked');
  const cli = await typed(t, b.e, 'prune', inPlace.id, '--artifacts', '--yes', '--unmerged');
  assert.equal(cli.error?.exitCode, 2, 'and the verb says it was not pruned');

  const shipped = await aFinished(b, { merged: true });
  assert.equal((await runWith(b.e, prune(shipped.run.id, { yes: true }))).kind, 'pruned');
  const marker = fs.readFileSync(path.join(ROOT, 'runs', `${shipped.run.id}.pruned`), 'utf8');
  locked(shipped.run.id);
  const again = await runWith(b.e, prune(shipped.run.id, { artifacts: true, yes: true }));
  assert.deepEqual([again.worktrees, again.artifacts, again.left.length], [[], undefined, 1]);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${shipped.run.id}.pruned`), 'utf8')),
    JSON.parse(marker),
    'a run pruned before keeps the marker it had',
  );
});

test('REFUSED at shipped defaults under --artifacts: a run not over, a finished run not merged, a folder run, one at its gate, and a worktree holding a change — its files and its worktree kept, and no mark', async (t) => {
  const b = board();
  const kept = (id: string, shot: string) => assert.ok(fs.existsSync(shot) && !under('runs', `${id}.pruned`), id);

  const running = await runPlaced(startRun({ brief: 'still running', repo: aRepo(), workflowDir: oneStep() }));
  await runWith(b.e, advanceRun(readRun(running.id)));
  const runningShot = aShot(running.id);
  const r = await typed(t, b.e, 'prune', running.id, '--artifacts', '--yes', '--unmerged');
  assert.equal(r.error?.exitCode, 2);
  assert.match(r.printed[0], new RegExp(`^${running.id}  not pruned: it is not over — `));
  kept(running.id, runningShot);

  const unmerged = await aFinished(b);
  const unmergedShot = aShot(unmerged.run.id);
  const u = await runWith(b.e, prune(unmerged.run.id, { artifacts: true, yes: true }));
  assert.equal(
    u.refusal,
    `it finished and is not merged into main: pruned, none of its steps can be tried again, sent round or approved, and its branch is the one place its work is left. Merge it first, or prune it all the same: nemia prune ${unmerged.run.id} --unmerged --artifacts.`,
  );
  kept(unmerged.run.id, unmergedShot);
  assert.equal((await runWith(b.e, prune(unmerged.run.id, { yes: true, unmerged: true }))).kind, 'pruned');
  const mark = fs.readFileSync(path.join(ROOT, 'runs', `${unmerged.run.id}.pruned`), 'utf8');
  const after = await runWith(b.e, prune(unmerged.run.id, { artifacts: true, yes: true }));
  assert.equal(
    after.refusal,
    u.refusal,
    'once its worktree is gone by a plain prune under --unmerged, its files are still refused with the not-merged words: that word was for the worktree',
  );
  assert.ok(fs.existsSync(unmergedShot), 'its files kept');
  assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${unmerged.run.id}.pruned`), 'utf8'), mark, 'and its mark as it was');
  const all = await typed(t, b.e, 'prune', '--artifacts', '--yes');
  assert.ok(
    all.printed.includes(`${unmerged.run.id}  not pruned: ${u.refusal}`),
    `with no run named, it is refused there too, and its line says why:\n${all.printed.join('\n')}`,
  );
  assert.ok(fs.existsSync(unmergedShot), 'its files kept by the prune of every run');
  assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${unmerged.run.id}.pruned`), 'utf8'), mark);
  const offered = await followed(t, b.e, after.refusal);
  assert.equal(
    offered.error,
    undefined,
    `${offered.command}: the command it offers is the one that takes them, not the plain --unmerged already run, which now has nothing to prune`,
  );
  assert.ok(
    offered.printed.includes(`${unmerged.run.id}  pruned: removed its files, 44.0 KB freed; its record and branches are kept`),
    offered.printed.join('\n'),
  );
  assert.ok(!fs.existsSync(unmergedShot) && !under('runs', unmerged.run.id, 'artifacts'), 'its files gone');

  const team = fs.mkdtempSync(path.join(ROOT, 'team-'));
  fs.writeFileSync(path.join(team, 'write.md'), '---\nworkspace: folder\npermissionMode: dontAsk\n---\nwrite the note\n');
  const folder = await runPlaced(startRun({ brief: 'a note', repo: fs.mkdtempSync(path.join(ROOT, 'not-a-repo-')), workflowDir: team }));
  await runWith(b.e, advanceRun(readRun(folder.id)));
  b.settle(`${folder.id}-write`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(folder.id)));
  const folderShot = aShot(folder.id);
  assert.match((await runWith(b.e, prune(folder.id, { artifacts: true, yes: true, unmerged: true }))).refusal!, /^a folder run: /);
  kept(folder.id, folderShot);

  const gated = fs.mkdtempSync(path.join(ROOT, 'gated-'));
  fs.writeFileSync(path.join(gated, 'implement.md'), '---\nplace: git\ngate: true\n---\nimplement it\n');
  fs.writeFileSync(path.join(gated, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  const atGate = await runPlaced(startRun({ brief: 'at its gate', repo: aRepo(), workflowDir: gated }));
  await runWith(b.e, advanceRun(readRun(atGate.id)));
  b.settle(`${atGate.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(atGate.id)));
  const gateShot = aShot(atGate.id);
  assert.match(
    (await runWith(b.e, prune(atGate.id, { artifacts: true, yes: true, unmerged: true }))).refusal!,
    new RegExp(`^implement waits at its gate for your approval`),
  );
  kept(atGate.id, gateShot);

  const dirty = await aFinished(b, { merged: true });
  fs.writeFileSync(path.join(dirty.wt, 'notes.md'), 'notes\n');
  const dirtyShot = aShot(dirty.run.id);
  assert.match(
    (await runWith(b.e, prune(dirty.run.id, { artifacts: true, yes: true }))).refusal!,
    /holds changes no commit has \(notes\.md\)/,
  );
  kept(dirty.run.id, dirtyShot);

  const flag = await typed(t, b.e, 'prune', '--artifact');
  assert.equal(flag.error?.exitCode, 2, 'a flag near it is not taken for it');
  assert.match(flag.error.message, /^nemia prune does not take --artifact\. .*--artifacts/);
});

test('pruneLines and sizeOf say what a person reads', () => {
  assert.equal(sizeOf(3 * 1024 ** 3), '3.00 GB');
  assert.equal(sizeOf(1536 * 1024), '1.5 MB');
  assert.deepEqual(
    pruneLines({
      id: 'r-1',
      kind: 'pruned',
      worktrees: [{ path: '/w/a', bytes: 2048 }],
      left: [{ path: '/w/b', git: 'fatal: nope', fix: 'git -C /w/b status' }],
    }),
    [
      'r-1  pruned: removed 1 worktree, 2.0 KB freed; its record, branches and files are kept',
      '   /w/a  2.0 KB',
      '   kept /w/b: git would not remove it — fatal: nope; look in it before anything is forced: git -C /w/b status',
    ],
  );
  const files = { path: '/s/runs/r-1/artifacts', files: 'EACCES' } as const;
  assert.equal(
    pruneLines({ id: 'r-1', kind: 'pruned', worktrees: [], left: [files], unmerged: true }).at(-1),
    '   kept what is left in /s/runs/r-1/artifacts: EACCES — what is still there is kept, and read as it is; nemia prune r-1 --unmerged --artifacts removes it once it can be',
    'files that would not go are offered the prune that removes them later: given --unmerged, repeated, or a run nobody decided is refused it',
  );
  assert.equal(
    pruneLines({ id: 'r-1', kind: 'pruned', worktrees: [], left: [files] }).at(-1),
    '   kept what is left in /s/runs/r-1/artifacts: EACCES — what is still there is kept, and read as it is; nemia prune r-1 --artifacts removes it once it can be',
  );
});

test('the whole screen of a pruned run over its budget', async (t) => {
  const b = board();
  const over = await aFinished(b, { budget: 3, costUsd: 3.4, closeout: { ...SIGNED, outcome: 'blocked', needs: 'a word' } });
  await runWith(b.e, prune(over.run.id, { yes: true, unmerged: true }));
  const overAt = readRun(over.run.id).pruned!.at;
  assert.deepEqual(
    await decideScreen(t, b.e, [over.run.id], { '<id>': over.run.id, '<root>': ROOT, '<repo>': over.repo, '<at>': overAt }),
    [
      '<id>  add a flag',
      '  pruned at <at> — its worktrees were removed (nemia prune); its branches, record and files are kept',
      '',
      '  BLOCKED: implement',
      '  OVER BUDGET: implement ($3.40 of $3)  — nothing more is filed for it, raised or not, since the run was pruned at <at> — its worktrees were removed (nemia prune); nothing after it ran',
      '',
      '  touched  wf/<id>/implement',
      '    (root)  1 file   +1 −0',
      '  lesson  nothing written where the next agent reads',
      '',
      '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
      '  none',
      '',
      '  implement  BLOCKED',
      '    used  not measured',
      '    cost  not measured · budget $3',
      '    timeline  try 1  filed not known  settled before it spawned  used not measured',
      '    did it',
      '    needs: a word',
      '',
      '  cost  run $3.40',
      '  timeline  run  queued —  ran —  wall not known',
      '',
      '  wf/<id>/implement  — 1 file: +1 −0',
      '',
      '  branch    wf/<id>/implement is ahead of main by 1 commit',
      '',
      '  ship it   git -C <repo> merge --no-ff wf/<id>/implement',
      '  drop it   git -C <repo> branch -D wf/<id>/implement',
    ],
  );
});

/** A finished merged run judged and sized now, as a prune that removes it later holds it. */
const readyNow = async (b: ReturnType<typeof board>, id: string) => {
  const judged = await runWith(b.e, judging(id));
  assert.ok('ready' in judged, `${id} is ready to prune`);
  return runWith(b.e, sized(judged.ready));
};

test('the mark of a run another prune freed since it was judged: a removal on the older judgement leaves that mark, its worktree and its time', async () => {
  const b = board();
  const { run, wt } = await aFinished(b, { merged: true });
  const stale = await readyNow(b, run.id);
  assert.equal((await runWith(b.e, prune(run.id, { yes: true }))).kind, 'pruned');
  const first = readRun(run.id).pruned!;
  assert.deepEqual(
    first.worktrees.map((w) => w.path),
    [wt],
  );

  const [late] = await runWith(b.e, freeing([stale]));
  assert.deepEqual(late.worktrees, [], 'the later removal removed nothing');
  assert.equal(late.left.length, 1, 'and says the worktree it found gone');
  assert.deepEqual(readRun(run.id).pruned, first, "the mark is the first prune's, whole");
});

test('the mark of a run another prune frees while this one asks its removal: the mark that prune wrote stays, though this one removed nothing', async () => {
  const b = board();
  const { run, wt } = await aFinished(b, { merged: true });
  const other = { at: '2026-01-01T00:00:00.000Z', worktrees: [{ path: wt, bytes: 7 }] };
  const between = PlaceService.layer(
    placeOver(shippedGitPlace, {
      remove: (request) => {
        const theirs = shippedGitPlace.askNow('remove', request);
        assert.ok('answer' in theirs && theirs.answer.removed.length === 1, 'the other prune removed the worktree');
        runStore.runs.prune(run.id, other);
        return {
          answer: { ...theirs.answer, removed: [], left: request.workspaces.map((at) => ({ path: at, said: 'is not a working tree' })) },
        };
      },
    }),
  );
  const done = await runWith(b.e, prune(run.id, { yes: true }).pipe(Effect.provide(between)));
  assert.deepEqual([done.worktrees, done.left.length], [[], 1]);
  assert.ok(!fs.existsSync(wt));
  assert.deepEqual(readRun(run.id).pruned, other, 'the run reads pruned, by the mark of the prune that removed its worktree');
});

test('the mark of a run whose removal was not heard and removed all the same: the run reads pruned, with the worktree that is gone, and its line says the removal unread', async () => {
  const b = board();
  const { run, wt } = await aFinished(b, { merged: true });
  const deaf = PlaceService.layer(
    placeOver(shippedGitPlace, {
      remove: (request) => {
        shippedGitPlace.askNow('remove', request);
        return unreadBy('remove', 'the removal was not heard');
      },
    }),
  );
  const done = await runWith(b.e, prune(run.id, { yes: true }).pipe(Effect.provide(deaf)));
  assert.deepEqual(
    done.left.map((l) => [l.path, 'unread' in l ? l.unread : null]),
    [[wt, 'the removal was not heard']],
  );
  assert.ok(!fs.existsSync(wt), 'the worktree went');
  const mark = readRun(run.id).pruned;
  assert.deepEqual(
    mark?.worktrees.map((w) => w.path),
    [wt],
    `the mark stays and lists it: ${JSON.stringify(mark)}`,
  );
  assert.equal((await runWith(b.e, prune(run.id))).kind, 'nothing', 'and the next prune has nothing to do');
});

/** Finished merged runs, `count` of them, each in the repository `repos` names in its turn: their ids, and their worktrees by id. */
const finishedIn = async (b: ReturnType<typeof board>, repos: readonly string[], count: number) => {
  const ids: string[] = [];
  const wts = new Map<string, string>();
  for (let k = 0; k < count; k++) {
    const { run, wt } = await aFinished(b, { merged: true, repo: repos[k % repos.length], work: `fix-${ids.length}-${k}.ts` });
    ids.push(run.id);
    wts.set(run.id, wt);
  }
  return { ids, wts };
};

/** What a place was asked, verb by verb, in order. */
type Asked = Array<{ verb: PlaceVerb; request: PlaceRequests[PlaceVerb] }>;

/** `place`, every question noted in `asked` before it is answered. */
const counting = (place: Place, asked: Asked): Place => ({
  declared: place.declared,
  ask: (verb, request, options) => {
    asked.push({ verb, request });
    return place.ask(verb, request, options);
  },
  askNow: (verb, request, options) => {
    asked.push({ verb, request });
    return place.askNow(verb, request, options);
  },
});

/** The run each `inventory` in `asked` was asked of, by the folder of worktrees it named. */
const inventoried = (asked: Asked): string[] =>
  asked.flatMap((a) => (a.verb === 'inventory' ? [path.basename((a.request as PlaceRequests['inventory']).under)] : []));

/** Each `remove` in `asked`, as it was asked. */
const removes = (asked: Asked): PlaceRequests['remove'][] =>
  asked.flatMap((a) => (a.verb === 'remove' ? [a.request as PlaceRequests['remove']] : []));

const kindsOf = (turned: readonly Turned[]) => turned.map((d) => ('failed' in d ? 'failed' : d.pruning.kind));

test(
  '`judgingMany` over more runs than its bound: no more than PRUNE_A_TURN inventories are asked at once, one a run, and the runs are answered in the order named whatever order they ended in',
  WAITED,
  async (t) => {
    const b = board();
    const { ids } = await finishedIn(b, [aRepo()], 2 * PRUNE_A_TURN + 1);
    const held = placeHeld(shippedGitPlace, 'inventory');
    const judged = runEngine(b.e, judgingMany(ids).pipe(Effect.provide(PlaceService.layer(held.place))));
    for (let left = ids.length; left > 0; left--) {
      const due = Math.min(PRUNE_A_TURN, left);
      await until(
        t,
        () => held.waiting() >= due,
        () => `${due} inventories asked at once, ${left} runs left: ${held.waiting()} wait`,
        {
          bell: held.bell,
        },
      );
      held.letGo();
    }
    const listed = await judged;
    assert.equal(held.most(), PRUNE_A_TURN, 'the bound is met, and never passed');
    assert.deepEqual(
      held.requests.map((r) => path.basename(r.under)),
      [...ids.slice(0, PRUNE_A_TURN), ...ids.slice(PRUNE_A_TURN)],
      'each run is asked its inventory once, in the order named',
    );
    assert.deepEqual(
      listed.map((l) => l.id),
      ids,
      'the last asked was let go first each time, and the answers are in the order named all the same',
    );
    assert.ok(
      listed.every((l) => 'ready' in l && l.ready && l.pruning.kind === 'prunable'),
      'each ready, sized',
    );
  },
);

test('under --yes a run is judged once, and the ready runs of one repository go by one `remove` with every worktree; of two repositories in a turn, by two, and the turn is told in the order listed', async () => {
  const b = board();
  const one = await finishedIn(b, [aRepo()], 3);
  const asked: Asked = [];
  const place = PlaceService.layer(counting(shippedGitPlace, asked));
  const listed = await runEngine(b.e, judgingMany(one.ids).pipe(Effect.provide(place)));
  const done = await runEngine(b.e, freeingMany(listed, { yes: true }).pipe(Effect.provide(place)));
  assert.deepEqual(kindsOf(done), ['pruned', 'pruned', 'pruned']);
  assert.deepEqual(inventoried(asked), one.ids, 'one inventory a run: the listing is the judgement the removal goes on');
  assert.equal(removes(asked).length, 1, 'one remove for the three runs');
  assert.deepEqual(
    [removes(asked)[0].workspaces, removes(asked)[0].branches],
    [one.ids.map((id) => one.wts.get(id)), []],
    'with the worktree of each, and no branch',
  );
  assert.ok(one.ids.every((id) => !fs.existsSync(one.wts.get(id)!) && readRun(id).pruned?.worktrees.length === 1));

  const repos = [aRepo(), aRepo()];
  const two = await finishedIn(b, repos, 3);
  asked.length = 0;
  const told: string[][] = [];
  const mixed = await runEngine(b.e, judgingMany(two.ids).pipe(Effect.provide(place)));
  const freed = await runEngine(
    b.e,
    freeingMany(mixed, { yes: true }, (turn) => void told.push(turn.map((d) => d.id))).pipe(Effect.provide(place)),
  );
  assert.deepEqual(
    removes(asked).map((r) => [r.repo, r.workspaces]),
    [
      [repos[0], [two.wts.get(two.ids[0]), two.wts.get(two.ids[2])]],
      [repos[1], [two.wts.get(two.ids[1])]],
    ],
    'a remove a repository, each with its own worktrees',
  );
  assert.deepEqual(told, [two.ids], 'one turn, told once, in the order listed and not by repository');
  assert.deepEqual(
    freed.map((d) => d.id),
    two.ids,
  );
  assert.deepEqual(kindsOf(freed), ['pruned', 'pruned', 'pruned']);
});

test('after a prompt each run is judged again before its removal: one whose worktree was detached on a commit no branch has since the listing is refused and kept, and the other is pruned', async () => {
  const b = board();
  const { ids, wts } = await finishedIn(b, [aRepo()], 2);
  const asked: Asked = [];
  const place = PlaceService.layer(counting(shippedGitPlace, asked));
  const listed = await runEngine(b.e, judgingMany(ids).pipe(Effect.provide(place)));
  const wt = wts.get(ids[0])!;
  git(wt, 'checkout', '-q', '--detach');
  fs.writeFileSync(path.join(wt, 'lost.ts'), 'lost\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', 'on no branch');

  const done = await runEngine(b.e, freeingMany(listed, { yes: false }).pipe(Effect.provide(place)));
  assert.deepEqual(kindsOf(done), ['refused', 'pruned']);
  assert.match('pruning' in done[0] ? (done[0].pruning.refusal ?? '') : '', /is on no branch/);
  assert.ok(fs.existsSync(wt) && !under('runs', `${ids[0]}.pruned`), 'the detached worktree stands, and its run is not marked');
  assert.ok(!fs.existsSync(wts.get(ids[1])!));
  assert.deepEqual(inventoried(asked).sort(), [...ids, ...ids].sort(), 'each run judged for the listing, and again for its removal');
  assert.equal(removes(asked).length, 1);
  assert.deepEqual(removes(asked)[0].workspaces, [wts.get(ids[1])], 'the run refused is in no remove');
});

test(
  'more ready runs of one repository than a turn carries: a `remove` of PRUNE_A_TURN runs, then one of the rest once the first has answered, never two at once',
  WAITED,
  async (t) => {
    const b = board();
    const { ids, wts } = await finishedIn(b, [aRepo()], PRUNE_A_TURN + 1);
    const held = placeHeld(shippedGitPlace, 'remove');
    const listed = await runEngine(b.e, judgingMany(ids).pipe(Effect.provide(PlaceService.layer(held.place))));
    const told: string[][] = [];
    const freed = runEngine(
      b.e,
      freeingMany(listed, { yes: true }, (turn) => void told.push(turn.map((d) => d.id))).pipe(
        Effect.provide(PlaceService.layer(held.place)),
      ),
    );
    await until(t, () => held.waiting() >= 1, 'the first remove asked', { bell: held.bell });
    assert.deepEqual(
      held.requests.map((r) => r.workspaces),
      [ids.slice(0, PRUNE_A_TURN).map((id) => wts.get(id))],
      'the first turn alone is asked while it has not answered',
    );
    assert.deepEqual(told, [], 'and no turn is told before it ends');
    held.letGo();
    await until(t, () => held.waiting() >= 1, 'the second remove asked', { bell: held.bell });
    assert.deepEqual(told, [ids.slice(0, PRUNE_A_TURN)], 'the first turn is told as it ends, before the second is asked');
    held.letGo();
    assert.deepEqual(
      kindsOf(await freed),
      ids.map(() => 'pruned'),
    );
    assert.deepEqual(held.requests[1].workspaces, [wts.get(ids[PRUNE_A_TURN])]);
    assert.equal(held.most(), 1);
    assert.deepEqual(told, [ids.slice(0, PRUNE_A_TURN), ids.slice(PRUNE_A_TURN)]);
  },
);

test(
  'the mark of a never-pruned run two prunes overlap on, neither removing anything: no mark is left, whichever ends first',
  WAITED,
  async (t) => {
    const b = board();
    const { run, wt } = await aFinished(b, { merged: true });
    const refusing = placeOver(shippedGitPlace, {
      remove: (request) => ({
        answer: {
          removed: [],
          left: request.workspaces.map((at) => ({ path: at, said: 'contains untracked files' })),
          deleted: [],
          kept: [],
        },
      }),
    });
    const held = placeHeld(refusing, 'remove');
    const judged = await runEngine(b.e, judging(run.id).pipe(Effect.provide(PlaceService.layer(held.place))));
    assert.ok('ready' in judged, 'ready to prune');
    const ready = await runWith(b.e, sized(judged.ready));
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    for (const ends of ['first', 'last'] as const) {
      const one = runWith(b.e, freeing([ready]));
      await until(t, () => held.waiting() >= 1, 'the first removal asked', { bell: held.bell });
      t.mock.timers.tick(1000);
      const other = runWith(b.e, freeing([ready]));
      await until(t, () => held.waiting() >= 2, 'the second removal asked', { bell: held.bell });
      assert.ok(under('runs', `${run.id}.pruned`), 'marked while its removals are asked');
      held.letGo(ends);
      await (ends === 'first' ? one : other);
      held.letGo();
      const done = [...(await one), ...(await other)];
      assert.deepEqual(
        done.map((d) => [d.worktrees.length, d.left.length]),
        [
          [0, 1],
          [0, 1],
        ],
        'neither removed anything',
      );
      assert.ok(fs.existsSync(wt), 'the worktree stands');
      assert.equal(readRun(run.id).pruned, undefined, `the ${ends} to ask ended first: the run is not marked`);
    }
  },
);

test('after a prompt, runs freed since the listing say nothing is left, and git forgets them by the `remove` their turn asks of their repository, or by one of nothing a repository where it asks none', async () => {
  const b = board();
  const asked: Asked = [];
  const place = PlaceService.layer(counting(shippedGitPlace, asked));
  const beside = await finishedIn(b, [aRepo()], 3);
  const listed = await runWith(b.e, judgingMany(beside.ids));
  for (const id of beside.ids.slice(0, 2)) assert.equal((await runWith(b.e, prune(id, { yes: true }))).kind, 'pruned');
  const done = await runEngine(b.e, freeingMany(listed, { yes: false }).pipe(Effect.provide(place)));
  assert.deepEqual(kindsOf(done), ['nothing', 'nothing', 'pruned']);
  assert.deepEqual(
    removes(asked).map((r) => r.workspaces),
    [[beside.wts.get(beside.ids[2])]],
    "one remove in the repository, the ready run's: it prunes what git lists of the two already gone",
  );

  const alone = await finishedIn(b, [aRepo()], 2);
  const gone = await runWith(b.e, judgingMany(alone.ids));
  for (const id of alone.ids) assert.equal((await runWith(b.e, prune(id, { yes: true }))).kind, 'pruned');
  asked.length = 0;
  const left = await runEngine(b.e, freeingMany(gone, { yes: false }).pipe(Effect.provide(place)));
  assert.deepEqual(kindsOf(left), ['nothing', 'nothing']);
  assert.deepEqual(
    removes(asked).map((r) => r.workspaces),
    [[]],
    'one remove of nothing for the two runs of the repository, never one a run',
  );
});
