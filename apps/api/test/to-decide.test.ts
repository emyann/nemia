/**
 * `to decide` on the board: what a person has to decide about a run's result, as the api carries it on the list and on a run's detail —
 * the ending step's gate with the command that approves it, or a result branch nobody merged — and the facts under the result on
 * `GET /api/runs/:id/decision`: where each branch stands, and how much it changed.
 *
 * The words are the package's (`toDecide`, `toDecideWords`, `branchWord`, `diffStat`), and the branches are read off a real repository.
 * Every `git` the api runs is noted, so a test can say which runs one is asked about: the list is polled every five seconds.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, the harness's fake `claude` (test/harness.ts) first on PATH.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// agent-workflows locates its store as its modules load: set first.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-to-decide-'));
process.env.WF_ROOT = root;

// A `git` in front of the real one that notes each call and runs it, as decision.test.ts has: what says which runs the api asks git about.
const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-to-decide-bin-'));
const gitCalls = path.join(bin, 'git-calls');
fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho "$*" >> '${gitCalls}'\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
const gitCount = () => (fs.existsSync(gitCalls) ? fs.readFileSync(gitCalls, 'utf8').split('\n').filter(Boolean).length : 0);

const { app } = await import('../src/app.ts');

const git = (repo: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: repo, encoding: 'utf8' });

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A repository with a file on `main`. Its base's sha. */
function aRepo(): { repo: string; base: string } {
  const repo = fs.mkdtempSync(path.join(root, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  write(path.join(repo, 'README.md'), '# app\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return { repo, base: git(repo, 'rev-parse', 'HEAD').trim() };
}

/** A branch off main with one commit of work on it; the checkout is left on main. */
function branchOff(repo: string, branch: string, file: string, text: string) {
  git(repo, 'checkout', '-q', '-b', branch);
  write(path.join(repo, file), text);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', `the work of ${branch}`);
  git(repo, 'checkout', '-q', 'main');
}

const at = '2026-09-17T09:00:00.000Z';
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');

/** A step's task that ran once and signed off done. */
const signedOff = (taskId: string, cwd: string) => write(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), jsonl([
  { kind: 'filed', at, brief: 'Do it.', cwd, maxAttempts: 1, harness: 'codex' },
  { kind: 'starting', at, attempt: 1 },
  { kind: 'spawned', at, attempt: 1 },
  { kind: 'ended', at, attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout: { outcome: 'done', summary: 'Did it.', needs: null, artifacts: [] } },
  { kind: 'settled', at, outcome: 'succeeded' },
]));

/** A step's task filed and spawned, still going. */
const running = (taskId: string, cwd: string) => write(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), jsonl([
  { kind: 'filed', at, brief: 'Do it.', cwd, maxAttempts: 1, harness: 'codex' },
  { kind: 'starting', at, attempt: 1 },
  { kind: 'spawned', at, attempt: 1 },
]));

/** What `ship.md` says first, which is what a person is deciding on: `toDecide.says`, and the whole of `wf ls`'s line with it. */
const SHIPS = 'Merge this run onto the base branch, or abort on any failure.';
const SHIP_BODY = `${SHIPS}\n\nLook at the checkout first.`;

/** A workflow that ends in a step acting on the base branch itself, gated: implement → ship. */
const ENDING = [
  { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' },
  { name: 'ship', after: ['implement'], body: SHIP_BODY, harness: 'claude', workspace: 'main', gate: true },
];
/** A workflow that says nothing about what happens when the work is done: its branch is a person's. */
const PLAIN = [{ name: 'implement', after: [], body: 'Implement it.', harness: 'codex' }];

function writeRun(run: { id: string; repo: string; baseRef: string } & Record<string, unknown>) {
  write(path.join(root, 'runs', `${run.id}.json`), JSON.stringify({
    workspace: run.repo, branch: 'main', isolate: true, brief: 'Decide it', createdAt: at,
    workflowDir: path.join(root, 'no-such-workflow'), ...run,
  }, null, 2));
}

const detailOf = async (id: string) => (await (await app.request(`/api/runs/${id}`)).json()) as {
  status: string; waitingOnYou: string[]; onYou: string[]; toDecide: { kind: string; step?: string; says?: string | null; branches?: string[]; said: string; command: string } | null;
  steps: Array<{ name: string; status: string; spec: { workspace: string | null } | null }>;
};
const listedOf = async (id: string) => ((await (await app.request('/api/runs')).json()) as Array<{ id: string }>).find((r) => r.id === id) as Awaited<ReturnType<typeof detailOf>>;
const decisionOf = async (id: string) => (await (await app.request(`/api/runs/${id}/decision`)).json()) as {
  standings?: Array<{ branch: string; where: string; commits?: number; said: string; stat: string | null }>;
  commands?: Array<{ label: string; command: string }>;
  nothing?: string;
  running?: true;
};

const { repo, base } = aRepo();

test("a run at its ending's gate: `to decide` says what the ending would do and the command that approves it, on the list and on the detail — with no `git` asked about it", async () => {
  const id = 'r-ending';
  branchOff(repo, `wf/${id}/implement`, 'src/a.ts', 'export const a = 1;\n');
  signedOff(`${id}-implement`, repo);
  writeRun({
    id, repo, baseRef: base, workflow: ENDING,
    steps: { implement: { taskId: `${id}-implement`, branch: `wf/${id}/implement` }, ship: { taskId: null } },
  });

  const before = gitCount();
  const detail = await detailOf(id);
  assert.deepEqual(detail.steps.map((s) => [s.name, s.status]), [['implement', 'unverified · done'], ['ship', 'awaiting approval']]);
  assert.deepEqual([detail.waitingOnYou, detail.onYou], [['ship'], ['approve ship']]);
  // And the key the board tells this gate from §6's by: the step runs in the repository's own checkout, and the work does not.
  assert.deepEqual(detail.steps.map((s) => [s.name, s.spec?.workspace ?? null]), [['implement', null], ['ship', 'main']]);
  // The ending has not run, so what there is to decide is what it would do, in the folder's own first line — and the command that runs it.
  assert.deepEqual(detail.toDecide, {
    kind: 'approve', step: 'ship', says: SHIPS,
    said: `${SHIPS} — wf approve ${id} ship`,
    command: `wf approve ${id} ship`,
  });
  // The whole of `wf ls`'s line ends with the command the board offers, so the two cannot drift apart.
  assert.ok(detail.toDecide!.said.endsWith(detail.toDecide!.command), detail.toDecide!.said);
  assert.deepEqual((await listedOf(id)).toDecide, detail.toDecide, 'the list says the same, in the same words');
  // A gate says a run is one to decide on its own: the branch is the ending step's to merge, and nothing asks git about it.
  assert.equal(gitCount(), before, 'no git call for a run whose folder has an ending step');
});

test("the decision of a run at its ending's gate offers the approval and the send-back, and never `git merge` by hand: its ending is what merges", async () => {
  const { commands, standings } = await decisionOf('r-ending');
  assert.deepEqual(commands?.map((c) => c.label), ['approve', 'send back']);
  assert.deepEqual(commands?.map((c) => c.command), [`wf approve r-ending ship`, `wf retry r-ending implement --message "<objection>"`]);
  // The result it would act on is the work's branch, not the ending step's own — which has none, working in the repository's checkout
  // (`resultSteps`). Read for the facts under the run, whatever the list is spared.
  assert.deepEqual(standings?.map((b) => [b.branch, b.where]), [['wf/r-ending/implement', 'ahead']]);
});

test('a finished run whose folder says nothing about shipping: `to decide` is its branch ahead of the base, and the command is `wf decide`', async () => {
  const id = 'r-plain';
  const branch = `wf/${id}/implement`;
  branchOff(repo, branch, 'src/b.ts', 'export const b = 2;\n');
  signedOff(`${id}-implement`, repo);
  writeRun({ id, repo, baseRef: base, workflow: PLAIN, steps: { implement: { taskId: `${id}-implement`, branch } } });

  const detail = await detailOf(id);
  assert.equal(detail.status, 'succeeded');
  assert.deepEqual(detail.waitingOnYou, [], 'no step waits on you: the run finished');
  assert.deepEqual(detail.toDecide, {
    kind: 'git', branches: [branch],
    said: `${branch} is ahead of main, and nothing has merged it — wf decide ${id}`,
    command: `wf decide ${id}`,
  });
  assert.deepEqual((await listedOf(id)).toDecide, detail.toDecide, 'the list says the same, in the same words');

  // The facts under the result, as `wf decide` prints them: where the branch stands, and how much it changed.
  const { standings, commands } = await decisionOf(id);
  assert.deepEqual(standings, [{
    branch, where: 'ahead', commits: 1, said: `${branch} is ahead of main by 1 commit`,
    stat: '1 file changed, 1 insertion(+)',
  }]);
  // And the commands a person runs by hand, which this folder leaves to them.
  assert.deepEqual(commands?.map((c) => c.label), ['ship it', 'drop it']);
});

test('level-triggered: a branch merged by hand stops being one to decide on the next read, with nobody telling the run', async () => {
  const id = 'r-plain';
  const record = fs.readFileSync(path.join(root, 'runs', `${id}.json`), 'utf8');
  git(repo, 'merge', '-q', '--no-ff', '-m', `Merge ${id}`, `wf/${id}/implement`);
  try {
    assert.equal((await detailOf(id)).toDecide, null, 'the branch is on the base: nothing left to decide');
    assert.equal((await listedOf(id)).toDecide, null);
    assert.equal(fs.readFileSync(path.join(root, 'runs', `${id}.json`), 'utf8'), record, "and nothing is written on the run's record");
    // And `wf decide`'s own answer, which reads the same way.
    assert.deepEqual(await decisionOf(id), { nothing: `shipped — wf/${id}/implement is already on main` });
  } finally {
    git(repo, 'reset', '-q', '--hard', base);
  }
});

test('an approved ending that has run leaves nothing to decide: the folder answered for its own branch', async () => {
  const id = 'r-shipped';
  const branch = `wf/${id}/implement`;
  branchOff(repo, branch, 'src/c.ts', 'export const c = 3;\n');
  signedOff(`${id}-implement`, repo);
  signedOff(`${id}-ship`, repo);
  writeRun({
    id, repo, baseRef: base, workflow: ENDING,
    steps: { implement: { taskId: `${id}-implement`, branch }, ship: { taskId: `${id}-ship`, workspace: repo } },
  });
  // The approval as `wf approve` writes one, with no words: a `message` it does not hold, which the package refuses read as null.
  write(path.join(root, 'runs', `${id}.asks`, 'approve-ship-1'), JSON.stringify({ step: 'ship', try: 1, at }));
  git(repo, 'merge', '-q', '--no-ff', '-m', `Merge ${id}`, branch);

  const detail = await detailOf(id);
  assert.deepEqual(detail.steps.map((s) => s.status), ['unverified · done', 'unverified · done']);
  assert.deepEqual([detail.status, detail.waitingOnYou], ['succeeded', []]);
  assert.equal(detail.toDecide, null, 'its ending merged it: nobody is handed the branch');
  assert.equal((await listedOf(id)).toDecide, null);
});

test("a branch already on the base is asked about once: the list's later polls run no `git` for it, and a branch ahead is asked every time", async () => {
  // A run whose ending merged nothing — a folder with no ending step — whose branch a person merged before the board first read it.
  const id = 'r-memo';
  const branch = `wf/${id}/implement`;
  branchOff(repo, branch, 'src/memo.ts', 'export const memo = 1;\n');
  signedOff(`${id}-implement`, repo);
  writeRun({ id, repo, baseRef: base, workflow: PLAIN, steps: { implement: { taskId: `${id}-implement`, branch } } });
  git(repo, 'merge', '-q', '--no-ff', '-m', `Merge ${id}`, branch);

  const first = gitCount();
  assert.equal((await listedOf(id)).toDecide, null, 'on the base: nothing to decide');
  const asked = gitCount() - first;
  assert.ok(asked > 0, `the first read asks git about it — it ran ${asked} calls`);

  const again = gitCount();
  assert.equal((await listedOf(id)).toDecide, null, 'and it still says nothing to decide');
  assert.equal(gitCount(), again, 'with no git call at all: a branch on the base does not come off it');

  // And it is remembered against the work the run had filed: a try of a finished step can commit to that branch, so the next read asks git
  // again. A run whose branch had nothing on it past its base reads `on` too, and this is the way that one grows.
  const tried = JSON.parse(fs.readFileSync(path.join(root, 'runs', `${id}.json`), 'utf8')) as { steps: Record<string, { taskId: string; tries?: unknown[] }> };
  tried.steps.implement = { taskId: `${id}-implement-2`, branch, tries: [{ taskId: `${id}-implement`, then: 'nudge' }] } as never;
  signedOff(`${id}-implement-2`, repo);
  write(path.join(root, 'runs', `${id}.json`), JSON.stringify(tried, null, 2));
  const retried = gitCount();
  assert.equal((await listedOf(id)).toDecide, null, 'still on the base, as git says');
  assert.ok(gitCount() > retried, 'and git was asked again: the work was filed again, so the branch may have grown');

  // The answer that holds a person up is asked every time, however often the list is polled.
  const ahead = 'wf/r-memo-ahead/implement';
  branchOff(repo, ahead, 'src/ahead.ts', 'export const ahead = 2;\n');
  signedOff('r-memo-ahead-implement', repo);
  writeRun({ id: 'r-memo-ahead', repo, baseRef: base, workflow: PLAIN, steps: { implement: { taskId: 'r-memo-ahead-implement', branch: ahead } } });
  for (const poll of [1, 2]) {
    const before = gitCount();
    assert.equal((await listedOf('r-memo-ahead')).toDecide?.kind, 'git', `poll ${poll} says the branch is there to decide`);
    assert.ok(gitCount() > before, `poll ${poll} asks git: a branch ahead of the base is one a person may merge at any moment`);
  }
});

test('nothing to decide, and no `git` asked, for a run still running, one still going at a step that waits on you, and one called off', async () => {
  const branch = 'wf/r-running/implement';
  branchOff(repo, branch, 'src/d.ts', 'export const d = 4;\n');
  running('r-running-implement', repo);
  writeRun({ id: 'r-running', repo, baseRef: base, workflow: PLAIN, steps: { implement: { taskId: 'r-running-implement', branch } } });

  writeRun({ id: 'r-off', repo, baseRef: base, workflow: PLAIN, steps: { implement: { taskId: 'r-plain-implement', branch: 'wf/r-plain/implement' } } });
  fs.writeFileSync(path.join(root, 'runs', 'r-off.cancelled'), at);

  const before = gitCount();
  const running1 = await detailOf('r-running');
  assert.deepEqual([running1.status, running1.toDecide], ['running', null]);
  const off = await detailOf('r-off');
  assert.deepEqual([off.status, off.toDecide], ['cancelled', null]);
  assert.equal(gitCount(), before, 'a run still going, and one called off, are not at their result: git is asked nothing');

  // The count counts: the run whose branch is read does run git through the same PATH.
  const ahead = 'wf/r-ahead/implement';
  branchOff(repo, ahead, 'src/e.ts', 'export const e = 5;\n');
  signedOff('r-ahead-implement', repo);
  writeRun({ id: 'r-ahead', repo, baseRef: base, workflow: PLAIN, steps: { implement: { taskId: 'r-ahead-implement', branch: ahead } } });
  assert.equal((await detailOf('r-ahead')).toDecide?.kind, 'git');
  assert.ok(gitCount() > before, 'a finished run whose branch may be ahead is read out of git');
});
