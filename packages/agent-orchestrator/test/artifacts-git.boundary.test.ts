/**
 * A step's declared files as git holds them: a file under an ignored path collected into the step's files directory, a link in a
 * workspace or in the files directory never followed, a file read on its branch as git types it, and a report that is not heard with
 * git off the `PATH`. The test place models no ignore rule and no link, and starts no process to lose, so these keep the git place; the
 * rest of a step's files is walked in store.test.ts.
 *
 * `WF_ROOT` is set before the runner is imported, since it is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { type TaskSpec, ForgetRefused } from 'agent-runtime';
import type { RepositoryRun, Run, TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { isRepositoryRun } from '../src/run.ts';
import { promised } from './promised.ts';
import { Effect } from 'effect';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-artifacts-git-');
const WORKFLOW = path.join(ROOT, 'workflow');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
fs.mkdirSync(WORKFLOW, { recursive: true });
fs.writeFileSync(path.join(WORKFLOW, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
fs.writeFileSync(path.join(WORKFLOW, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const {
  advanceRun,
  artifactFiles,
  artifactsDir,
  missingArtifacts,
  startRun,
  runWith: runEngine,
  gitPlaceLayer,
  builtinGitPlace,
} = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

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
const repositoryRunOf = (run: Run): RepositoryRun => {
  assert.ok(isRepositoryRun(run), `${run.id} works on a repository`);
  return run;
};

/** `nemia start`, for real, over a fresh repository, the steps working in the checkout itself. */
const started = async (dir: string) =>
  repositoryRunOf(await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: dir, isolate: false })));

/** A closeout that declares `artifacts`, and nothing else of note. */
const declaring = (artifacts: string[]) => ({ outcome: 'done' as const, summary: 'did it', artifacts });

/** Git in a checkout, as a person types it there. */
const gitIn = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

test("a file `artifacts` names from the workspace root is collected into the step's files directory when the step hands off, before its check is filed — again, only what changed, after a pass that died — and read from there; an absolute path in the directory is read where it is", async () => {
  const run = await started(folder('check: npm test'));
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const files = artifactsDir(run, 'implement');
  fs.writeFileSync(path.join(run.repo, '.gitignore'), '.e2e/\n');
  fs.mkdirSync(path.join(run.repo, '.e2e'));
  fs.writeFileSync(path.join(run.repo, '.e2e', 'shot.png'), 'png');
  fs.writeFileSync(path.join(run.repo, 'RESPONSE.md'), '# response\n');
  fs.writeFileSync(path.join(files, 'trace.zip'), 'zip');
  const named = ['RESPONSE.md', './.e2e/shot.png', path.join(files, 'trace.zip')];
  b.settle(`${run.id}-implement`, 'succeeded', declaring(named));

  const diesFilingTheCheck = {
    ...b.e,
    file: (spec: Parameters<typeof b.e.file>[0]) => (spec.id?.endsWith('-check') ? Effect.die(new Error('the pass died')) : b.e.file(spec)),
  } as typeof b.e;
  await assert.rejects(runWith(diesFilingTheCheck, advanceRun(readRun(run.id))), /the pass died/);
  assert.equal(
    fs.readFileSync(path.join(files, 'RESPONSE.md'), 'utf8'),
    '# response\n',
    'a file for the branch, collected by the pass that handed off and died filing the check',
  );
  assert.equal(fs.readFileSync(path.join(files, '.e2e', 'shot.png'), 'utf8'), 'png', 'a file git ignores, which never reaches the branch');

  fs.writeFileSync(path.join(run.repo, 'RESPONSE.md'), '# response, amended\n');
  const pass = await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(
    [pass.checked, pass.notes],
    [['implement'], [`implement: collected RESPONSE.md into ${files}`]],
    'the next pass collects again, only what changed since, and files the check',
  );
  assert.equal(fs.readFileSync(path.join(files, 'RESPONSE.md'), 'utf8'), '# response, amended\n');
  assert.equal(fs.readFileSync(path.join(files, 'trace.zip'), 'utf8'), 'zip', 'an absolute path in the directory, where it is');
  assert.deepEqual(missingArtifacts(builtinGitPlace, readRun(run.id), 'implement', declaring(named)), []);
  assert.deepEqual(
    artifactFiles(run, 'implement')
      .map((f) => path.relative(files, f.path))
      .sort(),
    ['.e2e/shot.png', 'RESPONSE.md', 'trace.zip'],
  );

  fs.writeFileSync(path.join(run.repo, 'RESPONSE.md'), '# rewritten while the check ran\n');
  assert.deepEqual(
    (await runWith(b.e, advanceRun(readRun(run.id)))).notes,
    [],
    "once its check is filed, the workspace is the check's: nothing more is collected",
  );
  assert.equal(fs.readFileSync(path.join(files, 'RESPONSE.md'), 'utf8'), '# response, amended\n');
});

test('REFUSED as findings on the screen, never silently: a path that climbs out of the workspace is never read, a link that leads out is not followed, and a directory and a file not there are not collected — the closeout that names them is not accepted, and `nemia decide` names each', async (t) => {
  const run = await started(folder());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const secret = path.join(path.dirname(run.repo), `secret-${run.id}.txt`);
  fs.writeFileSync(secret, "not a step's to name\n");
  fs.mkdirSync(path.join(run.repo, 'shots'));
  fs.writeFileSync(path.join(run.repo, 'shots', 'a.png'), 'png');
  fs.symlinkSync(secret, path.join(run.repo, 'leak.txt'));
  const climbs = `../${path.basename(secret)}`;
  b.settle(`${run.id}-implement`, 'succeeded', declaring([climbs, 'never-written.md', 'shots', 'leak.txt']));

  const spies = [
    'existsSync',
    'statSync',
    'lstatSync',
    'realpathSync',
    'readFileSync',
    'openSync',
    'accessSync',
    'readdirSync',
    'copyFileSync',
    'cpSync',
  ].map((method) => t.mock.method(fs, method as 'statSync'));
  const looked = () =>
    spies
      .flatMap((spy) => spy.mock.calls.flatMap((call) => call.arguments.slice(0, 2).filter((a) => typeof a === 'string')))
      .filter((p) => path.resolve(p) === secret);
  const pass = await runWith(b.e, advanceRun(readRun(run.id)));
  const named = [climbs, 'never-written.md', 'shots', 'leak.txt'];
  assert.deepEqual(
    [pass.filed, pass.tried, pass.notes],
    [
      [],
      ['implement'],
      [
        `implement: its closeout named ${named.join(', ')}, which the run does not have — not accepted`,
        'implement: try 2 — a nudge to sign off, once a round',
      ],
    ],
    'nothing collected, review not filed, and the step asked again',
  );
  assert.deepEqual(artifactFiles(run, 'implement'), []);
  assert.deepEqual(looked(), [], 'the file outside the workspace is neither opened, stat-ed nor resolved by the tick');

  b.settle(`${run.id}-implement-try2`, 'succeeded', declaring(named));
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).tried, [], 'once a round: it waits on a person');
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    out.push(args.map(String).join(' '));
  });
  const { main } = await import('../src/cli/main.ts');
  try {
    await main(['decide', run.id], b.e);
  } finally {
    log.mock.restore();
  }
  const lines = out.join('\n').split('\n');
  const at = lines.indexOf("    implement's closeout named files the run does not have:");
  assert.ok(at >= 0, lines.join('\n'));
  assert.deepEqual(lines.slice(at + 1, at + 6), [
    `      - \`${climbs}\`: it leads out of the workspace, so it was not read.`,
    '      - `never-written.md`: nothing is at that path in the workspace.',
    '      - `shots`: it is a directory, and a closeout names each file.',
    '      - `leak.txt`: it leads out of the workspace, so it was not read.',
    `      it writes each where its brief says, or takes the name off: nemia retry ${run.id} implement`,
  ]);
  assert.deepEqual(looked(), [], 'nor by nemia decide');
});

test('REFUSED at shipped defaults: a copy is never written through a link a step made in its files directory — on the way to it, or in its place — what the link leads to is left as it was, and `nemia decide` names the file not collected, though it is on the branch', async () => {
  const run = await started(folder('check: npm test'));
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const files = artifactsDir(run, 'implement');
  const elsewhere = fs.mkdtempSync(path.join(ROOT, 'elsewhere-'));
  fs.writeFileSync(path.join(elsewhere, 'shot.png'), 'what was there');
  fs.writeFileSync(path.join(elsewhere, 'report.md'), 'what was there');
  fs.symlinkSync(elsewhere, path.join(files, 'shots'));
  fs.symlinkSync(path.join(elsewhere, 'report.md'), path.join(files, 'report.md'));
  fs.mkdirSync(path.join(run.repo, 'shots'));
  fs.writeFileSync(path.join(run.repo, 'shots', 'shot.png'), 'png');
  fs.writeFileSync(path.join(run.repo, 'report.md'), '# report\n');
  const named = ['shots/shot.png', 'report.md'];
  b.settle(`${run.id}-implement`, 'succeeded', declaring(named));

  const pass = await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual([pass.checked, pass.notes], [['implement'], []], 'its check filed, and nothing collected');
  assert.deepEqual(
    Object.fromEntries(fs.readdirSync(elsewhere).map((f) => [f, fs.readFileSync(path.join(elsewhere, f), 'utf8')])),
    {
      'report.md': 'what was there',
      'shot.png': 'what was there',
    },
    'the links the step made in its files directory are never written through',
  );
  assert.equal(
    execFileSync('git', ['cat-file', '-t', `${run.branch}:report.md`], { cwd: run.repo, encoding: 'utf8' }).trim(),
    'blob',
    'handed off, the files are on the branch',
  );
  assert.deepEqual(
    missingArtifacts(builtinGitPlace, readRun(run.id), 'implement', declaring(named)),
    [
      { path: 'shots/shot.png', why: 'not collected' },
      { path: 'report.md', why: 'not collected' },
    ],
    'read from the files directory: what is not collected',
  );
});

test('REFUSED before, now read as it was: a run from before collection — its step past hand-off, its worktree still there, its files on the branch and none in its files directory — has nothing missing, and no pass collects it; a file on no branch still reads not collected', async () => {
  const run = await started(folder('check: npm test'));
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const files = artifactsDir(run, 'implement');
  fs.writeFileSync(path.join(run.repo, '.gitignore'), '.e2e/\n');
  fs.mkdirSync(path.join(run.repo, '.e2e'));
  fs.writeFileSync(path.join(run.repo, '.e2e', 'shot.png'), 'png');
  fs.mkdirSync(path.join(run.repo, 'docs'));
  fs.writeFileSync(path.join(run.repo, 'docs', 'RESPONSE.md'), '# response\n');
  gitIn(run.repo, 'add', '-A');
  gitIn(run.repo, 'commit', '-q', '-m', 'the step, handed off');
  const record = readRun(run.id);
  record.steps.implement = { ...record.steps.implement, check: { taskId: `${run.id}-implement-check` } };
  fs.writeFileSync(path.join(ROOT, 'runs', `${run.id}.json`), JSON.stringify(record, null, 2));
  b.settle(`${run.id}-implement`, 'succeeded', declaring(['docs/RESPONSE.md', '.e2e/shot.png']));
  fs.rmSync(files, { recursive: true, force: true });

  assert.equal(
    execFileSync('git', ['cat-file', '-t', `${run.branch}:docs/RESPONSE.md`], { cwd: run.repo, encoding: 'utf8' }).trim(),
    'blob',
    'as a run from before collection left it: its files on the branch, its check filed, and nothing in its files directory',
  );
  assert.ok(fs.existsSync(path.join(run.repo, 'docs', 'RESPONSE.md')), 'the worktree is still there');
  assert.deepEqual(
    missingArtifacts(builtinGitPlace, readRun(run.id), 'implement', declaring(['docs/RESPONSE.md', '.e2e/shot.png'])),
    [{ path: '.e2e/shot.png', why: 'not collected' }],
    'RESPONSE.md is on the branch; an ignored file is on none',
  );
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).notes, [], 'past hand-off, so no pass collects it');
  assert.deepEqual(artifactFiles(run, 'implement'), [], 'the branch is where the run reads it');
});

test("`nemia decide` of a run whose declared file is only on its branch says nothing is missing — the place says the branch has it — and, where the place's report is not heard, that whether it has it is not known, never that it is not there", async (t) => {
  const run = await started(folder());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  fs.mkdirSync(path.join(run.repo, 'docs'));
  fs.writeFileSync(path.join(run.repo, 'docs', 'RESPONSE.md'), '# response\n');
  gitIn(run.repo, 'add', '-A');
  gitIn(run.repo, 'commit', '-q', '-m', 'the step, handed off');
  b.settle(`${run.id}-implement`, 'succeeded', declaring(['docs/RESPONSE.md']));
  await runWith(b.e, advanceRun(readRun(run.id)));
  fs.rmSync(path.join(run.repo, 'docs'), { recursive: true });
  fs.rmSync(artifactsDir(run, 'implement'), { recursive: true, force: true });
  b.settle(`${run.id}-review`, 'succeeded', { outcome: 'blocked', summary: 'stopped', artifacts: [], needs: 'a person' });
  const { main } = await import('../src/cli/main.ts');
  const flagged = async (): Promise<string[]> => {
    const out: string[] = [];
    const log = t.mock.method(console, 'log', (...args: unknown[]) => {
      out.push(args.map(String).join(' '));
    });
    try {
      await main(['decide', run.id], b.e);
    } finally {
      log.mock.restore();
    }
    const lines = out.join('\n').split('\n');
    return lines.slice(lines.indexOf('  implement')).filter((l) => l.startsWith('    !! '));
  };

  assert.ok(!fs.existsSync(path.join(run.repo, 'docs', 'RESPONSE.md')), 'nowhere but on the branch');
  assert.deepEqual(await flagged(), [], 'the place says the branch has it: it is there');

  const before = process.env.PATH;
  process.env.PATH = scratch('wf-artifacts-no-git-');
  let unheard: string[];
  try {
    unheard = await flagged();
  } finally {
    process.env.PATH = before;
  }
  assert.equal(unheard.length, 1, unheard.join('\n'));
  assert.match(
    unheard[0],
    /^ {4}!! declared and not collected, and whether its branch has it is not known: docs\/RESPONSE\.md {2}— the place's report was not heard: /,
  );
});
