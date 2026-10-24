/**
 * What a step's worktree is given when it is cut, on git and npm for real: what `.worktreeinclude` lists from the main checkout, a
 * `node_modules` of its own by hard links or by `npm ci`, the lines `nemia start` and `nemia plan` refuse, a worktree a dying pass
 * left, read by its `.git`, and a cancel that lands while `npm ci` runs. The test place models no ignore rule and no link, and no
 * stand-in starts `npm`, so these keep the git place; the rest of the run store is walked in store.test.ts.
 *
 * `WF_ROOT` is set before the runner is imported, since it is read as the module loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { type TaskSpec, ForgetRefused } from 'agent-runtime';
import type { TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { promised } from './promised.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-store-install-');
const WORKFLOW = path.join(ROOT, 'workflow');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
fs.mkdirSync(WORKFLOW, { recursive: true });
fs.writeFileSync(path.join(WORKFLOW, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
fs.writeFileSync(path.join(WORKFLOW, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, cancelRun, forgetRun, startRun, startPlan, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');
const { LINE_NAME } = await import('../src/run.ts');

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

const gitOut = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/**
 * An engine board a test settles by hand. It keeps what each task was filed with — so a view carries
 * the closeout schema the run really asked for — and counts every filing. Each task's session is its
 * own (`native-<id>`), and a settled task carries the exit code it is given, as a detached one does.
 *
 * Beside the engine it hands back what a test sets or reads on it:
 * - `said`: what the engine journalled as said to each task (`say`), in order: its view's `state.said`.
 * - `deaf`: tasks whose session is not given the words: `say` rejects, with no exit code, and journals nothing.
 * - `waiting`: what the harness says each task's session waits for, as `claude agents` says it: the engine carries it onto the view
 *   (`TaskView.waitingFor`).
 * - `denials`: what the harness denied each task's last attempt, as the runtime records it on the attempt's end (`Attempt.denials`):
 *   once it has settled.
 * - `closedOut`: whether each task's last attempt gave the statement it was asked for, as the runtime reports it (`Attempt.closedOut`):
 *   once it has settled, its attempt ended `done` by its harness with the fact beside it. Absent, the attempt carries no such key, as
 *   an older journal's does.
 */
const board = () => {
  type Filed = TaskSpec & { id: string };
  const tasks = new Map<
    string,
    { spec: Filed; phase: TaskPhase; closeout?: unknown; exitCode?: number; reason?: string | string[]; usage?: object }
  >();
  const filings: string[] = [];
  const stopped: string[] = [];
  const logs = new Map<string, string>();
  const outputs = new Map<string, string>();
  const said = new Map<string, Array<{ at: string; attempt: number; text: string }>>();
  const deaf = new Set<string>();
  const waiting = new Map<string, string>();
  const denials = new Map<string, Array<{ tool: string; what?: string }>>();
  const closedOut = new Map<string, boolean>();
  const forgets: { taskIds: string[]; yes: boolean }[] = [];
  const endOf = (reason: string) =>
    reason === 'budget' ? { ended: 'failed', reason: 'harness', limit: 'budget' } : { ended: 'failed', reason };
  let clock = Date.parse('2026-09-14T16:00:00.000Z');
  const e = promised({
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      const reasons = Array.isArray(t?.reason) ? t.reason : [t?.reason];
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        ...(waiting.get(id) ? { waitingFor: waiting.get(id) } : {}),
        state: {
          brief: t?.spec.brief ?? '',
          closeoutSchema: t?.spec.closeoutSchema,
          settled,
          stopRequested: false,
          said: said.get(id) ?? [],
          /**
           * An attempt given a reason ended `failed` with it, as the engine records a session that went quiet unsigned, or broke. What it
           * consumed is on it once it has settled, and not before: a job writes its cost as it prints its result. Given several
           * reasons, one attempt ended with each, in order, and the last carries what the task settled with. `budget` is no end the
           * runtime judges: its harness's cut is carried on a failed end as `limit`, as the runtime records it.
           */
          attempts:
            !t || t.phase === 'pending'
              ? []
              : reasons.map((reason, i) =>
                  i < reasons.length - 1
                    ? { n: i + 1, ...endOf(reason!), nativeId: `native-${id}`, exitCode: null, usage: null }
                    : {
                        n: i + 1,
                        nativeId: `native-${id}`,
                        closeout: t.closeout,
                        exitCode: t.exitCode ?? null,
                        usage: settled && t.usage ? t.usage : null,
                        ...(reason ? endOf(reason) : { ended: null }),
                        ...(settled && denials.get(id) ? { denials: denials.get(id) } : {}),
                        ...(settled && !reason && closedOut.has(id)
                          ? { ended: 'succeeded', reason: 'harness', closedOut: closedOut.get(id) }
                          : {}),
                      },
                ),
        },
      };
    },
    file: async (spec: Filed) => {
      filings.push(spec.id);
      tasks.set(spec.id, { spec, phase: 'pending' });
      return spec.id;
    },
    stop: async (id: string) => {
      stopped.push(id);
    },
    logs: async (id: string) => logs.get(id) ?? '(no output yet)',
    /** A stream of a task's latest attempt the runtime kept, by `<id>.<stream>`: none where a test set none, as for a check run before. */
    output: async (id: string, stream: string) => outputs.get(`${id}.${stream}`),
    /**
     * The engine's `say`, as far as a run can tell it: refused in its words, exit code 2, for empty words, a task it has no record of, one
     * settled and one not started; rejected with no exit code for a session not given the words; otherwise journalled on the task, and
     * returned.
     */
    say: async (id: string, text: string) => {
      const refuse = (why: string) => Object.assign(new Error(`say: ${why}`), { exitCode: 2 });
      if (!text.trim()) throw refuse('`text` is empty. Give the words the session should hear.');
      const t = tasks.get(id);
      if (!t) throw refuse(`\`${id}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`);
      if (['succeeded', 'failed', 'stopped'].includes(t.phase))
        throw refuse(`\`${id}\` has settled (${t.phase}): no session of it is running to hear anything.`);
      if (t.phase === 'pending') throw refuse(`\`${id}\` has not started an attempt yet, so there is no session to hear anything.`);
      if (deaf.has(id)) throw new Error(`say: ae/${id}/1 was not given the words (connect ECONNREFUSED). Nothing was journalled.`);
      const entry = { at: new Date((clock += 60_000)).toISOString(), attempt: 1, text };
      said.set(id, [...(said.get(id) ?? []), entry]);
      return entry;
    },
    /**
     * The engine's `forget`, as far as a run can tell it: refused whole for a task not settled, naming it; otherwise each task taken off
     * the board with `yes`, its journal 1 KB and its 2 lines in the feed, and each call counted on `forgets`.
     */
    forget: async (ids: string[], options?: { yes?: boolean }) => {
      forgets.push({ taskIds: [...ids], yes: options?.yes === true });
      for (const id of ids)
        if (!['succeeded', 'failed', 'stopped'].includes(tasks.get(id)?.phase ?? 'pending'))
          throw new ForgetRefused({ taskId: id, message: `forget: \`${id}\` has not settled: stop it first.` });
      if (options?.yes) for (const id of ids) tasks.delete(id);
      return { forgotten: options?.yes === true, tasks: ids.map((taskId) => ({ taskId, journalBytes: 1024, feedLines: 2, sessions: [] })) };
    },
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, exitCode?: number, reason?: string | string[], usage?: object) =>
    Object.assign(tasks.get(id)!, { phase, closeout, exitCode, reason, usage });
  return { e, tasks, filings, stopped, forgets, settle, logs, outputs, said, deaf, waiting, denials, closedOut };
};

/** A workflow folder: `implement`, with whatever frontmatter it is given, and `review` after it. */
const folder = (implementKeys = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\nplace: git\n${implementKeys ? `${implementKeys}\n` : ''}---\nimplement it\n`);
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};

/** A run this file started on a repository: a repository run, whose repository and base branch are on its record. */

/**
 * A main checkout with npm workspaces: `packages/x`, a lockfile npm wrote, committed; then, as a person's
 * checkout has them, gitignored things — a `node_modules` written by hand (`x` linked, `third` main's
 * own, npm's `.package-lock.json`), so no registry is asked. npm's record of what it installed is what the
 * lockfile named, as npm would leave it; the run reads the disk instead.
 */
const aNodeRepo = (include?: string): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'node-repo-'));
  const put = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), text);
  };
  put('package.json', JSON.stringify({ name: 'fixture', private: true, workspaces: ['packages/*'] }));
  put('packages/x/package.json', JSON.stringify({ name: 'x', version: '1.0.0' }));
  put('packages/x/index.js', "module.exports = 'x';\n");
  put('.gitignore', 'node_modules\n.env.local\nconfig/local/\nescape\n');
  if (include !== undefined) put('.worktreeinclude', include);
  execFileSync('npm', ['install', '--package-lock-only', '--offline', '--no-audit', '--no-fund'], { cwd: repo, stdio: 'ignore' });
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  put('node_modules/third/index.js', "module.exports = 'third';\n");
  fs.copyFileSync(path.join(repo, 'package-lock.json'), path.join(repo, 'node_modules', '.package-lock.json'));
  fs.symlinkSync('../packages/x', path.join(repo, 'node_modules', 'x'));
  return repo;
};

/** `nemia start` as a person types it: worktrees, the default. */
const isolated = async (repo: string) => await runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: folder() }));

test("a step's worktree gets what .worktreeinclude lists from the main checkout — a file, a directory — and a node_modules of its own, never a copy", async () => {
  const repo = aNodeRepo(
    ['# what a worktree needs', '/.env.local', 'config/local/', 'node_modules', 'missing.txt', 'escape', 'notes.txt', ''].join('\n'),
  );
  fs.writeFileSync(path.join(repo, '.env.local'), 'TOKEN=main\n');
  fs.writeFileSync(path.join(repo, 'notes.txt'), 'TOKEN=main\n');
  fs.mkdirSync(path.join(repo, 'config/local/deeper'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'config/local/deeper/a.json'), '{"from":"main"}\n');
  const outside = fs.mkdtempSync(path.join(ROOT, 'outside-'));
  fs.writeFileSync(path.join(outside, 'secret'), "not the step's\n");
  fs.symlinkSync(outside, path.join(repo, 'escape'));

  const run = await isolated(repo);
  fs.appendFileSync(path.join(repo, '.worktreeinclude'), `../${path.basename(outside)}/secret\n`);
  const { e, tasks } = board();
  const pass = await runWith(e, advanceRun(readRun(run.id)));
  const wt = readRun(run.id).steps.implement.workspace!;
  assert.equal(wt, path.join(ROOT, 'worktrees', run.id, LINE_NAME), 'a worktree, as shipped');

  assert.equal(
    fs.readFileSync(path.join(wt, '.env.local'), 'utf8'),
    'TOKEN=main\n',
    "a listed file arrives, `/.env.local` anchored at the root as Claude Code's gitignore syntax writes it",
  );
  assert.equal(
    fs.readFileSync(path.join(wt, 'config/local/deeper/a.json'), 'utf8'),
    '{"from":"main"}\n',
    'a listed directory arrives, whole',
  );
  assert.ok(!fs.existsSync(path.join(wt, 'escape')), 'a listed path that leads out of the repository through a link is not copied');
  assert.ok(!fs.existsSync(path.join(wt, '..', path.basename(outside))), 'nor one that climbs out');
  assert.ok(
    !fs.existsSync(path.join(wt, 'notes.txt')),
    "nor one git does not ignore: copied, the hand-off's `git add -A` would commit it onto the run's branch",
  );
  assert.equal(gitOut(wt, 'status', '--porcelain'), '', 'so the cut leaves nothing for the hand-off to commit');

  assert.ok(
    fs.lstatSync(path.join(wt, 'node_modules')).isDirectory(),
    "`node_modules` was listed, and is not a copy: a directory of the worktree's own",
  );
  assert.ok(fs.lstatSync(path.join(wt, 'node_modules/third')).isDirectory());
  assert.equal(
    fs.statSync(path.join(wt, 'node_modules/third/index.js')).ino,
    fs.statSync(path.join(repo, 'node_modules/third/index.js')).ino,
    "main's packages are hardlinked into it",
  );
  assert.equal(
    fs.realpathSync(path.join(wt, 'node_modules/x')),
    fs.realpathSync(path.join(wt, 'packages/x')),
    'its workspace package is its own',
  );
  assert.ok(!fs.existsSync(path.join(wt, 'node_modules/.package-lock.json')), "without the file npm keeps for main's tree");

  assert.equal(pass.notes.length, 4, 'a line added after `nemia start` is refused by the cut');
  const [skipped, outsideNote, escaped, ignored] = pass.notes;
  assert.ok(skipped.startsWith('implement: .worktreeinclude: skipped missing.txt'), skipped);
  assert.ok(skipped.endsWith('not in the main checkout'), skipped);
  assert.equal(outsideNote, `implement: .worktreeinclude: refused "../${path.basename(outside)}/secret" is outside the repository`);
  assert.ok(escaped.startsWith('implement: .worktreeinclude: refused "escape"'), escaped);
  assert.ok(escaped.endsWith('outside the repository'), escaped);
  assert.ok(ignored.startsWith('implement: .worktreeinclude: refused "notes.txt"'), ignored);
  assert.ok(ignored.includes('is not gitignored'), ignored);
  assert.doesNotMatch(tasks.get(`${run.id}-implement`)!.spec.brief, /npm ci/, 'links cost nothing, and the brief says nothing of them');
});

test("a worktree whose main packages could only be linked — its store on another filesystem — says so in the run's notes: a fenced step's reads under them are denied", async (t) => {
  const run = await isolated(aNodeRepo());
  t.mock.method(fs, 'linkSync', () => {
    throw Object.assign(new Error("EXDEV: cross-device link not permitted, link 'a' -> 'b'"), { code: 'EXDEV', syscall: 'link' });
  });
  const { e } = board();
  const pass = await runWith(e, advanceRun(readRun(run.id)));
  const wt = readRun(run.id).steps.implement.workspace!;
  assert.ok(fs.lstatSync(path.join(wt, 'node_modules/third')).isSymbolicLink());
  assert.deepEqual(pass.notes, [
    "implement: node_modules: main's packages linked, not hardlinked — EXDEV: cross-device link not permitted, link 'a' -> 'b'; a fenced step's reads under it leave its worktree and are denied",
  ]);
});

test('nemia start refuses a .worktreeinclude line outside the repository, by name, before a run is written', async () => {
  const repo = aNodeRepo('/.env.local\n../x\nC:\\x\n.git/hooks\n');
  const runs = fs.readdirSync(path.join(ROOT, 'runs')).length;
  await assert.rejects(
    () => isolated(repo),
    (err: Error & { exitCode?: number }) => {
      assert.match(err.message, /"\.\.\/x" is outside the repository/);
      assert.match(err.message, /"C:\\x" is absolute/);
      assert.match(err.message, /"\.git\/hooks" is git's own/);
      assert.match(err.message, /fix or remove those lines/);
      assert.doesNotMatch(err.message, /\.env\.local/, 'a leading / is the repository root: not refused');
      assert.equal(err.exitCode, 2);
      return true;
    },
  );
  assert.equal(fs.readdirSync(path.join(ROOT, 'runs')).length, runs);
  assert.ok(
    await runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: folder(), isolate: false })),
    '--no-worktree cuts nothing and copies nothing, so it has nothing to refuse',
  );
  assert.ok(
    isolated(aNodeRepo('# for claude --worktree\n/.env.local\n/config/local/\n')),
    'a file written for Claude Code, anchored lines and all, starts a run',
  );
});

test('a worktree whose lockfile asks for what the main checkout has not installed gets its own tree from npm ci before the step is filed, and the step is told why', async () => {
  const repo = aNodeRepo();
  fs.mkdirSync(path.join(repo, 'packages/y'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'packages/y/package.json'), JSON.stringify({ name: 'y', version: '1.0.0' }));
  fs.writeFileSync(path.join(repo, 'packages/y/index.js'), "module.exports = 'y';\n");
  execFileSync('npm', ['install', '--package-lock-only', '--offline', '--no-audit', '--no-fund'], { cwd: repo, stdio: 'ignore' });
  for (const args of [
    ['add', '-A'],
    ['commit', '-q', '-m', 'add y'],
  ]) {
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  }
  assert.ok(
    !fs.existsSync(path.join(repo, 'node_modules/y')),
    'main has not installed y: it landed in the lockfile, committed, and nobody has run `npm install` in main since',
  );
  assert.match(
    fs.readFileSync(path.join(repo, 'node_modules/.package-lock.json'), 'utf8'),
    /node_modules\/y/,
    "though npm's record of main's tree says it has, after --package-lock-only",
  );

  const run = await isolated(repo);
  const { e, tasks } = board();
  const pass = await runWith(e, advanceRun(readRun(run.id)));
  const wt = readRun(run.id).steps.implement.workspace!;
  assert.equal(
    fs.readFileSync(path.join(wt, 'package-lock.json'), 'utf8'),
    fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8'),
    'the lockfiles agree, byte for byte, and are ahead of the tree links would point at',
  );
  assert.deepEqual(pass.filed, ['implement']);
  assert.ok(fs.existsSync(path.join(wt, 'node_modules/.package-lock.json')), 'npm installed a tree here');
  assert.equal(
    fs.realpathSync(path.join(wt, 'node_modules/y')),
    fs.realpathSync(path.join(wt, 'packages/y')),
    'with the package the lockfile names',
  );
  assert.ok(!fs.existsSync(path.join(wt, 'node_modules/third')), "and nothing of main's in it");
  assert.deepEqual(pass.notes, [
    'implement: node_modules: installed with npm ci — package-lock.json asks for packages the main checkout has not installed',
  ]);

  const brief = tasks.get(`${run.id}-implement`)!.spec.brief;
  const at = brief.indexOf('## Where to look');
  assert.ok(at >= 0 && brief.indexOf('`npm ci`', at) > at, 'told under Where to look');
  assert.ok(brief.indexOf('`npm ci`', at) < brief.indexOf('## When you are finished'), 'before the closeout, which stays last');
});

test('a pass that dies after cutting a worktree does not wedge every pass after it', async () => {
  const run = await isolated(aNodeRepo());
  const { e, filings } = board();
  const dying = promised({
    ...(e as object),
    file: async () => {
      throw new Error('the tick died here');
    },
  });
  await assert.rejects(runWith(dying, advanceRun(readRun(run.id))), /the tick died here/);
  const wt = path.join(ROOT, 'worktrees', run.id, LINE_NAME);
  assert.ok(fs.existsSync(path.join(wt, '.git')), 'the worktree and its branch were made');

  const pass = await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual([pass.filed, filings], [['implement'], [`${run.id}-implement`]]);
  assert.equal(readRun(run.id).steps.implement?.workspace, wt, 'in the worktree that pass cut');
});

/** Git in a checkout, as a person types it there. */
const gitIn = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** A workflow of one step, `implement`: its branch is the run's result. */
const oneStep = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
};

const runsWritten = () => fs.readdirSync(path.join(ROOT, 'runs')).length;

/** A card's text: its frontmatter keys, and its body. */
const cardText = (keys: string, body: string) => `---\n${keys}\n---\n${body}\n`;

/** A plan folder holding these files, by name — a function of the folder, so a card can name a workflow by a path from it. */
const aPlan = (files: (dir: string) => Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'plan-'));
  for (const [file, text] of Object.entries(files(dir))) fs.writeFileSync(path.join(dir, file), text);
  return dir;
};

test("REFUSED: nemia plan of a card on the repository whose .worktreeinclude its place's open refuses, before any run is written", async () => {
  const repo = aRepo();
  fs.writeFileSync(path.join(repo, '.worktreeinclude'), '../x\n');
  const plan = aPlan(() => ({ 'a.md': cardText(`workflow: ${oneStep()}`, 'the root') }));
  const before = runsWritten();
  await assert.rejects(runPlaced(startPlan({ dir: plan, repo })), (err: Error & { exitCode?: number }) => {
    assert.equal(
      err.message,
      `${path.join(repo, '.worktreeinclude')}: "../x" is outside the repository. Each line is a gitignored path inside the repository, relative to its root — fix or remove that line.`,
    );
    assert.equal(err.exitCode, 2);
    return true;
  });
  assert.equal(runsWritten(), before);
});

const worktreesOf = (repo: string) =>
  gitIn(repo, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length));
const under = (...parts: string[]) => fs.existsSync(path.join(ROOT, ...parts));

/**
 * A pass held inside `npm ci`, after it has cut its first step's worktree and before it files the step: a main checkout with a lockfile its
 * worktree does not have, and an `npm` first on PATH that waits to be let go. `release` lets it go, and answers with what the pass did.
 */
const heldInNpmCi = async (t: TestContext, b: ReturnType<typeof board>, brief: string) => {
  const repo = aRepo();
  fs.writeFileSync(path.join(repo, 'package-lock.json'), '{}\n');
  const bin = fs.mkdtempSync(path.join(ROOT, 'bin-'));
  const started = path.join(bin, 'started');
  const let_go = path.join(bin, 'release');
  fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\n: > '${started}'\nwhile [ ! -e '${let_go}' ]; do sleep 0.02; done\n`, {
    mode: 0o755,
  });
  const PATH = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${PATH}`;
  t.after(() => {
    process.env.PATH = PATH;
    fs.writeFileSync(let_go, '');
  });
  const run = await runPlaced(startRun({ brief, repo, workflowDir: folder() }));
  const pass = runWith(b.e, advanceRun(readRun(run.id)));
  while (!fs.existsSync(started)) await new Promise((r) => setTimeout(r, 10));
  const wt = path.join(ROOT, 'worktrees', run.id, LINE_NAME);
  assert.ok(worktreesOf(repo).includes(wt), 'the pass has cut the worktree, and not filed the step');
  return {
    run,
    repo,
    wt,
    release: () => {
      fs.writeFileSync(let_go, '');
      return pass;
    },
  };
};

test("REFUSED at shipped defaults: a pass that read a run before `nemia cancel` and is still cutting its step's worktree — `npm ci`, a minute — files nothing once the run is called off and forgotten under it: no session on the board, no record, no worktree made again", async (t) => {
  const b = board();
  const { run, release } = await heldInNpmCi(t, b, 'called off while it is cut');
  assert.deepEqual((await runWith(b.e, cancelRun(run.id))).plan, { kind: 'cancel', stop: [] }, 'nothing in flight to stop');
  assert.equal((await runWith(b.e, forgetRun(run.id))).kind, 'forgotten');
  await release();

  assert.deepEqual(b.filings, [], 'the step is not filed into a worktree that is gone');
  assert.ok(!under('runs', `${run.id}.json`) && !under('runs', run.id) && !under('worktrees', run.id), 'nothing of the run made again');
});

test("REFUSED at shipped defaults: a pass still cutting a step's worktree when `nemia cancel` lands files no session for it — the worktree it cut stays, and `nemia rm` then forgets the run, with nothing in flight", async (t) => {
  const b = board();
  const { run, wt, release } = await heldInNpmCi(t, b, 'cancelled while it is cut');
  await runWith(b.e, cancelRun(run.id));
  const pass = await release();
  assert.deepEqual([pass.filed, b.filings, b.stopped], [[], [], []], 'nothing filed, so nothing to stop');
  assert.equal(readRun(run.id).steps.implement.taskId, null);
  const forgot = await runWith(b.e, forgetRun(run.id));
  assert.deepEqual([forgot.kind, forgot.removed], ['forgotten', [wt]]);
});
