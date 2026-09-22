/**
 * GET /api/runs/:id/decision: what `wf decide` shows a person, off a real repository — what a result branch touched, the
 * lesson line, the check-affecting diffs cut per file, what each step consumed, and the commands — and nothing of it, and
 * no `git` at all, for a run still running.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// agent-workflows locates its store when the module loads, so point it at a scratch directory first.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-decision-'));
process.env.WF_ROOT = root;

// Ahead of the real one on PATH, beside the harness's `claude`: a `git` that notes each call and runs the real one, so a test can count
// what the route asked of git.
const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-decision-bin-'));
const gitCalls = path.join(bin, 'git-calls');
fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho "$*" >> '${gitCalls}'\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
const gitCount = () => (fs.existsSync(gitCalls) ? fs.readFileSync(gitCalls, 'utf8').split('\n').filter(Boolean).length : 0);

const { app, diffFiles, DIFF_LINES } = await import('../src/app.ts');
type DecideCommand = import('../src/app.ts').DecideCommand;

const git = (repo: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: repo, encoding: 'utf8' });
const write = (repo: string, file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
};

/** A repository whose base has a workspace package with a source file and its test, and a CLAUDE.md. Its base's sha. */
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
const filed = (taskId: string) => ({ kind: 'filed', at, brief: `The brief ${taskId} was filed with.`, cwd: '/code/app', maxAttempts: 1, harness: 'codex' });

/** A task that ran once and signed off with `closeout`, its attempt recording the `usage` the engine read, if any. */
const settledTask = (taskId: string, closeout: object, usage?: object) => journal(taskId, [
  filed(taskId),
  { kind: 'starting', at, attempt: 1 },
  { kind: 'spawned', at, attempt: 1 },
  { kind: 'ended', at, attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout, ...(usage ? { usage } : {}) },
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
  fs.writeFileSync(path.join(root, 'runs', `${run.id}.json`), JSON.stringify({
    workspace: run.repo, branch: 'main', isolate: true, brief: 'Decide it', createdAt: at,
    workflowDir: path.join(root, 'no-such-workflow'), workflow, ...run,
  }));
}

const decisionOf = async (id: string) => {
  const res = await app.request(`/api/runs/${id}/decision`);
  return { status: res.status, body: await res.json() };
};

const { repo, base } = aRepo();
const branch = 'wf/r-d1/implement';
branchOff(repo, branch, () => {
  write(repo, 'packages/x/src/add.ts', '/** Adds. */\nexport const add = (a: number, b: number): number =>\n  a + b;\n');
  const added = Array.from({ length: 450 }, (_, i) => `assert.equal(add(${i}, 1), ${i + 1});`).join('\n');
  write(repo, 'packages/x/test/add.test.ts', `import assert from 'node:assert';\nassert.equal(add(1, 1), 2);\n${added}\n`);
  write(repo, 'CLAUDE.md', '# app\n\n- A lesson for the next agent.\n');
  write(repo, 'package.json', `${JSON.stringify({ name: 'app', workspaces: ['packages/*'], scripts: { test: 'node --test packages/x/test/' } })}\n`);
});

/** One file's diff as git gives it on its own, line by line. */
const diffOf = (file: string) =>
  git(repo, '-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', '--find-renames', `${base}...${branch}`, '--', file).replace(/\n$/, '').split('\n');

settledTask('t-d1-implement', done, { turns: 12, toolCalls: 30, inputTokens: 112_000, outputTokens: 6_350 });
settledTask('t-d1-review', done, { toolCalls: 4, inputTokens: 8_000, outputTokens: 650, costUsd: 0.004 });
writeRun({
  id: 'r-d1', repo, baseRef: base,
  steps: { implement: { taskId: 't-d1-implement', branch }, review: { taskId: 't-d1-review', branch } },
});

test('a finished run: what its result branch touched, the lesson, the check-affecting diffs cut per file, what each step consumed, and the commands', async () => {
  const { status, body } = await decisionOf('r-d1');
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(body), ['standings', 'touched', 'lesson', 'sensitive', 'used', 'total', 'cost', 'overBudget', 'commands']);

  // Where the result stands against the base branch, and how much it changed, as `wf decide` prints them under the run: git's own
  // `--shortstat`, trimmed.
  assert.deepEqual(body.standings, [{
    branch, where: 'ahead', commits: 1, said: `${branch} is ahead of main by 1 commit`,
    stat: '4 files changed, 456 insertions(+), 2 deletions(-)',
    // And whether it still merges onto the base as the base is now: git's `merge-tree`, a merge in the object store alone.
    merge: { clean: true, said: 'merges cleanly onto main' },
  }]);

  // The package and the root, each once, with the files an agent reads and those a check is decided by named.
  assert.equal(body.touched.length, 1);
  const [touched] = body.touched;
  assert.equal(touched.branch, branch);
  assert.deepEqual(touched.radius.groups, [
    { name: '(root)', files: 2, added: 3, removed: 1, binary: 0 },
    { name: 'packages/x', files: 2, added: 453, removed: 1, binary: 0 },
  ]);
  assert.deepEqual(touched.radius.agentFacing, ['CLAUDE.md']);
  assert.deepEqual(touched.radius.checkAffecting, ['package.json', 'packages/x/test/add.test.ts']);

  assert.deepEqual(body.lesson, { said: 'CLAUDE.md +2 −0', state: 'written' });

  // Only the check-affecting files, a file each, in git's order; the source file is in the radius, not in full.
  const [sensitive] = body.sensitive;
  assert.equal(body.sensitive.length, 1);
  assert.deepEqual([sensitive.branch, sensitive.error], [branch, null]);
  assert.deepEqual(sensitive.files.map((f: { path: string }) => f.path), ['package.json', 'packages/x/test/add.test.ts']);
  const [pkg, testFile] = sensitive.files;
  assert.deepEqual(pkg, { path: 'package.json', lines: diffOf('package.json'), cut: 0 });
  // The test's diff is longer than the board is given: the first DIFF_LINES of it, and how many more there were.
  const whole = diffOf('packages/x/test/add.test.ts');
  assert.ok(whole.length > DIFF_LINES, `the seeded test's diff is longer than the cap: ${whole.length} lines`);
  assert.equal(testFile.lines.length, DIFF_LINES);
  assert.deepEqual(testFile.lines, whole.slice(0, DIFF_LINES));
  assert.equal(testFile.cut, whole.length - DIFF_LINES);
  assert.match(testFile.lines[0], /^diff --git a\/packages\/x\/test\/add\.test\.ts b\/packages\/x\/test\/add\.test\.ts$/);

  // `wf decide`'s words beside each check: a count nobody measured says so, and so does the total that one step lacks.
  assert.deepEqual(body.used, {
    implement: { usage: { turns: 12, toolCalls: 30, inputTokens: 112_000, outputTokens: 6_350 }, used: '12 turns · 30 tool calls · 112k in · 6.35k out', cost: 'not measured', costUsd: null, apiMs: null, toolMs: null, read: null, peak: null, rebuilt: 0 },
    review: { usage: { toolCalls: 4, inputTokens: 8_000, outputTokens: 650, costUsd: 0.004 }, used: 'turns not measured · 4 tool calls · 8k in · 650 out', cost: '$0.004', costUsd: 0.004, apiMs: null, toolMs: null, read: null, peak: null, rebuilt: 0 },
  });
  assert.deepEqual(body.total, {
    usage: { toolCalls: 34, inputTokens: 120_000, outputTokens: 7_000 },
    used: 'turns not measured · 34 tool calls · 120k in · 7k out',
    cost: 'not measured',
    costUsd: null, apiMs: null, toolMs: null, read: null, peak: null, rebuilt: 0,
  });
  // The run's cost after its steps, as `wf decide` prints it: review's session was priced, implement's was not. And no step held on a budget.
  assert.equal(body.cost, 'run $0.004 measured · 1 attempt not measured');
  assert.equal(body.overBudget, null);

  // Printed, never run: the branch is still where it was, and main has not moved.
  assert.deepEqual(body.commands, [
    { label: 'ship it', command: `git -C ${repo} merge --no-ff ${branch}`, said: null },
    { label: 'drop it', command: `git -C ${repo} branch -D ${branch}`, said: null },
  ]);
  assert.equal(git(repo, 'rev-parse', 'main').trim(), base);

  // The run's page carries the same words on each step, off the views it already reads.
  const detail = await (await app.request('/api/runs/r-d1')).json();
  assert.deepEqual(Object.fromEntries(detail.steps.map((s: { name: string; used: unknown }) => [s.name, s.used])), body.used);
});

test("the run's total reads its peak against the cap of the step that reached it: two steps' caps are not one cap", async () => {
  // `implement` ran under a 1M cap and peaked at 831k, which is no mark there; `review` had no cap and stayed small. Read against no cap, the
  // total's 831k would say `past 200k with no cap`, of a session that had one.
  const classes = (read: number, wrote: number, peak: number) => ({ inputTokens: read + wrote, cacheReadTokens: read, cacheWriteTokens: wrote, uncachedTokens: 0, peakContextTokens: peak });
  settledTask('t-dr-implement', done, classes(9_000_000, 900_000, 831_000));
  settledTask('t-dr-review', done, classes(1_000_000, 100_000, 120_000));
  writeRun({
    id: 'r-dr', repo, baseRef: base,
    workflow: [{ ...workflow[0], context: 1_000_000 }, workflow[1]],
    steps: { implement: { taskId: 't-dr-implement', branch }, review: { taskId: 't-dr-review', branch } },
  });
  const { body } = await decisionOf('r-dr');
  assert.deepEqual([body.used.implement.read, body.used.implement.peak], ['read 9M · wrote 900k · peak 831k', null]);
  assert.deepEqual([body.total.read, body.total.peak], ['read 10M · wrote 1M · peak 831k', null]);
});

test('a run still running is `running` and nothing else, and not one `git` is run for it', async () => {
  journal('t-d2-implement', [filed('t-d2-implement'), { kind: 'starting', at, attempt: 1 }, { kind: 'spawned', at, attempt: 1 }]);
  // On a branch git can read, so a route that asked would have had an answer.
  writeRun({ id: 'r-d2', repo, baseRef: base, steps: { implement: { taskId: 't-d2-implement', branch }, review: { taskId: null } } });
  const detail = await (await app.request('/api/runs/r-d2')).json();
  assert.deepEqual([detail.status, detail.waitingOnYou], ['running', []]);
  // A step not filed has consumed nothing, which is not `not measured`.
  assert.deepEqual(detail.steps.map((s: { used: unknown }) => s.used), [{ usage: null, used: 'not measured', cost: 'not measured', costUsd: null, apiMs: null, toolMs: null, read: null, peak: null, rebuilt: 0 }, null]);

  const before = gitCount();
  assert.deepEqual(await decisionOf('r-d2'), { status: 200, body: { running: true } });
  assert.equal(gitCount(), before, 'no git call for a running run');

  // The count counts: a decidable run's decision is read out of git.
  await decisionOf('r-d1');
  assert.ok(gitCount() > before, 'a decidable run runs git, through the same PATH');
});

test('a loop out of rounds offers both answers as commands, each the bare `wf` line and not the sentence that carries it', async () => {
  // `implement ⇄ review`, rounds: 2, both rounds spent, and review asked for a third.
  const looping = [
    { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' },
    {
      name: 'review', after: ['implement'], body: 'Review it.', harness: 'codex', loop: 'implement', rounds: 2,
      output: { file: 'review.json', schema: { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false } },
    },
  ];
  settledTask('t-d9-implement-2', done);
  settledTask('t-d9-review-2', { ...done, again: true });
  const tries = (name: string) => [{ taskId: `t-d9-${name}-1`, then: 'round' }];
  writeRun({
    id: 'r-d9', repo, baseRef: base, workflow: looping,
    steps: { implement: { taskId: 't-d9-implement-2', branch, tries: tries('implement') }, review: { taskId: 't-d9-review-2', branch, tries: tries('review') } },
  });

  const { status, body } = await decisionOf('r-d9');
  assert.equal(status, 200);
  // Both offers are parsed to the command a person runs. An offer this route's ONCE_MORE does not know is handed over whole, and the
  // board would give a person a paragraph of English to copy under a button that says `once more`.
  assert.deepEqual(body.commands.filter((c: { label: string }) => c.label !== 'ship it' && c.label !== 'drop it').map(({ label, command }: DecideCommand) => ({ label, command })), [
    { label: 'once more', command: 'wf round r-d9 review' },
    { label: 'accept', command: 'wf accept r-d9 review --message "<why>"' },
    { label: 'once more', command: 'wf retry r-d9 implement' },
  ]);
  const accept = body.commands.find((c: { label: string }) => c.label === 'accept');
  assert.match(accept.said, /^review: enough — go on with what is there; its findings stay on the record, and the run ends with them on the record:  wf accept r-d9 review --message "<why>"$/);

  // Before a person accepts, no step of the run says an acceptance; after, the looping step does — the try, when, and their words — and no
  // other step. The board's gate reads it: the closeout still says `again: true`, and without this it would say the loop asks another round.
  const stepsOf = async () => ((await (await app.request('/api/runs/r-d9')).json()) as { steps: { name: string; accepted: unknown }[] }).steps;
  assert.deepEqual((await stepsOf()).map((s) => [s.name, s.accepted]), [['implement', null], ['review', null]]);
  const asks = path.join(root, 'runs', 'r-d9.asks');
  fs.mkdirSync(asks, { recursive: true });
  // The looping step is on its second try (one round behind it), so the acceptance is of try 2: one of try 1 would be spent, and said of nothing.
  fs.writeFileSync(path.join(asks, 'accept-review-1'), JSON.stringify({ at: '2026-09-20T01:00:00.000Z', message: 'spent: of the try before' }));
  assert.deepEqual((await stepsOf()).map((s) => [s.name, s.accepted]), [['implement', null], ['review', null]], 'an acceptance of an earlier try is spent');
  fs.writeFileSync(path.join(asks, 'accept-review-2'), JSON.stringify({ at: '2026-09-20T02:00:00.000Z', message: 'the findings are follow-up work' }));
  assert.deepEqual((await stepsOf()).map((s) => [s.name, s.accepted]), [
    ['implement', null],
    ['review', { try: 2, at: '2026-09-20T02:00:00.000Z', message: 'the findings are follow-up work' }],
  ]);
});

test("a branch git cannot read is an `error` on its entry — the lesson not known, its diff not read — and the request still answers", async () => {
  // implement signed off blocked on a branch nobody made, and review is never filed: the branch a step worked on is read.
  settledTask('t-d3-implement', blocked);
  const gone = 'wf/r-d3/gone';
  writeRun({ id: 'r-d3', repo, baseRef: base, steps: { implement: { taskId: 't-d3-implement', branch: gone }, review: { taskId: null } } });

  const { status, body } = await decisionOf('r-d3');
  assert.equal(status, 200);
  const unread = `git could not diff ${base.slice(0, 12)}...${gone}`;
  assert.deepEqual(body.touched, [{ branch: gone, radius: { error: unread } }]);
  assert.deepEqual(body.lesson, { said: `not known — ${gone} could not be read`, state: 'unknown' });
  assert.deepEqual(body.sensitive, [{ branch: gone, files: [], error: unread }]);
  // No result branch to ship or drop; implement may be tried again, with the command `wf decide` prints for it.
  assert.equal(body.commands.length, 1);
  assert.deepEqual({ ...body.commands[0], said: undefined }, { label: 'once more', command: 'wf retry r-d3 implement', said: undefined });
  assert.match(body.commands[0].said, /^implement: .*:  wf retry r-d3 implement {2}\(--fresh/);

  // And a repository that is not there at all.
  writeRun({ id: 'r-d3b', repo: path.join(root, 'no-such-repo'), baseRef: base, steps: { implement: { taskId: 't-d3-implement', branch: gone }, review: { taskId: null } } });
  const nowhere = await decisionOf('r-d3b');
  assert.equal(nowhere.status, 200);
  assert.deepEqual(nowhere.body.touched, [{ branch: gone, radius: { error: unread } }]);
  assert.equal(nowhere.body.lesson.state, 'unknown');
});

test('REFUSED once pruned: a run whose worktrees `wf prune` removed offers no try, since the verb refuses it, and its page says when it was pruned', async () => {
  // As r-d3: implement signed off blocked, and may be tried again — until the run is pruned.
  writeRun({ id: 'r-d10', repo, baseRef: base, steps: { implement: { taskId: 't-d3-implement', branch }, review: { taskId: null } } });
  assert.deepEqual((await decisionOf('r-d10')).body.commands.map((c: DecideCommand) => c.command), ['wf retry r-d10 implement']);
  const pruned = { at: '2026-09-13T02:00:00.000Z', worktrees: [{ path: '/wt/r-d10/implement', bytes: 4096 }] };
  fs.writeFileSync(path.join(root, 'runs', 'r-d10.pruned'), JSON.stringify(pruned));

  const { status, body } = await decisionOf('r-d10');
  assert.equal(status, 200);
  assert.deepEqual(body.commands, []);
  const page = await app.request('/api/runs/r-d10');
  assert.deepEqual((await page.json()).pruned, pruned);
  // And a run never pruned says so with a null, not a missing field.
  assert.equal((await (await app.request('/api/runs/r-d1')).json()).pruned, null);
});

test('a run called off, or whose branch is already on its base, has nothing to decide, in `wf decide`\'s words', async () => {
  writeRun({ id: 'r-d4', repo, baseRef: base, steps: { implement: { taskId: 't-d1-implement', branch }, review: { taskId: 't-d1-review', branch } } });
  fs.writeFileSync(path.join(root, 'runs', 'r-d4.cancelled'), '2026-09-13T01:00:00.000Z');
  const before = gitCount();
  assert.deepEqual(await decisionOf('r-d4'), { status: 200, body: { nothing: 'cancelled at 2026-09-13T01:00:00.000Z — nothing to decide' } });
  assert.equal(gitCount(), before, 'no git call for a cancelled run');

  const shipped = aRepo();
  branchOff(shipped.repo, 'wf/r-d5/implement', () => write(shipped.repo, 'NOTES.md', 'shipped\n'));
  git(shipped.repo, 'merge', '-q', '--no-ff', '-m', 'ship it', 'wf/r-d5/implement');
  writeRun({
    id: 'r-d5', repo: shipped.repo, baseRef: shipped.base,
    steps: { implement: { taskId: 't-d1-implement', branch: 'wf/r-d5/implement' }, review: { taskId: 't-d1-review', branch: 'wf/r-d5/implement' } },
  });
  assert.deepEqual(await decisionOf('r-d5'), { status: 200, body: { nothing: 'shipped — wf/r-d5/implement is already on main' } });
});

test('an unknown run is refused with a 404 that says where to look', async () => {
  const { status, body } = await decisionOf('no-such-run');
  assert.equal(status, 404);
  assert.match(body.error, /No run 'no-such-run'/);
  assert.equal((await app.request('/api/runs/..%2Fescape/decision')).status, 404);
});

test("a diff is cut a file at a time: named by its header, a rename as both ends, and each file's lines past the cap counted", () => {
  const long = Array.from({ length: DIFF_LINES + 7 }, (_, i) => `+line ${i}`);
  const diff = [
    'diff --git a/logo.png b/logo.png', 'index 1111111..2222222 100644', 'Binary files a/logo.png and b/logo.png differ',
    'diff --git a/test/a.test.ts b/spec/a.test.ts', 'similarity index 90%', 'rename from test/a.test.ts', 'rename to spec/a.test.ts', '@@ -1 +1 @@', '-a', '+b',
    'diff --git a/new file.test.ts b/new file.test.ts', 'new file mode 100644', '--- /dev/null', '+++ b/new file.test.ts\t', '@@ -0,0 +1,407 @@', ...long.slice(0, -2),
  ].join('\n');
  const files = diffFiles(`${diff}\n`);
  assert.deepEqual(files.map((f) => [f.path, f.lines.length, f.cut]), [
    ['logo.png', 3, 0],
    ['test/a.test.ts → spec/a.test.ts', 7, 0],
    // Five header lines and DIFF_LINES + 5 added: ten past the cap.
    ['new file.test.ts', DIFF_LINES, 10],
  ]);
  assert.equal(files[2]!.lines.at(-1), long[DIFF_LINES - 6]);
});

test("a run `assess` calls running while a step waits on a person is decided on: its terminal steps' branches read, and no command yet", async () => {
  // The one way there: a record from before runs froze their workflow, whose folder has since lost implement. The tick judges
  // the folder, whose tokens still runs; implement, on the record and signed off blocked, waits on you all the same.
  const folder = fs.mkdtempSync(path.join(root, 'workflow-'));
  fs.writeFileSync(path.join(folder, 'tokens.md'), '---\nharness: codex\n---\nPick the colour tokens.\n');
  branchOff(repo, 'wf/r-d6/implement', () => write(repo, 'package.json', `${JSON.stringify({ name: 'app', workspaces: ['packages/*'] })}\n`));
  branchOff(repo, 'wf/r-d6/tokens', () => write(repo, 'packages/x/docs/notes.md', 'what is left\n'));
  settledTask('t-d6-implement', blocked);
  journal('t-d6-tokens', [filed('t-d6-tokens'), { kind: 'starting', at, attempt: 1 }, { kind: 'spawned', at, attempt: 1 }]);
  writeRun({
    id: 'r-d6', repo, baseRef: base, workflowDir: folder, workflow: undefined,
    steps: { implement: { taskId: 't-d6-implement', branch: 'wf/r-d6/implement' }, tokens: { taskId: 't-d6-tokens', branch: 'wf/r-d6/tokens' } },
  });
  const detail = await (await app.request('/api/runs/r-d6')).json();
  assert.deepEqual([detail.status, detail.waitingOnYou], ['running', ['implement']], detail.warning);

  const { status, body } = await decisionOf('r-d6');
  assert.equal(status, 200);
  assert.ok(!('running' in body), 'waiting on you is decidable, whatever `assess` calls the run');
  // The branch of the terminal step the tick judges, as `wf decide` reads a run once it stops — not implement's.
  assert.deepEqual(body.touched.map((t: { branch: string }) => t.branch), ['wf/r-d6/tokens']);
  assert.deepEqual(body.touched[0].radius.groups, [{ name: 'packages/x', files: 1, added: 1, removed: 0, binary: 0 }]);
  assert.deepEqual(body.lesson, { said: 'packages/x/docs/notes.md +1 −0', state: 'written' });
  assert.deepEqual(body.sensitive, [{ branch: 'wf/r-d6/tokens', files: [], error: null }]);
  // `decision` is still `running`: no ship, drop or once more is offered while its steps move.
  assert.deepEqual(body.commands, []);

  // The fan-out the same steps make when the run froze them is not this: implement blocked with tokens still spawned is
  // `failed` to `assess`, so the decision is `wf decide`'s own, its result branches both roots'.
  writeRun({
    id: 'r-d7', repo, baseRef: base,
    workflow: [{ name: 'implement', after: [], body: 'Implement it.' }, { name: 'tokens', after: [], body: 'Pick the colour tokens.' }],
    steps: { implement: { taskId: 't-d6-implement', branch: 'wf/r-d6/implement' }, tokens: { taskId: 't-d6-tokens', branch: 'wf/r-d6/tokens' } },
  });
  const fanOut = await (await app.request('/api/runs/r-d7')).json();
  assert.deepEqual([fanOut.status, fanOut.moving, fanOut.waitingOnYou], ['failed', true, ['implement']]);
  const decided = (await decisionOf('r-d7')).body;
  assert.deepEqual(decided.touched.map((t: { branch: string }) => t.branch), ['wf/r-d6/implement', 'wf/r-d6/tokens']);
  assert.deepEqual(decided.commands.map((c: { label: string }) => c.label), ['once more', 'ship it', 'drop it']);
});
