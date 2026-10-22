/**
 * The end of a run in a real git repository, for what the test place does not model (`ship.test.ts` holds the rest on the test place):
 *
 * - an ending with no check of its own, merged as its prose says: its brief's `git log --oneline`, a commit under `-F`, no trailer;
 * - the git place reading a checkout as a landing needs it: an octopus of two tips, a conflict within git, a linked worktree, and the
 *   refusal of an abort in git's words;
 * - an ending staged, checked and landed: the git place's denials on its session (`Bash(git commit:*)`), and no trailer on the commit;
 * - a check that refuses, and one that does not finish, on the merge: the new try's session is denied git's commit again;
 * - a merge the run is not to commit: a `commit-msg` hook refuses the commit, and its lines reach the record;
 * - a trial merge that reads no commit of the base: a `git` planted first on the `PATH`;
 * - a semantic merge's brief, in the git place's words (`git merge --no-ff --no-commit`, `git show --remerge-diff`), and the same brief
 *   where the engine cannot give the check's output;
 * - a planted place that denies `hg commit`, over the git place's words: that no git word leaks is read against a place that has some.
 *
 * `WF_ROOT` is set before the runner is imported: the module reads it as it loads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { TaskSpec } from 'agent-runtime';
import type { Engine } from '../src/runtime-client.ts';
import type { RepositoryRun, Run, TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { TEAM, TEAM_DEV } from './team.ts';
import { promised } from './promised.ts';
import { Effect } from 'effect';
import { Conflict } from '../src/refusal/refusal.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-ship-git-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const {
  advanceRun,
  approveRun,
  artifactFiles,
  artifactsDir,
  cancelRun,
  decideRun,
  isRepositoryRun,
  list,
  mergeRun,
  retryRun,
  startRun,
  runWith: runEngine,
  gitPlaceLayer,
} = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun, stepsOf } = await import('../src/record/record.store.ts');
const { roundOf } = await import('../src/run.ts');
const { runStore } = await import('../src/record/files.store.ts');
const { main } = await import('../src/cli/main.ts');
type PlaceVerb = import('../src/place/place.ts').PlaceVerb;
const { gitPlace } = await import('../place/git/place.ts');
const { stagedHere, landingDenies, landingWords } = await import('../src/place/landing.store.ts');
const { shippedGitPlace } = await import('../src/place/shipped.store.ts');
type Place = import('../src/place/place.store.ts').Place;
const { filedDenies } = await import('../src/ending/ending.ts');
const { landingContract } = await import('../src/check/check.ts');
type PlaceRequests = import('../src/place/place.ts').PlaceRequests;

const { standingLive } = await import('../src/standing/standing.verb.ts');

/** Whether `branch` of `run` is shipped, its standing asked now, as a person's verb asks it (`standingLive`). */
const isShipped = async (run: RepositoryRun, branch: string) => (await runPlaced(standingLive([run]))).shipped(run, branch);

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

/**
 * What the shipper's own `disallowedTools:` denies: what no step needs, and a push, `gh` whole, a forced branch delete, a kill by name
 * and the browser's unsafe tool.
 */
const SHIPPER_DENIED = [
  'SendMessage',
  'CronCreate',
  'CronDelete',
  'RemoteTrigger',
  'Bash(git push)',
  'Bash(git push:*)',
  'Bash(gh)',
  'Bash(gh:*)',
  'Bash(git branch -D:*)',
  'Bash(git branch --delete --force:*)',
  'Bash(pkill:*)',
  'Bash(killall:*)',
  'mcp__playwright__browser_run_code_unsafe',
];
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
 * An engine board a test settles by hand, as gate.test.ts's: what each task was filed with, and every filing. `settle` takes a check's
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

/**
 * `implement ⇄ review → ship`, as the team's dev is, with its `dev/ship.md` as the ending, whose `after: review` is
 * what this folder has: what a person types `nemia round` at once the loop has handed on.
 */
const loopingFolder = (rounds = 3): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-loop-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  fs.writeFileSync(
    path.join(dir, 'review.md'),
    `---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\nrounds: ${rounds}\n---\nreview it\n`,
  );
  fs.writeFileSync(
    path.join(dir, 'review.schema.json'),
    JSON.stringify(
      {
        type: 'object',
        properties: { again: { type: 'boolean' } },
        required: ['again'],
        additionalProperties: false,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(dir, 'ship.md'), SHIP_MD);
  return dir;
};

/**
 * `implement → ship` with the team's ship.md's `check:` line taken out: an ending with no check of its own, whose own session runs the
 * check and commits, in its prose. Nothing of the run lands such a merge (`landsOnCheck`).
 */
const uncheckedFolder = (): string => {
  const dir = folder();
  const file = path.join(dir, 'ship.md');
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /^check: .+\n/m);
  fs.writeFileSync(file, text.replace(/^check: .+\n/m, ''));
  return dir;
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

test("an approved ending with no check of its own is filed, in the repository's own checkout, and the merge its prose describes ships the run", async () => {
  const { repo, id, branch, e, tasks, settle, base } = await atTheGate({ dir: uncheckedFolder() });
  const { approval } = await runWith(e, approveRun(id, 'ship', 'Merge it.'));
  assert.deepEqual([approval.step, approval.try], ['ship', 1]);

  const filed = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual(filed.filed, ['ship'], 'the approval is what files it');
  const spec = tasks.get(`${id}-ship`)!.spec;
  assert.equal(spec.cwd, repo, "in the repository's own checkout, not a worktree");
  assert.equal(readRun(id).steps.ship.workspace, repo);
  assert.match(spec.brief, new RegExp(`You are in ${repo}, the repository's own checkout, on main`), 'told where the work is: the base');
  assert.match(spec.brief, new RegExp(`git log --oneline main\\.\\.${branch}`), 'and the branch');
  assert.match(spec.brief, /## Approved\n\nA person approved this step before it was filed/);
  assert.match(spec.brief, /Merge it\./, 'and what the person said when they approved it');
  assert.doesNotMatch(
    spec.brief,
    /## The run checks and lands your merge/,
    "with no check of its own it is told nothing of the run's landing, which it does not have",
  );
  assert.deepEqual(
    (spec.config as { disallowedTools?: string[] }).disallowedTools,
    SHIPPER_DENIED,
    "its recipe's fallback is its own: it commits the merge itself, and is denied only what its agent denies",
  );

  git(repo, 'merge', '--no-ff', '--no-commit', branch);
  const files = spec.brief.match(
    /## Files for the person who decides\n\nA report, a log or a screenshot reaches them one way: put it in `([^`]+)`/,
  )?.[1];
  assert.ok(
    files && path.isAbsolute(files) && !files.startsWith(repo),
    `the brief names a directory outside the checkout\n\n${spec.brief}`,
  );
  const message = path.join(files, 'merge-message.txt');
  fs.writeFileSync(
    message,
    `Add sub\n\nadd.ts exports sub beside add.\nRun ${id}, ${branch}: 1 commit; the check passed on the merged tree.\n`,
  );
  git(repo, 'commit', '-F', message);
  const merged = git(repo, 'rev-parse', 'HEAD');
  settle(`${id}-ship`, 'succeeded', { ...SIGNED, artifacts: [message] });
  await runWith(e, advanceRun(readRun(id)));

  const record = readRun(id);
  assert.notEqual(git(repo, 'rev-parse', 'HEAD'), base, 'the base branch has moved');
  assert.equal(
    git(repo, 'log', '-1', '--format=%s'),
    'Add sub',
    "the step, played as its prose says, commits under the subject it wrote into its files directory, with -F: not git's Merge branch",
  );
  assert.equal(git(repo, 'log', '-1', '--format=%(trailers)'), '', 'with no trailer');
  assert.equal(git(repo, 'status', '--porcelain'), '', 'and nothing is left in the checkout, the message included');
  assert.equal(await isShipped(repositoryRun(record), branch), true);
  const { decision, toDecide, standings } = await runWith(e, decideRun(id));
  assert.deepEqual([decision.kind, toDecide, standings], ['shipped', undefined, [{ branch, where: 'on' }]]);
  assert.equal(
    git(repo, 'rev-parse', 'HEAD'),
    merged,
    "the run committed nothing of its own in that checkout: the merge commit is the step's, and the only one",
  );
  assert.equal(git(repo, 'log', '-1', '--format=%P').split(' ').length, 2, 'a merge, of the base and the branch');
  assert.equal(record.steps.ship.landed, undefined, 'and the run wrote nothing of a landing it did not make');
  assert.equal(record.steps.ship.check, undefined, 'nor filed a check');
});

test('the place reads the checkout as a landing needs it: whose merge is staged, a conflict, a result branch it leaves out; land ends it', () => {
  const repo = aRepo();
  const branch = (name: string, file: string, text: string) => {
    git(repo, 'checkout', '-q', '-b', name, 'main');
    fs.writeFileSync(path.join(repo, file), text);
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', name);
    git(repo, 'checkout', '-q', 'main');
    return git(repo, 'rev-parse', name);
  };
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const placed = gitPlace({ env });
  const answered = <V extends PlaceVerb>(verb: V, request: PlaceRequests[V]) => {
    const outcome = placed.askNow(verb, request);
    assert.ok('answer' in outcome, `${verb} answered: ${JSON.stringify(outcome)}`);
    return outcome.answer;
  };
  const status = (checkout: string, tips: Record<string, string>) => answered('status', { checkout, tips });
  const land = (checkout: string, act: { act: 'commit'; message: string } | { act: 'abort' }) =>
    placed.askNow('land', { checkout, ...act });
  const stagedIn = (root: string) => ({ stagedFile: answered('open', { root, isolate: false }).staged });
  const a = branch('wf/r/a', 'a.ts', 'a\n');
  const b = branch('wf/r/b', 'b.ts', 'b\n');
  const base = git(repo, 'rev-parse', 'HEAD');
  const tips = { 'wf/r/a': a, 'wf/r/b': b };
  const marker = stagedIn(repo);
  assert.deepEqual(status(repo, tips), { merging: 'none', conflicted: false, missing: ['wf/r/a', 'wf/r/b'], head: base });
  assert.equal(stagedHere(marker), false);

  git(repo, 'merge', '--no-ff', '--no-commit', 'wf/r/a');
  assert.equal(stagedHere(marker), true, 'read off the file open named alone, which is all a pass asks of a checkout with no landing due');
  assert.deepEqual(status(repo, tips), { merging: 'ours', conflicted: false, missing: ['wf/r/b'], head: base }, 'one branch of two staged');
  assert.equal(status(repo, { 'wf/r/b': b }).merging, 'other', "a merge of a commit that is not one of the run's tips is another's");
  assert.deepEqual(land(repo, { act: 'abort' }), { answer: { aborted: true } });
  assert.equal(git(repo, 'status', '--porcelain'), '');
  const nothing = land(repo, { act: 'abort' });
  assert.ok('refused' in nothing, 'with nothing to abort, the place refuses');
  assert.match(nothing.refused, /MERGE_HEAD|no merge/i, "and says why, in git's words");

  git(repo, 'merge', '--no-ff', '--no-commit', 'wf/r/a', 'wf/r/b');
  assert.deepEqual(status(repo, tips), { merging: 'ours', conflicted: false, missing: [], head: base });
  const made = land(repo, { act: 'commit', message: 'Add a and b\n\nboth.\n' });
  assert.ok('answer' in made && 'commit' in made.answer);
  assert.equal(git(repo, 'log', '-1', '--format=%B'), 'Add a and b\n\nboth.');
  assert.equal(git(repo, 'log', '-1', '--format=%P').split(' ').length, 3, 'an octopus of the base and both tips');
  assert.deepEqual(status(repo, tips), { merging: 'none', conflicted: false, missing: [], head: made.answer.commit }, 'both on HEAD');

  const c1 = branch('wf/r/c1', 'c.ts', 'one\n');
  const c2 = branch('wf/r/c2', 'c.ts', 'two\n');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'c1', 'wf/r/c1');
  assert.throws(() => git(repo, 'merge', '--no-ff', '--no-commit', 'wf/r/c2'));
  assert.deepEqual(
    status(repo, { 'wf/r/c1': c1, 'wf/r/c2': c2 }).conflicted,
    true,
    'a conflict is staged as a merge in progress, with its paths unmerged',
  );
  assert.ok('refused' in land(repo, { act: 'commit', message: 'never\n' }), 'the place refuses to commit a conflict');
  assert.deepEqual(land(repo, { act: 'abort' }), { answer: { aborted: true } });
  assert.equal(git(repo, 'status', '--porcelain'), '');
  assert.equal(stagedHere(marker), false);

  const linked = path.join(path.dirname(repo), `${path.basename(repo)}-linked`);
  const d = branch('wf/r/d', 'd.ts', 'd\n');
  git(repo, 'worktree', 'add', '-q', '-b', 'side', linked, 'main');
  assert.ok(fs.statSync(path.join(linked, '.git')).isFile(), "a linked worktree's .git is a file naming its own git directory");
  const linkedMarker = stagedIn(linked);
  git(linked, 'merge', '--no-ff', '--no-commit', 'wf/r/d');
  assert.equal(stagedHere(linkedMarker), true, 'and its merge is read there, off the file open named for it');
  assert.equal(stagedHere(marker), false, "the main checkout's own merge is its own");
  assert.equal(status(linked, { 'wf/r/d': d }).merging, 'ours');
  assert.deepEqual(land(linked, { act: 'abort' }), { answer: { aborted: true } });
  assert.equal(stagedHere(linkedMarker), false);
  assert.equal(stagedHere({ stagedFile: path.join(repo, 'no-such', 'MERGE_HEAD') }), false, 'no checkout, no merge');
});

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

const mergeHead = (repo: string): boolean => fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD'));

/**
 * What the ship's check leaves in its files directory when its e2e runs on the merged tree (`WF_ARTIFACTS`): a picture per page and
 * theme, `-failed` for a page that failed. By default the shape of a web run's `artifacts/ship` in the owner's store: 252 of them,
 * about 194 KB each, 48.9 MB. The bytes in the directory before, to measure what a landing frees.
 */
const photographed = (id: string, { count = 252, bytes = 194_000 } = {}): { dir: string; pictures: string[]; before: number } => {
  const dir = artifactsDir({ id }, 'ship');
  fs.mkdirSync(dir, { recursive: true });
  const pictures = Array.from({ length: count }, (_, i) => `page-${String(i).padStart(3, '0')}-${i % 2 ? 'dark' : 'light'}.png`);
  pictures[0] = 'answer-light-failed.png';
  for (const name of pictures) fs.writeFileSync(path.join(dir, name), Buffer.alloc(bytes, 1));
  return { dir, pictures, before: bytesIn(dir) };
};
const bytesIn = (dir: string): number =>
  artifactFiles({ id: path.basename(path.dirname(path.dirname(dir))) }, 'ship').reduce((sum, f) => sum + f.bytes, 0);
const pngsIn = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.png'))
        .sort()
    : [];

test("an approved ending stages the merge and signs off its message; the run executes ship's check on the merged tree, and commits the merge only on its exit 0", async () => {
  const { repo, id, branch, e, tasks, settle, base, signed, checkId } = await stagedAndSigned();
  const spec = tasks.get(`${id}-ship`)!.spec;
  assert.match(
    spec.brief,
    /## The run checks and lands your merge\n\nOnce you sign off, the run executes `npm test && npm run typecheck && /,
    'told what the run does with what it stages',
  );
  assert.match(spec.brief, /do not run\nthe check, commit, or abort a clean merge yourself/);
  assert.doesNotMatch(spec.brief, /This workflow's check, which its work was judged by/, "not told the work's check as one to run");
  assert.deepEqual(
    (spec.closeoutSchema as { required: string[] }).required.slice(-1),
    ['message'],
    'asked for the message in its closeout',
  );
  assert.deepEqual(
    (spec.config as { disallowedTools?: string[] }).disallowedTools,
    [...SHIPPER_DENIED, 'Bash(git commit:*)', 'Bash(git merge --continue:*)'],
    "the session may not commit the merge it stages — the run does, on the check's word — beside what the shipper's own disallowedTools denies (filedDenies)",
  );

  assert.deepEqual(signed.checked, ['ship']);
  const check = tasks.get(checkId)!.spec;
  assert.deepEqual(
    [check.harness, check.cwd, check.deadlineSeconds],
    ['check', repo, 2700],
    "the check is filed as any step's is, on the check harness, in the checkout where the merge is, but with a landing's own deadline: " +
      'the e2e on the merged tree runs in it (`LANDING_CHECK_DEADLINE_SECONDS`)',
  );
  const command = readRun(id).workflow!.find((s) => s.name === 'ship')!.check!;
  assert.deepEqual(check.config?.command, ['sh', '-c', command], 'the command frozen on the record, with no install to run first');
  const env = check.config?.env ?? {};
  assert.equal(env.WF_BASE_REF, undefined, 'no WF_BASE_REF: what it judges is the merge, which the command reads off MERGE_HEAD');
  assert.equal(env.WF_WORKSPACE, repo);
  assert.deepEqual(
    Object.keys(env).filter((k) => !/^WF_[A-Z_]+$/.test(k) || k === 'WF_STDERR' || k === 'WF_STDOUT'),
    [],
    'only WF_ names, and none for streams the runtime keeps',
  );
  assert.equal((await runWith(e, list(e, readRun(id)))).steps.find((s) => s.name === 'ship')!.status, 'checking');

  for (const phase of ['pending', 'running'] as const) {
    settle(checkId, phase);
    await runWith(e, advanceRun(readRun(id)));
    assert.equal(
      git(repo, 'rev-parse', 'HEAD'),
      base,
      `${phase}: nothing lands while the check runs, and the base branch stays where it was`,
    );
    assert.equal(mergeHead(repo), true, `${phase}: nothing is taken back, and the merge stays staged`);
  }

  const shot = photographed(id);
  await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual(pngsIn(shot.dir), [...shot.pictures].sort(), "what the check's e2e took of the merged tree stays while it runs");

  settle(checkId, 'succeeded', undefined, 0);
  const landed = await runWith(e, advanceRun(readRun(id)));
  const head = git(repo, 'rev-parse', 'HEAD');
  assert.notEqual(head, base, 'the base branch has moved');
  assert.equal(git(repo, 'log', '-1', '--format=%B'), MESSAGE.trim(), 'under the message the step signed off, whole');
  assert.equal(git(repo, 'log', '-1', '--format=%(trailers)'), '', 'with no trailer');
  assert.equal(git(repo, 'log', '-1', '--format=%P'), `${base} ${git(repo, 'rev-parse', branch)}`, 'a merge, of the base and the branch');
  assert.equal(git(repo, 'status', '--porcelain'), '', 'and nothing is left in the checkout');
  assert.equal(mergeHead(repo), false);
  assert.deepEqual(readRun(id).steps.ship.landed, { commit: head });
  assert.ok(
    landed.notes.includes(`ship: its check passed on the merge, and the run committed its merge onto main as ${head.slice(0, 7)}`),
    landed.notes.join('\n'),
  );
  assert.deepEqual(pngsIn(shot.dir), [], 'landed, its pictures of the merged tree are read by nobody: removed on the pass that lands');
  assert.ok(
    landed.notes.includes(
      'ship: removed the 252 pictures its check took of the merged tree (46.6 MB); e2e-pictures.txt says what they were',
    ),
    landed.notes.join('\n'),
  );
  const note = fs.readFileSync(path.join(shot.dir, 'e2e-pictures.txt'), 'utf8');
  assert.match(
    note,
    new RegExp(
      `^ship's check passed on the merge, and the run committed it as ${head.slice(0, 12)}\\.\nSo the run removed the 252 pictures`,
    ),
  );
  assert.ok(note.includes(`ae logs ${checkId}; its stderr: ae output ${checkId} stderr`), note);
  assert.ok(note.includes('  answer-light-failed.png  189.5 KB\n'), note);
  const after = bytesIn(shot.dir);
  assert.equal(shot.before, 252 * 194_000);
  assert.equal(after, Buffer.byteLength(note), 'a note in their place');
  assert.ok(
    shot.before - after > 48_000_000,
    `on the store's shape, every byte of them less the note's is freed: freed ${shot.before - after} of ${shot.before} bytes`,
  );
  assert.equal(landed.status, 'succeeded');
  const { decision } = await runWith(e, decideRun(id));
  assert.equal(decision.kind, 'shipped');
  const shipLine = (await runWith(e, list(e, readRun(id)))).steps.find((s) => s.name === 'ship')!;
  assert.equal(shipLine.status, 'verified ✓');
  assert.equal(
    shipLine.note,
    `the run committed its merge onto main as ${head.slice(0, 7)}`,
    'nemia ls, and the board after it, say what landed — the commit — where nothing else of a run names it',
  );

  fs.writeFileSync(path.join(shot.dir, 'late.png'), 'a picture put there after the landing');
  await runWith(e, advanceRun(readRun(id)));
  assert.equal(git(repo, 'rev-parse', 'HEAD'), head, 'once for the try: a pass after it commits nothing more, whatever the checkout holds');
  assert.deepEqual(pngsIn(shot.dir), ['late.png'], 'and removes nothing more');
  assert.equal(fs.readFileSync(path.join(shot.dir, 'e2e-pictures.txt'), 'utf8'), note, 'nor writes the note again');
});

for (const [said, exitCode, words] of [
  ['refuses', 1, 'its check refused the merge (exit 1)'],
  ['does not finish', undefined, 'its check did not finish'],
] as const) {
  test(`REFUSED at shipped defaults: a check that ${said} on the merge has the run abort it — the base branch never moves, and a try of ship merges again, never --recheck`, async (t) => {
    const { repo, id, e, tasks, settle, base, checkId } = await stagedAndSigned();
    const shot = photographed(id, { count: 4, bytes: 10 });
    settle(checkId, 'failed', undefined, exitCode);
    const pass = await runWith(e, advanceRun(readRun(id)));
    assert.deepEqual(
      pngsIn(shot.dir),
      [...shot.pictures].sort(),
      "nothing landed, so every picture stays for whoever reads why, the failed page's among them",
    );
    assert.equal(fs.existsSync(path.join(shot.dir, 'e2e-pictures.txt')), false, 'and no note stands in for them');
    assert.ok(!pass.notes.some((n) => n.includes('pictures')), pass.notes.join('\n'));
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base, 'nothing landed');
    assert.equal(git(repo, 'status', '--porcelain'), '', 'and the checkout is as it was: the merge was aborted');
    assert.equal(mergeHead(repo), false);
    assert.deepEqual(
      readRun(id).steps.ship.landed,
      { aborted: words, ...(exitCode === undefined ? {} : { refusedOn: base }) },
      'the base `nemia merge` reads, on a refusal alone',
    );
    assert.ok(pass.notes.includes(`ship: ${words}, so the run aborted its merge; nothing landed on main`), pass.notes.join('\n'));
    const shipLine = (await runWith(e, list(e, readRun(id)))).steps.find((s) => s.name === 'ship')!;
    assert.equal(shipLine.status, `failed ✗ check (${exitCode === undefined ? 'unfinished' : 'exit 1'})`);
    assert.equal(shipLine.note, `nothing landed on main: ${words}`, 'and why nothing landed');

    const printed = (await decideLines(t, e, id)).flatMap((l) => l.split('\n'));
    const line = printed.find((l) => l.trimStart().startsWith('ship: '))?.trim();
    assert.ok(line, printed.join('\n'));
    assert.ok(line.includes(`nemia retry ${id} ship`), line);
    assert.ok(!printed.some((l) => l.includes('--recheck')), printed.join('\n'));
    if (exitCode === undefined)
      assert.equal(
        line,
        `ship: its check did not finish, so the run aborted the merge and nothing landed on main. Merge and check again:  nemia retry ${id} ship`,
      );

    await assert.rejects(runWith(e, retryRun(id, 'ship', { mode: 'recheck' })), (err: unknown) => {
      assert.ok(err instanceof Conflict, String(err));
      assert.equal(err.exitCode, 2);
      assert.ok(err.message.startsWith('--recheck '), err.message);
      const why = exitCode === undefined ? 'did not finish' : 'refused it';
      assert.ok(err.message.includes('when its check ' + why + ': '), err.message);
      assert.ok(err.message.includes('nothing staged for it to judge'), err.message);
      assert.ok(err.message.endsWith('nemia retry ' + id + ' ship.'), err.message);
      return true;
    });
    await runWith(e, retryRun(id, 'ship', { mode: 'nudge' }));
    assert.deepEqual(
      (await runWith(e, advanceRun(readRun(id)))).tried,
      ['ship'],
      'the try the refusal names is honoured: a new try of ship, which stages the merge again and is checked again',
    );
    assert.equal(readRun(id).steps.ship.landed, undefined, 'and the new try has landed nothing yet');
    const again = tasks.get(readRun(id).steps.ship.taskId!)!.spec.config as { disallowedTools?: string[]; allowedTools?: string[] };
    assert.ok(again.disallowedTools?.includes('Bash(git commit:*)'), 'and it may not commit the merge either');
    assert.ok(
      again.allowedTools?.includes(`Read(/${path.join(ROOT, 'runs', id, 'artifacts')}/**)`),
      "and it reads its run's artifacts again",
    );
  });
}

test('REFUSED at shipped defaults: a merge the run is not to commit is aborted — the run called off while its check ran, a message left blank, and a commit git refuses', async () => {
  {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
    await runWith(e, cancelRun(id));
    settle(checkId, 'stopped');
    await runWith(e, advanceRun(readRun(id)));
    assert.deepEqual(
      readRun(id).steps.ship.landed,
      { aborted: 'the run was called off before its merge was committed' },
      'called off while the check runs on the merge: the check stops, and the merge is taken back, cancelled or not',
    );
    assert.equal(mergeHead(repo), false);
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  }
  {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned({ message: '  \n' });
    settle(checkId, 'succeeded', undefined, 0);
    await runWith(e, advanceRun(readRun(id)));
    assert.deepEqual(
      readRun(id).steps.ship.landed,
      { aborted: 'ship signed off no commit message' },
      "signed off with no message, the check passed: nothing is committed under git's default or none",
    );
    assert.equal(mergeHead(repo), false);
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  }
  {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
    fs.writeFileSync(
      path.join(repo, '.git', 'hooks', 'commit-msg'),
      '#!/bin/sh\necho "commit-msg: refused by the hook" >&2\necho "  see CONTRIBUTING" >&2\nexit 1\n',
      { mode: 0o755 },
    );
    const shot = photographed(id, { count: 3, bytes: 10 });
    settle(checkId, 'succeeded', undefined, 0);
    await runWith(e, advanceRun(readRun(id)));
    assert.deepEqual(pngsIn(shot.dir), [...shot.pictures].sort(), 'its check passed and nothing landed: every picture is kept');
    const landed = readRun(id).steps.ship.landed as { aborted: string };
    assert.match(
      landed.aborted,
      /^the place refused the commit of its merge: .*refused by the hook \/ see CONTRIBUTING$/,
      "a hook refused the commit: the merge is aborted, and the place's words, git's lines, are on the record, joined on one",
    );
    const note = (await runWith(e, list(e, readRun(id)))).steps.find((s) => s.name === 'ship')!.note!;
    assert.match(
      note,
      /^nothing landed on main: the place refused the commit of its merge: .*refused by the hook \/ see CONTRIBUTING$/,
      "nemia ls prints them on the step's row, never a line break inside it",
    );
    assert.equal(mergeHead(repo), false);
    assert.equal(git(repo, 'status', '--porcelain'), '');
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  }
});

/**
 * An ending stopped on its base branch: `implement ⇄ review → ship`, implement verified, review done with `again: false`, ship approved
 * at try 1, filed in the repository's own checkout, and signed off blocked — the work does not hold on the base branch as it is now.
 */
async function stoppedOnBase(dir = loopingFolder()) {
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: dir }));
  const b = board();
  const { e, settle } = b;
  await runWith(e, advanceRun(readRun(run.id)));
  const work = readRun(run.id).steps.implement;
  fs.appendFileSync(path.join(work.workspace!, 'add.ts'), 'export const sub = (a, b) => a - b;\n');
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  if (readRun(run.id).steps.review) {
    settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: false });
    await runWith(e, advanceRun(readRun(run.id)));
  }
  await runWith(e, approveRun(run.id, 'ship', 'Merge it.'));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['ship']);
  settle(`${run.id}-ship`, 'succeeded', STOPPED);
  await runWith(e, advanceRun(readRun(run.id)));
  return { repo, id: run.id, branch: work.branch!, ...b, base: git(repo, 'rev-parse', 'HEAD') };
}

const STOPPED = {
  outcome: 'blocked',
  summary: 'main moved since the branch was cut: the trial merge conflicts in add.ts, so I aborted it',
  artifacts: [],
  needs: "the branch has to take main: add.ts conflicts with main's sub",
};

/** What `nemia decide` prints for a run, line by line. */
async function decideLines(t: { mock: { method: typeof import('node:test').mock.method } }, e: Engine, id: string): Promise<string[]> {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.map(String).join(' '));
  });
  try {
    await main(['decide', id], e);
  } finally {
    log.mock.restore();
  }
  return printed;
}

/** main moves under the run: a commit on the base branch that gives add.ts a `sub` of its own, which the branch's conflicts with. */
const mainMoves = (repo: string): string => {
  fs.appendFileSync(path.join(repo, 'add.ts'), 'export const sub = (a, b) => b - a;\n');
  git(repo, 'commit', '-q', '-am', "main's sub");
  return git(repo, 'rev-parse', 'HEAD');
};

/** A refusal of `nemia merge`: exit 2, in `words`, and no ask written. */
const mergeRefused = (id: string, words: RegExp) => (err: Error & { exitCode?: number }) => {
  assert.equal(err.exitCode, 2);
  assert.match(err.message, words);
  assert.deepEqual(
    fs.readdirSync(path.join(ROOT, 'runs', `${id}.asks`)).filter((f) => f.startsWith('merge-')),
    [],
  );
  return true;
};

/** A `git` on PATH that answers every command as git does but reading the commit `branch` names, which it says it has none of. */
function blindTo(branch: string): string {
  const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const dir = scratch('wf-ship-blind-git-');
  fs.writeFileSync(
    path.join(dir, 'git'),
    `#!/bin/sh\ncase "$*" in *"rev-parse --verify --quiet ${branch}^{commit}"*) exit 1;; esac\nexec ${real} "$@"\n`,
    { mode: 0o755 },
  );
  return dir;
}

test('REFUSED at shipped defaults: a merge whose trial read no commit of the base says git cannot read it, and `nemia decide` offers none', async () => {
  const { repo, id, e } = await stoppedOnBase();
  mainMoves(repo);
  const before = process.env.PATH;
  process.env.PATH = `${blindTo('main')}${path.delimiter}${before}`;
  try {
    await assert.rejects(
      runWith(e, mergeRun(id)),
      mergeRefused(id, new RegExp(`^git cannot read main in ${repo}\\. Check the repository, then: nemia merge ${id}\\.$`)),
    );
    assert.deepEqual(
      (await runWith(e, decideRun(id))).commands.filter((c) => c.label === 'merge'),
      [],
    );
  } finally {
    process.env.PATH = before;
  }
});

/** What the ship's check printed on the merged tree it refused, as turbo prefixes node's spec reporter: a test failed, listed twice. */
const FAILING = [
  '@x/add:test: ✔ add adds (1.2ms)',
  '@x/add:test: ✖ sub subtracts (2.1ms)',
  '@x/add:test: ℹ fail 1',
  '@x/add:test: ✖ failing tests:',
  '@x/add:test: ✖ sub subtracts (2.1ms)',
].join('\n');

/**
 * A loop's work that merges cleanly onto main and that ship's check refused on the merged tree: implement and review done, ship approved
 * and filed, its merge staged and signed off, and its check settled `failed` with exit 1 — with none where it did not finish (`finished`)
 * — printing `FAILING`; the pass after aborts the merge. The base branch is where the merge was staged on (`base`).
 */
async function refusedOnBase(finished = true) {
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: loopingFolder() }));
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const work = readRun(run.id).steps.implement;
  addSub(work.workspace!);
  git(work.workspace!, 'commit', '-q', '-am', 'add sub');
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: false });
  await runWith(b.e, advanceRun(readRun(run.id)));
  await runWith(b.e, approveRun(run.id, 'ship', 'Merge it.'));
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).filed, ['ship']);
  git(repo, 'merge', '--no-ff', '--no-commit', work.branch!);
  b.settle(`${run.id}-ship`, 'succeeded', { ...SIGNED, message: MESSAGE });
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).checked, ['ship']);
  const checkId = `${run.id}-ship-check`;
  b.settle(checkId, 'failed', undefined, finished ? 1 : undefined);
  b.tasks.get(checkId)!.printed = FAILING;
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.equal(mergeHead(repo), false, 'the run aborted the merge its check refused');
  return { repo, id: run.id, branch: work.branch!, ...b, checkId, base: git(repo, 'rev-parse', 'HEAD') };
}

test("a merge of work that merges cleanly but whose landing check refused the merged tree on the base as it is: the conflict is semantic, the ask names the landing, and the target is told so with the check's failing tests", async () => {
  const { id, e, tasks, checkId, base } = await refusedOnBase();
  assert.deepEqual(
    readRun(id).steps.ship.landed,
    { aborted: 'its check refused the merge (exit 1)', refusedOn: base },
    'the record names the base the refused merge was staged on',
  );
  const before = roundOf(readRun(id), 'review');

  const { ask } = await runWith(e, mergeRun(id));
  const merge = { target: 'implement', try: 2, onto: 'main', sha: base, landing: { step: 'ship', check: checkId } };
  assert.deepEqual(ask.merge, merge);
  assert.deepEqual(
    runStore.asks.read(id).rounds.map((a) => a.merge),
    [merge],
    'the ask file keeps the landing it was asked on',
  );

  const sent = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual([sent.looped, sent.filed], [['review'], []], sent.notes.join('\n'));
  const run = readRun(id);
  assert.equal(roundOf(run, 'review'), before, 'the round stays as it is');
  assert.equal(run.baseRef, base, "the run's base is the commit merged");
  assert.deepEqual(
    run.steps.ship.tries?.map((t) => t.then),
    ['back'],
  );
  assert.equal(run.steps.ship.landed, undefined, 'the ending sent back keeps no landing, and so lets no merge through a second time');
  const brief = tasks.get(`${id}-implement-try2`)!.spec.brief;
  assert.match(brief, /^## Merge main\n/);
  assert.ok(
    brief.includes(
      `the work merges cleanly onto \`main\` as text, but ship's check refused the\nmerged tree at \`${base}\` (exit 1), so the conflict is semantic`,
    ),
    brief,
  );
  assert.ok(brief.includes(`\n    git merge --no-ff --no-commit ${base}\n`), brief);
  assert.ok(!brief.includes(`\n    git merge ${base}\n`), 'never the merge a textual conflict is made by');
  assert.ok(brief.includes('so `git show --remerge-diff` shows the fix'), brief);
  assert.match(brief, /\n## What ship's check said on the merged tree\n/);
  assert.ok(brief.includes(`"exit": 1,\n  "failing": [\n    "@x/add:test: ✖ sub subtracts (2.1ms)"\n  ],\n`), brief);
  assert.ok(brief.includes('You were handed no findings this round.'), 'a merge answers no finding');
});

test("a semantic merge whose check's output the engine cannot give is filed all the same, its brief saying why the output is missing", async () => {
  const { id, e, tasks, checkId } = await refusedOnBase();
  await runWith(e, mergeRun(id));
  tasks.get(checkId)!.printed = new Error('the stream is gone');
  const sent = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual(sent.looped, ['review'], sent.notes.join('\n'));
  const brief = tasks.get(`${id}-implement-try2`)!.spec.brief;
  assert.ok(brief.includes('git merge --no-ff --no-commit'), brief);
  assert.ok(
    brief.includes(
      `What it said cannot be given here — the engine could not give what its task ${checkId} printed: the stream is gone. Its task is \`${checkId}\`.`,
    ),
    brief,
  );
});

test('REFUSED: a landing session is denied and told what its place says — a planted place that denies `hg commit` gives exactly that, and no git word', async () => {
  const say = { ...shippedGitPlace.declared.say, stage: 'hg -R {repo} merge {branches}' };
  const place: Place = { ...shippedGitPlace, declared: { denyWhileLanding: ['Bash(hg commit:*)'], say } };
  const { id, repo, branch } = await atTheGate();
  const run = readRun(id);
  const ship = stepsOf(run).find((s) => s.name === 'ship')!;
  const denied = filedDenies(ship, run, () => landingDenies(run, place))!;
  assert.deepEqual(denied, [...SHIPPER_DENIED, 'Bash(hg commit:*)']);
  assert.equal(
    denied.some((d) => d.includes('git commit')),
    false,
  );
  const words = landingWords(run, ship, place)!;
  assert.deepEqual(words, { stage: `hg -R ${repo} merge ${branch}`, denied: ['Bash(hg commit:*)'] });
  const told = landingContract(ship.check!, words);
  assert.ok(told.includes(`\`hg -R ${repo} merge ${branch}\``), told);
  assert.ok(told.includes('Your fence denies `Bash(hg commit:*)`'), told);
  assert.doesNotMatch(told, /git (commit|merge)/);
  const implement = stepsOf(run).find((s) => s.name === 'implement')!;
  assert.equal(landingWords(run, implement, place), undefined, 'a step that lands nothing is told nothing of it');
});
