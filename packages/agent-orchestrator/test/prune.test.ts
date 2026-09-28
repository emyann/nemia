/**
 * `wf prune`: a run's worktrees removed, and nothing else of it — over a store and repositories of its own, with git for real. A file of its
 * own, since `WF_ROOT` is read once, as the package loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from 'agent-runtime';
import type { TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-prune-');
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

/** A workflow of one step, `implement`, whose closeout names a file it leaves in its workspace — with a `budget:`, when given one. */
const oneStep = (budget?: number) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `${budget === undefined ? '' : `---\nbudget: ${budget}\n---\n`}implement it\n`);
  return dir;
};

/** Just enough engine: each task's phase, and its closeout on its one attempt once it has one, with what that attempt cost when it says. */
const board = () => {
  const tasks = new Map<string, { phase: TaskPhase; closeout?: unknown; usage?: object }>();
  const filings: string[] = [];
  const e = {
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id, phase: t?.phase ?? 'pending', sessionId: t ? 's' : null,
        state: {
          brief: t ? 'filed' : '', settled, stopRequested: false, said: [],
          attempts: !t || t.phase === 'pending' ? [] : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: null, usage: t.usage ?? null }],
        },
      };
    },
    file: async (spec: { id: string }) => { filings.push(spec.id); tasks.set(spec.id, { phase: 'pending' }); return spec.id; },
    stop: async () => {},
  } as unknown as Engine;
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, usage?: object) => tasks.set(id, { phase, closeout, usage });
  return { e, filings, settle };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/**
 * A run that is over: started for real, its one step filed in a worktree of its own, `work` committed on its branch, signed off, and handed
 * off by a pass — with a `node_modules` in the worktree that git ignores, holding a link out of it and a file of main's, hardlinked. Merged into `main` with `merged`.
 */
const aFinished = async (b: ReturnType<typeof board>, { merged = false, work = 'fix.ts', budget, costUsd, closeout = SIGNED }: { merged?: boolean; work?: string; budget?: number; costUsd?: number; closeout?: object | ((id: string) => object) } = {}) => {
  const repo = aRepo();
  const run = start({ brief: 'add a flag', repo, workflowDir: oneStep(budget) });
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
  // And a package of main's, hardlinked as the run provisions one: a megabyte removing the worktree does not free.
  fs.mkdirSync(path.join(repo, 'node_modules', 'big'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'node_modules', 'big', 'index.js'), 'y'.repeat(1024 * 1024));
  fs.mkdirSync(path.join(wt, 'node_modules', 'big'));
  fs.linkSync(path.join(repo, 'node_modules', 'big', 'index.js'), path.join(wt, 'node_modules', 'big', 'index.js'));
  b.settle(`${run.id}-implement`, 'succeeded', typeof closeout === 'function' ? closeout(run.id) : closeout, costUsd === undefined ? undefined : { costUsd });
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
  assert.ok(measured < 1024 * 1024, `and not a file main still holds, which removing the worktree does not free (${measured})`);

  const done = await typed(t, b.e, 'prune', run.id, '--yes');
  assert.equal(done.error, undefined);
  assert.match(done.printed.at(-2)!, new RegExp(`^${run.id}  pruned: removed 1 worktree, \\d+\\.\\d KB freed; its record, branches and files are kept$`));
  assert.ok(!fs.existsSync(wt) && !under('worktrees', run.id), 'the worktree, and the run\'s directory of them, are gone');
  assert.ok(!worktreesOf(repo).includes(fs.realpathSync(ROOT) + wt.slice(ROOT.length)), 'git lists it no more');
  assert.equal(fs.readFileSync(path.join(outside, 'precious.txt'), 'utf8'), 'keep me\n', 'a link in node_modules is not followed');
  assert.equal(fs.statSync(path.join(repo, 'node_modules', 'big', 'index.js')).size, 1024 * 1024, 'nor is main\'s file, hardlinked, touched');
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
  assert.equal(printed[0], `${run.id}  not pruned: it is not over — wf decide ${run.id} says it is still running. Pruning is not cancelling: wf cancel ${run.id} files nothing more, then wf prune ${run.id} --unmerged once what was in flight has settled.`);
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
  assert.equal(d.refusal, `${detached.wt} is on no branch — its HEAD is detached at ${head.slice(0, 7)} — and removing it would leave what it holds on none: put it on one (git -C ${detached.wt} switch -c <branch>), then wf prune ${detached.run.id} --unmerged.`);
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
  assert.equal(refused.refusal, `implement is still to be handed off — a pass commits what it left, and collects its files, from the worktree: let a tick run (wf tick), then wf prune ${run.id} --unmerged.`);
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

test('REFUSED at shipped defaults: whatever holds `wf rm` — a step waiting at its gate, named with the approval that answers it, and an ask no pass has spent, named with the file that takes it back', async (t) => {
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
  const gateWords = (flags: string) => `implement waits at its gate for your approval, and what waits on it is filed once it is approved: wf approve ${run.id} implement. Pruning is not cancelling: wf cancel ${run.id} files nothing more, then wf prune ${run.id}${flags}.`;
  const atGate = await prune(b.e, run.id, { yes: true, unmerged: true });
  assert.equal(atGate.kind, 'refused');
  // The prune it names is the one given, --unmerged kept: this run is not merged, and without it the next prune is refused in turn.
  assert.equal(atGate.refusal, gateWords(' --unmerged'));
  // Without --unmerged, the gate alone is said: --unmerged gets past no gate, so offering it would name a command that is refused in turn.
  const bare = await prune(b.e, run.id, { yes: true });
  assert.equal(bare.refusal, gateWords(''));
  assert.doesNotMatch(bare.refusal!, /--unmerged/);
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

  // Once what held it is cleared, the next prune says what is left: called off at its gate, the run that is not merged prunes with no word
  // more, since a cancelled run is never tried again (features.md, left for later); the gate no longer holds either way.
  assert.equal((await typed(t, b.e, 'cancel', run.id)).error, undefined);
  assert.equal((await prune(b.e, run.id, { yes: true })).kind, 'pruned');
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

test('REFUSED after a prune: a step over its budget is offered no raise — `decide`, `wf decide` and the api say the run was pruned where they said it waits on you, as `wf ls` does', async (t) => {
  const b = board();
  // Signed off blocked past its budget, and nothing about a budget holds `wf prune`: finished and not merged, it is pruned under --unmerged.
  const { run } = await aFinished(b, { budget: 3, costUsd: 3.4, closeout: { ...SIGNED, outcome: 'blocked', needs: 'a word' } });
  const before = await decide(b.e, run.id);
  assert.equal(before.overBudgetLine, 'OVER BUDGET, waiting on you: implement ($3.40 of $3)  — the run files nothing more for it on its own; nothing after it ran');
  assert.match(before.offers.join('\n'), new RegExp(`:  wf retry ${run.id} implement --budget <amount>`), 'its raise is offered before');
  assert.equal(before.answering.implement, `to answer it, its cap raised above $3.40:  wf retry ${run.id} implement --budget <amount> --message "<answer>"`);
  assert.match((await typed(t, b.e, 'ls', run.id)).printed.join('\n'), /waiting on you: implement/);
  assert.equal((await prune(b.e, run.id, { yes: true, unmerged: true })).kind, 'pruned');
  const at = readRun(run.id).pruned!.at;

  const d = await decide(b.e, run.id);
  assert.equal(d.decision.kind, 'awaiting', 'still a run to decide: its branch holds its work');
  assert.equal(d.overBudgetLine, `OVER BUDGET: implement ($3.40 of $3)  — nothing more is filed for it, raised or not, since the run was pruned at ${at} — its worktrees were removed (wf prune); nothing after it ran`);
  assert.deepEqual([d.offers, d.answering, d.gates], [[], {}, {}]);
  await assert.rejects(retry(b.e, run.id, 'implement', { mode: 'nudge', budget: 5 }), /was pruned at/, 'the raise the line used to point to is refused');

  const screen = (await typed(t, b.e, 'decide', run.id)).printed.join('\n');
  assert.ok(screen.includes(`\n  ${d.overBudgetLine}\n`), screen);
  assert.doesNotMatch(screen, /waiting on you/, screen);
  assert.doesNotMatch(screen, /wf (retry|round|accept|approve) /, 'no verb a pruned run refuses');
  assert.doesNotMatch((await typed(t, b.e, 'ls', run.id)).printed.join('\n'), /waiting on you/, 'and `wf ls` agrees');
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

/** A file in a run's files directory, as a step's check leaves one: its absolute path. */
const aShot = (id: string, name = 'shot.png', bytes = 32 * 1024): string => {
  const at = path.join(ROOT, 'runs', id, 'artifacts', 'implement', name);
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, 'p'.repeat(bytes));
  return at;
};

/** Runs the prune a refusal offers, as a person would type it, with `--yes`: the command is read off the refusal, never written here. */
const followed = async (t: TestContext, e: Engine, refusal: string) => {
  const command = /(wf prune \S+(?: --[a-z]+)*)\.$/.exec(refusal)?.[1];
  assert.ok(command, `a refusal that offers a prune: ${refusal}`);
  return { command, ...(await typed(t, e, ...command.split(' ').slice(1), '--yes')) };
};
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

test('`wf prune --artifacts` on a run that shipped: its worktree and its files, listed with their sizes until --yes, then removed — a link among the files as a link — and what freed said; its record, asks, inputs and rendered prompts are kept; `wf decide` reads it and says the files went; a second prune has nothing to do', async (t) => {
  const b = board();
  // The closeout names a shot in the step's files directory, as a step names a screenshot it took.
  const shotOf = (id: string) => path.join(ROOT, 'runs', id, 'artifacts', 'implement', 'shot.png');
  const run0 = await aFinished(b, { merged: true, closeout: (id) => ({ ...SIGNED, artifacts: [shotOf(id)] }) });
  const id = run0.run.id;
  const shot = aShot(id);
  assert.equal(shot, shotOf(id));
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
  assert.match(dry.printed[0]!, new RegExp(`^${id}  would remove 1 worktree and its files, \\d+\\.\\d KB$`));
  assert.match(dry.printed[1]!, new RegExp(`^   ${escaped(run0.wt)}  \\d+\\.\\d KB$`));
  assert.match(dry.printed[2]!, new RegExp(`^   ${escaped(files)}  \\d+\\.\\d KB$`));
  assert.equal(dry.printed[4], `nothing removed: wf prune ${id} --artifacts --yes removes them`);
  assert.ok(fs.existsSync(shot) && !under('runs', `${id}.pruned`), 'a dry run touches nothing');
  const measured = (await prune(b.e, id, { artifacts: true })).artifacts!.bytes;
  assert.ok(measured >= 32 * 1024, `what the files hold is counted (${measured})`);

  // Without the flag, the files are not offered: the worktree alone, as ever.
  assert.equal((await prune(b.e, id)).artifacts, undefined);

  const done = await typed(t, b.e, 'prune', id, '--artifacts', '--yes');
  assert.equal(done.error, undefined);
  assert.match(done.printed.join('\n'), new RegExp(`^${id}  pruned: removed 1 worktree and its files, \\d+\\.\\d KB freed; its record and branches are kept$`, 'm'));
  assert.ok(!fs.existsSync(files) && !fs.existsSync(run0.wt), 'the files and the worktree are gone');
  assert.equal(fs.readFileSync(path.join(outside, 'precious.png'), 'utf8'), 'keep me\n', 'a link among the files is not followed');
  for (const kept of ['inputs', 'agents']) assert.ok(under('runs', id, kept, 'kept.md'), `${kept} is kept`);
  assert.ok(under('runs', `${id}.json`) && under('runs', `${id}.asks`, 'done'), 'the record and the asks are kept');
  assert.ok(git(run0.repo, 'branch', '--list', run0.branch), 'and the branch');
  const pruned = readRun(id).pruned!;
  assert.equal(pruned.worktrees.length, 1);
  assert.equal(pruned.artifacts?.bytes, measured, 'the marker says what the files freed');
  assert.ok(pruned.artifacts?.at);

  const d = await decide(b.e, id);
  assert.equal(d.decision.kind, 'shipped');
  const screen = await typed(t, b.e, 'decide', id);
  assert.equal(screen.error, undefined, 'wf decide reads it');
  const text = screen.printed.join('\n');
  assert.equal(text.split('\n')[1], `  pruned at ${pruned.at} — its worktrees were removed (wf prune), and its files were removed at ${pruned.artifacts!.at} (wf prune --artifacts); its branches and record are kept`);
  assert.doesNotMatch(text, /not kept|missing/, 'a shipped run is said shipped, as before');

  // A run a person agreed to prune unmerged is still decided on its closeouts: a file its step named reads as pruned, not as never made.
  const open = await aFinished(b, { closeout: (id) => ({ ...SIGNED, artifacts: [shotOf(id)] }) });
  const openShot = aShot(open.run.id);
  assert.equal((await prune(b.e, open.run.id, { artifacts: true, unmerged: true, yes: true })).kind, 'pruned');
  const openAt = readRun(open.run.id).pruned!.artifacts!.at;
  const read = await typed(t, b.e, 'decide', open.run.id);
  assert.equal(read.error, undefined, 'wf decide reads it');
  const openText = read.printed.join('\n');
  assert.ok(openText.includes(`    !! not kept: ${openShot}  — its files were removed at ${openAt} (wf prune --artifacts)`), openText);
  assert.doesNotMatch(openText, /!! missing|not there/, 'the file is not said to be missing as if never written');
  assert.ok(shot, 'the shot the shipped run named went too');

  const again = await prune(b.e, id, { artifacts: true, yes: true });
  assert.deepEqual([again.kind, again.nothing], ['nothing', `its worktrees were removed at ${pruned.at} (wf prune), and its files were removed at ${pruned.artifacts!.at} (wf prune --artifacts)`]);
  assert.deepEqual(readRun(id).pruned, pruned, 'a prune with nothing to do leaves the marker as it was');
  await assert.rejects(retry(b.e, id, 'implement', { mode: 'nudge' }), (err: Error) => err.message.startsWith(`${id} was pruned at ${pruned.at}: its worktrees were removed (wf prune), its files at ${pruned.artifacts!.at} (wf prune --artifacts), and a retry would file work into one of them.`));
});

test('`wf prune --artifacts` of a run whose worktrees a plain prune already removed: its files alone, the worktrees\' time kept; and of a run that cut none, its files alone, which then reads pruned', async (t) => {
  const b = board();
  const { run } = await aFinished(b, { merged: true });
  aShot(run.id);
  assert.equal((await prune(b.e, run.id, { yes: true })).kind, 'pruned');
  const first = readRun(run.id).pruned!;
  assert.ok(under('runs', run.id, 'artifacts', 'implement', 'shot.png'), 'a plain prune keeps the files');
  const files = await prune(b.e, run.id, { artifacts: true, yes: true });
  assert.deepEqual([files.kind, files.worktrees, files.left], ['pruned', [], []]);
  assert.ok(files.artifacts!.bytes >= 32 * 1024);
  assert.deepEqual(pruneLines(files)[0], `${run.id}  pruned: removed its files, ${sizeOf(files.artifacts!.bytes)} freed; its record and branches are kept`);
  const after = readRun(run.id).pruned!;
  assert.deepEqual([after.at, after.worktrees], [first.at, first.worktrees], 'when the worktrees went, and which, is as it was');
  assert.ok(after.artifacts && !under('runs', run.id, 'artifacts'));

  // A run that worked in its repository itself: nothing but its files to give back, and pruned once they go.
  const inPlace = start({ brief: 'in place', repo: aRepo(), workflowDir: oneStep(), isolate: false });
  await advance(b.e, readRun(inPlace.id));
  b.settle(`${inPlace.id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(inPlace.id));
  aShot(inPlace.id);
  assert.deepEqual([(await prune(b.e, inPlace.id)).kind, (await prune(b.e, inPlace.id)).nothing], ['nothing', `it cut no worktree — it worked in ${inPlace.repo} itself`], 'without the flag, nothing');
  assert.equal((await prune(b.e, inPlace.id, { artifacts: true, yes: true })).refusal, `it finished on main itself and waits on your decision: pruned, none of its steps can be tried again, sent round or approved, and its files are part of what you read to decide it. Decide it first, or prune it all the same: wf prune ${inPlace.id} --unmerged --artifacts.`);
  assert.ok(under('runs', inPlace.id, 'artifacts', 'implement', 'shot.png') && !under('runs', `${inPlace.id}.pruned`), 'refused: its files kept, and no mark');
  // The command it offers is the one that prunes them: the plain --unmerged of a run that cut no worktree has nothing to prune.
  const bare = await followed(t, b.e, (await prune(b.e, inPlace.id, { artifacts: true, yes: true })).refusal!);
  assert.equal(bare.error, undefined, bare.command);
  assert.ok(bare.printed.includes(`${inPlace.id}  pruned: removed its files, 40.0 KB freed; its record and branches are kept`), bare.printed.join('\n'));
  assert.ok(!under('runs', inPlace.id, 'artifacts'), 'its files gone');
  const marked = readRun(inPlace.id).pruned!;
  assert.deepEqual(marked.worktrees, []);
  assert.equal(marked.at, marked.artifacts!.at);
  await assert.rejects(retry(b.e, inPlace.id, 'implement', { mode: 'nudge' }), (err: Error) => err.message.startsWith(`${inPlace.id} was pruned at ${marked.at}: its files were removed (wf prune --artifacts), and a retry would file work`));
  const screen = await typed(t, b.e, 'decide', inPlace.id);
  assert.equal(screen.error, undefined);
  assert.equal(screen.printed.join('\n').split('\n')[1], `  pruned at ${marked.at} — its files were removed at ${marked.at} (wf prune --artifacts); its branches and record are kept`);
  assert.equal((await prune(b.e, inPlace.id, { artifacts: true })).nothing, `it cut no worktree — it worked in ${inPlace.repo} itself, and its files were removed at ${marked.at} (wf prune --artifacts)`);
});

test('`wf prune --artifacts` marks the run before its files go, and a prune that removed nothing takes the mark back — gone on a run never pruned, as it was on one that was', async (t) => {
  const b = board();
  const { run } = await aFinished(b, { merged: true });
  aShot(run.id);
  // The order, seen from inside the removal: the marker already says the files go.
  const rm = fs.rmSync;
  let seen: unknown;
  const mocked = t.mock.method(fs, 'rmSync', (at: fs.PathLike, opts?: fs.RmOptions) => {
    if (String(at).endsWith(path.join(run.id, 'artifacts'))) seen = JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.pruned`), 'utf8'));
    return rm(at, opts);
  });
  assert.equal((await prune(b.e, run.id, { artifacts: true, yes: true })).kind, 'pruned');
  mocked.mock.restore();
  assert.ok((seen as { artifacts?: unknown } | undefined)?.artifacts, `marked before the removal: ${JSON.stringify(seen)}`);

  if (process.getuid?.() === 0) return t.skip('root removes what a mode forbids');
  // Files that will not go, of runs with no worktree to remove: a directory nobody may write in.
  const locked = (id: string) => {
    aShot(id);
    fs.chmodSync(path.join(ROOT, 'runs', id, 'artifacts', 'implement'), 0o555);
    t.after(() => fs.chmodSync(path.join(ROOT, 'runs', id, 'artifacts', 'implement'), 0o755));
  };
  const inPlace = start({ brief: 'in place', repo: aRepo(), workflowDir: oneStep(), isolate: false });
  await advance(b.e, readRun(inPlace.id));
  b.settle(`${inPlace.id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(inPlace.id));
  locked(inPlace.id);
  const never = await prune(b.e, inPlace.id, { artifacts: true, yes: true, unmerged: true });
  assert.equal(never.kind, 'pruned');
  assert.equal(never.artifacts, undefined, 'nothing freed');
  assert.equal(never.left.length, 1);
  assert.match(pruneLines(never).at(-1)!, new RegExp(`^   kept what is left in ${escaped(path.join(ROOT, 'runs', inPlace.id, 'artifacts'))}: .*EACCES.* — what is still there is read as before; wf prune ${inPlace.id} --unmerged --artifacts removes it once it can be$`));
  assert.ok(!under('runs', `${inPlace.id}.pruned`), 'a run never pruned is not marked');
  const cli = await typed(t, b.e, 'prune', inPlace.id, '--artifacts', '--yes', '--unmerged');
  assert.equal(cli.error?.exitCode, 2, 'and the verb says it was not pruned');

  const shipped = await aFinished(b, { merged: true });
  assert.equal((await prune(b.e, shipped.run.id, { yes: true })).kind, 'pruned');
  const marker = fs.readFileSync(path.join(ROOT, 'runs', `${shipped.run.id}.pruned`), 'utf8');
  locked(shipped.run.id);
  const again = await prune(b.e, shipped.run.id, { artifacts: true, yes: true });
  assert.deepEqual([again.worktrees, again.artifacts, again.left.length], [[], undefined, 1]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${shipped.run.id}.pruned`), 'utf8')), JSON.parse(marker), 'a run pruned before keeps the marker it had');
});

test('REFUSED at shipped defaults under --artifacts: a run not over, a finished run not merged, a folder run, one at its gate, and a worktree holding a change — its files and its worktree kept, and no mark', async (t) => {
  const b = board();
  const kept = (id: string, shot: string) => assert.ok(fs.existsSync(shot) && !under('runs', `${id}.pruned`), id);

  const running = start({ brief: 'still running', repo: aRepo(), workflowDir: oneStep() });
  await advance(b.e, readRun(running.id));
  const runningShot = aShot(running.id);
  const r = await typed(t, b.e, 'prune', running.id, '--artifacts', '--yes', '--unmerged');
  assert.equal(r.error?.exitCode, 2);
  assert.match(r.printed[0]!, new RegExp(`^${running.id}  not pruned: it is not over — `));
  kept(running.id, runningShot);

  const unmerged = await aFinished(b);
  const unmergedShot = aShot(unmerged.run.id);
  const u = await prune(b.e, unmerged.run.id, { artifacts: true, yes: true });
  assert.equal(u.refusal, `it finished and is not merged into main: pruned, none of its steps can be tried again, sent round or approved, and its branch is the one place its work is left. Merge it first, or prune it all the same: wf prune ${unmerged.run.id} --unmerged --artifacts.`);
  kept(unmerged.run.id, unmergedShot);
  // Once its worktree is gone by a plain prune under --unmerged, its files are still asked for: that word was for the worktree.
  assert.equal((await prune(b.e, unmerged.run.id, { yes: true, unmerged: true })).kind, 'pruned');
  const mark = fs.readFileSync(path.join(ROOT, 'runs', `${unmerged.run.id}.pruned`), 'utf8');
  const after = await prune(b.e, unmerged.run.id, { artifacts: true, yes: true });
  assert.equal(after.refusal, u.refusal, 'refused with the not-merged words');
  assert.ok(fs.existsSync(unmergedShot), 'its files kept');
  assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${unmerged.run.id}.pruned`), 'utf8'), mark, 'and its mark as it was');
  // With no run named, it is refused there too, and its line says why.
  const all = await typed(t, b.e, 'prune', '--artifacts', '--yes');
  assert.ok(all.printed.includes(`${unmerged.run.id}  not pruned: ${u.refusal}`), all.printed.join('\n'));
  assert.ok(fs.existsSync(unmergedShot), 'its files kept by the prune of every run');
  assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${unmerged.run.id}.pruned`), 'utf8'), mark);
  // The command it offers is the one that takes them, not the plain --unmerged already run, which now has nothing to prune.
  const offered = await followed(t, b.e, after.refusal!);
  assert.equal(offered.error, undefined, offered.command);
  assert.ok(offered.printed.includes(`${unmerged.run.id}  pruned: removed its files, 40.0 KB freed; its record and branches are kept`), offered.printed.join('\n'));
  assert.ok(!fs.existsSync(unmergedShot) && !under('runs', unmerged.run.id, 'artifacts'), 'its files gone');

  const team = fs.mkdtempSync(path.join(ROOT, 'team-'));
  fs.writeFileSync(path.join(team, 'write.md'), '---\nworkspace: folder\npermissionMode: dontAsk\n---\nwrite the note\n');
  const folder = start({ brief: 'a note', repo: fs.mkdtempSync(path.join(ROOT, 'not-a-repo-')), workflowDir: team });
  await advance(b.e, readRun(folder.id));
  b.settle(`${folder.id}-write`, 'succeeded', SIGNED);
  await advance(b.e, readRun(folder.id));
  const folderShot = aShot(folder.id);
  assert.match((await prune(b.e, folder.id, { artifacts: true, yes: true, unmerged: true })).refusal!, /^a folder run: /);
  kept(folder.id, folderShot);

  const gated = fs.mkdtempSync(path.join(ROOT, 'gated-'));
  fs.writeFileSync(path.join(gated, 'implement.md'), '---\ngate: true\n---\nimplement it\n');
  fs.writeFileSync(path.join(gated, 'review.md'), '---\nafter: implement\n---\nreview it\n');
  const atGate = start({ brief: 'at its gate', repo: aRepo(), workflowDir: gated });
  await advance(b.e, readRun(atGate.id));
  b.settle(`${atGate.id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(atGate.id));
  const gateShot = aShot(atGate.id);
  assert.match((await prune(b.e, atGate.id, { artifacts: true, yes: true, unmerged: true })).refusal!, new RegExp(`^implement waits at its gate for your approval`));
  kept(atGate.id, gateShot);

  const dirty = await aFinished(b, { merged: true });
  fs.writeFileSync(path.join(dirty.wt, 'notes.md'), 'notes\n');
  const dirtyShot = aShot(dirty.run.id);
  assert.match((await prune(b.e, dirty.run.id, { artifacts: true, yes: true })).refusal!, /holds changes no commit has \(notes\.md\)/);
  kept(dirty.run.id, dirtyShot);

  // And a flag near it is not taken for it.
  const flag = await typed(t, b.e, 'prune', '--artifact');
  assert.equal(flag.error?.exitCode, 2);
  assert.match(flag.error!.message, /^wf prune does not take --artifact\. .*--artifacts/);
});

test('pruneLines and sizeOf say what a person reads', () => {
  assert.equal(sizeOf(3 * 1024 ** 3), '3.00 GB');
  assert.equal(sizeOf(1536 * 1024), '1.5 MB');
  assert.deepEqual(pruneLines({ id: 'r-1', kind: 'pruned', worktrees: [{ path: '/w/a', bytes: 2048 }], left: [{ path: '/w/b', git: 'fatal: nope' }] }), [
    'r-1  pruned: removed 1 worktree, 2.0 KB freed; its record, branches and files are kept',
    '   /w/a  2.0 KB',
    '   kept /w/b: git would not remove it — fatal: nope; look in it before anything is forced: git -C /w/b status',
  ]);
  // Files that would not go are offered the prune that removes them later: given --unmerged, repeated, or a run nobody decided is refused it.
  const files = { path: '/s/runs/r-1/artifacts', files: 'EACCES' } as const;
  assert.equal(pruneLines({ id: 'r-1', kind: 'pruned', worktrees: [], left: [files], unmerged: true }).at(-1), '   kept what is left in /s/runs/r-1/artifacts: EACCES — what is still there is read as before; wf prune r-1 --unmerged --artifacts removes it once it can be');
  assert.equal(pruneLines({ id: 'r-1', kind: 'pruned', worktrees: [], left: [files] }).at(-1), '   kept what is left in /s/runs/r-1/artifacts: EACCES — what is still there is read as before; wf prune r-1 --artifacts removes it once it can be');
});
