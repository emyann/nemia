/**
 * `wf prune`: a run's worktrees removed, and nothing else of it — over a store and repositories of its own, with git for real. A file of its
 * own, since `WF_ROOT` is read once, as the package loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from 'agent-engine';
import type { TaskPhase } from '../src/run.ts';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-prune-'));
process.env.WF_ROOT = ROOT;
const { accept, advance, approve, decide, forget, idRefusal, listRuns, prune, pruneLines, readRun, retry, round, sizeOf, start } = await import('../src/runner.ts');
const { main } = await import('../src/cli.ts');

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
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

/** A workflow of one step, `implement`, whose closeout names a file it leaves in its workspace. */
const oneStep = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  return dir;
};

/** Just enough engine: each task's phase, and its closeout on its one attempt once it has one. */
const board = () => {
  const tasks = new Map<string, { phase: TaskPhase; closeout?: unknown }>();
  const filings: string[] = [];
  const e = {
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id, phase: t?.phase ?? 'pending', sessionId: t ? 's' : null,
        state: {
          brief: t ? 'filed' : '', settled, stopRequested: false, said: [],
          attempts: !t || t.phase === 'pending' ? [] : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: null, usage: null }],
        },
      };
    },
    file: async (spec: { id: string }) => { filings.push(spec.id); tasks.set(spec.id, { phase: 'pending' }); return spec.id; },
    stop: async () => {},
  } as unknown as Engine;
  const settle = (id: string, phase: TaskPhase, closeout?: unknown) => tasks.set(id, { phase, closeout });
  return { e, filings, settle };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/**
 * A run that is over: started for real, its one step filed in a worktree of its own, `work` committed on its branch, signed off, and handed
 * off by a pass — with a `node_modules` in the worktree that git ignores, holding a link out of it. Merged into `main` with `merged`.
 */
const aFinished = async (b: ReturnType<typeof board>, { merged = false, work = 'fix.ts' }: { merged?: boolean; work?: string } = {}) => {
  const repo = aRepo();
  const run = start({ brief: 'add a flag', repo, workflowDir: oneStep() });
  await advance(b.e, readRun(run.id));
  const wt = readRun(run.id).steps.implement!.workspace!;
  fs.writeFileSync(path.join(wt, work), 'export const fixed = true;\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', `add ${work}`);
  fs.mkdirSync(path.join(wt, 'node_modules', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(wt, 'node_modules', 'pkg', 'index.js'), 'x'.repeat(64 * 1024));
  const outside = fs.mkdtempSync(path.join(ROOT, 'outside-'));
  fs.writeFileSync(path.join(outside, 'precious.txt'), 'keep me\n');
  fs.symlinkSync(outside, path.join(wt, 'node_modules', 'linked'));
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(run.id));   // the hand-off: nothing left uncommitted
  const branch = `wf/${run.id}/implement`;
  if (merged) git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', branch);
  return { run, repo, wt, branch, outside };
};

/** `wf <verb>`, through the CLI, as a person types it: the lines it printed, and the error it ended with, if it did. */
const typed = async (t: TestContext, e: Engine, ...argv: string[]) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => { printed.push(a.join(' ')); });
  try {
    await main(argv, e);
    return { printed, error: undefined };
  } catch (err) {
    return { printed, error: err as Error & { exitCode?: number } };
  } finally {
    log.mock.restore();
  }
};

const worktreesOf = (repo: string) => git(repo, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => fs.realpathSync(l.slice('worktree '.length)));

test('`wf prune` on a run that shipped: listed with its size and nothing removed, until --yes — then its worktree is removed through git, what git ignores with it and nothing a link leads to; its record, closeout, branch, files and asks are kept; `wf ls` and `wf decide` say it is pruned, and a second prune has nothing to do', async (t) => {
  const b = board();
  const { run, repo, wt, branch, outside } = await aFinished(b, { merged: true });
  fs.mkdirSync(path.join(ROOT, 'runs', run.id, 'artifacts', 'implement'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'runs', run.id, 'artifacts', 'implement', 'report.md'), 'report\n');
  fs.mkdirSync(path.join(ROOT, 'runs', `${run.id}.asks`, 'done'), { recursive: true });

  // A dry run, as the CLI says it with nobody at a terminal: the worktree and its size, and how to remove it.
  const dry = await typed(t, b.e, 'prune', run.id);
  assert.equal(dry.error, undefined);
  assert.match(dry.printed[0]!, new RegExp(`^${run.id}  would remove 1 worktree, \\d+\\.\\d KB$`));
  assert.match(dry.printed[1]!, new RegExp(`^   ${wt.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}  \\d+\\.\\d KB$`));
  assert.match(dry.printed[2]!, /^1 run to prune, \d+\.\d KB in all$/);
  assert.equal(dry.printed[3], `nothing removed: wf prune ${run.id} --yes removes them`);
  assert.ok(fs.existsSync(wt) && !under('runs', `${run.id}.pruned`), 'a dry run touches nothing');
  const measured = (await prune(b.e, run.id)).worktrees[0]!.bytes;
  assert.ok(measured >= 64 * 1024, `what node_modules holds is counted (${measured})`);

  const done = await typed(t, b.e, 'prune', run.id, '--yes');
  assert.equal(done.error, undefined);
  assert.match(done.printed.at(-2)!, new RegExp(`^${run.id}  pruned: removed 1 worktree, \\d+\\.\\d KB freed; its record, branches and files are kept$`));
  assert.ok(!fs.existsSync(wt) && !under('worktrees', run.id), 'the worktree, and the run\'s directory of them, are gone');
  assert.ok(!worktreesOf(repo).includes(fs.realpathSync(ROOT) + wt.slice(ROOT.length)), 'git lists it no more');
  assert.equal(fs.readFileSync(path.join(outside, 'precious.txt'), 'utf8'), 'keep me\n', 'a link in node_modules is not followed');
  assert.ok(git(repo, 'branch', '--list', branch), 'the branch is kept');
  assert.ok(under('runs', `${run.id}.json`) && under('runs', run.id, 'artifacts', 'implement', 'report.md') && under('runs', `${run.id}.asks`, 'done'));
  const pruned = readRun(run.id).pruned!;
  assert.equal(pruned.worktrees.length, 1);
  assert.equal(pruned.worktrees[0]!.path, wt);
  assert.ok(!('pruned' in JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8'))), 'the record itself never holds it');

  // Still on the board, as it was, with the word beside it.
  const ls = await typed(t, b.e, 'ls', run.id);
  assert.match(ls.printed[0]!, new RegExp(`^${run.id}  add a flag  \\(pruned\\)`));
  const d = await decide(b.e, run.id);
  assert.equal(d.decision.kind, 'shipped');
  assert.equal((d.closeouts.implement as { summary?: string }).summary, 'did it', 'its closeout is the engine\'s, and still read');
  const screen = await typed(t, b.e, 'decide', run.id);
  assert.equal(screen.printed.join('\n').split('\n')[1], `  pruned at ${pruned.at} — its worktrees were removed (wf prune); its branches, record and files are kept`);

  // And a tick after it files nothing, and writes nothing into the record it should not.
  const filings = [...b.filings];
  await advance(b.e, readRun(run.id));
  assert.deepEqual(b.filings, filings);

  const again = await prune(b.e, run.id, { yes: true });
  assert.deepEqual([again.kind, again.nothing], ['nothing', `its worktrees were removed at ${pruned.at} (wf prune)`]);
  assert.equal(readRun(run.id).pruned!.at, pruned.at, 'a prune with nothing to do leaves the marker as it was');

  // `wf rm` still forgets it, and the marker goes with it.
  assert.equal((await forget(b.e, run.id)).kind, 'forgotten');
  assert.ok(!under('runs', `${run.id}.pruned`));
});

test('REFUSED at shipped defaults: a run not over — named, and told to cancel first; nothing removed, exit 2', async (t) => {
  const b = board();
  const repo = aRepo();
  const run = start({ brief: 'still running', repo, workflowDir: oneStep() });
  await advance(b.e, readRun(run.id));
  const wt = readRun(run.id).steps.implement!.workspace!;
  const { printed, error } = await typed(t, b.e, 'prune', run.id, '--yes', '--unmerged');
  assert.equal(error?.exitCode, 2);
  assert.equal(printed[0], `${run.id}  not pruned: it is not over — wf decide ${run.id} says it is still running. Pruning is not cancelling: wf cancel ${run.id} files nothing more, then wf prune ${run.id} once what was in flight has settled.`);
  assert.ok(fs.existsSync(wt) && !under('runs', `${run.id}.pruned`));
});

test('REFUSED at shipped defaults: a finished run not merged — pruned, it could not be tried again — unless --unmerged; with it, pruned, and the branch with its work kept', async () => {
  const b = board();
  const { run, repo, wt, branch } = await aFinished(b);
  const refused = await prune(b.e, run.id, { yes: true });
  assert.equal(refused.kind, 'refused');
  assert.equal(refused.refusal, `it finished and is not merged into main: pruned, none of its steps can be tried again, sent round or approved, and its branch is the one place its work is left. Merge it first, or prune it all the same: wf prune ${run.id} --unmerged.`);
  assert.ok(fs.existsSync(wt) && !under('runs', `${run.id}.pruned`));

  const done = await prune(b.e, run.id, { yes: true, unmerged: true });
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
    const refused = await prune(b.e, run.id, { yes: true });
    assert.equal(refused.kind, 'refused', change);
    assert.equal(refused.refusal, `${wt} holds changes no commit has (${change === 'untracked' ? 'notes.md' : 'README.md'}), and they would be lost with it: commit them on its branch, or discard them (git -C ${wt} status), then wf prune ${run.id}.`);
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
  const d = await prune(b.e, detached.run.id, { yes: true, unmerged: true });
  assert.equal(d.refusal, `${detached.wt} is on no branch — its HEAD is detached at ${head.slice(0, 7)} — and removing it would leave what it holds on none: put it on one (git -C ${detached.wt} switch -c <branch>), then wf prune ${detached.run.id}.`);
  assert.ok(fs.existsSync(detached.wt));

  const locked = await aFinished(b, { merged: true });
  git(locked.repo, 'worktree', 'lock', '--reason', 'on a stick', locked.wt);
  const l = await prune(b.e, locked.run.id, { yes: true, unmerged: true });
  assert.equal(l.refusal, `${locked.wt} is locked (on a stick), and git will not remove it — unlock it if nothing needs it: git -C ${locked.repo} worktree unlock ${locked.wt}.`);
  assert.ok(fs.existsSync(locked.wt) && !under('runs', `${locked.run.id}.pruned`));
});

test('REFUSED at shipped defaults: a hand-off still owed — a step settled and no pass since — until a tick has handed it off', async () => {
  const b = board();
  const repo = aRepo();
  const run = start({ brief: 'owed', repo, workflowDir: oneStep() });
  await advance(b.e, readRun(run.id));
  const wt = readRun(run.id).steps.implement!.workspace!;
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  const refused = await prune(b.e, run.id, { yes: true, unmerged: true });
  assert.equal(refused.refusal, `implement is still to be handed off — a pass commits what it left, and collects its files, from the worktree: let a tick run (wf tick), then wf prune ${run.id}.`);
  assert.ok(fs.existsSync(wt));
  await advance(b.e, readRun(run.id));
  assert.equal((await prune(b.e, run.id, { yes: true, unmerged: true })).kind, 'pruned');
});

test('REFUSED at shipped defaults: a folder run — its folders are its work, kept until `wf rm`', async () => {
  const b = board();
  const team = fs.mkdtempSync(path.join(ROOT, 'team-'));
  fs.writeFileSync(path.join(team, 'write.md'), '---\nworkspace: folder\npermissionMode: dontAsk\n---\nwrite the note\n');
  const run = start({ brief: 'a note', repo: fs.mkdtempSync(path.join(ROOT, 'not-a-repo-')), workflowDir: team });
  await advance(b.e, readRun(run.id));
  b.settle(`${run.id}-write`, 'succeeded', SIGNED);
  await advance(b.e, readRun(run.id));
  const refused = await prune(b.e, run.id, { yes: true, unmerged: true });
  assert.deepEqual([refused.kind, refused.refusal], ['refused', `a folder run: its steps' folders are its work, kept with the run until it is forgotten — no worktree to prune. wf rm ${run.id} forgets it with them.`]);
  assert.ok(!under('runs', `${run.id}.pruned`));
});

test('REFUSED at shipped defaults: whatever holds `wf rm` — a step waiting at its gate, named with the approval that answers it, and an ask no pass has spent, named with the file that takes it back', async () => {
  // A gated step that signed off: the run is not running, and not merged, so --unmerged is given, and the gate alone holds it.
  const b = board();
  const gated = fs.mkdtempSync(path.join(ROOT, 'gated-'));
  fs.writeFileSync(path.join(gated, 'implement.md'), '---\ngate: true\n---\nimplement it\n');
  fs.writeFileSync(path.join(gated, 'review.md'), '---\nafter: implement\n---\nreview it\n');
  const run = start({ brief: 'at its gate', repo: aRepo(), workflowDir: gated });
  await advance(b.e, readRun(run.id));
  const wt = readRun(run.id).steps.implement!.workspace!;
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(run.id));
  assert.equal((await decide(b.e, run.id)).decision.kind, 'awaiting', 'over, as `decide` reads it: not refused as running');
  const atGate = await prune(b.e, run.id, { yes: true, unmerged: true });
  assert.equal(atGate.kind, 'refused');
  assert.equal(atGate.refusal, `implement waits at its gate for your approval, and what waits on it is filed once it is approved: wf approve ${run.id} implement. Pruning is not cancelling: wf cancel ${run.id} files nothing more, then wf prune ${run.id}.`);
  assert.ok(fs.existsSync(wt) && !under('runs', `${run.id}.pruned`));

  // A retry asked of a step that shipped, which no pass files: the run is over and merged, and the ask alone holds it — until it is taken back.
  const shipped = await aFinished(b, { merged: true });
  const asks = path.join(ROOT, 'runs', `${shipped.run.id}.asks`);
  fs.mkdirSync(asks, { recursive: true });
  fs.writeFileSync(path.join(asks, 'retry-implement-2'), JSON.stringify({ mode: 'nudge' }));
  assert.equal((await decide(b.e, shipped.run.id)).decision.kind, 'shipped');
  const asked = await prune(b.e, shipped.run.id, { yes: true });
  assert.equal(asked.kind, 'refused');
  assert.equal(asked.refusal, `try 2 of implement is asked for, and no pass files it as the run stands. Take that ask back, then wf prune ${shipped.run.id}: rm ${path.join(asks, 'retry-implement-2')}.`);
  assert.ok(fs.existsSync(shipped.wt) && !under('runs', `${shipped.run.id}.pruned`));
  fs.rmSync(path.join(asks, 'retry-implement-2'));
  assert.equal((await prune(b.e, shipped.run.id, { yes: true })).kind, 'pruned');
});

test('REFUSED after a prune: a retry, a round, an approval and an acceptance — each would file work into a worktree that is gone — and a pass files nothing on an ask a person wrote by hand', async (t) => {
  const b = board();
  const { run } = await aFinished(b);
  // A step that signed off blocked: a person may try it again, until the run is pruned.
  b.settle(`${run.id}-implement`, 'succeeded', { ...SIGNED, outcome: 'blocked', needs: 'a word' });
  assert.equal((await decide(b.e, run.id)).answering.implement !== undefined, true, 'an answer is offered before');
  assert.match((await typed(t, b.e, 'ls', run.id)).printed.join('\n'), /waiting on you: implement/, 'and `wf ls` says it waits on you');
  assert.equal((await prune(b.e, run.id, { yes: true, unmerged: true })).kind, 'pruned');
  const at = readRun(run.id).pruned!.at;
  const said = `${run.id} was pruned at ${at}: its worktrees were removed (wf prune), and`;

  await assert.rejects(retry(b.e, run.id, 'implement', { mode: 'nudge' }), (err: Error) => err.message.startsWith(`${said} a retry would file work into one of them.`));
  await assert.rejects(round(b.e, run.id, 'implement'), (err: Error) => err.message.startsWith(`${said} a round would file work into one of them.`));
  await assert.rejects(approve(b.e, run.id, 'implement'), (err: Error) => err.message.startsWith(`${said} an approval would file work into one of them.`));
  await assert.rejects(accept(b.e, run.id, 'implement', 'as it stands'), (err: Error) => err.message.startsWith(`${said} an acceptance would file work into one of them.`));
  const d = await decide(b.e, run.id);
  assert.deepEqual([d.retrying, d.rounding, d.offers, d.answering], [[], [], [], {}], 'and nothing is offered');
  assert.doesNotMatch((await typed(t, b.e, 'ls', run.id)).printed.join('\n'), /waiting on you/, 'and `wf ls` waits on nobody');

  // The verbs are one writer of the asks; a person with a text editor is another. The pass is the guard that holds.
  const asks = path.join(ROOT, 'runs', `${run.id}.asks`);
  fs.mkdirSync(asks, { recursive: true });
  fs.writeFileSync(path.join(asks, 'retry-implement-2'), JSON.stringify({ mode: 'nudge' }));
  const filings = [...b.filings];
  await advance(b.e, readRun(run.id));
  assert.deepEqual(b.filings, filings, 'nothing filed');
  assert.doesNotMatch((await typed(t, b.e, 'ls', run.id)).printed.join('\n'), /asked|due|files it/, '`wf ls` says no try is coming of the ask written by hand');
});

test('`wf prune` with no run reads every run: one not over is summed up on a line, one with nothing to prune is not said, and the rest are listed with the total', async (t) => {
  const b = board();
  const merged = await aFinished(b, { merged: true });
  const running = start({ brief: 'running', repo: aRepo(), workflowDir: oneStep() });
  await advance(b.e, readRun(running.id));
  const inPlace = start({ brief: 'in place', repo: aRepo(), workflowDir: oneStep(), isolate: false });
  await advance(b.e, readRun(inPlace.id));
  b.settle(`${inPlace.id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(inPlace.id));

  const { printed, error } = await typed(t, b.e, 'prune');
  assert.equal(error, undefined, 'a run refused is not an error when none was named');
  const text = printed.join('\n');
  assert.match(text, new RegExp(`^${merged.run.id}  would remove 1 worktree, `, 'm'));
  assert.match(text, new RegExp(`^\\d+ runs? not over, not pruned: .*${running.id}`, 'm'));
  assert.doesNotMatch(text, new RegExp(`^${inPlace.id} `, 'm'), 'a run that cut no worktree is not a line');
  assert.match(text, /^nothing removed: wf prune --yes removes them$/m);
  assert.ok(listRuns().some((r) => r.id === merged.run.id) && fs.existsSync(merged.wt));
});

test('REFUSED before anything is read: a flag `wf prune` does not take, and an id that is not a name', async (t) => {
  const b = board();
  const flag = await typed(t, b.e, 'prune', '--force');
  assert.equal(flag.error?.exitCode, 2);
  assert.match(flag.error!.message, /^wf prune does not take --force\./);
  for (const id of ['../x', 'r-1.pruned']) {
    assert.match(idRefusal(id, 'prune')!, /wf prune/);
    await assert.rejects(prune(b.e, id), (err: Error & { exitCode?: number }) => err.exitCode === 2 && /wf prune/.test(err.message), id);
  }
});

test('pruneLines and sizeOf say what a person reads', () => {
  assert.equal(sizeOf(3 * 1024 ** 3), '3.00 GB');
  assert.equal(sizeOf(1536 * 1024), '1.5 MB');
  assert.deepEqual(pruneLines({ id: 'r-1', kind: 'pruned', worktrees: [{ path: '/w/a', bytes: 2048 }], left: [{ path: '/w/b', git: 'fatal: nope' }] }), [
    'r-1  pruned: removed 1 worktree, 2.0 KB freed; its record, branches and files are kept',
    '   /w/a  2.0 KB',
    '   kept /w/b: git would not remove it — fatal: nope; look in it before anything is forced: git -C /w/b status',
  ]);
});
