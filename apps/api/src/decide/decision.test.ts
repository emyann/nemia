/**
 * GET /api/runs/:runId/decision: what `nemia decide` shows a person, off a real repository — what a result branch touched, the
 * lesson line, the check-affecting diffs cut per file, what each step consumed, and the commands — and nothing of it, and
 * no `git` at all, for a run still running.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import { story } from '../../test/checkpoints.ts';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { Effect, Layer } from 'effect';
import { engine, PlaceService, runStore, runWith as runEngine, builtinGitPlace, standingWhen, type Place } from 'agent-orchestrator';
import { app, appOf, liveOf } from '../app.ts';
import { diffFiles, DIFF_LINES } from './decision.ts';

const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
/**
 * A folder ahead of the real `git` on PATH, beside the harness's `claude`, holding a `git` that notes each call in `gitCalls` and runs
 * the real one, so a test counts what the route asked of git (`gitCount`).
 */
const bin = scratch('nemia-api-decision-bin-');
const gitCalls = path.join(bin, 'git-calls');
fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho "$*" >> '${gitCalls}'\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
const gitCount = () => (fs.existsSync(gitCalls) ? fs.readFileSync(gitCalls, 'utf8').split('\n').filter(Boolean).length : 0);

type DecideCommand = import('./decision.ts').DecideCommand;
type Decidable = import('./decision.ts').Decidable;
type RunDecision = import('./decision.ts').RunDecision;
type RunDetail = import('../detail/detail.ts').RunDetail;

const git = (repo: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd: repo, encoding: 'utf8' },
  );
const write = (repo: string, file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
};

/** A repository whose base has a workspace package with a source file and its test, and a CLAUDE.md; returns it with its base's sha. */
function aRepo(): { repo: string; base: string } {
  const repo = fs.mkdtempSync(path.join(root, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  write(repo, 'package.json', `${JSON.stringify({ name: 'app', workspaces: ['packages/*'], scripts: { test: 'node --test' } })}\n`);
  write(repo, 'packages/x/src/add.ts', 'export const add = (a, b) => a + b;\n');
  write(repo, 'packages/x/test/add.test.ts', "import assert from 'node:assert';\nassert.equal(add(1, 1), 2);\n");
  write(repo, 'CLAUDE.md', '# app\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return { repo, base: git(repo, 'rev-parse', 'HEAD').trim() };
}

/** A branch off main with `change` committed on it; the checkout is left on main. */
function branchOff(repo: string, branch: string, change: () => void) {
  git(repo, 'checkout', '-q', '-b', branch);
  change();
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'the work');
  git(repo, 'checkout', '-q', 'main');
}

const at = '2026-09-13T00:10:00.000Z';

/** A task's journal, as the engine writes it. */
const journal = (taskId: string, events: object[]) => {
  fs.mkdirSync(path.join(root, 'engine', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), events.map((e) => `${JSON.stringify(e)}\n`).join(''));
};
const filed = (taskId: string) => ({
  kind: 'filed',
  at,
  brief: `The brief ${taskId} was filed with.`,
  cwd: '/code/app',
  maxAttempts: 1,
  harness: 'codex',
});

/** A task that ran once and signed off with `closeout`, its attempt recording the `usage` the engine read, if any. */
const settledTask = (taskId: string, closeout: object, usage?: object) =>
  journal(taskId, [
    filed(taskId),
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    {
      kind: 'ended',
      at,
      attempt: 1,
      sessionId: `ae/${taskId}/1`,
      observed: 'done',
      reason: 'harness',
      closeout,
      ...(usage ? { usage } : {}),
    },
    { kind: 'settled', at, outcome: 'succeeded' },
  ]);

const done = { outcome: 'done', summary: 'It is done.', needs: null, artifacts: [] };
const blocked = { outcome: 'blocked', summary: 'Half of it is done.', needs: 'Which database?', artifacts: [] };

/** Implement, then a review of it in the same workspace and on the same branch: review's branch is the run's result. */
const workflow = [
  { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' },
  { name: 'review', after: ['implement'], body: 'Review it.', harness: 'codex' },
];

function writeRun(run: { id: string; repo: string; baseRef: string } & Record<string, unknown>) {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'runs', `${run.id}.json`),
    JSON.stringify({
      workspace: run.repo,
      branch: 'main',
      isolate: true,
      brief: 'Decide it',
      createdAt: at,
      workflowDir: path.join(root, 'no-such-workflow'),
      workflow,
      ...run,
    }),
  );
}

const decisionOf = async (id: string) => {
  const res = await app.request(`/api/runs/${id}/decision`);
  return { status: res.status, body: (await res.json()) as RunDecision };
};

/** A decision there is to make: a 200 whose body is `nemia decide`'s whole reading (`Decidable`), not `running` nor `nothing`. */
const decidable = async (id: string): Promise<Decidable> => {
  const { status, body } = await decisionOf(id);
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok('commands' in body, JSON.stringify(body));
  return body;
};

const detailOf = async (id: string) => (await (await app.request(`/api/runs/${id}`)).json()) as RunDetail;

const { repo, base } = aRepo();
const branch = 'wf/r-d1/implement';
branchOff(repo, branch, () => {
  write(repo, 'packages/x/src/add.ts', '/** Adds. */\nexport const add = (a: number, b: number): number =>\n  a + b;\n');
  const added = Array.from({ length: 450 }, (_, i) => `assert.equal(add(${i}, 1), ${i + 1});`).join('\n');
  write(repo, 'packages/x/test/add.test.ts', `import assert from 'node:assert';\nassert.equal(add(1, 1), 2);\n${added}\n`);
  write(repo, 'CLAUDE.md', '# app\n\n- A lesson for the next agent.\n');
  write(
    repo,
    'package.json',
    `${JSON.stringify({ name: 'app', workspaces: ['packages/*'], scripts: { test: 'node --test packages/x/test/' } })}\n`,
  );
});

/** One file's diff as git gives it on its own, line by line. */
const diffOf = (file: string) =>
  git(repo, '-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', '--find-renames', `${base}...${branch}`, '--', file)
    .replace(/\n$/, '')
    .split('\n');

settledTask('t-d1-implement', done, { responses: 12, toolCalls: 30, inputTokens: 112_000, outputTokens: 6_350 });
settledTask('t-d1-review', done, { toolCalls: 4, inputTokens: 8_000, outputTokens: 650, costUsd: 0.004 });
writeRun({
  id: 'r-d1',
  repo,
  baseRef: base,
  steps: { implement: { taskId: 't-d1-implement', branch }, review: { taskId: 't-d1-review', branch } },
});

/** The package's git place, its `standing` counted each time it is asked (`asks`), as a layer an app or a program is given. */
function countedStanding() {
  let asks = 0;
  const place: Place = {
    declared: builtinGitPlace.declared,
    ask: (verb, request, options) => {
      if (verb === 'standing') asks += 1;
      return builtinGitPlace.ask(verb, request, options);
    },
    askNow: (verb, request, options) => {
      if (verb === 'standing') asks += 1;
      return builtinGitPlace.askNow(verb, request, options);
    },
  };
  return { layer: PlaceService.layer(place), asks: () => asks };
}

test("a finished run's decision: what its branch touched, the lesson, the diffs cut per file, what each step consumed and the commands, off one ask of where the branches stand, and its total's peak against its own step's cap", async (t) => {
  const s = story(t);
  await s.test(
    'a finished run: what its result branch touched, the lesson, the check-affecting diffs cut per file, what each step consumed, and the commands',
    async () => {
      const body = await decidable('r-d1');
      assert.deepEqual(Object.keys(body), [
        'standings',
        'touched',
        'lesson',
        'sensitive',
        'used',
        'total',
        'cost',
        'overBudget',
        'commands',
        'awaiting',
        'collisions',
      ]);
      assert.equal(body.collisions, null, 'a branch handed to a person to merge is at no ending: no collision is read');
      assert.deepEqual(
        body.awaiting,
        { branches: [branch], direct: false },
        'finished, and nobody merged it: what `nemia prune` refuses without `--unmerged`',
      );

      assert.deepEqual(
        body.standings,
        [
          {
            branch,
            where: 'ahead',
            commits: 1,
            said: `${branch} is ahead of main by 1 commit`,
            stat: '4 files: +456 −2',
            /** Whether it still merges onto the base as the base is now: git's `merge-tree`, a merge in the object store alone. */
            merge: { clean: true, said: 'merges cleanly onto main' },
          },
        ],
        'where the result stands against the base branch, and how much it changed, as `nemia decide` prints them under the run: its counts, in its words',
      );

      assert.equal(body.touched.length, 1);
      const [touched] = body.touched;
      assert.equal(touched.branch, branch);
      assert.ok(!('error' in touched.radius), JSON.stringify(touched.radius));
      assert.deepEqual(
        touched.radius.groups,
        [
          { name: '(root)', files: 2, added: 3, removed: 1, binary: 0 },
          { name: 'packages/x', files: 2, added: 453, removed: 1, binary: 0 },
        ],
        'the package and the root, each once',
      );
      assert.deepEqual(touched.radius.agentFacing, ['CLAUDE.md'], 'the files an agent reads, named');
      assert.deepEqual(
        touched.radius.checkAffecting,
        ['package.json', 'packages/x/test/add.test.ts'],
        'the files a check is decided by, named',
      );

      assert.deepEqual(body.lesson, { said: 'CLAUDE.md +2 −0', state: 'written' });

      const [sensitive] = body.sensitive;
      assert.equal(body.sensitive.length, 1);
      assert.deepEqual([sensitive.branch, sensitive.error], [branch, null]);
      assert.deepEqual(
        sensitive.files.map((f: { path: string }) => f.path),
        ['package.json', 'packages/x/test/add.test.ts'],
        "only the check-affecting files, a file each, in git's order; the source file is in the radius, not in full",
      );
      const [pkg, testFile] = sensitive.files;
      assert.deepEqual(pkg, { path: 'package.json', lines: diffOf('package.json'), cut: 0 });
      const whole = diffOf('packages/x/test/add.test.ts');
      assert.ok(whole.length > DIFF_LINES, `the seeded test's diff is longer than the cap: ${whole.length} lines`);
      assert.equal(testFile.lines.length, DIFF_LINES);
      assert.deepEqual(testFile.lines, whole.slice(0, DIFF_LINES), 'a diff longer than the board is given: the first DIFF_LINES of it');
      assert.equal(testFile.cut, whole.length - DIFF_LINES, 'and how many more there were');
      assert.match(testFile.lines[0], /^diff --git a\/packages\/x\/test\/add\.test\.ts b\/packages\/x\/test\/add\.test\.ts$/);

      assert.deepEqual(
        body.used,
        {
          implement: {
            usage: { responses: 12, toolCalls: 30, inputTokens: 112_000, outputTokens: 6_350 },
            used: '12 responses · 30 tool calls · 112k in · 6.35k out',
            cost: 'not measured',
            costUsd: null,
            apiMs: null,
            toolMs: null,
            read: null,
            peak: null,
            rebuilt: 0,
          },
          review: {
            usage: { toolCalls: 4, inputTokens: 8_000, outputTokens: 650, costUsd: 0.004 },
            used: 'responses not measured · 4 tool calls · 8k in · 650 out',
            cost: '$0.004',
            costUsd: 0.004,
            apiMs: null,
            toolMs: null,
            read: null,
            peak: null,
            rebuilt: 0,
          },
        },
        "`nemia decide`'s words beside each step: a count nobody measured says so",
      );
      assert.deepEqual(
        body.total,
        {
          usage: { toolCalls: 34, inputTokens: 120_000, outputTokens: 7_000 },
          used: 'responses not measured · 34 tool calls · 120k in · 7k out',
          cost: 'not measured',
          costUsd: null,
          apiMs: null,
          toolMs: null,
          read: null,
          peak: null,
          rebuilt: 0,
        },
        'the total says not measured of a count one step lacks',
      );
      assert.equal(
        body.cost,
        'run $0.004 measured · 1 session not measured',
        "the run's cost after its steps, as `nemia decide` prints it: review's session was priced, implement's was not",
      );
      assert.equal(body.overBudget, null, 'no step held on a budget');

      assert.deepEqual(
        body.commands,
        [
          { label: 'land it', command: `git -C ${repo} merge --no-ff ${branch}`, said: null, step: null },
          { label: 'drop it', command: `git -C ${repo} branch -D ${branch}`, said: null, step: null },
        ],
        'printed, never run',
      );
      assert.equal(git(repo, 'rev-parse', 'main').trim(), base, 'the branch is still where it was, and main has not moved');

      const detail = await detailOf('r-d1');
      assert.deepEqual(
        Object.fromEntries(detail.steps.map((s: { name: string; used: unknown }) => [s.name, s.used])),
        body.used,
        "the run's page carries the same words on each step, off the views it already reads",
      );
    },
  );
  await s.test(
    "a decidable run's decision asks where the branches stand once: the package's decision reads the api's own ask",
    async () => {
      const one = countedStanding();
      await runEngine(
        engine(),
        Effect.flatMap(standingWhen(runStore.runs.list(), 'r-d1'), (asker) => asker.standing).pipe(Effect.provide(one.layer)),
      );
      assert.ok(one.asks() > 0, 'one ask asks the place its standing, which the count sees');
      const served = countedStanding();
      const { app: own } = appOf(Layer.merge(liveOf(), served.layer));
      const res = await own.request('/api/runs/r-d1/decision');
      assert.equal(res.status, 200, await res.text());
      assert.equal(served.asks(), one.asks(), 'the decision asks as one ask does, never twice');
    },
  );
  await s.test("the run's total reads its peak against the cap of the step that reached it: two steps' caps are not one cap", async () => {
    const classes = (read: number, wrote: number, peak: number) => ({
      inputTokens: read + wrote,
      cacheReadTokens: read,
      cacheWriteTokens: wrote,
      uncachedTokens: 0,
      peakContextTokens: peak,
    });
    settledTask('t-dr-implement', done, classes(9_000_000, 900_000, 831_000));
    settledTask('t-dr-review', done, classes(1_000_000, 100_000, 120_000));
    writeRun({
      id: 'r-dr',
      repo,
      baseRef: base,
      workflow: [{ ...workflow[0], context: 1_000_000 }, workflow[1]],
      steps: { implement: { taskId: 't-dr-implement', branch }, review: { taskId: 't-dr-review', branch } },
    });
    const body = await decidable('r-dr');
    assert.deepEqual(
      [body.used.implement.read, body.used.implement.peak],
      ['read 9M · wrote 900k · peak 831k', null],
      'implement ran under a 1M cap and peaked at 831k, which is no mark there',
    );
    assert.deepEqual(
      [body.total.read, body.total.peak],
      ['read 10M · wrote 1M · peak 831k', null],
      "the total's 831k is read against implement's 1M cap, not as past 200k with no cap: review had no cap and stayed small",
    );
  });
});

test("a run in flight is `running` and runs not one `git`: still running, and held by the cap on runs in flight as the app's own `WF_MAX_RUNS` says", async (t) => {
  const s = story(t);
  await s.test(
    'a run still running is `running` and nothing else, and not one `git` is run for it — nor where its result branch stands',
    async () => {
      journal('t-d2-implement', [filed('t-d2-implement'), { kind: 'starting', at, attempt: 1 }, { kind: 'spawned', at, attempt: 1 }]);
      writeRun({ id: 'r-d2', repo, baseRef: base, steps: { implement: { taskId: 't-d2-implement', branch }, review: { taskId: null } } });
      const detail = await detailOf('r-d2');
      assert.deepEqual([detail.status, detail.waitingOnYou], ['running', []]);
      assert.deepEqual(
        detail.steps.map((s: { used: unknown }) => s.used),
        [
          {
            usage: null,
            used: 'not measured',
            cost: 'not measured',
            costUsd: null,
            apiMs: null,
            toolMs: null,
            read: null,
            peak: null,
            rebuilt: 0,
          },
          null,
        ],
        'a step not filed has consumed nothing, which is not `not measured`',
      );

      const before = gitCount();
      assert.deepEqual(await decisionOf('r-d2'), { status: 200, body: { running: true } });
      assert.equal(
        gitCount(),
        before,
        'no git call for a running run, on a branch git can read: a route that asked would have had an answer',
      );
      journal('t-d8-implement', [filed('t-d8-implement'), { kind: 'starting', at, attempt: 1 }, { kind: 'spawned', at, attempt: 1 }]);
      writeRun({ id: 'r-d8', repo, baseRef: base, workflow: [workflow[0]], steps: { implement: { taskId: 't-d8-implement', branch } } });
      assert.deepEqual(await decisionOf('r-d8'), { status: 200, body: { running: true } });
      assert.equal(
        gitCount(),
        before,
        'nor for one whose running step is its result, on a branch git can read: where it stands is not asked',
      );

      await decisionOf('r-d1');
      assert.ok(gitCount() > before, "the count counts: a decidable run's decision is read out of git, through the same PATH");
    },
  );
  await s.test(
    "a run the cap on runs in flight holds is `running`, held at the count `GET /api/ceilings` holds it at — both by the app's own `WF_MAX_RUNS`, never the process's — and not one `git` is run for it",
    async () => {
      journal('t-d13-implement', [filed('t-d13-implement'), { kind: 'starting', at, attempt: 1 }, { kind: 'spawned', at, attempt: 1 }]);
      writeRun({ id: 'r-d13', repo, baseRef: base, steps: { implement: { taskId: 't-d13-implement', branch }, review: { taskId: null } } });
      writeRun({ id: 'r-d12', repo, baseRef: base, steps: {} });
      assert.equal(process.env.WF_MAX_RUNS, 'set-it-in-the-test', "the process's own is not a count, which the package refuses by name");
      const { app: own } = appOf(liveOf({ ...process.env, WF_MAX_RUNS: '1' }));
      const before = gitCount();
      const res = await own.request('/api/runs/r-d12/decision');
      const body = (await res.json()) as RunDecision;
      assert.equal(gitCount(), before, 'no git call for a run nothing of which is filed');
      const ceilings = (await (await own.request('/api/ceilings')).json()) as { inFlight: string[]; held: { run: string }[] };
      assert.ok(ceilings.inFlight.includes('r-d13'), JSON.stringify(ceilings));
      assert.ok(
        ceilings.held.some((h) => h.run === 'r-d12'),
        JSON.stringify(ceilings),
      );
      assert.deepEqual(
        { status: res.status, body },
        { status: 200, body: { running: true, held: { inFlight: ceilings.inFlight.length, cap: 1 } } },
      );
    },
  );
});

test('the commands a decision offers are bare `nemia` lines, by the state the run is in', async (t) => {
  await t.test(
    'a loop out of rounds offers both answers as commands, each the bare `nemia` line and not the sentence that carries it',
    async () => {
      const looping = [
        { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' },
        {
          name: 'review',
          after: ['implement'],
          body: 'Review it.',
          harness: 'codex',
          /** `implement ⇄ review`, two rounds: both spent, and review asks for a third. */
          loop: 'implement',
          rounds: 2,
          output: {
            file: 'review.json',
            schema: { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false },
          },
        },
      ];
      settledTask('t-d9-implement-2', done);
      settledTask('t-d9-review-2', { ...done, again: true });
      const tries = (name: string) => [{ taskId: `t-d9-${name}-1`, cause: 'round' }];
      writeRun({
        id: 'r-d9',
        repo,
        baseRef: base,
        workflow: looping,
        steps: {
          implement: { taskId: 't-d9-implement-2', branch, tries: tries('implement') },
          review: { taskId: 't-d9-review-2', branch, tries: tries('review') },
        },
      });

      const body = await decidable('r-d9');
      assert.deepEqual(
        body.commands
          .filter((c: { label: string }) => c.label !== 'land it' && c.label !== 'drop it')
          .map(({ label, command, step }: DecideCommand) => ({ label, command, step })),
        [
          { label: 'once more', command: 'nemia retry r-d9 review --round', step: 'review' },
          { label: 'approve', command: 'nemia approve r-d9 review --message "<why>"', step: 'review' },
          { label: 'once more', command: 'nemia retry r-d9 implement', step: 'implement' },
        ],
        'both offers are the bare command a person runs (`choicesOf`), never a paragraph under a button that says `once more`',
      );
      assert.deepEqual(
        body.commands.filter((c) => !/^(nemia|git -C) \S+( \S+)*$/.test(c.command) || /\n|\.$/.test(c.command)).map((c) => c.command),
        [],
        'every command is one line a person runs, never a sentence',
      );
      const accept = body.commands.find((c) => c.label === 'approve');
      assert.ok(accept?.said, JSON.stringify(body.commands));
      assert.match(
        accept.said,
        /^review: enough — go on with what is there; its findings stay on the record, and the run ends with them on the record:  nemia approve r-d9 review --message "<why>"$/,
      );

      const stepsOf = async () => (await detailOf('r-d9')).steps;
      assert.deepEqual(
        (await stepsOf()).map((s) => [s.name, s.accepted]),
        [
          ['implement', null],
          ['review', null],
        ],
        'before a person accepts, no step of the run says an acceptance',
      );
      const asks = path.join(root, 'runs', 'r-d9.asks');
      fs.mkdirSync(asks, { recursive: true });
      fs.writeFileSync(
        path.join(asks, 'accept-review-1'),
        JSON.stringify({ at: '2026-09-20T01:00:00.000Z', message: 'spent: of the try before' }),
      );
      assert.deepEqual(
        (await stepsOf()).map((s) => [s.name, s.accepted]),
        [
          ['implement', null],
          ['review', null],
        ],
        'the looping step is on its second try, one round behind it: an acceptance of try 1 is spent, and said of nothing',
      );
      fs.writeFileSync(
        path.join(asks, 'accept-review-2'),
        JSON.stringify({ at: '2026-09-20T02:00:00.000Z', message: 'the findings are follow-up work' }),
      );
      assert.deepEqual(
        (await stepsOf()).map((s) => [s.name, s.accepted]),
        [
          ['implement', null],
          ['review', { try: 2, at: '2026-09-20T02:00:00.000Z', message: 'the findings are follow-up work' }],
        ],
        "the looping step says the try, when and their words, and no other step: the board's gate reads it, the closeout still saying `again: true`",
      );
    },
  );
  await t.test(
    'an ending whose check did not finish on the merge it staged is offered the bare `nemia retry <run> ship`, labelled once more, and never --recheck: the run aborted that merge',
    async () => {
      const { repo, base } = aRepo();
      const branch = 'wf/r-d20/implement';
      branchOff(repo, branch, () => write(repo, 'packages/x/src/sub.ts', 'export const sub = (a, b) => a - b;\n'));
      const landing = [
        { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' },
        {
          name: 'ship',
          after: ['implement'],
          body: 'Ship it.',
          harness: 'claude',
          workspace: 'main',
          gate: true,
          check: 'npm test',
          output: {
            file: 'shipper.schema.json',
            schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false },
          },
        },
      ];
      settledTask('t-d20-implement', done);
      settledTask('t-d20-ship', { ...done, message: 'Add sub\n\nsub beside add.' });
      journal('t-d20-ship-check', [
        { kind: 'filed', at, brief: JSON.stringify({ check: 'npm test', env: {} }), cwd: repo, maxAttempts: 1, harness: 'check' },
        { kind: 'starting', at, attempt: 1 },
        { kind: 'spawned', at, attempt: 1 },
        { kind: 'ended', at, attempt: 1, sessionId: 'ae/t-d20-ship-check/1', observed: 'failed', reason: 'deadline' },
        { kind: 'settled', at, outcome: 'failed' },
      ]);
      writeRun({
        id: 'r-d20',
        repo,
        baseRef: base,
        workflow: landing,
        steps: {
          implement: { taskId: 't-d20-implement', branch },
          ship: {
            taskId: 't-d20-ship',
            workspace: repo,
            branch: 'main',
            check: { taskId: 't-d20-ship-check' },
            /** Its check was killed at its deadline: no exit code, so no verdict on the merge, and the run aborted it (`landingDue`). */
            landed: { aborted: 'its check did not finish' },
          },
        },
      });
      const asks = path.join(root, 'runs', 'r-d20.asks');
      fs.mkdirSync(asks, { recursive: true });
      fs.writeFileSync(path.join(asks, 'approve-ship-1'), JSON.stringify({ at, message: 'Merge it.' }));

      const body = await decidable('r-d20');
      const offered = body.commands.filter((c: DecideCommand) => c.label === 'once more');
      assert.deepEqual(
        offered.map(({ command }: DecideCommand) => command),
        ['nemia retry r-d20 ship'],
        JSON.stringify(body.commands),
      );
      const [first] = offered;
      assert.ok(first?.said, JSON.stringify(offered));
      assert.match(
        first.said,
        /^ship: its check did not finish, so the run aborted the merge and nothing landed on main\. Merge and check again:  nemia retry r-d20 ship$/,
      );
      assert.ok(!JSON.stringify(body).includes('--recheck'), 'a check the run aborted the merge of is never checked again on its own');
    },
  );
  await t.test(
    'a step `denials: fail` stopped is offered the bare `nemia retry <run> <step> --fresh`, labelled once more — the rule for `allowedTools:` stays in what `nemia decide` said — and reads `denied`, waited on by a person',
    async () => {
      const denying = [
        { ...workflow[0], harness: 'claude', denials: 'fail' },
        { ...workflow[1], harness: 'claude' },
      ];
      journal('t-d11-implement', [
        { ...filed('t-d11-implement'), harness: 'claude' },
        { kind: 'starting', at, attempt: 1 },
        { kind: 'spawned', at, attempt: 1 },
        {
          kind: 'ended',
          at,
          attempt: 1,
          sessionId: 'ae/t-d11-implement/1',
          observed: 'done',
          reason: 'harness',
          closeout: done,
          denials: [{ tool: 'Write', what: '/tmp/w/notes.md' }],
        },
        { kind: 'settled', at, outcome: 'succeeded' },
      ]);
      writeRun({
        id: 'r-d11',
        repo,
        baseRef: base,
        workflow: denying,
        steps: { implement: { taskId: 't-d11-implement', branch }, review: { taskId: null } },
      });

      const detail = await detailOf('r-d11');
      assert.deepEqual([detail.steps[0].status, detail.steps[1].status, detail.waitingOnYou], ['denied', 'pending', ['implement']]);
      const body = await decidable('r-d11');
      const once = body.commands.filter((c: DecideCommand) => c.label === 'once more');
      assert.deepEqual(
        once.map(({ label, command }: DecideCommand) => ({ label, command })),
        [{ label: 'once more', command: 'nemia retry r-d11 implement --fresh' }],
      );
      assert.ok(once[0]?.said, JSON.stringify(once));
      assert.match(once[0].said, /add Edit\(\/\/tmp\/w\/notes\.md\) to the folder's allowedTools:/);
    },
  );
});

test('a decision where the place cannot say: a branch it has not is an error on its entry, and a report not heard is what the run changed not known', async (t) => {
  await t.test(
    'a branch the place has not is an `error` on its entry — the lesson not known, its diff not known — and the request still answers',
    async () => {
      settledTask('t-d3-implement', blocked);
      const gone = 'wf/r-d3/gone';
      writeRun({
        id: 'r-d3',
        repo,
        baseRef: base,
        steps: { implement: { taskId: 't-d3-implement', branch: gone }, review: { taskId: null } },
      });

      const body = await decidable('r-d3');
      const unread = `what this run changed is not known: the place has no branch ${gone} in ${repo}`;
      assert.deepEqual(
        body.touched,
        [{ branch: gone, radius: { error: unread } }],
        'implement signed off blocked on a branch nobody made, and review is never filed: the branch a step worked on is read',
      );
      assert.deepEqual(body.lesson, { said: `not known — ${gone} could not be read`, state: 'unknown' });
      assert.deepEqual(body.sensitive, [{ branch: gone, files: [], error: unread }]);
      assert.equal(body.commands.length, 1, 'no result branch to land or drop');
      assert.deepEqual(
        { ...body.commands[0], said: undefined },
        { label: 'once more', command: 'nemia retry r-d3 implement', said: undefined, step: 'implement' },
        'implement may be tried again, with the command `nemia decide` prints for it',
      );
      const [retried] = body.commands;
      assert.ok(retried?.said, JSON.stringify(retried));
      assert.match(retried.said, /^implement: .*:  nemia retry r-d3 implement {2}\(--fresh/);

      writeRun({
        id: 'r-d3b',
        repo: path.join(root, 'no-such-repo'),
        baseRef: base,
        steps: { implement: { taskId: 't-d3-implement', branch: gone }, review: { taskId: null } },
      });
      const nowhere = await decidable('r-d3b');
      const refused = `what this run changed is not known: ${path.join(root, 'no-such-repo')} is not a directory, so nothing a branch in it changed can be read`;
      assert.deepEqual(
        nowhere.touched,
        [{ branch: gone, radius: { error: refused } }],
        'a repository that is not there at all: the place refuses',
      );
      assert.equal(nowhere.lesson.state, 'unknown');
    },
  );
  await t.test('a place whose report is not heard says what the run changed is not known, never that it changed nothing', async () => {
    const before = process.env.PATH;
    process.env.PATH = scratch('nemia-api-decision-no-git-');
    try {
      const body = await decidable('r-d1');
      const [touched] = body.touched;
      const unknown = /^what this run changed is not known: the place's report was not heard: /;
      assert.ok('error' in touched.radius, `with no git to run, the place's report exits 1: ${JSON.stringify(touched.radius)}`);
      assert.match(touched.radius.error, unknown);
      assert.match(body.sensitive[0]?.error ?? '', unknown, 'its check-affecting diff is not known either');
      assert.equal(body.lesson.state, 'unknown');
      for (const s of body.standings) assert.match(s.stat ?? '', unknown, `${s.branch}'s counts are not known, never none`);
    } finally {
      process.env.PATH = before;
    }
  });
});

test('a decision with nothing to try, nothing to decide, or no run: pruned, called off, unknown', async (t) => {
  await t.test(
    'REFUSED once pruned: a run whose worktrees `nemia prune` removed offers no try, since the verb refuses it, and its page says when it was pruned',
    async () => {
      writeRun({ id: 'r-d10', repo, baseRef: base, steps: { implement: { taskId: 't-d3-implement', branch }, review: { taskId: null } } });
      assert.deepEqual(
        (await decidable('r-d10')).commands.map((c: DecideCommand) => c.command),
        ['nemia retry r-d10 implement'],
        'as r-d3: implement signed off blocked, and may be tried again while the run is not pruned',
      );
      assert.deepEqual((await detailOf('r-d10')).waitingOnYou, ['implement']);
      const pruned = { at: '2026-09-13T02:00:00.000Z', worktrees: [{ path: '/wt/r-d10/implement', bytes: 4096 }] };
      fs.writeFileSync(path.join(root, 'runs', 'r-d10.pruned'), JSON.stringify(pruned));

      const body = await decidable('r-d10');
      assert.deepEqual(body.commands, []);
      const page = await detailOf('r-d10');
      assert.deepEqual(page.pruned, { ...pruned, artifacts: null }, 'its files are kept: a plain prune removes the worktrees alone');
      assert.deepEqual(page.waitingOnYou, [], 'it waits on nobody: nothing a person does files anything for it');
      const asks = path.join(root, 'runs', 'r-d10.asks');
      fs.mkdirSync(asks, { recursive: true });
      fs.writeFileSync(path.join(asks, 'retry-implement-2'), JSON.stringify({ mode: 'nudge' }));
      const asked = await detailOf('r-d10');
      assert.equal(
        asked.steps.find((s) => s.name === 'implement')?.asked,
        null,
        'a try asked by hand, beside the verb that refuses it, is no try coming',
      );
      assert.equal(asked.moving, false, 'the board says nothing is on its way');
      fs.rmSync(asks, { recursive: true });
      assert.equal((await detailOf('r-d1')).pruned, null, 'a run never pruned says so with a null, not a missing field');
    },
  );
  await t.test(
    "a run called off has nothing to decide: a 200 whose body carries `nothing` alone, and no git call — the verdict's own words are the orchestrator's, pinned there over a real repository",
    async () => {
      writeRun({
        id: 'r-d4',
        repo,
        baseRef: base,
        steps: { implement: { taskId: 't-d1-implement', branch }, review: { taskId: 't-d1-review', branch } },
      });
      fs.writeFileSync(path.join(root, 'runs', 'r-d4.cancelled'), '2026-09-13T01:00:00.000Z');
      const before = gitCount();
      const res = await app.request('/api/runs/r-d4/decision');
      assert.equal(res.status, 200);
      const body = (await res.json()) as Record<string, unknown>;
      assert.deepEqual(Object.keys(body), ['nothing'], 'the one key: no commands, no steps');
      assert.equal(typeof body.nothing, 'string');
      assert.equal(gitCount(), before, 'no git call for a cancelled run');
    },
  );
  await t.test('an unknown run is refused with a 404 that says where to look', async () => {
    const res = await app.request('/api/runs/no-such-run/decision');
    assert.equal(res.status, 404);
    assert.match(((await res.json()) as { error: string }).error, /No run 'no-such-run'/);
    assert.equal((await app.request('/api/runs/..%2Fescape/decision')).status, 404);
  });
});

test("a diff is cut a file at a time: named by its header, a rename as both ends, and each file's lines past the cap counted", () => {
  const long = Array.from({ length: DIFF_LINES + 7 }, (_, i) => `+line ${i}`);
  const diff = [
    'diff --git a/logo.png b/logo.png',
    'index 1111111..2222222 100644',
    'Binary files a/logo.png and b/logo.png differ',
    'diff --git a/test/a.test.ts b/spec/a.test.ts',
    'similarity index 90%',
    'rename from test/a.test.ts',
    'rename to spec/a.test.ts',
    '@@ -1 +1 @@',
    '-a',
    '+b',
    'diff --git a/new file.test.ts b/new file.test.ts',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/new file.test.ts\t',
    '@@ -0,0 +1,407 @@',
    ...long.slice(0, -2),
  ].join('\n');
  const files = diffFiles(`${diff}\n`);
  assert.deepEqual(
    files.map((f) => [f.path, f.lines.length, f.cut]),
    [
      ['logo.png', 3, 0],
      ['test/a.test.ts → spec/a.test.ts', 7, 0],
      ['new file.test.ts', DIFF_LINES, 10],
    ],
    'the new file has five header lines and DIFF_LINES + 5 added: ten past the cap',
  );
  assert.equal(files[2].lines.at(-1), long[DIFF_LINES - 6]);
});

test("a run `assess` calls running while a step waits on a person is decided on: its terminal steps' branches read, and no command yet", async () => {
  const folder = fs.mkdtempSync(path.join(root, 'workflow-'));
  fs.writeFileSync(path.join(folder, 'tokens.md'), '---\nplace: git\nharness: codex\n---\nPick the colour tokens.\n');
  branchOff(repo, 'wf/r-d6/implement', () =>
    write(repo, 'package.json', `${JSON.stringify({ name: 'app', workspaces: ['packages/*'] })}\n`),
  );
  branchOff(repo, 'wf/r-d6/tokens', () => write(repo, 'packages/x/docs/notes.md', 'what is left\n'));
  settledTask('t-d6-implement', blocked);
  journal('t-d6-tokens', [filed('t-d6-tokens'), { kind: 'starting', at, attempt: 1 }, { kind: 'spawned', at, attempt: 1 }]);
  writeRun({
    id: 'r-d6',
    repo,
    baseRef: base,
    workflowDir: folder,
    /**
     * A record with no frozen workflow, whose folder has no implement: the tick judges the folder, whose tokens still runs, and implement,
     * on the record and signed off blocked, waits on you all the same.
     */
    workflow: undefined,
    steps: {
      implement: { taskId: 't-d6-implement', branch: 'wf/r-d6/implement' },
      tokens: { taskId: 't-d6-tokens', branch: 'wf/r-d6/tokens' },
    },
  });
  const detail = await detailOf('r-d6');
  assert.deepEqual([detail.status, detail.waitingOnYou], ['running', ['implement']], detail.warning ?? undefined);

  const body = await decidable('r-d6');
  assert.ok(!('running' in body), 'waiting on you is decidable, whatever `assess` calls the run');
  assert.deepEqual(
    body.touched.map((t: { branch: string }) => t.branch),
    ['wf/r-d6/tokens'],
    "the branch of the terminal step the tick judges, as `nemia decide` reads a run once it stops, not implement's",
  );
  const [tokens] = body.touched;
  assert.ok(tokens && !('error' in tokens.radius), JSON.stringify(tokens));
  assert.deepEqual(tokens.radius.groups, [{ name: 'packages/x', files: 1, added: 1, removed: 0, binary: 0 }]);
  assert.deepEqual(body.lesson, { said: 'packages/x/docs/notes.md +1 −0', state: 'written' });
  assert.deepEqual(body.sensitive, [{ branch: 'wf/r-d6/tokens', files: [], error: null }]);
  assert.deepEqual(body.commands, [], '`decision` is still `running`: no land, drop or once more is offered while its steps move');
  assert.equal(body.awaiting, null, 'still running: not yet a run nobody decided');

  writeRun({
    id: 'r-d7',
    repo,
    baseRef: base,
    /**
     * The same steps frozen on the record fan out: implement blocked with tokens still spawned is `failed` to `assess`, so the decision
     * is `nemia decide`'s own, its result branches both roots'.
     */
    workflow: [
      { name: 'implement', after: [], body: 'Implement it.' },
      { name: 'tokens', after: [], body: 'Pick the colour tokens.' },
    ],
    steps: {
      implement: { taskId: 't-d6-implement', branch: 'wf/r-d6/implement' },
      tokens: { taskId: 't-d6-tokens', branch: 'wf/r-d6/tokens' },
    },
  });
  const fanOut = await detailOf('r-d7');
  assert.deepEqual([fanOut.status, fanOut.moving, fanOut.waitingOnYou], ['waiting', true, ['implement']]);
  const decided = await decidable('r-d7');
  assert.deepEqual(
    decided.touched.map((t: { branch: string }) => t.branch),
    ['wf/r-d6/implement', 'wf/r-d6/tokens'],
  );
  assert.deepEqual(
    decided.commands.map((c: { label: string }) => c.label),
    ['once more', 'land it', 'drop it'],
  );
});

test("a run whose approved ending waits for the repository's checkout, which another run's ending is in, answers `checkout` with that run — read by the app's own `WF_MAX_RUNS`, never the process's — and one nothing holds answers none", async () => {
  const { repo: shared, base: from } = aRepo();
  const landing = [
    { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' },
    { name: 'notes', after: [], body: 'Write the notes.', harness: 'codex', gate: true },
    { name: 'ship', after: ['implement'], body: 'Ship it.', harness: 'claude', workspace: 'main', gate: true },
  ];
  const approve = (id: string) => {
    fs.mkdirSync(path.join(root, 'runs', `${id}.asks`), { recursive: true });
    fs.writeFileSync(path.join(root, 'runs', `${id}.asks`, 'approve-ship-1'), JSON.stringify({ at, message: 'Merge it.' }));
  };
  settledTask('t-d14-implement', done);
  settledTask('t-d14-notes', done);
  writeRun({
    id: 'r-d14',
    repo: shared,
    baseRef: from,
    workflow: landing,
    steps: {
      implement: { taskId: 't-d14-implement', branch: 'wf/r-d14/implement' },
      notes: { taskId: 't-d14-notes', branch: 'wf/r-d14/notes' },
      ship: { taskId: null },
    },
  });
  approve('r-d14');
  assert.equal(process.env.WF_MAX_RUNS, 'set-it-in-the-test', "the process's own is not a count, which the package refuses by name");
  const { app: own } = appOf(liveOf({ ...process.env, WF_MAX_RUNS: '1' }));
  const answer = async () => {
    const res = await own.request('/api/runs/r-d14/decision');
    const body = (await res.json()) as Decidable;
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.ok('commands' in body, JSON.stringify(body));
    return body;
  };
  assert.ok(!('checkout' in (await answer())), 'no other run is in the checkout, so nothing holds it');

  settledTask('t-d15-implement', done);
  journal('t-d15-ship', [
    { ...filed('t-d15-ship'), cwd: shared },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
  ]);
  writeRun({
    id: 'r-d15',
    repo: shared,
    baseRef: from,
    workflow: landing,
    steps: {
      implement: { taskId: 't-d15-implement', branch: 'wf/r-d15/implement' },
      notes: { taskId: null },
      ship: { taskId: 't-d15-ship', workspace: shared, branch: 'main' },
    },
  });
  approve('r-d15');
  assert.deepEqual((await answer()).checkout, { run: 'r-d15', step: 'ship' });
});
