/**
 * The walk of a run's ending on the git place, from the merge its ending step stages to landed: the place's `open` names the
 * staged-merge file, a stat reads the merge staged, a passing check commits it and a refusing one aborts it, and the checkout is clean
 * both ways. One of the three walks kept on real git; `stand-in-run.test.ts` walks a run to landed on the test place.
 *
 * `WF_ROOT` is set before the runner is imported: the module reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { TaskSpec } from 'agent-runtime';
import type { RepositoryRun, Run, TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { TEAM, TEAM_DEV } from './team.ts';
import { promised } from './promised.ts';
import { Effect } from 'effect';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-ship-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, approveRun, isRepositoryRun, startRun, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');
const { stagedHere } = await import('../src/place/landing.store.ts');

/** A run this file started on a repository, as `isShipped` reads one: a repository run. */
const repositoryRun = (run: Run): RepositoryRun => {
  assert.ok(isRepositoryRun(run), `${run.id} works on a repository`);
  return run;
};

/**
 * The ending of the tests' team's `dev` (`team.ts`): the file a person reads, its keys and its agent. It names `agent: shipper`, so the
 * team's agents and skills are copied beside every folder this file makes under `ROOT`.
 */
const SHIP_MD = fs.readFileSync(path.join(TEAM_DEV, 'ship.md'), 'utf8');
fs.cpSync(path.join(TEAM, 'agents'), path.join(ROOT, 'agents'), { recursive: true });
fs.cpSync(path.join(TEAM, 'skills'), path.join(ROOT, 'skills'), { recursive: true });
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

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
 * `implement → ship`, with the team's `dev/ship.md` as its ending — its keys and its agent — with only its `after:` changed, since this
 * folder has no review.
 */
const folder = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  assert.match(SHIP_MD, /^after: review$/m);
  fs.writeFileSync(path.join(dir, 'ship.md'), SHIP_MD.replace(/^after: review$/m, 'after: implement'));
  return dir;
};

/**
 * An engine board a test settles by hand, as the story's stage: what each task was filed with, and every filing. `settle` takes a check's
 * exit code where it is given: a check settled with none did not finish (`exitVerdicts`). `list` views the tasks it is handed that were
 * filed. A check's stdout is empty unless a test gives it (`printed`), and an `Error` given in its place is what reading it throws.
 */
const board = () => {
  type Filed = { id: string; brief: string; cwd?: string; closeoutSchema?: object; config?: TaskSpec['config'] } & Record<string, unknown>;
  const tasks = new Map<string, { spec: Filed; phase: TaskPhase; closeout?: unknown; exitCode?: number; printed?: string | Error }>();
  const filings: string[] = [];
  const e = promised({
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '',
          closeoutSchema: t?.spec.closeoutSchema,
          settled,
          stopRequested: false,
          said: [],
          attempts:
            !t || t.phase === 'pending'
              ? []
              : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: t.exitCode ?? null, usage: null }],
        },
      };
    },
    file: async (spec: Filed) => {
      filings.push(spec.id);
      tasks.set(spec.id, { spec, phase: 'pending' });
      return spec.id;
    },
    stop: async () => {},
    forget: async (ids: string[]) => ({
      forgotten: true,
      tasks: ids.map((taskId) => ({ taskId, journalBytes: 0, feedLines: 0, sessions: [] })),
    }),
    /** A check's verdict is its attempt's exit code (`exitVerdicts`); its log and streams say nothing of it. */
    logs: async () => '(no output yet)',
    output: async (id: string, stream: 'stdout' | 'stderr') => {
      const t = tasks.get(id);
      if (t?.printed instanceof Error) throw t.printed;
      return typeof t?.exitCode === 'number' ? (stream === 'stdout' ? (t.printed ?? '') : '') : undefined;
    },
    feed: async () => ({ entries: [], cursor: 0 }),
    list: async (ids?: readonly string[]) => ({
      views: await Promise.all((ids ?? [...tasks.keys()]).filter((id) => tasks.has(id)).map((id) => Effect.runPromise(e.view(id)))),
      unreadable: [],
    }),
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, exitCode?: number) =>
    Object.assign(tasks.get(id)!, { phase, closeout, exitCode });
  return { e, tasks, filings, settle };
};

const SIGNED = { outcome: 'done', summary: 'did the work', artifacts: [], needs: null };

/** What implement does in its worktree, by default: add.ts gains `sub`. */
const addSub = (workspace: string) => fs.appendFileSync(path.join(workspace, 'add.ts'), 'export const sub = (a, b) => a - b;\n');

/** A repository, a board, a folder and the work implement does, where a test gives its own. */
type Given = { repo?: string; board?: ReturnType<typeof board>; dir?: string; work?: (workspace: string) => void };

/**
 * A run of `implement → ship` with implement done and committed on its branch: the run at its result, waiting at the ending's gate.
 *
 * A repository and a board of its own, unless it is given them: two runs of one repository, on one board, are two endings for one checkout.
 */
async function atTheGate(given: Given = {}) {
  const repo = given.repo ?? aRepo();
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: given.dir ?? folder() }));
  const { e, tasks, filings, settle } = given.board ?? board();
  await runWith(e, advanceRun(readRun(run.id)));
  const work = readRun(run.id).steps.implement;
  (given.work ?? addSub)(work.workspace!);
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  const pass = await runWith(e, advanceRun(readRun(run.id)));
  return { repo, id: run.id, branch: work.branch!, e, tasks, filings, settle, pass, base: git(repo, 'rev-parse', 'HEAD') };
}

const MESSAGE = 'Add sub\n\nadd.ts exports sub beside add.\nThe run, its branch: 1 commit; the check on the merged tree.\n';

/**
 * A run at its ending, approved and filed, whose shipper did as its recipe says: staged the merge of the result in the repository's
 * checkout and signed off `done` with the message — and the pass after, which files ship's check on that merge.
 */
async function stagedAndSigned(given: Given & { message?: string; artifacts?: string[] } = {}) {
  const at = await atTheGate(given);
  await runWith(at.e, approveRun(at.id, 'ship', 'Merge it.'));
  assert.deepEqual((await runWith(at.e, advanceRun(readRun(at.id)))).filed, ['ship']);
  git(at.repo, 'merge', '--no-ff', '--no-commit', at.branch);
  at.settle(`${at.id}-ship`, 'succeeded', { ...SIGNED, artifacts: given.artifacts ?? [], message: given.message ?? MESSAGE });
  const signed = await runWith(at.e, advanceRun(readRun(at.id)));
  return { ...at, signed, checkId: `${at.id}-ship-check` };
}

test('an ending lands through its place, end to end: open names the staged-merge file, a stat reads the merge staged, a passing check commits it and a refusing one aborts it, and the checkout is clean both ways', async () => {
  const passing = await stagedAndSigned();
  const run = repositoryRun(readRun(passing.id));
  assert.equal(run.stagedFile, path.join(passing.repo, '.git', 'MERGE_HEAD'), 'open named the file at `nemia start`, on the record');
  assert.equal(stagedHere(run), true, 'the merge the shipper staged is read by a stat');
  passing.settle(passing.checkId, 'succeeded', undefined, 0);
  await runWith(passing.e, advanceRun(readRun(passing.id)));
  const head = git(passing.repo, 'rev-parse', 'HEAD');
  assert.notEqual(head, passing.base, 'committed');
  assert.equal(git(passing.repo, 'log', '-1', '--format=%B'), MESSAGE.trim(), 'with its message');
  assert.deepEqual(readRun(passing.id).steps.ship.landed, { commit: head });
  assert.equal(git(passing.repo, 'status', '--porcelain'), '');
  assert.equal(stagedHere(repositoryRun(readRun(passing.id))), false, 'and the stat reads no merge staged');

  const refusing = await stagedAndSigned();
  assert.equal(stagedHere(repositoryRun(readRun(refusing.id))), true);
  refusing.settle(refusing.checkId, 'failed', undefined, 1);
  await runWith(refusing.e, advanceRun(readRun(refusing.id)));
  assert.equal(git(refusing.repo, 'rev-parse', 'HEAD'), refusing.base, 'nothing committed');
  assert.equal(git(refusing.repo, 'status', '--porcelain'), '', 'the merge taken back');
  assert.equal(stagedHere(repositoryRun(readRun(refusing.id))), false);
  assert.deepEqual(readRun(refusing.id).steps.ship.landed, { aborted: 'its check refused the merge (exit 1)', refusedOn: refusing.base });
});
