/**
 * What a person and a step read in the git place's own words: the whole screens of `nemia ls` and `nemia decide`, with the branch the
 * repository each test makes is on (`master`, named by the fixture, never git's own default) and the commands it offers, a line of
 * `nemia ls` laid out after that branch, and the sentence a fan-in is told of the paths its merge left in conflict. The test place says each in words of its own, so these keep the git place;
 * what the screens say of a run is walked in store.test.ts.
 *
 * `WF_ROOT` is set before the runner is imported, since it is read as the module loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { type TaskSpec, ForgetRefused } from 'agent-runtime';
import type { Engine } from '../src/runtime-client.ts';
import type { RepositoryRun, Run, TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { decideScreen } from './screens.ts';
import { isRepositoryRun, shownNote } from '../src/run.ts';
import { promised } from './promised.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-screens-git-');
const WORKFLOW = path.join(ROOT, 'workflow');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
fs.mkdirSync(WORKFLOW, { recursive: true });
fs.writeFileSync(path.join(WORKFLOW, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
fs.writeFileSync(path.join(WORKFLOW, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, decideRun, list, startRun, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');

/**
 * A repository with one commit, so `nemia start` has a base to record. It names its own branch `master`, rather than take git's
 * `init.defaultBranch`: the screens below quote that branch by name, and the default is a machine's, unset here and `main` on a
 * runner.
 */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q', '-b', 'master');
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
 * - `stated`: whether each task's last attempt gave the statement it was asked for, as the runtime reports it (`Attempt.stated`): once
 *   it has settled, its attempt ended `done` by its harness with the fact beside it. Absent, the attempt carries no such key, as an
 *   older journal's does.
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
  const stated = new Map<string, boolean>();
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
           * consumed is on it once it has settled, and not before: a `--bg` session writes its cost as its process exits. Given several
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
                        ...(settled && !reason && stated.has(id) ? { ended: 'done', reason: 'harness', stated: stated.get(id) } : {}),
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
  return { e, tasks, filings, stopped, forgets, settle, logs, outputs, said, deaf, waiting, denials, stated };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

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

test("a fan-in whose two parents wrote one file differently is filed told the path its place's make left conflicted and the place's words for seeing it; a clean one is told of no conflict", async () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'left.md'), '---\nplace: git\n---\nthe left half\n');
  fs.writeFileSync(path.join(dir, 'right.md'), '---\nplace: git\n---\nthe right half\n');
  fs.writeFileSync(path.join(dir, 'join.md'), '---\nafter: left, right\nplace: git\n---\njoin them\n');
  const joined = async (left: [string, string], right: [string, string]) => {
    const run = await runPlaced(startRun({ brief: 'two halves', repo: aRepo(), workflowDir: dir }));
    const b = board();
    assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).filed.sort(), ['left', 'right']);
    for (const [step, [file, text]] of [
      ['left', left],
      ['right', right],
    ] as const) {
      fs.writeFileSync(path.join(readRun(run.id).steps[step].workspace!, file), text);
      b.settle(`${run.id}-${step}`, 'succeeded', SIGNED);
    }
    for (let pass = 1; !b.tasks.has(`${run.id}-join`); pass++) {
      assert.ok(pass <= 3, `join is filed within three passes: ${JSON.stringify(readRun(run.id).steps)}`);
      await runWith(b.e, advanceRun(readRun(run.id)));
    }
    return b.tasks.get(`${run.id}-join`)!.spec.brief;
  };
  const conflicted = await joined(['flag.ts', 'export const flag = 1;\n'], ['flag.ts', 'export const flag = 2;\n']);
  assert.match(conflicted, /work of left and right has been merged/);
  assert.match(conflicted, /The merge left conflicts, and they are yours to resolve[^\n]*\n\n- flag\.ts\n\n`git status` shows them\./);
  const clean = await joined(['left.ts', 'export const left = 1;\n'], ['right.ts', 'export const right = 1;\n']);
  assert.match(clean, /work of left and right has been merged/);
  assert.doesNotMatch(clean, /conflict|`git status` shows them/i, 'a merge that left none is told of none');
});

test('a step whose job was denied a call says so — on `nemia ls` beside its line and on `nemia decide` under it — and its status is unchanged', async (t) => {
  const run = await started(folder());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const taskId = `${run.id}-implement`;
  b.denials.set(taskId, [
    { tool: 'Skill', what: 'look' },
    { tool: 'Bash', what: 'pytest' },
    { tool: 'Skill', what: 'look' },
  ]);
  b.settle(taskId, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  const { main } = await import('../src/cli/main.ts');
  const printedBy = async (...args: string[]) => {
    printed.length = 0;
    await main(args, b.e);
    return printed.join('\n');
  };

  const [implement, review] = (await runWith(b.e, list(b.e, readRun(run.id)))).steps;
  assert.deepEqual(
    [implement.status, shownNote(implement)],
    ['unverified · done', 'denied: Skill(look), Bash(pytest)'],
    'each call once, and the status as it was',
  );
  assert.equal(review.note, undefined, 'a step denied nothing says nothing');
  assert.match(
    await printedBy('ls'),
    /^ {3}implement +unverified · done +master {2}· denied: Skill\(look\), Bash\(pytest\)$/m,
    '`nemia ls`: after the branch, unpadded',
  );
  const decided = await runWith(b.e, decideRun(run.id));
  assert.deepEqual(decided.denied, { implement: 'denied: Skill(look), Bash(pytest)' });
  b.settle(`${run.id}-review`, 'succeeded', SIGNED);
  assert.match(
    await printedBy('decide', run.id),
    /\n {2}implement\n(?: {4}.*\n)*? {4}denied: Skill\(look\), Bash\(pytest\)\n/,
    '`nemia decide`: under the step',
  );
  assert.doesNotMatch(printed.join('\n'), /\n {2}review\n(?: {4}.*\n)*? {4}denied:/, 'and under no other');
});

/**
 * `nemia decide`'s whole screen for `run`, with its id, repository and base commit and the store as `<id>`, `<repo>`, `<base>` and
 * `<root>`.
 */
const whole = (t: TestContext, e: Engine, run: RepositoryRun): Promise<string[]> =>
  decideScreen(t, e, [run.id], { '<id>': run.id, '<root>': ROOT, '<repo>': run.repo, '<base>': run.baseRef });

test('the whole screen of a run from an inbox card, given a file, whose step its harness waits on and is told a word, and then denied a call', async (t) => {
  const given = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'notes.txt');
  fs.writeFileSync(given, 'read me\n');
  const run = repositoryRunOf(
    await runPlaced(
      startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: folder(), isolate: false, from: { inbox: 'card-7' }, inputs: [given] }),
    ),
  );
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const taskId = `${run.id}-implement`;
  b.tasks.get(taskId)!.phase = 'running';
  b.waiting.set(taskId, 'a permission prompt: Bash(npm test)');
  b.said.set(taskId, [{ at: '2026-09-14T16:01:00.000Z', attempt: 1, text: 'mind the lockfile' }]);
  assert.deepEqual(await whole(t, b.e, run), [
    '<id>  add a flag',
    '  from inbox card card-7',
    '  inputs  notes.txt  —  in <root>/runs/<id>/inputs',
    '',
    '  still running: implement',
    '  implement: waiting for a permission prompt: Bash(npm test) — answer it in Claude Code: claude agents, session ae/<id>-implement/1',
    '  nothing to decide yet',
  ]);
  b.denials.set(taskId, [{ tool: 'Bash', what: 'npm test' }]);
  b.settle(taskId, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-review`, 'succeeded', SIGNED);
  assert.deepEqual(await whole(t, b.e, run), [
    '<id>  add a flag',
    '  from inbox card card-7',
    '  inputs  notes.txt  —  in <root>/runs/<id>/inputs',
    '',
    '  UNVERIFIED: implement, review  — no check: declared; only its own word says it worked',
    '',
    '  touched  master',
    '    nothing — the branch changed no file against the base',
    '  lesson  nothing written where the next agent reads',
    '',
    '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
    '  none',
    '',
    '  implement',
    '    harness  waiting for a permission prompt: Bash(npm test) — answer it in Claude Code: claude agents, session ae/<id>-implement/1',
    '    denied: Bash(npm test)',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed not known  settled before it spawned  used not measured',
    '    said to try 1, at 2026-09-14T16:01:00.000Z:',
    '    ```text',
    '    mind the lockfile',
    '    ```',
    '    did it',
    '',
    '  review',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed not known  settled before it spawned  used not measured',
    '    did it',
    '',
    '  cost  run not measured',
    '  timeline  run  queued —  ran —  wall not known',
    '',
    '  master',
    '',
    '  worked directly on master; nothing to merge; the base was <base>',
    '  read it    git -C <repo> diff <base>...master',
  ]);
});

test('the whole screen of a step its harness ended at its budget', async (t) => {
  const run = await started(folder());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, 'failed', undefined, undefined, 'budget');
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(await whole(t, b.e, run), [
    '<id>  add a flag',
    '',
    '  BUDGET EXHAUSTED, waiting on you: implement  — its harness ended its session at its budget:; nothing after it ran',
    '',
    '  once more, on the next tick:',
    '    implement: budget exhausted. Continue its session, told what happened:  nemia retry <id> implement  (--fresh, or --model <m>, for a new session)',
    '',
    '  touched  master',
    '    nothing — the branch changed no file against the base',
    '  lesson  nothing written where the next agent reads',
    '',
    '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
    '  none',
    '',
    '  implement',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed not known  settled before it spawned  used not measured',
    '',
    '  cost  run not measured',
    '  timeline  run  queued —  ran —  wall not known',
    '',
  ]);
});

test('the whole screen of a step that says `denials: fail`, denied a call', async (t) => {
  const run = await started(folder('denials: fail'));
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.denials.set(`${run.id}-implement`, [{ tool: 'Write', what: '/tmp/w/notes.md' }]);
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(await whole(t, b.e, run), [
    '<id>  add a flag',
    '',
    '  DENIED, waiting on you: implement  — its harness denied its try a call, and denials: fail passes none on; nothing after it ran, and its check was not run',
    '',
    '  once more, on the next tick:',
    "    implement: denied — its harness denied its try a call, and denials: fail passes none on. For a new run, add Edit(//tmp/w/notes.md) to the folder's allowedTools:, which allows it. This run's allowedTools: is frozen at nemia start, so a try of it is denied the same again. A new session, told to do without it:  nemia retry <id> implement --fresh  (or continue its session: nemia retry <id> implement)",
    '',
    '  touched  master',
    '    nothing — the branch changed no file against the base',
    '  lesson  nothing written where the next agent reads',
    '',
    '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
    '  none',
    '',
    '  implement',
    '    denied: Write(/tmp/w/notes.md)',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed not known  settled before it spawned  used not measured',
    '    did it',
    '',
    '  cost  run not measured',
    '  timeline  run  queued —  ran —  wall not known',
    '',
  ]);
});

test('the whole screen of a step whose closeout does not read, never nudged', async (t) => {
  const run = await started(folder());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.stated.set(`${run.id}-implement`, true);
  b.settle(`${run.id}-implement`, 'succeeded', '{"outcome": "done", "summary": ');
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(await whole(t, b.e, run), [
    '<id>  add a flag',
    '',
    '  UNSIGNED: implement  — ended without the closeout it was asked for, or without a field its output: declares, or its closeout named a file the run does not have; nothing after it ran',
    '',
    '  once more, on the next tick:',
    '    implement: unsigned. Continue its session, told what happened:  nemia retry <id> implement  (--fresh, or --model <m>, for a new session)',
    '',
    '  touched  master',
    '    nothing — the branch changed no file against the base',
    '  lesson  nothing written where the next agent reads',
    '',
    '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
    '  none',
    '',
    '  implement',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed not known  settled before it spawned  used not measured',
    '    closeout unreadable — unparseable: Unexpected end of JSON input',
    '',
    '  cost  run not measured',
    '  timeline  run  queued —  ran —  wall not known',
    '',
  ]);
});

test('the whole screen of a run whose every step passed its check', async (t) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\ncheck: true\n---\nimplement it\n');
  const run = await started(dir);
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.logs.set(`${run.id}-implement-check`, '# pass 1\n');
  b.settle(`${run.id}-implement-check`, 'succeeded', undefined, 0);
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(await whole(t, b.e, run), [
    '<id>  add a flag',
    '',
    '  every step verified',
    '',
    '  touched  master',
    '    nothing — the branch changed no file against the base',
    '  lesson  nothing written where the next agent reads',
    '',
    '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
    '  none',
    '',
    '  implement',
    '    check  true  →  exit 0 ✓',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1        filed not known  settled before it spawned  used not measured',
    '              try 1 check  filed not known  settled before it spawned',
    '    did it',
    '',
    '  cost  run not measured',
    '  timeline  run  queued —  ran —  wall not known',
    '',
    '  master',
    '',
    '  worked directly on master; nothing to merge; the base was <base>',
    '  read it    git -C <repo> diff <base>...master',
  ]);
});
