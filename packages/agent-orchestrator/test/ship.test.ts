/**
 * The end of a run, on disk: a workflow whose last step merges, in a real repository.
 *
 * What a gate means to `assess`, `listing` and `decision` is pure, and lives in run.test.ts. This is the part that is not: a run whose
 * ending step is never filed until a person approves it, the merge that step's own prose describes run against real git, and what the
 * checkout looks like when its check refuses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from 'agent-runtime';
import type { TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-ship-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
const { accept, advance, approve, cancel, decide, forget, isShipped, list, readRun, retry, round, start } = await import('../src/runner.ts');
const { main } = await import('../src/cli.ts');
const { abortMerge, commitMerge, mergeInProgress, mergeState } = await import('../src/worktree.ts');

const REPO_ROOT = path.join(import.meta.dirname, '..', '..', '..');
// The shipped agents, beside every folder this file makes under ROOT: the shipped ship.md names `agent: shipper`, and its recipe is there.
fs.cpSync(path.join(REPO_ROOT, 'workflows', 'agents'), path.join(ROOT, 'agents'), { recursive: true });
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A repository with one file committed on main. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'add.ts'), 'export const add = (a, b) => a + b;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
};

/**
 * `implement → ship`, with the shipped `workflows/dev/ship.md` as its ending — the file a person reads, its prose and its keys — with
 * only its `after:` changed, since this folder has no review. A folder written here would not test what the repository ships.
 */
const folder = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\n---\nimplement it\n');
  const shipped = fs.readFileSync(path.join(REPO_ROOT, 'workflows', 'dev', 'ship.md'), 'utf8');
  assert.match(shipped, /^after: review$/m);
  fs.writeFileSync(path.join(dir, 'ship.md'), shipped.replace(/^after: review$/m, 'after: implement'));
  return dir;
};

/** An engine board a test settles by hand, as gate.test.ts's: what each task was filed with, and every filing. */
const board = () => {
  type Filed = { id: string; brief: string; cwd?: string; closeoutSchema?: object } & Record<string, unknown>;
  const tasks = new Map<string, { spec: Filed; phase: TaskPhase; closeout?: unknown; exitCode?: number }>();
  const filings: string[] = [];
  const e = {
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id, phase: t?.phase ?? 'pending', sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '', closeoutSchema: t?.spec.closeoutSchema, settled, stopRequested: false, said: [],
          attempts: !t || t.phase === 'pending' ? [] : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: t.exitCode ?? null, usage: null }],
        },
      };
    },
    file: async (spec: Filed) => { filings.push(spec.id); tasks.set(spec.id, { spec, phase: 'pending' }); return spec.id; },
    stop: async () => {},
    // A check's log ends in the trailer its script writes (`readVerdict`), where it exited; `wf ls` and `wf decide` read the code there.
    logs: async (id: string) => (typeof tasks.get(id)?.exitCode === 'number' ? `[wf check] exit ${tasks.get(id)!.exitCode}\n` : '(no output yet)'),
    feed: async () => ({ entries: [], cursor: 0 }),
  } as unknown as Engine;
  // A check's exit code, where it is given: a check settled with none did not finish (`exitVerdicts`).
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, exitCode?: number) => Object.assign(tasks.get(id)!, { phase, closeout, exitCode });
  return { e, tasks, filings, settle };
};

/**
 * `implement ⇄ review → ship`, as the dev folders are, with the shipped `workflows/dev/ship.md` as its ending, whose `after: review` is
 * what this folder has: what a person types `wf round` at once the loop has handed on.
 */
const loopingFolder = (rounds = 3): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-loop-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), `---\nafter: implement\noutput: review.schema.json\nloop: implement\nrounds: ${rounds}\n---\nreview it\n`);
  fs.writeFileSync(path.join(dir, 'review.schema.json'), JSON.stringify({
    type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false,
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'ship.md'), fs.readFileSync(path.join(REPO_ROOT, 'workflows', 'dev', 'ship.md'), 'utf8'));
  return dir;
};

/**
 * A folder whose ONE step merges: the shipped `workflows/dev/ship.md` with its `after:` dropped, which `validateMainWorkspace` allows —
 * nothing waits on it, and nothing ends the workflow beside it. Its ending is also its root, which is the one way a run with nothing filed
 * can be the run that wants the checkout.
 */
const mergeOnly = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-merge-'));
  const shipped = fs.readFileSync(path.join(REPO_ROOT, 'workflows', 'dev', 'ship.md'), 'utf8');
  fs.writeFileSync(path.join(dir, 'ship.md'), shipped.replace(/^after: review\n/m, ''));
  return dir;
};

/**
 * `implement → ship` with the shipped ship.md's `check:` line taken out: an ending as every run froze one before the run landed its merges,
 * whose own session runs the check and commits, in its prose. Nothing of the run lands such a merge (`landsOnCheck`).
 */
const uncheckedFolder = (): string => {
  const dir = folder();
  const file = path.join(dir, 'ship.md');
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /^check: .+\n/m);
  fs.writeFileSync(file, text.replace(/^check: .+\n/m, ''));
  return dir;
};

/** A folder of one step, for a run started `--after` another. */
const oneStep = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\n---\nimplement it\n');
  return dir;
};

const SIGNED = { outcome: 'done', summary: 'did the work', artifacts: [], needs: null };
const BLOCKED = { outcome: 'blocked', summary: 'the check refused', artifacts: [], needs: 'read the suite' };

/**
 * A run of `implement → ship` with implement done and committed on its branch: the run at its result, waiting at the ending's gate.
 *
 * A repository and a board of its own, unless it is given them: two runs of one repository, on one board, are two endings for one checkout.
 */
async function atTheGate(given: { repo?: string; board?: ReturnType<typeof board>; dir?: string } = {}) {
  const repo = given.repo ?? aRepo();
  const run = start({ brief: 'add sub', repo, workflowDir: given.dir ?? folder() });
  const { e, tasks, filings, settle } = given.board ?? board();
  await advance(e, readRun(run.id));
  const work = readRun(run.id).steps.implement!;
  fs.appendFileSync(path.join(work.workspace!, 'add.ts'), 'export const sub = (a, b) => a - b;\n');
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  const pass = await advance(e, readRun(run.id));
  return { repo, id: run.id, branch: work.branch!, e, tasks, filings, settle, pass, base: git(repo, 'rev-parse', 'HEAD') };
}

test('`wf start` on a folder with an ending says so: nothing of that step runs until a person approves it', async (t) => {
  const repo = aRepo();
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.map(String).join(' ')); });
  try { await main(['start', 'add sub', '--repo', repo, '--workflows', folder()], {} as Engine); } finally { log.mock.restore(); }
  const id = printed[0]!.split(' ')[0]!;
  assert.equal(printed[0], `${id}  2 step(s): implement → ship (shipper)`, "the shipped ship.md names its agent");
  assert.ok(printed.includes(`ends at: ship — nothing of it runs until wf approve ${id} ship, which is what files it`), printed.join('\n'));
  assert.ok(!printed.some((l) => l.startsWith('gated at:')), 'an ending is not a handoff waiting to be let through');
});

test('a run stops at its ending step: nothing of it is filed, the checkout is untouched, and `wf ls` says what is to be decided', async () => {
  const { repo, id, branch, e, filings, pass, base } = await atTheGate();
  assert.deepEqual([pass.filed, pass.status], [[], 'failed'], 'the ending is not filed, and the run reads as one waiting on a person');
  assert.deepEqual(filings, [`${id}-implement`]);
  assert.equal(readRun(id).steps.ship!.taskId, null);
  assert.equal(git(repo, 'rev-parse', 'HEAD'), base, 'the base branch has not moved');
  assert.equal(git(repo, 'status', '--porcelain'), '', 'and the checkout is clean');

  const listed = await list(e, readRun(id));
  assert.equal(listed.steps.find((s) => s.name === 'ship')?.status, 'awaiting approval');
  assert.deepEqual(listed.toDecide, {
    kind: 'approve', step: 'ship',
    says: "Ship it: stage the merge of this run's result onto the base branch, and sign off with the message to commit it with.",
  });
  // Pass after pass: the gate is read off the world each time, and nothing is spent while it holds.
  const again = await advance(e, readRun(id));
  assert.deepEqual([again.filed, again.checked, again.tried], [[], [], []]);
  assert.equal(isShipped(readRun(id), branch), false);
});

test("REFUSED at shipped defaults: an ending's gate whose result a person merged by hand — the run has shipped as git reads it, a run `--after` it starts, every screen agrees, and `wf approve` names `wf cancel` instead", async (t) => {
  const { repo, id, branch, e, filings } = await atTheGate();
  assert.equal((await list(e, readRun(id))).toDecide?.kind, 'approve', 'at its gate, with the branch ahead: a decision to make');
  // A run waiting on it: nothing of it is filed while the result is off the base.
  const child = start({ brief: 'read the flag', repo, workflowDir: oneStep(), after: [id] });
  assert.deepEqual((await advance(e, readRun(child.id))).filed, [], 'the child waits on a run that has not shipped');

  // A person merges the result by hand, as happened to the run that built the checkout hold. Nobody tells the run.
  git(repo, 'merge', '--no-ff', '--no-edit', branch);
  assert.equal(isShipped(readRun(id), branch), true);

  // `wf ls`: nothing to decide, nobody waited on, and the ending's line says where the branch stands and the one command there still is.
  const listed = await list(e, readRun(id));
  assert.equal(listed.toDecide, undefined, 'nothing to decide: git already has the result');
  assert.deepEqual(listed.waitingOnYou, [], 'and nobody is waited on for an approval that would be refused');
  const ship = listed.steps.find((s) => s.name === 'ship')!;
  assert.deepEqual([ship.status, ship.note], ['awaiting approval',
    `${branch} is on main — nothing is left for ship to merge: the run has shipped as git reads it, and nothing waits on you; close the record if you want it closed: wf cancel ${id}`]);
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.map(String).join(' ')); });
  try { await main(['ls', id], e); } finally { log.mock.restore(); }
  assert.ok(!printed.some((l) => l.includes('→ to decide') || l.includes('→ waiting on you')), printed.join('\n'));
  assert.ok(printed.some((l) => l.includes(`${branch} is on main — nothing is left for ship to merge`)), printed.join('\n'));

  // `wf decide` says the same, before anybody closes the record: shipped, the ending never ran, and no AWAITING APPROVAL above a branch on main.
  const { decision } = await decide(e, id);
  assert.deepEqual([decision.kind, decision.kind === 'shipped' ? decision.branches : []], ['shipped', [branch]]);
  const screen: string[] = [];
  const log2 = t.mock.method(console, 'log', (...args: unknown[]) => { screen.push(args.map(String).join(' ')); });
  try { await main(['decide', id], e); } finally { log2.mock.restore(); }
  assert.ok(screen.some((l) => l.endsWith(`\n\n  shipped — ${branch} is already on main\n  ship never ran: nothing is left for it to merge, and nothing waits on you — close the record if you want it closed: wf cancel ${id}`)), screen.join('\n'));
  assert.ok(!screen.some((l) => l.includes('AWAITING APPROVAL') || l.includes('wf approve')), screen.join('\n'));

  // `wf approve`: refused, saying so, and naming what to type if the record should be closed.
  await assert.rejects(approve(e, id, 'ship', 'Merge it.'), (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.equal(err.message, `${branch} is on main, so there is nothing left for ship to merge: approving would file it to merge what the base branch already has. `
      + `The run has shipped as git reads it — wf decide ${id} says so, and a run started --after it goes on without ship. Nothing waits on you; if you want the record closed: wf cancel ${id}.`);
    return true;
  });
  assert.deepEqual(readRun(id).approvals ?? [], [], 'nothing was written');

  // And ship is never filed: pass after pass, nothing of it runs — while the run that waited on it starts, on git's word.
  for (const pass of [1, 2]) assert.deepEqual((await advance(e, readRun(id))).filed, [], `pass ${pass}`);
  assert.deepEqual(filings, [`${id}-implement`]);
  assert.equal(readRun(id).steps.ship!.taskId, null);
  assert.deepEqual((await advance(e, readRun(child.id))).filed, ['implement'], 'the child starts: its parent has shipped');

  // The command it names is honoured, once the child has started: the record is closed, and there is nothing to decide about it.
  await cancel(e, id);
  assert.equal((await decide(e, id)).decision.kind, 'cancelled');
});

test("`wf rm` of a run whose ending never ran and whose result a person merged by hand forgets it: the gate holds nothing, so the approval it named is not named", async () => {
  const { repo, id, branch, e } = await atTheGate();
  const held = await forget(e, id);
  assert.equal(held.kind, 'refused', 'at its gate with the branch ahead, the run is held');
  assert.match(held.kind === 'refused' ? held.refusal : '', new RegExp(`ship waits at its gate for your approval, and it is filed once it is approved: wf approve ${id} ship`));

  git(repo, 'merge', '--no-ff', '--no-edit', branch);
  const forgot = await forget(e, id);
  assert.equal(forgot.kind, 'forgotten', forgot.kind === 'refused' ? forgot.refusal : '');
  assert.equal(fs.existsSync(path.join(ROOT, 'runs', `${id}.json`)), false);
});

test("an ending's gate is a decision again once the base branch no longer has the result: git is read each pass, and the approval is honoured", async () => {
  const { repo, id, branch, e, base } = await atTheGate();
  git(repo, 'merge', '--no-ff', '--no-edit', branch);
  assert.equal((await list(e, readRun(id))).toDecide, undefined);
  // Taken back — the merge reset away before anybody pushed it: the branch is ahead again, and the gate is a person's word again.
  git(repo, 'reset', '-q', '--hard', base);
  const listed = await list(e, readRun(id));
  assert.equal(listed.toDecide?.kind, 'approve');
  assert.match(listed.steps.find((s) => s.name === 'ship')!.note ?? '', /^approve it: wf approve /);
  assert.equal((await approve(e, id, 'ship')).approval.step, 'ship');
  assert.deepEqual((await advance(e, readRun(id))).filed, ['ship']);
});

test('an approved ending with no check of its own is filed, in the repository\'s own checkout, and the merge its prose describes ships the run', async () => {
  const { repo, id, branch, e, tasks, settle, base } = await atTheGate({ dir: uncheckedFolder() });
  const { approval } = await approve(e, id, 'ship', 'Merge it.');
  assert.deepEqual([approval.step, approval.try], ['ship', 1]);

  const filed = await advance(e, readRun(id));
  assert.deepEqual(filed.filed, ['ship'], 'the approval is what files it');
  const spec = tasks.get(`${id}-ship`)!.spec;
  assert.equal(spec.cwd, repo, "in the repository's own checkout, not a worktree");
  assert.equal(readRun(id).steps.ship!.workspace, repo);
  // It is told where the work is — the branch and the base — and what the person said when they approved it.
  assert.match(spec.brief, new RegExp(`You are in ${repo}, the repository's own checkout, on main`));
  assert.match(spec.brief, new RegExp(`git log --oneline main\\.\\.${branch}`));
  assert.match(spec.brief, /## Approved\n\nA person approved this step before it was filed/);
  assert.match(spec.brief, /Merge it\./);
  // With no check of its own it is told nothing of the run's landing, which it does not have, and its recipe's fallback is its own.
  assert.doesNotMatch(spec.brief, /## The run checks and lands your merge/);

  // The step, played as its own prose says: trial merge, the check, the commit — with a message it writes, into the directory its brief
  // names under *Files for the person who decides*, outside the checkout, and commits with `-F`. Not git's `Merge branch '…'`.
  git(repo, 'merge', '--no-ff', '--no-commit', branch);
  const files = spec.brief.match(/## Files for the person who decides\n\nA report, a log or a screenshot reaches them one way: put it in `([^`]+)`/)?.[1];
  assert.ok(files && path.isAbsolute(files) && !files.startsWith(repo), `the brief names a directory outside the checkout\n\n${spec.brief}`);
  const message = path.join(files, 'merge-message.txt');
  fs.writeFileSync(message, `Add sub\n\nadd.ts exports sub beside add.\nRun ${id}, ${branch}: 1 commit; the check passed on the merged tree.\n`);
  git(repo, 'commit', '-F', message);
  const merged = git(repo, 'rev-parse', 'HEAD');
  settle(`${id}-ship`, 'succeeded', { ...SIGNED, artifacts: [message] });
  await advance(e, readRun(id));

  const record = readRun(id);
  assert.notEqual(git(repo, 'rev-parse', 'HEAD'), base, 'the base branch has moved');
  assert.equal(git(repo, 'log', '-1', '--format=%s'), 'Add sub', 'under the subject the step wrote');
  assert.equal(git(repo, 'log', '-1', '--format=%(trailers)'), '', 'with no trailer');
  assert.equal(git(repo, 'status', '--porcelain'), '', 'and nothing is left in the checkout, the message included');
  assert.equal(isShipped(record, branch), true);
  const { decision, toDecide, standings } = await decide(e, id);
  assert.deepEqual([decision.kind, toDecide, standings], ['shipped', undefined, [{ branch, where: 'on' }]]);
  // The run committed nothing of its own in that checkout: the merge commit is the step's, and the only one.
  assert.equal(git(repo, 'rev-parse', 'HEAD'), merged);
  assert.equal(git(repo, 'log', '-1', '--format=%P').split(' ').length, 2, 'a merge, of the base and the branch');
  assert.equal(record.steps.ship!.landed, undefined, 'and the run wrote nothing of a landing it did not make');
  assert.equal(record.steps.ship!.check, undefined, 'nor filed a check');
});

test("mergeState reads the checkout as a landing needs it: whose merge is staged, a conflict, a result branch it leaves out; commitMerge and abortMerge end it", () => {
  const repo = aRepo();
  const branch = (name: string, file: string, text: string) => {
    git(repo, 'checkout', '-q', '-b', name, 'main');
    fs.writeFileSync(path.join(repo, file), text);
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', name);
    git(repo, 'checkout', '-q', 'main');
    return git(repo, 'rev-parse', name);
  };
  const a = branch('wf/r/a', 'a.ts', 'a\n');
  const b = branch('wf/r/b', 'b.ts', 'b\n');
  const base = git(repo, 'rev-parse', 'HEAD');
  const tips = { 'wf/r/a': a, 'wf/r/b': b };
  assert.deepEqual(mergeState(repo, tips), { merging: 'none', conflicted: false, missing: ['wf/r/a', 'wf/r/b'], head: base });
  assert.equal(mergeInProgress(repo), false);

  git(repo, 'merge', '--no-ff', '--no-commit', 'wf/r/a');
  assert.equal(mergeInProgress(repo), true, 'read off the file alone, which is all a pass asks of a checkout with no landing due');
  assert.deepEqual(mergeState(repo, tips), { merging: 'ours', conflicted: false, missing: ['wf/r/b'], head: base }, 'one branch of two staged');
  assert.equal(mergeState(repo, { 'wf/r/b': b }).merging, 'other', "a merge of a commit that is not one of the run's tips is another's");
  assert.equal(abortMerge(repo), undefined);
  assert.equal(git(repo, 'status', '--porcelain'), '');
  assert.match(abortMerge(repo)!.error, /MERGE_HEAD|no merge/i, 'with nothing to abort, git says why');

  git(repo, 'merge', '--no-ff', '--no-commit', 'wf/r/a', 'wf/r/b');
  assert.deepEqual(mergeState(repo, tips), { merging: 'ours', conflicted: false, missing: [], head: base });
  const made = commitMerge(repo, 'Add a and b\n\nboth.\n');
  assert.ok('commit' in made);
  assert.equal(git(repo, 'log', '-1', '--format=%B'), 'Add a and b\n\nboth.');
  assert.equal(git(repo, 'log', '-1', '--format=%P').split(' ').length, 3, 'an octopus of the base and both tips');
  assert.deepEqual(mergeState(repo, tips), { merging: 'none', conflicted: false, missing: [], head: made.commit }, 'both on HEAD');

  // A conflict is staged as a merge in progress, with its paths unmerged.
  const c1 = branch('wf/r/c1', 'c.ts', 'one\n');
  const c2 = branch('wf/r/c2', 'c.ts', 'two\n');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'c1', 'wf/r/c1');
  assert.throws(() => git(repo, 'merge', '--no-ff', '--no-commit', 'wf/r/c2'));
  assert.deepEqual(mergeState(repo, { 'wf/r/c1': c1, 'wf/r/c2': c2 }).conflicted, true);
  assert.ok('error' in commitMerge(repo, 'never\n'), 'git refuses to commit a conflict');
  assert.equal(abortMerge(repo), undefined);
  assert.equal(git(repo, 'status', '--porcelain'), '');
  assert.equal(mergeInProgress(repo), false);

  // A linked worktree's `.git` is a file naming its own git directory, and its merge is read there.
  const linked = path.join(path.dirname(repo), `${path.basename(repo)}-linked`);
  const d = branch('wf/r/d', 'd.ts', 'd\n');
  git(repo, 'worktree', 'add', '-q', '-b', 'side', linked, 'main');
  assert.ok(fs.statSync(path.join(linked, '.git')).isFile());
  git(linked, 'merge', '--no-ff', '--no-commit', 'wf/r/d');
  assert.equal(mergeInProgress(linked), true);
  assert.equal(mergeInProgress(repo), false, "the main checkout's own merge is its own");
  assert.equal(mergeState(linked, { 'wf/r/d': d }).merging, 'ours');
  assert.equal(abortMerge(linked), undefined);
  assert.equal(mergeInProgress(linked), false);
  assert.equal(mergeInProgress(path.join(repo, 'no-such')), false, 'no checkout, no merge');
});

const MESSAGE = 'Add sub\n\nadd.ts exports sub beside add.\nThe run, its branch: 1 commit; the check on the merged tree.\n';

/**
 * A run at its ending, approved and filed, whose shipper did as its recipe says: staged the merge of the result in the repository's checkout
 * and signed off `done` with the message — and the pass after, which files ship's check on that merge.
 */
async function stagedAndSigned(given: { repo?: string; board?: ReturnType<typeof board>; message?: string } = {}) {
  const at = await atTheGate(given);
  await approve(at.e, at.id, 'ship', 'Merge it.');
  assert.deepEqual((await advance(at.e, readRun(at.id))).filed, ['ship']);
  git(at.repo, 'merge', '--no-ff', '--no-commit', at.branch);
  at.settle(`${at.id}-ship`, 'succeeded', { ...SIGNED, message: given.message ?? MESSAGE });
  const signed = await advance(at.e, readRun(at.id));
  return { ...at, signed, checkId: `${at.id}-ship-check` };
}

const mergeHead = (repo: string): boolean => fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD'));

test("an approved ending stages the merge and signs off its message; the run executes ship's check on the merged tree, and commits the merge only on its exit 0", async () => {
  const { repo, id, branch, e, tasks, settle, base, signed, checkId } = await stagedAndSigned();
  const spec = tasks.get(`${id}-ship`)!.spec;
  // Told what the run does with what it stages, and asked for the message in its closeout; not told the work's check as one to run.
  assert.match(spec.brief, /## The run checks and lands your merge\n\nOnce you sign off, the run executes `npm test && npm run typecheck && /);
  assert.match(spec.brief, /do not run\nthe check, commit, or abort a clean merge yourself/);
  assert.doesNotMatch(spec.brief, /This workflow's check, which its work was judged by/);
  assert.deepEqual((spec.closeoutSchema as { required: string[] }).required.slice(-1), ['message']);

  // The check, filed as any step's is: on the check harness, in the checkout where the merge is, with its deadline — and no WF_BASE_REF,
  // since what it judges is the merge, which the command reads off MERGE_HEAD.
  assert.deepEqual(signed.checked, ['ship']);
  const check = tasks.get(checkId)!.spec as unknown as { harness: string; cwd: string; deadlineSeconds: number; brief: string };
  assert.deepEqual([check.harness, check.cwd, check.deadlineSeconds], ['check', repo, 1200]);
  const { check: command, env } = JSON.parse(check.brief);
  assert.equal(command, readRun(id).workflow!.find((s) => s.name === 'ship')!.check, 'the command frozen on the record');
  assert.equal(env.WF_BASE_REF, undefined);
  assert.equal(env.WF_WORKSPACE, repo);
  assert.equal(env.WF_STDERR, path.join(ROOT, 'checks', `${checkId}.stderr`));
  assert.equal((await list(e, readRun(id))).steps.find((s) => s.name === 'ship')!.status, 'checking');

  // While the check runs, nothing lands and nothing is taken back: pass after pass, the merge stays staged and the base branch where it was.
  for (const phase of ['pending', 'running'] as const) {
    settle(checkId, phase);
    await advance(e, readRun(id));
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
    assert.equal(mergeHead(repo), true);
  }

  settle(checkId, 'succeeded', undefined, 0);
  const landed = await advance(e, readRun(id));
  const head = git(repo, 'rev-parse', 'HEAD');
  assert.notEqual(head, base, 'the base branch has moved');
  assert.equal(git(repo, 'log', '-1', '--format=%B'), MESSAGE.trim(), 'under the message the step signed off, whole');
  assert.equal(git(repo, 'log', '-1', '--format=%(trailers)'), '', 'with no trailer');
  assert.equal(git(repo, 'log', '-1', '--format=%P'), `${base} ${git(repo, 'rev-parse', branch)}`, 'a merge, of the base and the branch');
  assert.equal(git(repo, 'status', '--porcelain'), '', 'and nothing is left in the checkout');
  assert.equal(mergeHead(repo), false);
  assert.deepEqual(readRun(id).steps.ship!.landed, { commit: head });
  assert.ok(landed.notes.includes(`ship: its check passed on the merge, and the run committed its merge onto main as ${head.slice(0, 7)}`), landed.notes.join('\n'));
  assert.equal(landed.status, 'succeeded');
  const { decision } = await decide(e, id);
  assert.equal(decision.kind, 'shipped');
  assert.equal((await list(e, readRun(id))).steps.find((s) => s.name === 'ship')!.status, 'verified ✓');

  // Once for the try: a pass after it commits nothing more, whatever the checkout holds.
  await advance(e, readRun(id));
  assert.equal(git(repo, 'rev-parse', 'HEAD'), head);
});

for (const [said, exitCode, words] of [
  ['refuses', 1, 'its check refused the merge (exit 1)'],
  ['does not finish', undefined, 'its check did not finish'],
] as const) {
  test(`REFUSED at shipped defaults: a check that ${said} on the merge has the run abort it — the base branch never moves, and a try of ship merges again, never --recheck`, async (t) => {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
    settle(checkId, 'failed', undefined, exitCode);
    const pass = await advance(e, readRun(id));
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base, 'nothing landed');
    assert.equal(git(repo, 'status', '--porcelain'), '', 'and the checkout is as it was: the merge was aborted');
    assert.equal(mergeHead(repo), false);
    assert.deepEqual(readRun(id).steps.ship!.landed, { aborted: words });
    assert.ok(pass.notes.includes(`ship: ${words}, so the run aborted its merge; nothing landed on main`), pass.notes.join('\n'));
    assert.equal((await list(e, readRun(id))).steps.find((s) => s.name === 'ship')!.status, `failed ✗ check (${exitCode === undefined ? 'unfinished' : 'exit 1'})`);

    const printed = (await decideLines(t, e, id)).flatMap((l) => l.split('\n'));
    const line = printed.find((l) => l.trimStart().startsWith('ship: '))?.trim();
    assert.ok(line, printed.join('\n'));
    assert.ok(line.includes(`wf retry ${id} ship`), line);
    assert.ok(!printed.some((l) => l.includes('--recheck')), printed.join('\n'));
    if (exitCode === undefined) assert.equal(line, `ship: its check did not finish, so the run aborted the merge and nothing landed on main. Merge and check again:  wf retry ${id} ship`);

    await assert.rejects(retry(e, id, 'ship', { mode: 'recheck' }), (err: Error & { exitCode?: number }) => {
      assert.equal(err.exitCode, 2);
      assert.match(err.message, new RegExp(`^--recheck runs a step's check again on the work as it stands, and ship's check was run on the merge ship staged in the repository's checkout, which the run aborted when its check ${exitCode === undefined ? 'did not finish' : 'refused it'}: there is nothing staged for it to judge\\. Merge and check again, in a new try of ship: wf retry ${id} ship\\.$`));
      return true;
    });
    // The try it names is honoured: a new try of ship, which stages the merge again and is checked again.
    await retry(e, id, 'ship', { mode: 'nudge' });
    assert.deepEqual((await advance(e, readRun(id))).tried, ['ship']);
    assert.equal(readRun(id).steps.ship!.landed, undefined, 'and the new try has landed nothing yet');
  });
}

test("a pass after a restart does what the last one would have: a merge committed before the run wrote it down is recorded as landed, never committed twice, and one aborted by hand is recorded as nothing landed", async () => {
  // The daemon died after `git commit` and before it wrote the record: the next pass reads the result on the checkout's HEAD.
  {
    const { repo, id, e, settle, checkId } = await stagedAndSigned();
    settle(checkId, 'succeeded', undefined, 0);
    git(repo, 'commit', '-q', '-m', 'the commit the pass made before it died');
    const head = git(repo, 'rev-parse', 'HEAD');
    await advance(e, readRun(id));
    assert.deepEqual(readRun(id).steps.ship!.landed, { commit: head });
    assert.equal(git(repo, 'rev-parse', 'HEAD'), head, 'nothing committed again');
    assert.equal((await decide(e, id)).decision.kind, 'shipped');
  }
  // And after `git merge --abort` of a refused merge: what the check said is recorded, and nothing is aborted again.
  {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
    settle(checkId, 'failed', undefined, 1);
    git(repo, 'merge', '--abort');
    await advance(e, readRun(id));
    assert.deepEqual(readRun(id).steps.ship!.landed, { aborted: 'its check refused the merge (exit 1)' });
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  }
  // A check that passed on a merge that is no longer staged commits nothing: the run does not merge again on its own.
  {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
    settle(checkId, 'succeeded', undefined, 0);
    git(repo, 'merge', '--abort');
    await advance(e, readRun(id));
    assert.deepEqual(readRun(id).steps.ship!.landed, { aborted: 'its check passed, and the merge it judged was no longer staged, so nothing was committed' });
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  }
});

test("REFUSED at shipped defaults: a merge in the checkout that is not the run's is never touched — committed nor aborted — with nothing of the ending running", async () => {
  const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
  settle(checkId, 'succeeded', undefined, 0);
  // A person takes the checkout for a merge of their own before the pass lands the run's: MERGE_HEAD names a commit that is not the result.
  git(repo, 'merge', '--abort');
  git(repo, 'checkout', '-q', '-b', 'theirs');
  fs.writeFileSync(path.join(repo, 'mul.ts'), 'export const mul = (a, b) => a * b;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'mul');
  git(repo, 'checkout', '-q', 'main');
  git(repo, 'merge', '--no-ff', '--no-commit', 'theirs');
  const theirs = git(repo, 'rev-parse', 'theirs');
  for (let pass = 0; pass < 2; pass++) {
    await advance(e, readRun(id));
    assert.equal(fs.readFileSync(path.join(repo, '.git', 'MERGE_HEAD'), 'utf8').trim(), theirs, 'their merge is still staged');
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
    assert.equal(readRun(id).steps.ship!.landed, undefined, 'and the run has written nothing of its own merge yet');
  }
  // Once theirs is done, the run's merge is read as gone, and nothing of it is committed.
  git(repo, 'merge', '--abort');
  await advance(e, readRun(id));
  assert.match(String((readRun(id).steps.ship!.landed as { aborted?: string }).aborted), /no longer staged/);
  assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
});

test("REFUSED at shipped defaults: a merge the run is not to commit is aborted — the run called off while its check ran, a message left blank, and a commit git refuses", async () => {
  // Called off while the check runs on the merge: the check stops, and the merge is taken back, cancelled or not.
  {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
    await cancel(e, id);
    settle(checkId, 'stopped');
    await advance(e, readRun(id));
    assert.deepEqual(readRun(id).steps.ship!.landed, { aborted: 'the run was called off before its merge was committed' });
    assert.equal(mergeHead(repo), false);
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  }
  // Signed off with no message: the check passed, and nothing is committed under git's default or none.
  {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned({ message: '  \n' });
    settle(checkId, 'succeeded', undefined, 0);
    await advance(e, readRun(id));
    assert.deepEqual(readRun(id).steps.ship!.landed, { aborted: 'ship signed off no commit message' });
    assert.equal(mergeHead(repo), false);
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  }
  // A hook refuses the commit: the merge is aborted, and git's words are on the record.
  {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
    fs.writeFileSync(path.join(repo, '.git', 'hooks', 'commit-msg'), '#!/bin/sh\necho "commit-msg: refused by the hook" >&2\nexit 1\n', { mode: 0o755 });
    settle(checkId, 'succeeded', undefined, 0);
    await advance(e, readRun(id));
    const landed = readRun(id).steps.ship!.landed as { aborted: string };
    assert.match(landed.aborted, /^git refused the commit of its merge: .*refused by the hook/s);
    assert.equal(mergeHead(repo), false);
    assert.equal(git(repo, 'status', '--porcelain'), '');
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  }
});

test("REFUSED at shipped defaults: `wf rm` of a run whose merge is staged and not landed, and another run's ending, wait until the run has landed it", async () => {
  const shared = board();
  const repo = aRepo();
  const { id, e, settle, checkId } = await stagedAndSigned({ repo, board: shared });
  const other = await atTheGate({ repo, board: shared });
  await approve(e, other.id, 'ship');

  // While the check runs on the merge, the other run's ending is not filed into that checkout.
  assert.deepEqual((await advance(e, readRun(other.id))).filed, []);
  // And with the check settled and nothing landed yet — the pass that lands it has not come — neither is forgotten.
  settle(checkId, 'succeeded', undefined, 0);
  assert.deepEqual((await advance(e, readRun(other.id))).filed, [], 'a merge staged and not landed still holds the checkout');
  const refused = await forget(e, id);
  assert.equal(refused.kind, 'refused');
  assert.equal(refused.kind === 'refused' && refused.refusal,
    `ship's merge is staged in the repository's checkout (${repo}), and the run has not yet committed or aborted it. `
    + `The next tick lands it, cancelled or not: wf rm ${id} once wf ls ${id} says what became of ship's merge.`);
  assert.equal(mergeHead(repo), true, 'and nothing was touched');

  await advance(e, readRun(id));
  assert.equal(mergeHead(repo), false);
  assert.deepEqual((await advance(e, readRun(other.id))).filed, ['ship'], 'landed, the checkout is free');
  assert.notEqual((await forget(e, id)).kind, 'refused');
});

/**
 * Two runs of one repository, each at its ending's gate and each approved — and the SECOND's approval written older than the first's, since
 * a rule about order that a fixture already has proves nothing.
 */
async function twoApproved() {
  const shared = board();
  const repo = aRepo();
  const first = await atTheGate({ repo, board: shared });
  const second = await atTheGate({ repo, board: shared });
  await approve(shared.e, first.id, 'ship');
  const { file } = await approve(shared.e, second.id, 'ship');
  fs.writeFileSync(file, JSON.stringify({ at: '2026-09-17T08:00:00.000Z' }));
  return { repo, first, second, ...shared };
}

test("two runs' ending steps never work in one checkout at once: the oldest approval takes it, and the other reads as waiting for it", async (t) => {
  const { repo, first, second, e } = await twoApproved();

  // A pass over both, the first run first: the order a pass reads the runs in decides nothing — the older approval is filed, and the other
  // is not, though its own approval is on the record and everything it waits on has handed on.
  const one = await advance(e, readRun(first.id));
  const two = await advance(e, readRun(second.id));
  assert.deepEqual([one.filed, two.filed], [[], ['ship']], 'one ending, in one checkout');
  assert.equal(one.inFlight, true, 'and the run held back is in flight all the same: its ending is approved, and a directory is what it waits for');
  assert.equal(readRun(first.id).steps.ship!.taskId, null);
  assert.equal(readRun(second.id).steps.ship!.workspace, repo, "and the one that was filed is in the repository's own checkout");

  // Pass after pass, while that step is in the checkout: read from the world each time.
  assert.deepEqual((await advance(e, readRun(first.id))).filed, []);
  // And both screens say which run's step has it.
  const listed = await list(e, readRun(first.id));
  assert.equal(listed.steps.find((s) => s.name === 'ship')!.status, `waiting on the checkout (${second.id}'s ship has it)`);
  const { decision, checkout } = await decide(e, first.id);
  assert.deepEqual([decision.kind, decision.kind === 'running' ? decision.waiting : []], ['running', ['ship']]);
  assert.deepEqual(checkout, { run: second.id, step: 'ship' });
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.map(String).join(' ')); });
  try { await main(['decide', first.id], e); } finally { log.mock.restore(); }
  assert.ok(printed.includes(`  ship: waiting on the checkout (${second.id}'s ship has it) — it works in the repository's own checkout, `
    + `and two endings never do at once; the next tick files ship once ${second.id}'s ship has settled`), printed.join('\n'));
});

test('a run whose ending waits for the checkout is filed once the step in it settles', async () => {
  const { repo, first, second, e, settle } = await twoApproved();
  await advance(e, readRun(second.id));
  assert.deepEqual((await advance(e, readRun(first.id))).filed, [], 'held while the other run works in the checkout');

  settle(`${second.id}-ship`, 'succeeded', SIGNED);
  const now = await advance(e, readRun(first.id));
  assert.deepEqual(now.filed, ['ship'], 'and filed on the first pass after it settles');
  assert.equal(readRun(first.id).steps.ship!.workspace, repo);
  assert.equal((await list(e, readRun(first.id))).steps.find((s) => s.name === 'ship')!.status, 'pending');
});

test("a try of an ending step waits for the checkout as its first filing does: a person's send-back of a ship that ended blocked files nothing while another run's ship is merging", async (t) => {
  const { repo, first, second, e, settle } = await twoApproved();
  // The older approval takes the checkout, and its ship signs off blocked — its check refused, and its prose aborted the trial merge.
  await advance(e, readRun(second.id));
  settle(`${second.id}-ship`, 'succeeded', BLOCKED);
  const freed = await advance(e, readRun(first.id));
  assert.deepEqual(freed.filed, ['ship'], 'the checkout is free, and the other run takes it');

  // A person sends the blocked one back while that step is merging: allowed — it is a settled step that signed off blocked — and held.
  const { ask } = await retry(e, second.id, 'ship', { mode: 'nudge', message: 'the check was green here; run it again' });
  assert.deepEqual([ask.step, ask.try], ['ship', 2]);
  for (const pass of [1, 2]) {
    const held = await advance(e, readRun(second.id));
    assert.deepEqual([held.tried, held.filed], [[], []], `pass ${pass}: the try waits for the checkout`);
  }
  assert.deepEqual(readRun(second.id).steps.ship!.tries, undefined, 'and no try was taken');
  assert.equal(git(repo, 'rev-parse', 'HEAD'), first.base, 'nothing merged while two endings wanted the same directory');
  const listed = await list(e, readRun(second.id));
  assert.deepEqual([listed.steps[1]!.status, listed.steps[1]!.note],
    ['succeeded · BLOCKED', `try 2 asked (--nudge) — waiting on the checkout (${first.id}'s ship has it)`]);

  // And `wf decide` says it on the screen of a run whose ending ended blocked, where the try due would have said the next tick files it.
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.map(String).join(' ')); });
  try { await main(['decide', second.id], e); } finally { log.mock.restore(); }
  assert.ok(printed.includes(`  ship: waiting on the checkout (${first.id}'s ship has it) — it works in the repository's own checkout, `
    + `and two endings never do at once; the next tick files ship once ${first.id}'s ship has settled`), printed.join('\n'));
  assert.ok(!printed.some((l) => l.includes('the next tick files it')), 'and not that the next tick files the try');

  // Once the step in the checkout settles, the try is filed there, as any try of it would be.
  settle(`${first.id}-ship`, 'succeeded', SIGNED);
  const tried = await advance(e, readRun(second.id));
  assert.deepEqual(tried.tried, ['ship']);
  assert.equal(readRun(second.id).steps.ship!.workspace, repo);
});

test("a run whose ending's try the checkout holds is a run still running: `wf ls`, `wf decide` and the pass agree, and it still counts against the cap on runs in flight", async () => {
  const { first, second, e, settle } = await twoApproved();
  // The older approval takes the checkout and signs off blocked; the other run takes the freed directory; a person answers the blocked one.
  await advance(e, readRun(second.id));
  settle(`${second.id}-ship`, 'succeeded', BLOCKED);
  assert.deepEqual((await advance(e, readRun(first.id))).filed, ['ship']);
  await retry(e, second.id, 'ship', { mode: 'nudge', message: 'the check was green here; run it again' });

  // A try asked for and not yet filed is work in hand, not a run waiting on a person.
  const pass = await advance(e, readRun(second.id));
  assert.deepEqual([pass.filed, pass.tried], [[], []], 'nothing of it is filed while the other run is in the checkout');
  assert.equal(pass.status, 'running', 'and the run is running, not failed');
  assert.equal(pass.inFlight, true, 'so the cap on runs in flight still counts it: the slot is held for the ending it is queued for');

  // The three screens say the same thing in that window.
  const listed = await list(e, readRun(second.id));
  assert.deepEqual(listed.waitingOnYou, [], 'nobody is waited on — the answer was given, and what holds it is a directory');
  assert.equal(listed.toDecide, undefined, 'and there is nothing to decide');
  assert.deepEqual([listed.steps[1]!.status, listed.steps[1]!.note],
    ['succeeded · BLOCKED', `try 2 asked (--nudge) — waiting on the checkout (${first.id}'s ship has it)`]);
  const { decision } = await decide(e, second.id);
  assert.deepEqual([decision.kind, decision.kind === 'running' ? decision.waiting : []], ['running', ['ship']]);

  // And the try is filed, as it always was, on the first pass after the step in the checkout settles.
  settle(`${first.id}-ship`, 'succeeded', SIGNED);
  assert.deepEqual((await advance(e, readRun(second.id))).tried, ['ship']);
});

test("a cancelled run holds the checkout while its ending's session is still in it: `wf cancel` asks the engine to stop it, and it is still merging until it has", async () => {
  const { repo, first, second, e, settle, tasks } = await twoApproved();
  await advance(e, readRun(second.id));
  assert.equal(tasks.get(`${second.id}-ship`)!.phase, 'pending', 'its session is in the checkout');

  // Called off: the engine is asked to stop it, and until it has settled that agent is still mid `git merge` in that directory.
  const { plan } = await cancel(e, second.id);
  assert.deepEqual(plan.kind === 'cancel' ? plan.stop.map((x) => x.name) : [], ['ship']);
  assert.deepEqual((await advance(e, readRun(first.id))).filed, [], 'so the other run files nothing into it');
  assert.equal((await list(e, readRun(first.id))).steps.find((s) => s.name === 'ship')!.status, `waiting on the checkout (${second.id}'s ship has it)`);

  // Settled `stopped`, a tick or two later: the checkout is free, and the next pass takes it.
  settle(`${second.id}-ship`, 'stopped');
  assert.deepEqual((await advance(e, readRun(first.id))).filed, ['ship']);
  assert.equal(readRun(first.id).steps.ship!.workspace, repo);
});

test("a run whose ending the pass will not file claims no checkout: one waiting on a run that has not shipped, and one the cap on runs in flight holds, each hold nobody — however old their word", async () => {
  // A merge-only run started `--after` one that is at its own gate, and so has not shipped: its ship is approved, and its word is the
  // oldest — but `advance` files a root only once every run it waits on has shipped, so nothing of it will be filed.
  const shared = board();
  const repo = aRepo();
  const waiting = await atTheGate({ repo, board: shared });
  const child = start({ brief: 'ship the flag', repo, workflowDir: mergeOnly(), after: [waiting.id] });
  const { file } = await approve(shared.e, child.id, 'ship');
  fs.writeFileSync(file, JSON.stringify({ at: '2026-09-17T07:00:00.000Z' }));
  assert.deepEqual((await advance(shared.e, readRun(child.id))).filed, [], 'it waits on a run that has not shipped');

  await approve(shared.e, waiting.id, 'ship');
  assert.deepEqual((await advance(shared.e, readRun(waiting.id))).filed, ['ship'], 'so the checkout goes to the run that would use it');
  assert.equal((await list(shared.e, readRun(waiting.id))).steps.find((s) => s.name === 'ship')!.status, 'pending');

  // And the same for a root the cap on runs in flight holds: it is not filed while a run is in flight, so its ending claims nothing.
  const capped = board();
  const other = aRepo();
  const inFlight = await atTheGate({ repo: other, board: capped });
  await approve(capped.e, inFlight.id, 'ship');
  const queued = start({ brief: 'ship the flag', repo: other, workflowDir: mergeOnly() });
  fs.writeFileSync((await approve(capped.e, queued.id, 'ship')).file, JSON.stringify({ at: '2026-09-17T05:00:00.000Z' }));
  process.env.WF_MAX_RUNS = '1';
  try {
    assert.deepEqual((await advance(capped.e, readRun(queued.id), { inFlight: 1, cap: 1 })).filed, [], 'the cap holds its root');
    assert.deepEqual((await advance(capped.e, readRun(inFlight.id))).filed, ['ship'], 'and its ending holds no other run\'s');
  } finally { delete process.env.WF_MAX_RUNS; }
});

test("a run with nothing filed is held by the checkout like any other: its ending is its root, and a root is not filed into a directory another run's ship is in", async () => {
  const shared = board();
  const repo = aRepo();
  const { e, settle } = shared;

  // A run that ships, so the merge-only run's parent has shipped and nothing but the checkout is between it and being filed.
  const parent = await atTheGate({ repo, board: shared });
  await approve(e, parent.id, 'ship');
  await advance(e, readRun(parent.id));
  git(repo, 'merge', '--no-ff', '--no-commit', parent.branch);
  git(repo, 'commit', '--no-edit');
  settle(`${parent.id}-ship`, 'succeeded', SIGNED);
  await advance(e, readRun(parent.id));
  assert.equal(isShipped(readRun(parent.id), parent.branch), true);

  // Another run at its ending's gate, its word the older, and the merge-only child of the shipped run.
  const other = await atTheGate({ repo, board: shared });
  fs.writeFileSync((await approve(e, other.id, 'ship')).file, JSON.stringify({ at: '2026-09-17T06:00:00.000Z' }));
  const child = start({ brief: 'ship the flag', repo, workflowDir: mergeOnly(), after: [parent.id] });
  fs.writeFileSync((await approve(e, child.id, 'ship')).file, JSON.stringify({ at: '2026-09-17T07:00:00.000Z' }));

  assert.deepEqual((await advance(e, readRun(other.id))).filed, ['ship'], 'the older word takes the checkout');
  assert.deepEqual((await advance(e, readRun(child.id))).filed, [], 'and the run with nothing filed waits for it');
  assert.equal((await list(e, readRun(child.id))).steps[0]!.status, `waiting on the checkout (${other.id}'s ship has it)`);

  settle(`${other.id}-ship`, 'succeeded', SIGNED);
  assert.deepEqual((await advance(e, readRun(child.id))).filed, ['ship'], 'and is filed once that step settles');
  assert.equal(readRun(child.id).steps.ship!.workspace, repo);
});


test("a `workspace: main` task the engine has lost holds no checkout: a run nobody can stop does not hold every other run's ending for ever", async () => {
  const { first, second, e, tasks } = await twoApproved();
  await advance(e, readRun(second.id));
  assert.deepEqual((await advance(e, readRun(first.id))).filed, [], 'held while the engine has that step in flight');

  tasks.delete(`${second.id}-ship`);
  assert.deepEqual((await advance(e, readRun(first.id))).filed, ['ship'], 'and filed once the engine no longer holds it');
});

test("a run another waited on hands forward what its work said, not what its ending said: the ending's account is of the merge, and it declares nothing", async () => {
  const { repo, id, branch, e, settle, tasks } = await atTheGate();
  await approve(e, id, 'ship');
  await advance(e, readRun(id));
  git(repo, 'merge', '--no-ff', '--no-commit', branch);
  git(repo, 'commit', '--no-edit');
  settle(`${id}-ship`, 'succeeded', { ...SIGNED, summary: 'SHIP-ACCOUNT: merged it onto main, the check passed' });
  await advance(e, readRun(id));

  const child = start({ brief: 'read the flag', repo, workflowDir: oneStep(), after: [id] });
  const filed = await advance(e, readRun(child.id));
  assert.deepEqual(filed.filed, ['implement'], 'the parent shipped, so the child is filed');
  const brief = tasks.get(`${child.id}-implement`)!.spec.brief;
  assert.match(brief, new RegExp(`## From run ${id}\\n`));
  assert.match(brief, /What implement said when it signed off, its `summary`:\n\n```text\ndid the work\n```/);
  assert.doesNotMatch(brief, /SHIP-ACCOUNT/, "the ending's account is of the merge, and says nothing of the work");
  assert.doesNotMatch(brief, /What ship said when it signed off/);
});

test('a sent-back ending merges nothing: the work is filed again, the checkout is untouched, and the gate holds again once it signs off', async () => {
  const { repo, id, branch, e, settle, base } = await atTheGate();
  const { ask } = await retry(e, id, 'implement', { mode: 'nudge', message: 'sub subtracts the wrong way round' });
  assert.deepEqual([ask.step, ask.try], ['implement', 2]);

  const sent = await advance(e, readRun(id));
  assert.deepEqual([sent.tried, sent.filed], [['implement'], []], 'the work goes again, and the ending is not filed');
  assert.equal(readRun(id).steps.ship!.taskId, null);
  assert.equal(git(repo, 'rev-parse', 'HEAD'), base, 'nothing is merged');
  assert.equal(git(repo, 'status', '--porcelain'), '');
  // While the work runs there is nothing to decide, and the approval of a step that has not been filed is refused.
  assert.equal((await list(e, readRun(id))).toDecide, undefined);
  await assert.rejects(approve(e, id, 'ship'), (err: Error & { exitCode?: number }) => err.exitCode === 2 && /^ship is not at its gate yet/.test(err.message));

  settle(`${id}-implement-try2`, 'succeeded', SIGNED);
  const held = await advance(e, readRun(id));
  assert.deepEqual(held.filed, [], 'and the gate holds the ending again');
  assert.deepEqual((await list(e, readRun(id))).toDecide?.kind, 'approve');
  assert.equal(isShipped(readRun(id), branch), false);
});

test("REFUSED at the ending's gate, at shipped defaults: a send-back with no words names the step at the gate — ship, not the work — and the two commands it names are honoured", async () => {
  const { id, e } = await atTheGate();
  await assert.rejects(retry(e, id, 'implement', { mode: 'nudge' }), (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.equal(err.message, "ship is at its gate, not implement: ship ends the run in the repository's own checkout, nothing of it has run, and the send-back from that gate goes to implement, the work it would act on. "
      + `A try with no words tells its session nothing to change, so it would sign off as it did. Say what to change: wf retry ${id} implement --message "<objection>" — or approve the ending, which is what files it: wf approve ${id} ship.`);
    return true;
  });
  // The send-back it names is honoured, and so is the approval — on a run of its own, since one takes the other back.
  const { ask } = await retry(e, id, 'implement', { mode: 'nudge', message: 'sub subtracts the wrong way round' });
  assert.deepEqual([ask.step, ask.try], ['implement', 2]);
  const other = await atTheGate();
  assert.equal((await approve(other.e, other.id, 'ship')).approval.step, 'ship');
});

test("REFUSED at shipped defaults: a try of the ending step itself, which has not run, names the approval that files it and the send-back to the work", async () => {
  const { id, e } = await atTheGate();
  await assert.rejects(retry(e, id, 'ship', { mode: 'nudge' }), (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.equal(err.message, "ship is at its gate, and nothing of it has run: it ends the run in the repository's own checkout, and your approval is what files it, so there is no try of it to replace. "
      + `Approve it: wf approve ${id} ship — or send the work back: wf retry ${id} implement --message "<objection>".`);
    return true;
  });
  assert.equal(readRun(id).steps.ship!.taskId, null, 'and nothing was written');
});

test("REFUSED at shipped defaults: `wf round` at an ending's gate says the run is at that gate — not that what waits on the loop has been filed", async () => {
  const run = start({ brief: 'add sub', repo: aRepo(), workflowDir: loopingFolder() });
  const { e, settle } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(e, readRun(run.id));
  settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: false });
  const pass = await advance(e, readRun(run.id));
  assert.deepEqual([pass.looped, pass.filed], [[], []], 'the loop has handed on, and the ending waits at its gate');
  assert.equal((await list(e, readRun(run.id))).steps.find((s) => s.name === 'ship')!.status, 'awaiting approval');

  await assert.rejects(round(e, run.id, 'review'), (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.equal(err.message, "review signed off without asking for another round (`again: false`), so its loop is over — and nothing waiting on it has been filed: the run is at ship's gate, "
      + `where nothing of ship has run and your approval is what files it. Approve it: wf approve ${run.id} ship — or send the work back: wf retry ${run.id} review --message "<objection>".`);
    return true;
  });
  assert.ok(!fs.existsSync(path.join(ROOT, 'runs', `${run.id}.asks`, 'round-review-2')), 'and no ask was written');
});

test("REFUSED at shipped defaults: a step is handed off once — a person's edit in the reviewed worktree while the run waits at its ending's gate is not committed under review's name, pass after pass", async () => {
  // The incident's path: the work sent back, review hands on (`again: false`) with no commit of its own, so the branch's tip is the one
  // the run already recorded and the pass that hands review off writes nothing else — the mark must be written for itself.
  const { id, e, settle } = await stoppedOnBase();
  await retry(e, id, 'review', { mode: 'nudge', message: 'take main' });
  await advance(e, readRun(id));
  settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: false });
  const tipsBefore = readRun(id).tips;
  const handing = await advance(e, readRun(id));
  assert.deepEqual([handing.filed, handing.looped, handing.tried], [[], [], []], 'the pass that hands review off files nothing: the ending waits at its gate');
  assert.deepEqual(readRun(id).tips, tipsBefore, 'and no tip moved, so nothing else of the pass wrote the record');
  const review = readRun(id).steps.review!;
  assert.equal(review.handedOff, `${id}-review-try2`, 'the mark is on the record on disk, not only in the pass that set it');

  // A person edits the reviewed worktree while the run waits for their approval.
  const tip = git(review.workspace!, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(review.workspace!, 'NOTES.md'), "a person's notes\n");
  await advance(e, readRun(id));
  await advance(e, readRun(id));
  assert.equal(git(review.workspace!, 'rev-parse', 'HEAD'), tip, "no commit under review's name");
  assert.match(git(review.workspace!, 'status', '--porcelain'), /NOTES\.md/, "the edit is still the person's, uncommitted");
});

test("a check that refuses leaves the checkout clean: the abort the ending's prose names takes the trial merge back, and the run says what happened", async () => {
  const { repo, id, branch, e, settle, base } = await atTheGate();
  await approve(e, id, 'ship');
  await advance(e, readRun(id));

  // The step, played as its own prose says when the check refuses: trial merge, a check that does not exit 0, then the abort.
  git(repo, 'merge', '--no-ff', '--no-commit', branch);
  assert.notEqual(git(repo, 'status', '--porcelain'), '', 'the trial merge is staged and uncommitted');
  git(repo, 'merge', '--abort');
  assert.equal(git(repo, 'status', '--porcelain'), '', 'the checkout is as it was');
  assert.equal(git(repo, 'rev-parse', 'HEAD'), base, 'and the base branch has not moved');

  settle(`${id}-ship`, 'succeeded', BLOCKED);
  await advance(e, readRun(id));
  const record = readRun(id);
  assert.equal(git(repo, 'status', '--porcelain'), '', 'nor does the run commit what a step left in that checkout');
  assert.equal(isShipped(record, branch), false);
  const { decision } = await decide(e, id);
  assert.equal(decision.kind, 'awaiting');
  if (decision.kind !== 'awaiting') return;
  assert.deepEqual([decision.outcome, decision.stuck, decision.branches], ['blocked', ['ship'], [branch]]);
});

/**
 * The incident, as the record had it: `implement ⇄ review → ship`, implement verified, review done with `again: false`, ship approved at
 * try 1, filed in the repository's own checkout, and signed off blocked — the work does not hold on the base branch as it is now.
 */
async function stoppedOnBase(dir = loopingFolder()) {
  const repo = aRepo();
  const run = start({ brief: 'add sub', repo, workflowDir: dir });
  const b = board();
  const { e, settle } = b;
  await advance(e, readRun(run.id));
  const work = readRun(run.id).steps.implement!;
  fs.appendFileSync(path.join(work.workspace!, 'add.ts'), 'export const sub = (a, b) => a - b;\n');
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(e, readRun(run.id));
  if (readRun(run.id).steps.review) {
    settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: false });
    await advance(e, readRun(run.id));
  }
  await approve(e, run.id, 'ship', 'Merge it.');
  assert.deepEqual((await advance(e, readRun(run.id))).filed, ['ship']);
  settle(`${run.id}-ship`, 'succeeded', STOPPED);
  await advance(e, readRun(run.id));
  return { repo, id: run.id, branch: work.branch!, ...b, base: git(repo, 'rev-parse', 'HEAD') };
}

const STOPPED = { outcome: 'blocked', summary: 'main moved since the branch was cut: the trial merge conflicts in add.ts, so I aborted it', artifacts: [], needs: 'the branch has to take main: add.ts conflicts with main\'s sub' };

/** What `wf decide` prints for a run, line by line. */
async function decideLines(t: { mock: { method: typeof import('node:test').mock.method } }, e: Engine, id: string): Promise<string[]> {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.map(String).join(' ')); });
  try { await main(['decide', id], e); } finally { log.mock.restore(); }
  return printed;
}

test("an ending that stopped on the base branch sends the work back through the loop: review hears the objection and the ending's needs, implement gets a round, and ship waits at its gate for a new approval", async (t) => {
  const { repo, id, e, tasks, filings, settle, base } = await stoppedOnBase();
  assert.equal(readRun(id).steps.ship!.taskId, `${id}-ship`, 'the fixture is the incident: ship ran on its approval');

  // `wf decide` offers both ways on, each with when to take it.
  const printed = await decideLines(t, e, id);
  assert.ok(printed.some((l) => l.includes(`ship: blocked. Ship again, when what stopped it was not the work — a dirty checkout, a flaky test. Continue its session, told what happened:  wf retry ${id} ship  (`)), printed.join('\n'));
  assert.ok(printed.some((l) => l.includes(`review: ship stopped on the base branch. Send the work back, when it does not hold on the base branch — review is filed again with your objection and what ship said, may ask for a round, and ship waits at its gate for a new approval:  wf retry ${id} review --message "<objection>"`)), printed.join('\n'));

  const { ask } = await retry(e, id, 'review', { mode: 'nudge', message: 'take main, and keep both subs working' });
  assert.deepEqual([ask.step, ask.try], ['review', 2]);
  // Between the ask and the pass, the ending reads as waiting for the work, not as blocked: what the next pass will say.
  assert.equal((await list(e, readRun(id))).steps.find((s) => s.name === 'ship')!.status, 'waiting');

  const sent = await advance(e, readRun(id));
  assert.deepEqual([sent.tried, sent.filed], [['review'], []], 'the reviewer is filed again, and the ending is not');
  assert.deepEqual(readRun(id).steps.ship, { taskId: null, workspace: repo, branch: 'main', tries: [{ taskId: `${id}-ship`, then: 'back' }] });
  assert.equal(git(repo, 'rev-parse', 'HEAD'), base, 'nothing merged');
  const brief = tasks.get(`${id}-review-try2`)!.spec.brief;
  assert.match(brief, /the work went on to ship, which a person approved: it acts on main in the repository's own checkout, and it stopped there — `blocked` —/);
  assert.match(brief, /## Your answer\n\n```text\ntake main, and keep both subs working\n```/);
  assert.match(brief, /## What ship said\n\nIts summary:\n\n```text\nmain moved since the branch was cut/);
  assert.match(brief, /What it needs:\n\n```text\nthe branch has to take main: add.ts conflicts with main's sub\n```/);
  assert.match(brief, /sign off with `again: true` and say what — what ship needs among it: the work's next round is on the run's branch, where merging main into it is the work's to do\./);
  await assert.rejects(approve(e, id, 'ship'), (err: Error & { exitCode?: number }) => err.exitCode === 2 && /^ship is not at its gate yet/.test(err.message),
    'the approval of try 1 does not carry over, and none is taken while the work is out');

  // The reviewer asks for a round: implement goes on, on its branch, and review reviews again.
  settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: true });
  const looped = await advance(e, readRun(id));
  assert.deepEqual(looped.looped, ['review']);
  assert.ok(filings.includes(`${id}-implement-try2`), filings.join(', '));
  settle(`${id}-implement-try2`, 'succeeded', { ...SIGNED, replies: [{ finding: 'take main', answer: 'fixed', why: 'merged main into the branch, and both subs are one' }] });
  await advance(e, readRun(id));
  settle(`${id}-review-try3`, 'succeeded', { ...SIGNED, again: false });
  const settled = await advance(e, readRun(id));
  assert.deepEqual(settled.filed, [], 'the loop has settled, and the ending holds at its gate: nothing of it runs');
  const listed = await list(e, readRun(id));
  assert.deepEqual([listed.steps.find((s) => s.name === 'ship')!.status, listed.toDecide?.kind], ['awaiting approval', 'approve']);

  // A new approval, of the try the ending is now on, files it.
  const { approval } = await approve(e, id, 'ship', 'Merge it, now it takes main.');
  assert.deepEqual([approval.step, approval.try], ['ship', 2]);
  assert.deepEqual((await advance(e, readRun(id))).filed, ['ship']);
  assert.equal(tasks.get(`${id}-ship-try2`)!.spec.cwd, repo);
});

test("a send-back composes with `wf round` in a loop out of rounds, as the incident's was: review's `again: true` reads exhausted, a round takes it once more, and ship waits at its gate for a new approval", async () => {
  // `rounds: 1`: the loop's only round was spent before ship ran, so the send-back's round is one the loop does not have.
  const { id, e, filings, settle } = await stoppedOnBase(loopingFolder(1));
  await retry(e, id, 'review', { mode: 'nudge', message: 'take main' });
  await advance(e, readRun(id));
  settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: true });
  const spent = await advance(e, readRun(id));
  assert.deepEqual([spent.looped, spent.filed], [[], []], 'no round is left, so nothing goes round on its own');
  const listed = await list(e, readRun(id));
  assert.deepEqual(['review', 'ship'].map((n) => listed.steps.find((s) => s.name === n)!.status), ['rounds exhausted', 'waiting'],
    'review asked for a round the loop does not have, and ship still waits for the work');
  await assert.rejects(approve(e, id, 'ship'), (err: Error & { exitCode?: number }) => err.exitCode === 2, 'and no approval is taken while the work is out');

  // A person takes the loop once more; the round goes to implement, and review hands on after it.
  const { ask: asked } = await round(e, id, 'review');
  assert.equal(asked.round, 2);
  assert.deepEqual((await advance(e, readRun(id))).looped, ['review']);
  assert.ok(filings.includes(`${id}-implement-try2`), filings.join(', '));
  settle(`${id}-implement-try2`, 'succeeded', { ...SIGNED, replies: [{ finding: 'take main', answer: 'fixed', why: 'merged main into the branch' }] });
  await advance(e, readRun(id));
  settle(`${id}-review-try3`, 'succeeded', { ...SIGNED, again: false });
  assert.deepEqual((await advance(e, readRun(id))).filed, [], 'the loop has settled, and nothing of ship runs');
  assert.equal((await list(e, readRun(id))).steps.find((s) => s.name === 'ship')!.status, 'awaiting approval');

  const { approval } = await approve(e, id, 'ship', 'Merge it, now it takes main.');
  assert.deepEqual([approval.step, approval.try], ['ship', 2], 'a new approval, of the try ship is now on');
  assert.deepEqual((await advance(e, readRun(id))).filed, ['ship']);
});

/** Why a person judged the loop's findings later work rather than this run's: what `wf accept` carries to the shipper. */
const ENOUGH = 'the findings are cases no shipped team has: follow-up work, not this run.';

/**
 * The incident's other half: `implement ⇄ review → ship` at `rounds: 1`, implement committed on its branch, review done with `again: true`
 * — out of rounds, and nothing after the loop is ever filed, so the ending never reaches its gate.
 */
async function atTheCap() {
  const repo = aRepo();
  const run = start({ brief: 'add sub', repo, workflowDir: loopingFolder(1) });
  const b = board();
  const { e, settle } = b;
  await advance(e, readRun(run.id));
  const work = readRun(run.id).steps.implement!;
  fs.appendFileSync(path.join(work.workspace!, 'add.ts'), 'export const sub = (a, b) => a - b;\n');
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(e, readRun(run.id));
  settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: true });
  assert.deepEqual((await advance(e, readRun(run.id))).filed, [], 'out of rounds, nothing after the loop is filed');
  return { repo, id: run.id, ...b, base: git(repo, 'rev-parse', 'HEAD') };
}

test("the incident's other ending: at rounds exhausted a person accepts the work as it stands, and ship reaches its gate on their word — approved, filed, and told why the findings are still open", async () => {
  const { repo, id, e, tasks } = await atTheCap();
  const stuck = await list(e, readRun(id));
  assert.deepEqual(['review', 'ship'].map((n) => stuck.steps.find((s) => s.name === n)!.status), ['rounds exhausted', 'waiting'],
    'the ending never reaches its gate, which is how the work came to be merged by hand');
  await assert.rejects(approve(e, id, 'ship'), (err: Error & { exitCode?: number }) => err.exitCode === 2 && /^ship is not at its gate yet/.test(err.message));

  // The person read the findings, judged them follow-up work, and said so. The loop ends; the run does not.
  const { acceptance } = await accept(e, id, 'review', ENOUGH);
  assert.deepEqual((await advance(e, readRun(id))).filed, [], 'the ending is approved before it is filed, so it goes to its gate, not to work');
  const listed = await list(e, readRun(id));
  assert.deepEqual([listed.steps.find((s) => s.name === 'ship')!.status, listed.toDecide?.kind], ['awaiting approval', 'approve']);
  const { decision: d, offers, accepted } = await decide(e, id);
  assert.deepEqual([d.kind === 'awaiting' && d.awaitingApproval, offers], [['ship'], []], 'the gate is what is left to decide, and no round is offered');
  assert.deepEqual(accepted, { review: `accepted as it stands ${acceptance.at.slice(11, 16)}Z, its findings open — "${ENOUGH}"` });

  // Approved, it is filed in the repository's own checkout as ever — and told why it is shipping work a reviewer had more to say about.
  await approve(e, id, 'ship', 'Merge it; the findings are follow-up.');
  assert.deepEqual((await advance(e, readRun(id))).filed, ['ship']);
  const brief = tasks.get(`${id}-ship`)!.spec.brief;
  assert.match(brief, /\n## Accepted\n/);
  assert.match(brief, /review judged this work and asked for another round after the 1 `rounds: 1` allows\./);
  assert.ok(brief.includes(ENOUGH), brief);
  assert.equal(tasks.get(`${id}-ship`)!.spec.cwd, repo);
});

test("a send-back at the ending's gate spends the acceptance: the loop is open again, its findings with it, and the work goes back to the reviewer", async () => {
  const { id, e, tasks } = await atTheCap();
  await accept(e, id, 'review', ENOUGH);
  await advance(e, readRun(id));
  assert.equal((await list(e, readRun(id))).steps.find((s) => s.name === 'ship')!.status, 'awaiting approval');

  const { ask } = await retry(e, id, 'review', { mode: 'nudge', message: 'the second finding is this run\'s after all' });
  assert.deepEqual([ask.step, ask.try], ['review', 2]);
  const sent = await advance(e, readRun(id));
  assert.deepEqual([sent.tried, sent.filed], [['review'], []]);
  assert.equal(readRun(id).acceptances, undefined, 'spent by the try after it, as an approval is');
  assert.ok(fs.existsSync(path.join(ROOT, 'runs', `${id}.asks`, 'done', 'accept-review-1')), 'and moved whole');
  assert.doesNotMatch(tasks.get(`${id}-review-try2`)!.spec.brief as string, /## Accepted/, 'the reviewer is not told its own loop was ended');
  // Out of rounds again on the new try, and the acceptance that ended the old one opens nothing.
  await assert.rejects(accept(e, id, 'review', ENOUGH), (err: Error & { exitCode?: number }) => err.exitCode === 2 && /^round 1 of review's loop is still running/.test(err.message));
});

test("REFUSED at shipped defaults: a send-back from a stopped ending with no words, to a step that is not the loop's, a round of the loop, or while the ending's own try is asked for — and the ending's try while a send-back is", async () => {
  const { id, e } = await stoppedOnBase();
  const refused = (words: string) => (err: Error & { exitCode?: number }) => { assert.equal(err.exitCode, 2); assert.equal(err.message, words); return true; };
  await assert.rejects(retry(e, id, 'review', { mode: 'nudge' }), refused(
    "review's work went on to ship, and ship stopped on the base branch (blocked) without doing what it was approved for: a try of review sends the work back from there, and one with no words tells its session nothing to change. "
    + `Say what to change: wf retry ${id} review --message "<objection>" — or ship again, for what was not the work — a dirty checkout, a flaky test: wf retry ${id} ship.`));
  await assert.rejects(retry(e, id, 'implement', { mode: 'nudge', message: 'take main' }), refused(
    "ship stopped on the base branch (blocked) without doing what it was approved for, and the work goes back through the folder's loop, not to implement: send it back to review, which is filed again with your objection and what ship said, and may ask for a round of the work — "
    + `wf retry ${id} review --message "<objection>". Or ship again, for what was not the work — a dirty checkout, a flaky test: wf retry ${id} ship.`));
  // A round carries no words, and the loop is over: what goes round again is the send-back's `again: true`.
  await assert.rejects(round(e, id, 'review'), refused(
    "review signed off without asking for another round (`again: false`), and ship stopped on the base branch (blocked) without doing what it was approved for: a round would file the work again with nothing said of why. "
    + "Send it back, with what to change — review is filed again with your objection and what ship said, and its `again: true` is the round: "
    + `wf retry ${id} review --message "<objection>". Or ship again, for what was not the work — a dirty checkout, a flaky test: wf retry ${id} ship.`));
  assert.ok(!fs.existsSync(path.join(ROOT, 'runs', `${id}.asks`, 'round-review-2')), 'and no ask was written');

  // The two ways on take the same try of the ending: one asked refuses the other, each way round.
  const { ask } = await retry(e, id, 'ship', { mode: 'nudge', message: 'the checkout is clean now' });
  await assert.rejects(retry(e, id, 'review', { mode: 'nudge', message: 'take main' }), (err: Error & { exitCode?: number }) =>
    err.exitCode === 2 && err.message.startsWith(`try 2 of ship is asked for (--nudge, at ${ask.at}): it does the act again on the work as it stands, and a send-back would take that try back.`));
  fs.rmSync(path.join(ROOT, 'runs', `${id}.asks`, 'retry-ship-2'));
  const back = await retry(e, id, 'review', { mode: 'nudge', message: 'take main' });
  await assert.rejects(retry(e, id, 'ship', { mode: 'nudge' }), refused(
    `the work is being sent back from ship (wf retry ${id} review, at ${back.ask.at}): ship returns to its gate once it settles, and a try of ship now would act on work that is being changed. Wait for it: wf ls ${id}.`));
});

test("REFUSED at shipped defaults: a folder with no loop before its ending has no way to send the work back from it, and says so — shipping again is still there", async () => {
  const { id, e, settle, tasks } = await stoppedOnBase(folder());
  await assert.rejects(retry(e, id, 'implement', { mode: 'nudge', message: 'take main' }), (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.equal(err.message, "ship stopped on the base branch (blocked) without doing what it was approved for, and this workflow has no loop before it to send the work back through: a send-back files the looping step an ending waits on, whose `again: true` gives the work a round, and implement does not loop. "
      + `Ship again, for what was not the work — a dirty checkout, a flaky test: wf retry ${id} ship. For work that does not hold on the base branch, call this run off (wf cancel ${id}) and start one for the work on the base branch as it is now (wf start); a folder that gives its ending a \`loop:\` step to wait on can send work back.`);
    return true;
  });
  assert.equal(readRun(id).steps.implement!.tries, undefined, 'and nothing was asked');

  // Shipping again is a try of the ending, filed without a new approval, and once its merge lands the run is over — not at its gate again.
  await retry(e, id, 'ship', { mode: 'nudge', message: 'the checkout is clean now' });
  assert.deepEqual((await advance(e, readRun(id))).tried, ['ship']);
  assert.ok(tasks.get(`${id}-ship-try2`));
  const { repo, branch } = readRun(id) as unknown as { repo: string; branch: string };
  git(repo, 'merge', '--no-ff', '--no-commit', readRun(id).steps.implement!.branch!);
  assert.equal(branch, 'main');
  settle(`${id}-ship-try2`, 'succeeded', { ...SIGNED, message: MESSAGE });
  assert.deepEqual((await advance(e, readRun(id))).checked, ['ship'], "the try's merge is checked as the first try's was");
  settle(`${id}-ship-try2-check`, 'succeeded', undefined, 0);
  const done = await advance(e, readRun(id));
  assert.equal(done.status, 'succeeded');
  assert.notEqual((await list(e, readRun(id))).steps.find((s) => s.name === 'ship')!.status, 'awaiting approval');
});
