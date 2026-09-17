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
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from 'agent-engine';
import type { TaskPhase } from '../src/run.ts';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-ship-'));
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
const { advance, approve, cancel, decide, isShipped, list, readRun, retry, round, start } = await import('../src/runner.ts');
const { main } = await import('../src/cli.ts');

const REPO_ROOT = path.join(import.meta.dirname, '..', '..', '..');
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
  const tasks = new Map<string, { spec: Filed; phase: TaskPhase; closeout?: unknown }>();
  const filings: string[] = [];
  const e = {
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id, phase: t?.phase ?? 'pending', sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '', closeoutSchema: t?.spec.closeoutSchema, settled, stopRequested: false, said: [],
          attempts: !t || t.phase === 'pending' ? [] : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: null, usage: null }],
        },
      };
    },
    file: async (spec: Filed) => { filings.push(spec.id); tasks.set(spec.id, { spec, phase: 'pending' }); return spec.id; },
    stop: async () => {},
    logs: async () => '(no output yet)',
    feed: async () => ({ entries: [], cursor: 0 }),
  } as unknown as Engine;
  const settle = (id: string, phase: TaskPhase, closeout?: unknown) => Object.assign(tasks.get(id)!, { phase, closeout });
  return { e, tasks, filings, settle };
};

/**
 * `implement ⇄ review → ship`, as the dev folders are, with the shipped `workflows/dev/ship.md` as its ending, whose `after: review` is
 * what this folder has: what a person types `wf round` at once the loop has handed on.
 */
const loopingFolder = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-loop-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\noutput: review.schema.json\nloop: implement\nrounds: 3\n---\nreview it\n');
  fs.writeFileSync(path.join(dir, 'review.schema.json'), JSON.stringify({
    type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false,
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'ship.md'), fs.readFileSync(path.join(REPO_ROOT, 'workflows', 'dev', 'ship.md'), 'utf8'));
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
async function atTheGate(given: { repo?: string; board?: ReturnType<typeof board> } = {}) {
  const repo = given.repo ?? aRepo();
  const run = start({ brief: 'add sub', repo, workflowDir: folder() });
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
  assert.equal(printed[0], `${id}  2 step(s): implement → ship`);
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
    says: "Ship it: trial merge this run's result branch onto the base branch, run the check, and commit — or abort and say why.",
  });
  // Pass after pass: the gate is read off the world each time, and nothing is spent while it holds.
  const again = await advance(e, readRun(id));
  assert.deepEqual([again.filed, again.checked, again.tried], [[], [], []]);
  assert.equal(isShipped(readRun(id), branch), false);
});

test('an approved ending is filed, in the repository\'s own checkout, and the merge its prose describes ships the run', async () => {
  const { repo, id, branch, e, tasks, settle, base } = await atTheGate();
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

  // The step, played as its own prose says: trial merge, the check, the commit.
  git(repo, 'merge', '--no-ff', '--no-commit', branch);
  git(repo, 'commit', '--no-edit');
  settle(`${id}-ship`, 'succeeded', SIGNED);
  await advance(e, readRun(id));

  const record = readRun(id);
  assert.notEqual(git(repo, 'rev-parse', 'HEAD'), base, 'the base branch has moved');
  assert.equal(git(repo, 'status', '--porcelain'), '', 'and nothing is left in the checkout');
  assert.equal(isShipped(record, branch), true);
  const { decision, toDecide, standings } = await decide(e, id);
  assert.deepEqual([decision.kind, toDecide, standings], ['shipped', undefined, [{ branch, where: 'on' }]]);
  // The run committed nothing of its own in that checkout: the merge commit is the step's, and the only one.
  assert.equal(git(repo, 'log', '-1', '--format=%s'), `Merge branch '${branch}'`);
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
  assert.equal(readRun(first.id).steps.ship!.taskId, null);
  assert.equal(readRun(second.id).steps.ship!.workspace, repo, "and the one that was filed is in the repository's own checkout");

  // Pass after pass, while that step is in the checkout: read from the world each time.
  assert.deepEqual((await advance(e, readRun(first.id))).filed, []);
  // And both screens say which run's step has it.
  const listed = await list(e, readRun(first.id));
  assert.equal(listed.steps.find((s) => s.name === 'ship')!.status, `waiting for the checkout (${second.id}'s ship has it)`);
  const { decision, checkout } = await decide(e, first.id);
  assert.deepEqual([decision.kind, decision.kind === 'running' ? decision.waiting : []], ['running', ['ship']]);
  assert.deepEqual(checkout, { run: second.id, step: 'ship' });
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.map(String).join(' ')); });
  try { await main(['decide', first.id], e); } finally { log.mock.restore(); }
  assert.ok(printed.includes(`  ship: waiting for the checkout (${second.id}'s ship has it) — it works in the repository's own checkout, `
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

test("a try of an ending step waits for the checkout as its first filing does: a person's send-back of a ship that ended blocked files nothing while another run's ship is merging", async () => {
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
    ['succeeded · BLOCKED', `try 2 asked (--nudge) — waiting for the checkout (${first.id}'s ship has it)`]);

  // Once the step in the checkout settles, the try is filed there, as any try of it would be.
  settle(`${first.id}-ship`, 'succeeded', SIGNED);
  const tried = await advance(e, readRun(second.id));
  assert.deepEqual(tried.tried, ['ship']);
  assert.equal(readRun(second.id).steps.ship!.workspace, repo);
});

test("a cancelled run holds the checkout while its ending's session is still in it: `wf cancel` asks the engine to stop it, and it is still merging until it has", async () => {
  const { repo, first, second, e, settle, tasks } = await twoApproved();
  await advance(e, readRun(second.id));
  assert.equal(tasks.get(`${second.id}-ship`)!.phase, 'pending', 'its session is in the checkout');

  // Called off: the engine is asked to stop it, and until it has settled that agent is still mid `git merge` in that directory.
  const { plan } = await cancel(e, second.id);
  assert.deepEqual(plan.kind === 'cancel' ? plan.stop.map((x) => x.name) : [], ['ship']);
  assert.deepEqual((await advance(e, readRun(first.id))).filed, [], 'so the other run files nothing into it');
  assert.equal((await list(e, readRun(first.id))).steps.find((s) => s.name === 'ship')!.status, `waiting for the checkout (${second.id}'s ship has it)`);

  // Settled `stopped`, a tick or two later: the checkout is free, and the next pass takes it.
  settle(`${second.id}-ship`, 'stopped');
  assert.deepEqual((await advance(e, readRun(first.id))).filed, ['ship']);
  assert.equal(readRun(first.id).steps.ship!.workspace, repo);
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
