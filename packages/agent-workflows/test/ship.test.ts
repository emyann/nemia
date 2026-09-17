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
const { advance, approve, decide, isShipped, list, readRun, retry, start } = await import('../src/runner.ts');
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

const SIGNED = { outcome: 'done', summary: 'did the work', artifacts: [], needs: null };
const BLOCKED = { outcome: 'blocked', summary: 'the check refused', artifacts: [], needs: 'read the suite' };

/** A run of `implement → ship` with implement done and committed on its branch: the run at its result, waiting at the ending's gate. */
async function atTheGate() {
  const repo = aRepo();
  const run = start({ brief: 'add sub', repo, workflowDir: folder() });
  const { e, tasks, filings, settle } = board();
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
