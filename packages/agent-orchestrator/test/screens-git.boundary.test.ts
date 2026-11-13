/**
 * What a person and a step read in the git place's own words, told as four stories: the whole decisions a run's read model gives
 * (`decisionFacts`, what `GET /api/runs/:runId/decision` serves and the client's `nemia decide` prints), each one checkpoint compared
 * whole, with the branch the repository each test makes is on (`master` named by the fixture, never git's own default, or `main` for a
 * repository with a workspace package) and the commands it offers; a line of `nemia ls` laid out after that branch; the sentence a fan-in
 * is told of the paths its merge left in conflict; what a branch touched where only git says it (a rename, a binary file, a lint config's
 * diff); and the git processes `nemia ls` costs. The test place says each in words of its own, so these keep the git place; what a
 * decision says of a run is told on the test place in decide.test.ts.
 *
 * The store is the file's own, at `ROOT`, given as `ENV`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { type TaskSpec, ForgetRefused } from 'agent-runtime';
import type { Engine } from '../src/runtime-client.ts';
import type { RepositoryRun, Run, TaskPhase } from '../src/run.ts';
import { scratch } from 'test-kit/scratch';
import { decisionFacts, decisionOf } from './screens.ts';
import { runLines } from '../src/object/lines.verb.ts';
import { isRepositoryRun, shownNote } from '../src/run.ts';
import { promised } from './promised.ts';
import { runGiven, runOver } from './placed.ts';
import { story } from 'test-kit/checkpoints';
import {
  advanceRun,
  builtinGitPlace,
  changesOf,
  decideRun,
  list,
  retryRun,
  startRun,
  touchedLines,
  runWith as runEngine,
  gitPlaceLayer,
} from '../src/runner.ts';
import { listRuns, runRecord } from '../src/record/record.store.ts';
import { passStanding } from '../src/standing/standing.verb.ts';
import { metered } from '../src/meter/tally.store.ts';
import type { RunsListed } from '../src/list/list.ts';
import { typed } from './typed.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-screens-git-');
const WORKFLOW = path.join(ROOT, 'workflow');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
fs.mkdirSync(WORKFLOW, { recursive: true });
fs.writeFileSync(path.join(WORKFLOW, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
fs.writeFileSync(path.join(WORKFLOW, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');

const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };
const runWith = runOver(runEngine, gitPlaceLayer, ENV);
const runPlaced = runGiven(gitPlaceLayer, ENV);

/**
 * A repository with one commit, so `nemia start` has a base to record. The screens below quote its branch by name, so the fixture
 * names it — `-b master` — rather than take git's `init.defaultBranch`, which is a machine's and not this test's: unset on the
 * owner's machine, `main` on a runner. It inits under a default of `main` on purpose, so the branch can only come from the `-b`:
 * drop it and the file fails wherever it runs, rather than only where the machine disagrees.
 */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'init.defaultBranch=main', ...args], {
      cwd: repo,
      stdio: 'ignore',
    });
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
    /**
     * Each of `ids` the board has filed, viewed as `view` views it, as the engine's `list` answers: the judgement reads the run through
     * it. `promised` calls each method on the fake, so `this` is the fake.
     */
    async list(this: { view: (id: string) => Promise<unknown> }, ids: string[]) {
      return { views: await Promise.all(ids.filter((id) => tasks.has(id)).map((id) => this.view(id))), unreadable: [] };
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

/** `run`'s whole decision as facts (`decisionFacts`), read on the git place over this file's store, the globs `sensitive` names in full. */
const whole = async (e: Engine, run: RepositoryRun, sensitive?: readonly string[]) =>
  decisionFacts(await decisionOf(e, run.id, { place: builtinGitPlace, env: ENV, ...(sensitive ? { sensitive } : {}) }));

/** A task on the clock of a board that stamps no filing: settled before it spawned, its times not known. */
const UNSPAWNED = ['unspawned', null, null, null, 'never spawned', '—'];
/**
 * The n-th task a timed board filed (`timed`), on its clock: filed 10n minutes after its midnight, spawned 12 s later, ended at 5
 * minutes.
 */
const ranAt = (n: number) => {
  const at = Date.parse('2026-09-13T00:00:00Z') + n * 600_000;
  return ['ended', new Date(at).toISOString(), new Date(at + 12_000).toISOString(), new Date(at + 300_000).toISOString(), '12s', '4m48s'];
};

/** `git` in `repo`, as the test's own identity, its output as text. */
const git = (repo: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, encoding: 'utf8' });
const write = (repo: string, file: string, text: string | Uint8Array) => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
};

/** A repository on `main` with a workspace package that has a source file and a test. */
const aPackage = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  write(repo, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }));
  write(repo, 'packages/x/src/add.ts', 'export const add = (a, b) => a + b;\n');
  write(repo, 'packages/x/test/add.test.ts', "import assert from 'node:assert';\nassert.equal(add(1, 1), 2);\n");
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
};

/** A branch off the repository's HEAD with `change` committed on it; the checkout is left where it was. */
const branchOff = (repo: string, branch: string, change: () => void) => {
  git(repo, 'checkout', '-q', '-b', branch);
  change();
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'the work');
  git(repo, 'checkout', '-q', 'main');
};

/**
 * A board whose clock is laid by hand: the n-th task filed is filed 10n minutes after the board's midnight, its attempt started 5 s and
 * spawned 12 s after that, and ended 5 minutes after filing once it settled; each view and the feed carry its filing. A settled attempt
 * carries the usage it is given. `fed` counts the reads of the feed, and `viewed` how many times each task was viewed: every view is a
 * harness observe.
 */
const timed = () => {
  type Filed = { id: string };
  const tasks = new Map<string, { phase: TaskPhase; closeout?: unknown; usage?: object; exitCode?: number; filedAt: number }>();
  const T0 = Date.parse('2026-09-13T00:00:00Z');
  const iso = (ms: number) => new Date(ms).toISOString();
  const logs = new Map<string, string>();
  const viewed = new Map<string, number>();
  const fed = { reads: 0 };
  const e = promised({
    view: async (id: string) => {
      viewed.set(id, (viewed.get(id) ?? 0) + 1);
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        state: {
          brief: t ? 'filed' : '',
          ...(t ? { filedAt: iso(t.filedAt) } : {}),
          settled,
          stopRequested: false,
          attempts:
            !t || t.phase === 'pending'
              ? []
              : [
                  {
                    n: 1,
                    startedAt: iso(t.filedAt + 5_000),
                    spawnedAt: iso(t.filedAt + 12_000),
                    endedAt: settled ? iso(t.filedAt + 300_000) : null,
                    reason: settled ? 'harness' : null,
                    nativeId: `native-${id}`,
                    closeout: t.closeout,
                    usage: t.usage ?? null,
                    exitCode: t.exitCode ?? null,
                  },
                ],
        },
      };
    },
    /**
     * Each of `ids` the board has filed, viewed as `view` views it, as the engine's `list` answers: the judgement reads the run through
     * it. `promised` calls each method on the fake, so `this` is the fake.
     */
    async list(this: { view: (id: string) => Promise<unknown> }, ids: string[]) {
      return { views: await Promise.all(ids.filter((id) => tasks.has(id)).map((id) => this.view(id))), unreadable: [] };
    },
    file: async (spec: Filed) => {
      tasks.set(spec.id, { phase: 'pending', filedAt: T0 + tasks.size * 600_000 });
      return spec.id;
    },
    feed: async () => (
      fed.reads++,
      { entries: [...tasks].map(([taskId, t]) => ({ taskId, event: { kind: 'filed', at: iso(t.filedAt) } })), cursor: tasks.size }
    ),
    stop: async () => {},
    logs: async (id: string) => logs.get(id) ?? '(no output yet)',
    output: async () => undefined,
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, usage?: object, exitCode?: number) =>
    Object.assign(tasks.get(id)!, { phase, closeout, usage, exitCode });
  return { e, settle, logs, viewed, fed };
};

const USAGE = { responses: 29, toolCalls: 93, inputTokens: 6_350_000, outputTokens: 112_000 };

/** `implement`, checked by `npm test`, then `review`, with no check. */
const checked = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\ncheck: npm test\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};

test("what a step is told and what it shows, in the git place's words: a fan-in's conflicts, and a call its job was denied", async (t) => {
  const s = story(t);

  await s.test(
    "a fan-in whose two parents wrote one file differently is filed told the path its place's make left conflicted and the place's words for seeing it; a clean one is told of no conflict",
    async () => {
      const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
      fs.writeFileSync(path.join(dir, 'left.md'), '---\nplace: git\n---\nthe left half\n');
      fs.writeFileSync(path.join(dir, 'right.md'), '---\nplace: git\n---\nthe right half\n');
      fs.writeFileSync(path.join(dir, 'join.md'), '---\nafter: left, right\nplace: git\n---\njoin them\n');
      const joined = async (left: [string, string], right: [string, string]) => {
        const run = await runPlaced(startRun({ brief: 'two halves', repo: aRepo(), workflowDir: dir }));
        const b = board();
        assert.deepEqual((await runWith(b.e, advanceRun(runRecord(ROOT, run.id)))).filed.sort(), ['left', 'right']);
        for (const [step, [file, text]] of [
          ['left', left],
          ['right', right],
        ] as const) {
          fs.writeFileSync(path.join(runRecord(ROOT, run.id).steps[step].workspace!, file), text);
          b.settle(`${run.id}-${step}`, 'succeeded', SIGNED);
        }
        for (let pass = 1; !b.tasks.has(`${run.id}-join`); pass++) {
          assert.ok(pass <= 3, `join is filed within three passes: ${JSON.stringify(runRecord(ROOT, run.id).steps)}`);
          await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
        }
        return b.tasks.get(`${run.id}-join`)!.spec.brief;
      };
      const conflicted = await joined(['flag.ts', 'export const flag = 1;\n'], ['flag.ts', 'export const flag = 2;\n']);
      assert.match(conflicted, /work of left and right has been merged/);
      assert.match(conflicted, /The merge left conflicts, and they are yours to resolve[^\n]*\n\n- flag\.ts\n\n`git status` shows them\./);
      const clean = await joined(['left.ts', 'export const left = 1;\n'], ['right.ts', 'export const right = 1;\n']);
      assert.match(clean, /work of left and right has been merged/);
      assert.doesNotMatch(clean, /conflict|`git status` shows them/i, 'a merge that left none is told of none');
    },
  );

  await s.test(
    'a step whose job was denied a call says so — on `nemia ls` beside its line and in the decision under it — and its status is unchanged',
    async () => {
      const run = await started(folder());
      const b = board();
      await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
      const taskId = `${run.id}-implement`;
      b.denials.set(taskId, [
        { tool: 'Skill', what: 'look' },
        { tool: 'Bash', what: 'pytest' },
        { tool: 'Skill', what: 'look' },
      ]);
      b.settle(taskId, 'succeeded', SIGNED);
      await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
      const [implement, review] = (await runWith(b.e, list(b.e, runRecord(ROOT, run.id)))).steps;
      assert.deepEqual(
        [implement.message, shownNote(implement)],
        ['unverified · done', 'denied: Skill(look), Bash(pytest)'],
        'each call once, and the status as it was',
      );
      assert.equal(review.note, undefined, 'a step denied nothing says nothing');
      const { runs } = (await typed(['ls'], b.e, undefined, undefined, ENV)) as RunsListed;
      const listed = runs.find((one) => one.run.id === run.id)?.listed.steps.find((step) => step.name === 'implement');
      assert.equal(listed && 'denied' in listed ? listed.denied : undefined, 'denied: Skill(look), Bash(pytest)', '`nemia ls` reads it so');
      const decided = await runWith(b.e, decideRun(run.id));
      assert.deepEqual(decided.denied, { implement: 'denied: Skill(look), Bash(pytest)' });
      b.settle(`${run.id}-review`, 'succeeded', SIGNED);
      const steps = (await whole(b.e, run)).steps as Record<string, { denied?: string }>;
      assert.deepEqual(
        [steps.implement?.denied, steps.review?.denied],
        ['denied: Skill(look), Bash(pytest)', undefined],
        'the decision: under the step, and under no other',
      );
    },
  );
});

/** A step of a run on a board that stamps no filing (`board`): its closeout, no check, nothing measured, and its one try unspawned. */
const plainStep = (closeout: unknown, more: Record<string, unknown> = {}) => ({
  closeout,
  check: null,
  used: 'not measured',
  cost: 'cost  not measured',
  tries: [[1, UNSPAWNED, null]],
  ...more,
});
const DID_IT = ['done', 'did it', null, {}];
/** What a run that worked on its base branch itself offers: the diff of its work, to read it; nothing to merge. */
const readIt = (run: RepositoryRun) => [['read it', `git -C ${run.repo} diff ${run.baseRef}...master`]];
/** What a run in the checkout of a repository on master touched, read and decided, when nothing it did is on its branch. */
const onMaster = {
  overBudget: null,
  touched: [['master', [[], [], []]]],
  lesson: 'nothing written where the next agent reads',
  inFull: [['master', []]],
  run: ['run not measured', '—', '—', 'not known'],
};

test('the whole decisions of a run in the checkout, on master, by how its step ended', async (t) => {
  const s = story(t);

  await s.test(
    'the whole decision of a run from an inbox card, given a file, whose step its harness waits on and is told a word, and then denied a call',
    async () => {
      const given = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'notes.txt');
      fs.writeFileSync(given, 'read me\n');
      const run = repositoryRunOf(
        await runPlaced(
          startRun({
            brief: 'add a flag',
            repo: aRepo(),
            workflowDir: folder(),
            isolate: false,
            from: { inbox: 'card-7' },
            inputs: [given],
          }),
        ),
      );
      const b = board();
      await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
      const taskId = `${run.id}-implement`;
      b.tasks.get(taskId)!.phase = 'running';
      b.waiting.set(taskId, 'a permission prompt: Bash(npm test)');
      b.said.set(taskId, [{ at: '2026-09-14T16:01:00.000Z', attempt: 1, text: 'mind the lockfile' }]);
      const waits = `waiting for a permission prompt: Bash(npm test) — answer it in Claude Code: claude agents, session ae/${run.id}-implement/1`;
      const { run: read } = await decisionOf(b.e, run.id, { place: builtinGitPlace, env: ENV });
      assert.deepEqual(
        [runLines(read).fromNote, read.inputs, fs.readdirSync(path.join(ROOT, 'runs', run.id, 'inputs'))],
        ['from inbox card card-7', ['notes.txt'], ['notes.txt']],
        'from its card, and given a file the run keeps in its inputs',
      );
      assert.deepEqual(await whole(b.e, run), {
        decision: { running: true },
        running: { kind: 'running', waiting: ['implement'] },
        waitingOn: { implement: waits },
        retrying: [],
        rounding: [],
      });
      b.denials.set(taskId, [{ tool: 'Bash', what: 'npm test' }]);
      b.settle(taskId, 'succeeded', SIGNED);
      await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
      b.settle(`${run.id}-review`, 'succeeded', SIGNED);
      assert.deepEqual(await whole(b.e, run), {
        verdicts: { outcome: 'succeeded', unverified: ['implement', 'review'] },
        offers: [],
        ...onMaster,
        steps: {
          implement: plainStep(DID_IT, {
            waitingOn: waits,
            denied: 'denied: Bash(npm test)',
            said: [{ at: '2026-09-14T16:01:00.000Z', attempt: 1, text: 'mind the lockfile', try: 1 }],
          }),
          review: plainStep(DID_IT),
        },
        results: [['master', null, []]],
        standings: [],
        collisions: null,
        commands: readIt(run),
      });
    },
  );

  await s.test('the whole decision of a step its harness ended at its budget', async () => {
    const run = await started(folder());
    const b = board();
    await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
    b.settle(`${run.id}-implement`, 'failed', undefined, undefined, 'budget');
    await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
    assert.deepEqual(await whole(b.e, run), {
      verdicts: { outcome: 'waiting', budgetExhausted: ['implement'] },
      offers: [
        `implement: budget exhausted. Continue its session, told what happened:  nemia retry ${run.id} implement  (--fresh, or --model <m>, for a new session)`,
      ],
      ...onMaster,
      steps: { implement: plainStep(undefined) },
      results: [],
      standings: [],
      collisions: null,
      commands: [['once more', `nemia retry ${run.id} implement`]],
    });
  });

  await s.test('the whole decision of a step that says `denials: fail`, denied a call', async () => {
    const run = await started(folder('denials: fail'));
    const b = board();
    await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
    b.denials.set(`${run.id}-implement`, [{ tool: 'Write', what: '/tmp/w/notes.md' }]);
    b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
    await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
    assert.deepEqual(await whole(b.e, run), {
      verdicts: { outcome: 'waiting', denied: ['implement'] },
      offers: [
        `implement: denied — its harness denied its try a call, and denials: fail passes none on. For a new run, add Edit(//tmp/w/notes.md) to the folder's allowedTools:, which allows it. This run's allowedTools: is frozen at nemia start, so a try of it is denied the same again. A new session, told to do without it:  nemia retry ${run.id} implement --fresh  (or continue its session: nemia retry ${run.id} implement)`,
      ],
      ...onMaster,
      steps: { implement: plainStep(DID_IT, { denied: 'denied: Write(/tmp/w/notes.md)' }) },
      results: [],
      standings: [],
      collisions: null,
      commands: [['once more', `nemia retry ${run.id} implement --fresh`]],
    });
  });

  await s.test('the whole decision of a step whose closeout does not read, never nudged', async () => {
    const run = await started(folder());
    const b = board();
    await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
    b.closedOut.set(`${run.id}-implement`, true);
    b.settle(`${run.id}-implement`, 'succeeded', '{"outcome": "done", "summary": ');
    await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
    assert.deepEqual(await whole(b.e, run), {
      verdicts: { outcome: 'waiting', unsigned: ['implement'] },
      offers: [
        `implement: unsigned. Continue its session, told what happened:  nemia retry ${run.id} implement  (--fresh, or --model <m>, for a new session)`,
      ],
      ...onMaster,
      steps: { implement: plainStep({ error: 'unparseable: Unexpected end of JSON input' }) },
      results: [],
      standings: [],
      collisions: null,
      commands: [['once more', `nemia retry ${run.id} implement`]],
    });
  });

  await s.test('the whole decision of a run whose every step passed its check', async () => {
    const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
    fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\ncheck: true\n---\nimplement it\n');
    const run = await started(dir);
    const b = board();
    await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
    b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
    await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
    b.logs.set(`${run.id}-implement-check`, '# pass 1\n');
    b.settle(`${run.id}-implement-check`, 'succeeded', undefined, 0);
    await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
    assert.deepEqual(await whole(b.e, run), {
      verdicts: { outcome: 'succeeded' },
      offers: [],
      ...onMaster,
      steps: { implement: plainStep(DID_IT, { check: ['true', 0, true], tries: [[1, UNSPAWNED, UNSPAWNED]] }) },
      results: [['master', null, []]],
      standings: [],
      collisions: null,
      commands: readIt(run),
    });
  });
});

/** The diff of the weakened test the run waiting on you committed, as the place gives it whole. */
const ADD_TEST_DIFF = [
  'diff --git a/packages/x/test/add.test.ts b/packages/x/test/add.test.ts',
  'index ae00847..2dc14f5 100644',
  '--- a/packages/x/test/add.test.ts',
  '+++ b/packages/x/test/add.test.ts',
  '@@ -1,2 +1,2 @@',
  " import assert from 'node:assert';",
  '-assert.equal(add(1, 1), 2);',
  '+assert.ok(true);',
];

/** The whole decision of the run waiting on you on `branch`, the files `inFull` read whole. */
const waiting = (run: RepositoryRun, branch: string, inFull: unknown[]) => ({
  verdicts: { outcome: 'succeeded', unverified: ['review'] },
  offers: [],
  overBudget: null,
  touched: [
    [
      branch,
      [
        [
          ['(root)', 2, 2, 0, 1],
          ['packages/x', 2, 2, 1, 0],
        ],
        ['CLAUDE.md'],
        ['packages/x/test/add.test.ts'],
      ],
    ],
  ],
  lesson: 'CLAUDE.md +2 −0',
  inFull: [[branch, inFull]],
  steps: {
    implement: {
      closeout: DID_IT,
      check: ['npm test', 0, true],
      used: '29 responses · 93 tool calls · 6.35M in · 112k out',
      cost: 'cost  not measured',
      tries: [[1, ranAt(0), ranAt(1)]],
    },
    review: { closeout: DID_IT, check: null, used: 'not measured', cost: 'cost  not measured', tries: [[1, ranAt(2), null]] },
  },
  run: ['run not measured', '36s', '14m24s', '25m00s'],
  results: [[branch, '4 files: +4 −1, 1 binary', ['CLAUDE.md']]],
  standings: [`${branch} is ahead of main by 1 commit`],
  collisions: null,
  commands: [
    ['land it', `git -C ${run.repo} merge --no-ff ${branch}`],
    ['drop it', `git -C ${run.repo} branch -D ${branch}`],
  ],
});

test("a run waiting on you, on git: its whole decisions, what its branches touched in the place's report, and what `nemia ls` costs", async (t) => {
  const s = story(t);
  let a = { run: undefined as unknown as RepositoryRun, repo: '', branch: '', b: timed() };

  await s.test(
    'the whole decision of a run waiting on you, once a pass has read where its branch stands: verdicts, touched with a binary file, lesson, in full, each step, the totals, the branch and its notes, and land and drop — each task viewed once and the feed never read',
    async () => {
      const repo = aPackage();
      const run = repositoryRunOf(await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: checked(), isolate: false })));
      const branch = `wf/${run.id}`;
      branchOff(repo, branch, () => {
        fs.appendFileSync(path.join(repo, 'packages/x/src/add.ts'), 'export const sub = (a, b) => a - b;\n');
        write(repo, 'packages/x/test/add.test.ts', "import assert from 'node:assert';\nassert.ok(true);\n");
        write(repo, 'CLAUDE.md', 'lesson one\nlesson two\n');
        write(repo, 'logo.png', new Uint8Array([0, 1, 2, 0, 255]));
      });
      const b = timed();
      await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
      b.settle(`${run.id}-implement`, 'succeeded', SIGNED, USAGE);
      await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
      b.settle(`${run.id}-implement-check`, 'succeeded', undefined, undefined, 0);
      b.logs.set(`${run.id}-implement-check`, '# pass 1\n');
      await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
      b.settle(`${run.id}-review`, 'succeeded', SIGNED);
      const read = runRecord(ROOT, run.id);
      const record = {
        ...read,
        isolate: true,
        steps: Object.fromEntries(Object.entries(read.steps).map(([name, step]) => [name, { ...step, branch }])),
      };
      fs.writeFileSync(path.join(ROOT, 'runs', `${run.id}.json`), JSON.stringify(record, null, 2));
      a = { run, repo, branch, b };
      await runWith(b.e, passStanding(listRuns(ROOT)));

      b.viewed.clear();
      b.fed.reads = 0;
      assert.deepEqual(await whole(b.e, run), waiting(run, branch, [['packages/x/test/add.test.ts', ADD_TEST_DIFF]]));
      assert.deepEqual(
        Object.fromEntries(b.viewed),
        { [`${run.id}-implement`]: 1, [`${run.id}-implement-check`]: 1, [`${run.id}-review`]: 1 },
        'each task viewed once for the whole decision, usage included: every view is a harness observe',
      );
      assert.equal(
        b.fed.reads,
        0,
        "the feed, which holds every task the engine ever filed, is not read for one run: the times come off the engine's attempts and each task's filing time on its view",
      );
      assert.equal(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main', 'none of the commands is run');
      assert.ok(git(repo, 'branch', '--list', branch).trim(), 'the branch is still there');
    },
  );

  await s.test('the whole decision with --sensitive naming nothing: no file in full, in place of the check files', async () => {
    assert.deepEqual(await whole(a.b.e, a.run, ['nothing/**']), waiting(a.run, a.branch, []));
  });

  await s.test(
    "what a branch touched is the place's report: a rename at both ends, a binary file, a file in no directory, today's lines — and a branch that is gone is not read as nothing",
    () => {
      branchOff(a.repo, 'wf/moved', () => {
        fs.mkdirSync(path.join(a.repo, 'packages/x/spec'));
        git(a.repo, 'mv', 'packages/x/test/add.test.ts', 'packages/x/spec/add.test.ts');
        write(a.repo, 'logo.png', new Uint8Array([0, 1, 2, 0, 255]));
        write(a.repo, 'NOTES', 'one\n');
      });
      const [moved] = changesOf(builtinGitPlace, a.run, ['wf/moved']);
      const r = moved.radius;
      assert.ok(!('error' in r), JSON.stringify(r));
      assert.deepEqual(
        [...r.changes].sort((x, y) => x.path.localeCompare(y.path)),
        [
          { path: 'logo.png', status: 'added', added: null, removed: null },
          { path: 'NOTES', status: 'added', added: 1, removed: 0 },
          { from: 'packages/x/test/add.test.ts', path: 'packages/x/spec/add.test.ts', status: 'renamed', added: 0, removed: 0 },
        ],
      );
      assert.deepEqual(
        touchedLines([moved]),
        [
          'touched  wf/moved',
          '  (root)      2 files  +1 −0 · 1 binary',
          '  packages/x  1 file   +0 −0',
          '  check-affecting  packages/x/test/add.test.ts → packages/x/spec/add.test.ts',
        ],
        "grouped by the base's workspaces, a binary file counted with no lines and a rename at both ends, as the lines were",
      );
      assert.equal(typeof moved.inFull, 'string');
      assert.match(
        moved.inFull as string,
        /^rename from packages\/x\/test\/add\.test\.ts$/m,
        'asked by its path, the place shows a rename',
      );
      assert.match(moved.inFull as string, /^rename to packages\/x\/spec\/add\.test\.ts$/m);

      const [gone] = changesOf(builtinGitPlace, a.run, ['wf/never']);
      const notKnown = `what this run changed is not known: the place has no branch wf/never in ${a.repo}`;
      assert.deepEqual(gone, { branch: 'wf/never', radius: { error: notKnown }, inFull: { error: notKnown }, notes: { error: notKnown } });
    },
  );

  await s.test("a branch that touched a lint config lists it as check-affecting, with its whole diff from the place's diffs", () => {
    branchOff(a.repo, 'wf/lint', () => {
      write(a.repo, '.oxlintrc.json', '{ "rules": { "no-console": "off" } }\n');
      write(a.repo, 'packages/x/src/add.ts', 'export const add = (a, b) => a + b + 0;\n');
    });
    const [lint] = changesOf(builtinGitPlace, a.run, ['wf/lint']);
    assert.ok(!('error' in lint.radius), JSON.stringify(lint.radius));
    assert.deepEqual(lint.radius.checkAffecting, ['.oxlintrc.json']);
    assert.match(lint.inFull as string, /^\+\{ "rules": \{ "no-console": "off" \} \}$/m);
    assert.doesNotMatch(lint.inFull as string, /add\.ts/, 'a file no glob names is not printed in full');
  });

  await s.test('`nemia ls` views each task once, and runs added in a repository it already reads add no git process', async () => {
    const { e, viewed, settle } = a.b;
    const ls = async () => {
      viewed.clear();
      return (await metered(() => typed(['ls'], e, undefined, undefined, ENV))).tallies!.kinds.place.spawned;
    };
    const oneStep = fs.mkdtempSync(path.join(ROOT, 'wf-'));
    fs.writeFileSync(path.join(oneStep, 'work.md'), '---\nplace: git\n---\nwork it\n');
    const first = (await runPlaced(startRun({ brief: 'first', repo: a.repo, workflowDir: oneStep, isolate: true }))).id;
    await runWith(e, advanceRun(runRecord(ROOT, first)));
    settle(`${first}-work`, 'succeeded', SIGNED);
    await runWith(e, advanceRun(runRecord(ROOT, first)));
    const before = await ls();
    for (let k = 1; k < 4; k++) {
      const more = await runPlaced(
        startRun({ brief: `more ${k}`, repo: a.repo, workflowDir: checked(), isolate: false, ...(k === 1 ? { after: [first] } : {}) }),
      );
      branchOff(a.repo, `wf/${more.id}`, () => write(a.repo, `more-${k}.txt`, 'x\n'));
      const record = runRecord(ROOT, more.id);
      record.steps.implement = { ...record.steps.implement, branch: `wf/${more.id}` };
      fs.writeFileSync(path.join(ROOT, 'runs', `${more.id}.json`), JSON.stringify(record, null, 2));
    }
    const after = await ls();
    assert.ok(viewed.has(`${first}-work`), 'the run of one step, finished in a worktree and waited on by the next, was read');
    assert.ok(
      [...viewed.values()].every((n) => n === 1),
      `every task viewed once: ${JSON.stringify(Object.fromEntries(viewed))}`,
    );
    assert.equal(
      after,
      before,
      "three more runs, each with a result branch, in a repository already read, add no git process: the store holds the file's other runs too, so what is counted is what they add",
    );
  });
});

/** A run on main blocked on `implement`, read on a timed board: what it touched, read and offers, its step as `implement` says it. */
const blockedOnMain = (run: RepositoryRun, implement: Record<string, unknown>, total: string[]) => ({
  verdicts: { outcome: 'waiting', awaitingAnswer: ['implement'] },
  offers: [
    `implement: blocked. Continue its session, told what happened:  nemia retry ${run.id} implement  (--fresh, or --model <m>, for a new session)`,
  ],
  overBudget: null,
  touched: [['main', [[], [], []]]],
  lesson: 'nothing written where the next agent reads',
  inFull: [['main', []]],
  steps: { implement },
  run: ['run not measured', ...total],
  results: [],
  standings: [],
  collisions: null,
  commands: [['once more', `nemia retry ${run.id} implement`]],
});

test('the whole decisions of a run through its tries and on two branches', async (t) => {
  const s = story(t);

  await s.test(
    'the whole decision of a running run, of a try asked for, of a step blocked with its question, and of a try a person answered',
    async () => {
      const run = repositoryRunOf(
        await runPlaced(startRun({ brief: 'add sub', repo: aPackage(), workflowDir: checked(), isolate: false })),
      );
      const { e, settle } = timed();
      const running = (retrying: unknown[]) => ({
        decision: { running: true },
        running: { kind: 'running', waiting: ['implement'] },
        waitingOn: {},
        retrying,
        rounding: [],
      });
      await runWith(e, advanceRun(runRecord(ROOT, run.id)));
      assert.deepEqual(await whole(e, run), running([]));
      settle(`${run.id}-implement`, 'succeeded', { outcome: 'blocked', summary: 'two readings', artifacts: [], needs: 'Rename --flag?' });
      await runWith(e, advanceRun(runRecord(ROOT, run.id)));
      const answering = `to answer it:  nemia retry ${run.id} implement --message "<answer>"`;
      assert.deepEqual(
        await whole(e, run),
        blockedOnMain(
          run,
          {
            closeout: ['blocked', 'two readings', 'Rename --flag?', {}],
            check: null,
            used: 'not measured',
            cost: 'cost  not measured',
            tries: [[1, ranAt(0), null]],
            answering,
          },
          ['12s', '4m48s', '5m00s'],
        ),
      );
      await runWith(e, retryRun(run.id, 'implement', { mode: 'continue', message: 'Keep it.\nThe flag is public.' }));
      assert.deepEqual(await whole(e, run), running([['implement', 2, 'continue', 'ask']]));
      await runWith(e, advanceRun(runRecord(ROOT, run.id)));
      settle(`${run.id}-implement-try2`, 'succeeded', {
        outcome: 'blocked',
        summary: 'one reading',
        artifacts: [],
        needs: 'And the README?',
      });
      await runWith(e, advanceRun(runRecord(ROOT, run.id)));
      assert.deepEqual(
        await whole(e, run),
        blockedOnMain(
          run,
          {
            closeout: ['blocked', 'one reading', 'And the README?', {}],
            check: null,
            used: 'not measured',
            cost: 'cost  this try not measured · not measured over 2 tries',
            tries: [
              [1, ranAt(0), null],
              [2, ranAt(1), null],
            ],
            answer: { try: 2, message: 'Keep it.\nThe flag is public.', needs: 'Rename --flag?' },
            answering,
          },
          ['24s', '9m36s', '15m00s'],
        ),
      );
    },
  );

  await s.test(
    'the whole decision of a run on two branches, once a pass has read where they stand, one with a note longer than a screen shows',
    async () => {
      const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
      fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
      fs.writeFileSync(path.join(dir, 'docs.md'), '---\nplace: git\n---\nwrite it down\n');
      const run = repositoryRunOf(await runPlaced(startRun({ brief: 'add sub', repo: aPackage(), workflowDir: dir })));
      const { e, settle } = timed();
      await runWith(e, advanceRun(runRecord(ROOT, run.id)));
      const committed = (step: string, file: string, text: string) => {
        const wt = runRecord(ROOT, run.id).steps[step].workspace!;
        write(wt, file, text);
        git(wt, 'add', '-A');
        git(wt, 'commit', '-q', '-m', `add ${file}`);
      };
      const notes = Array.from({ length: 123 }, (_, i) => `note ${i + 1}\n`).join('');
      committed('implement', 'sub.ts', 'export const sub = (a, b) => a - b;\n');
      committed('docs', 'NOTES.md', notes);
      settle(`${run.id}-implement`, 'succeeded', SIGNED);
      settle(`${run.id}-docs`, 'succeeded', SIGNED);
      await runWith(e, advanceRun(runRecord(ROOT, run.id)));
      await runWith(e, passStanding(listRuns(ROOT)));
      const [runBranch, implementBranch] = [`wf/${run.id}/run`, `wf/${run.id}/implement`];
      const plain = (n: number) => ({
        closeout: DID_IT,
        check: null,
        used: 'not measured',
        cost: 'cost  not measured',
        tries: [[1, ranAt(n), null]],
      });
      const read = await decisionOf(e, run.id, { place: builtinGitPlace, env: ENV });
      assert.deepEqual(decisionFacts(read), {
        verdicts: { outcome: 'succeeded', unverified: ['docs', 'implement'] },
        offers: [],
        overBudget: null,
        touched: [
          [runBranch, [[['(root)', 1, 123, 0, 0]], [], []]],
          [implementBranch, [[['(root)', 1, 1, 0, 0]], [], []]],
        ],
        lesson: 'nothing written where the next agent reads',
        inFull: [
          [runBranch, []],
          [implementBranch, []],
        ],
        steps: { docs: plain(0), implement: plain(1) },
        run: ['run not measured', '24s', '9m36s', '15m00s'],
        results: [
          [runBranch, '1 file: +123 −0', ['NOTES.md']],
          [implementBranch, '1 file: +1 −0', []],
        ],
        standings: [`${runBranch} is ahead of main by 1 commit`, `${implementBranch} is ahead of main by 1 commit`],
        collisions: null,
        commands: [
          ['land it', `git -C ${run.repo} merge --no-ff ${runBranch}`],
          ['drop it', `git -C ${run.repo} branch -D ${runBranch} ${implementBranch}`],
        ],
      });
      const [docsNotes] = read.results;
      assert.deepEqual(
        docsNotes && !('error' in docsNotes.notes) && docsNotes.notes.map((n) => [n.file, `${n.text}\n`]),
        [['NOTES.md', notes]],
        'the note whole, as its branch has it: a reader cuts it',
      );
    },
  );
});
