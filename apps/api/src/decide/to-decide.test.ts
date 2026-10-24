/**
 * `to decide` on the board: what a person has to decide about a run's result, as the api carries it on the list and on a run's detail —
 * the ending step's gate with the command that approves it, or a result branch nobody merged — and the facts under the result on
 * `GET /api/runs/:runId/decision`: where each branch stands, and how much it changed.
 *
 * The words are the package's (`toDecide`, `toDecideWords`, `branchWord`, `countsLine`), and the branches are read off a real repository.
 * Every `git` the api runs is noted, so a test can say which runs one is asked about: the list is polled every five seconds.
 *
 * At shipped defaults: the api's own engine over the harness's scratch store (`root`), which this file seeds, and the harness's fake
 * `claude` (test/harness.ts) first on PATH.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import { story } from '../../test/checkpoints.ts';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import type { RunDecision } from './decision.ts';
import type { RunDetail } from '../detail/detail.ts';
import { app } from '../app.ts';
import { engine, passStanding, runStore, type RunSummary } from 'agent-orchestrator';
import { runWith } from '../../test/shipped-place.ts';

/** The real `git`, behind one first on PATH that notes each call in `gitCalls` and runs it: what says which runs the api asks git about. */
const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
const bin = scratch('nemia-api-to-decide-bin-');
const gitCalls = path.join(bin, 'git-calls');
fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho "$*" >> '${gitCalls}'\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
const gitCount = () => (fs.existsSync(gitCalls) ? fs.readFileSync(gitCalls, 'utf8').split('\n').filter(Boolean).length : 0);

const git = (repo: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd: repo, encoding: 'utf8' },
  );

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

/**
 * A pass's read of where every run's branches stand, written to `standing.json` as the tick writes it: what the list and a run's page read,
 * with no `git` of their own.
 */
const aPass = () => runWith(engine(), passStanding(runStore.runs.list()));

/** The tick's last reading, gone: no pass has read where anything stands. */
const noPass = () => fs.rmSync(path.join(root, 'standing.json'), { force: true });

const at = '2026-09-17T09:00:00.000Z';
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');

/** A step's task that ran once and signed off done. */
const signedOff = (taskId: string, cwd: string) =>
  write(
    path.join(root, 'engine', 'tasks', `${taskId}.jsonl`),
    jsonl([
      { kind: 'filed', at, brief: 'Do it.', cwd, maxAttempts: 1, harness: 'codex' },
      { kind: 'starting', at, attempt: 1 },
      { kind: 'spawned', at, attempt: 1 },
      {
        kind: 'ended',
        at,
        attempt: 1,
        sessionId: `ae/${taskId}/1`,
        observed: 'done',
        reason: 'harness',
        closeout: { outcome: 'done', summary: 'Did it.', needs: null, artifacts: [] },
      },
      { kind: 'settled', at, outcome: 'succeeded' },
    ]),
  );

/** A step's task filed and spawned, still going. */
const running = (taskId: string, cwd: string) =>
  write(
    path.join(root, 'engine', 'tasks', `${taskId}.jsonl`),
    jsonl([
      { kind: 'filed', at, brief: 'Do it.', cwd, maxAttempts: 1, harness: 'codex' },
      { kind: 'starting', at, attempt: 1 },
      { kind: 'spawned', at, attempt: 1 },
    ]),
  );

/** What `ship.md` says first, which is what a person is deciding on: `toDecide.says`, and the whole of `nemia ls`'s line with it. */
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
  write(
    path.join(root, 'runs', `${run.id}.json`),
    JSON.stringify(
      {
        workspace: run.repo,
        branch: 'main',
        isolate: true,
        brief: 'Decide it',
        createdAt: at,
        workflowDir: path.join(root, 'no-such-workflow'),
        ...run,
      },
      null,
      2,
    ),
  );
}

const detailOf = async (id: string) => (await (await app.request(`/api/runs/${id}`)).json()) as RunDetail;
const listedOf = async (id: string) => {
  const run = ((await (await app.request('/api/runs')).json()) as RunSummary[]).find((r) => r.id === id);
  assert.ok(run, `${id} is on the list`);
  return run;
};
const decisionOf = async (id: string) => (await (await app.request(`/api/runs/${id}/decision`)).json()) as RunDecision;
/** A decision with something to decide: where the branches stand, and the commands. */
const decidableOf = async (id: string) => {
  const decision = await decisionOf(id);
  assert.ok('commands' in decision, JSON.stringify(decision));
  return decision;
};

const { repo, base } = aRepo();

test("a run at its ending's gate: `to decide` says what the ending would do on the list and the page, the decision offers the approval and the send-back, and whether it still merges onto the base as the base moves", async (t) => {
  const s = story(t);
  await s.test(
    "a run at its ending's gate: `to decide` says what the ending would do and the command that approves it, on the list and on the detail — with no `git` asked about it",
    async () => {
      const id = 'r-ending';
      branchOff(repo, `wf/${id}/implement`, 'src/a.ts', 'export const a = 1;\n');
      signedOff(`${id}-implement`, repo);
      writeRun({
        id,
        repo,
        baseRef: base,
        workflow: ENDING,
        steps: { implement: { taskId: `${id}-implement`, branch: `wf/${id}/implement` }, ship: { taskId: null } },
      });

      const before = gitCount();
      const detail = await detailOf(id);
      assert.deepEqual(
        detail.steps.map((s) => [s.name, s.status]),
        [
          ['implement', 'unverified · done'],
          ['ship', 'awaiting approval'],
        ],
      );
      assert.deepEqual([detail.waitingOnYou, detail.onYou], [['ship'], ['approve ship']]);
      assert.deepEqual(
        detail.steps.map((s) => [s.name, s.spec?.workspace ?? null]),
        [
          ['implement', null],
          ['ship', 'main'],
        ],
        "the key the board tells an ending's gate from another gate by: the ending runs in the repository's own checkout, and the work does not",
      );
      assert.deepEqual(
        detail.toDecide,
        {
          kind: 'approve',
          step: 'ship',
          says: SHIPS,
          filed: false,
          /**
           * What the card answers it with: a send-back goes to the work ship waits on (`sendBackTo`), and the result is on its way to
           * main.
           */
          back: ['implement'],
          onto: 'main',
          said: `${SHIPS} — nemia approve ${id} ship`,
          command: `nemia approve ${id} ship`,
        },
        "the ending has not run: what there is to decide is what it would do, in the folder's own first line, and the command that runs it",
      );
      assert.ok(
        detail.toDecide.said.endsWith(detail.toDecide.command),
        `the whole of nemia ls's line ends with the command the board offers, so the two cannot drift apart: ${detail.toDecide.said}`,
      );
      assert.deepEqual((await listedOf(id)).toDecide, detail.toDecide, 'the list says the same, in the same words');
      assert.equal(
        gitCount(),
        before,
        "no git call for a run whose folder has an ending step: a gate says it is one to decide, and the branch is the ending step's to merge",
      );
    },
  );
  await s.test(
    "the decision of a run at its ending's gate offers the approval and the send-back, and never `git merge` by hand: its ending is what merges",
    async () => {
      const { commands, standings } = await decidableOf('r-ending');
      assert.deepEqual(
        commands.map((c) => c.label),
        ['approve', 'send back'],
      );
      assert.deepEqual(
        commands.map((c) => c.command),
        [`nemia approve r-ending ship`, `nemia retry r-ending implement --message "<objection>"`],
      );
      assert.deepEqual(
        standings.map((b) => [b.branch, b.where]),
        [['wf/r-ending/implement', 'ahead']],
        "the result it would act on is the work's branch, not the ending step's own, which has none, working in the repository's checkout (resultSteps); read for the facts under the run, whatever the list is spared",
      );
    },
  );
  await s.test(
    'whether the result still merges onto the base, as the base is now: clean, then the file it conflicts in once main has moved under it — and read on the decision, never on the list',
    async () => {
      const id = 'r-ending';
      const clean = await decidableOf(id);
      assert.deepEqual(
        clean.standings.map((s) => s.merge),
        [{ clean: true, said: 'merges cleanly onto main' }],
      );

      const tip = git(repo, 'rev-parse', 'HEAD').trim();
      write(path.join(repo, 'src/a.ts'), 'export const a = 2;\n');
      git(repo, 'add', '-A');
      git(repo, 'commit', '-q', '-m', 'main writes a.ts too');
      try {
        const before = gitCount();
        await listedOf(id);
        const listed = fs.readFileSync(gitCalls, 'utf8').split('\n').filter(Boolean).slice(before);
        assert.deepEqual(
          listed.filter((call) => call.startsWith('merge-tree')),
          [],
          'the list the Factory polls asks git no merge',
        );
        const read = gitCount();
        const conflicted = await decidableOf(id);
        assert.ok(
          fs
            .readFileSync(gitCalls, 'utf8')
            .split('\n')
            .filter(Boolean)
            .slice(read)
            .some((call) => call.startsWith('merge-tree')),
          "the decision's trial merge, run in the git place's own process, is counted: the list's none is no blind spot",
        );
        assert.deepEqual(
          conflicted.standings.map((s) => s.merge),
          [{ clean: false, conflicts: ['src/a.ts'], said: 'conflicts with main in 1 file: src/a.ts' }],
          'main moved under the branch, writing the same file otherwise: the branch is as it was, what it would find is not',
        );
        assert.equal(
          git(repo, 'status', '--porcelain'),
          '',
          "a trial in git's object store alone: the checkout and its index are as they were",
        );
        assert.equal(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main', 'and main is still checked out');
      } finally {
        git(repo, 'reset', '-q', '--hard', tip);
      }
    },
  );
});

test("the gate's commands are never empty, by what the ending waits on and where it stopped", async (t) => {
  await t.test(
    "an ending that waits on several steps offers a send-back to each, and one that waits on nothing offers only the approval — the gate's commands are never empty",
    async () => {
      const fan = 'r-fan';
      const wide = [
        { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' },
        { name: 'docs', after: [], body: 'Write the docs.', harness: 'codex' },
        { name: 'ship', after: ['implement', 'docs'], body: SHIP_BODY, harness: 'claude', workspace: 'main', gate: true },
      ];
      branchOff(repo, `wf/${fan}/implement`, 'src/fan.ts', 'export const fan = 1;\n');
      signedOff(`${fan}-implement`, repo);
      signedOff(`${fan}-docs`, repo);
      writeRun({
        id: fan,
        repo,
        baseRef: base,
        workflow: wide,
        steps: {
          implement: { taskId: `${fan}-implement`, branch: `wf/${fan}/implement` },
          docs: { taskId: `${fan}-docs`, branch: `wf/${fan}/implement` },
          ship: { taskId: null },
        },
      });
      const wideGate = await decidableOf(fan);
      assert.deepEqual(
        wideGate.commands.map((c) => c.label),
        ['approve', 'send back', 'send back'],
        'a send-back for each step the objection could be about',
      );
      assert.deepEqual(
        wideGate.commands.map((c) => c.command),
        [
          `nemia approve ${fan} ship`,
          `nemia retry ${fan} implement --message "<objection>"`,
          `nemia retry ${fan} docs --message "<objection>"`,
        ],
        'a fan-in ending, which the loader allows: ship after implement and docs, nothing waiting on it and nothing ending beside it',
      );

      const alone = 'r-alone';
      writeRun({
        id: alone,
        repo,
        baseRef: base,
        workflow: [{ name: 'ship', after: [], body: SHIP_BODY, harness: 'claude', workspace: 'main', gate: true }],
        steps: { ship: { taskId: null } },
      });
      process.env.WF_MAX_RUNS = '0';
      const lone = await decidableOf(alone).finally(() => (process.env.WF_MAX_RUNS = 'set-it-in-the-test'));
      assert.deepEqual(
        lone.commands.map((c) => [c.label, c.command]),
        [['approve', `nemia approve ${alone} ship`]],
        'an ending that waits on nothing, a workflow of one step in the checkout, which the loader allows too: no work to send back, so the approval is the only command, and it is there',
      );
      for (const { commands } of [wideGate, lone]) {
        assert.deepEqual(
          commands.filter((c) => c.label === 'land it' || c.label === 'drop it'),
          [],
          'neither is handed git merge by hand: the ending step is what merges',
        );
      }
    },
  );
  await t.test(
    'an ending that ran on its approval and stopped on the base branch offers both ways on: land again, and a send-back through the loop with its words',
    async () => {
      const id = 'r-stopped';
      const loop = [
        { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' },
        {
          name: 'review',
          after: ['implement'],
          body: 'Review it.',
          harness: 'codex',
          loop: 'implement',
          rounds: 3,
          output: {
            file: 'review.json',
            schema: {
              type: 'object',
              properties: { again: { type: 'boolean' } },
              required: ['again'],
              additionalProperties: false,
            },
          },
        },
        { name: 'ship', after: ['review'], body: SHIP_BODY, harness: 'claude', workspace: 'main', gate: true },
      ];
      branchOff(repo, `wf/${id}/implement`, 'src/stopped.ts', 'export const stopped = 1;\n');
      signedOff(`${id}-implement`, repo);
      write(
        path.join(root, 'engine', 'tasks', `${id}-review.jsonl`),
        jsonl([
          { kind: 'filed', at, brief: 'Review it.', cwd: repo, maxAttempts: 1, harness: 'codex' },
          { kind: 'starting', at, attempt: 1 },
          { kind: 'spawned', at, attempt: 1 },
          {
            kind: 'ended',
            at,
            attempt: 1,
            sessionId: `ae/${id}-review/1`,
            observed: 'done',
            reason: 'harness',
            /** Review handed on: `again: false`, flat beside the outcome as a harness writes it. */
            closeout: { outcome: 'done', summary: 'Holds.', needs: null, artifacts: [], again: false },
          },
          { kind: 'settled', at, outcome: 'succeeded' },
        ]),
      );
      write(
        path.join(root, 'engine', 'tasks', `${id}-ship.jsonl`),
        jsonl([
          { kind: 'filed', at, brief: 'Ship it.', cwd: repo, maxAttempts: 1, harness: 'claude' },
          { kind: 'starting', at, attempt: 1 },
          { kind: 'spawned', at, attempt: 1 },
          {
            kind: 'ended',
            at,
            attempt: 1,
            sessionId: `ae/${id}-ship/1`,
            observed: 'done',
            reason: 'harness',
            closeout: { outcome: 'blocked', summary: 'The trial merge conflicts.', needs: 'the branch has to take main', artifacts: [] },
          },
          { kind: 'settled', at, outcome: 'succeeded' },
        ]),
      );
      writeRun({
        id,
        repo,
        baseRef: base,
        workflow: loop,
        steps: {
          implement: { taskId: `${id}-implement`, branch: `wf/${id}/implement` },
          review: { taskId: `${id}-review`, branch: `wf/${id}/implement` },
          ship: { taskId: `${id}-ship`, workspace: repo, branch: 'main' },
        },
      });
      const { commands } = await decidableOf(id);
      assert.deepEqual(
        commands.map((c) => [c.label, c.command]),
        [
          ['send back', `nemia retry ${id} review --message "<objection>"`],
          ['once more', `nemia retry ${id} ship`],
        ],
      );
    },
  );
});

test("a finished run's `to decide`, level-triggered: its branch ahead of the base until it is merged by hand, and nothing once its approved ending has run", async (t) => {
  const s = story(t);
  await s.test(
    'a finished run whose folder says nothing about landing: `to decide` is its branch ahead of the base, and the command is `nemia decide`',
    async () => {
      const id = 'r-plain';
      const branch = `wf/${id}/implement`;
      branchOff(repo, branch, 'src/b.ts', 'export const b = 2;\n');
      signedOff(`${id}-implement`, repo);
      writeRun({ id, repo, baseRef: base, workflow: PLAIN, steps: { implement: { taskId: `${id}-implement`, branch } } });

      noPass();
      const unread = await detailOf(id);
      assert.deepEqual(
        [unread.status, unread.toDecide],
        ['succeeded', null],
        'with no pass yet, where the branch stands is unread, and an unread branch decides nothing',
      );
      assert.equal((await listedOf(id)).toDecide, null, 'nor on the list');

      await aPass();
      const detail = await detailOf(id);
      assert.equal(detail.status, 'succeeded');
      assert.deepEqual(detail.waitingOnYou, [], 'no step waits on you: the run finished');
      assert.deepEqual(detail.toDecide, {
        kind: 'result',
        branches: [branch],
        said: `${branch} is ahead of main, and nothing has merged it — nemia decide ${id}`,
        command: `nemia decide ${id}`,
      });
      assert.deepEqual((await listedOf(id)).toDecide, detail.toDecide, 'the list says the same, in the same words');

      const { standings, commands } = await decidableOf(id);
      assert.deepEqual(
        standings,
        [
          {
            branch,
            where: 'ahead',
            commits: 1,
            said: `${branch} is ahead of main by 1 commit`,
            stat: '1 file: +1 −0',
            merge: { clean: true, said: 'merges cleanly onto main' },
          },
        ],
        'the facts under the result, as nemia decide prints them: where the branch stands, and how much it changed',
      );
      assert.deepEqual(
        commands.map((c) => c.label),
        ['land it', 'drop it'],
        'the commands a person runs by hand, which this folder leaves to them',
      );
    },
  );
  await s.test(
    'level-triggered: a branch merged by hand stops being one to decide on the next pass, with nobody telling the run',
    async () => {
      const id = 'r-plain';
      const record = fs.readFileSync(path.join(root, 'runs', `${id}.json`), 'utf8');
      git(repo, 'merge', '-q', '--no-ff', '-m', `Merge ${id}`, `wf/${id}/implement`);
      try {
        await aPass();
        assert.equal((await detailOf(id)).toDecide, null, 'the branch is on the base: nothing left to decide');
        assert.equal((await listedOf(id)).toDecide, null);
        assert.equal(fs.readFileSync(path.join(root, 'runs', `${id}.json`), 'utf8'), record, "and nothing is written on the run's record");
        assert.deepEqual(
          await decisionOf(id),
          { nothing: `landed — wf/${id}/implement is already on main` },
          "nemia decide's own answer reads the same way",
        );
      } finally {
        git(repo, 'reset', '-q', '--hard', base);
      }
    },
  );
  await s.test(
    'an approved ending that has run leaves nothing to decide: the folder answered for its own branch — its approval with no words, no `message` in it, as `nemia approve` writes one',
    async () => {
      const id = 'r-landed';
      const branch = `wf/${id}/implement`;
      branchOff(repo, branch, 'src/c.ts', 'export const c = 3;\n');
      signedOff(`${id}-implement`, repo);
      signedOff(`${id}-ship`, repo);
      writeRun({
        id,
        repo,
        baseRef: base,
        workflow: ENDING,
        steps: { implement: { taskId: `${id}-implement`, branch }, ship: { taskId: `${id}-ship`, workspace: repo } },
      });
      write(path.join(root, 'runs', `${id}.asks`, 'approve-ship-1'), JSON.stringify({ step: 'ship', try: 1, at }));
      git(repo, 'merge', '-q', '--no-ff', '-m', `Merge ${id}`, branch);

      const detail = await detailOf(id);
      assert.deepEqual(
        detail.steps.map((s) => s.status),
        ['unverified · done', 'unverified · done'],
      );
      assert.deepEqual([detail.status, detail.waitingOnYou], ['succeeded', []]);
      assert.equal(detail.toDecide, null, 'its ending merged it: nobody is handed the branch');
      assert.equal((await listedOf(id)).toDecide, null);
    },
  );
});

test("the list runs no `git`, however often it is polled: where a branch stands, on the base or ahead of it, is read off the tick's last pass", async () => {
  const id = 'r-memo';
  const branch = `wf/${id}/implement`;
  branchOff(repo, branch, 'src/memo.ts', 'export const memo = 1;\n');
  signedOff(`${id}-implement`, repo);
  writeRun({ id, repo, baseRef: base, workflow: PLAIN, steps: { implement: { taskId: `${id}-implement`, branch } } });
  git(repo, 'merge', '-q', '--no-ff', '-m', `Merge ${id}`, branch);
  await aPass();

  const first = gitCount();
  assert.equal(
    (await listedOf(id)).toDecide,
    null,
    'on the base, merged by a person before the board first read it, in a folder with no ending step: nothing to decide',
  );
  assert.equal((await listedOf(id)).toDecide, null, 'and it still says nothing to decide');
  assert.equal(gitCount(), first, 'with no git call at all: the list reads what the pass read');

  const tried = JSON.parse(fs.readFileSync(path.join(root, 'runs', `${id}.json`), 'utf8')) as {
    steps: Record<string, { taskId: string; tries?: unknown[] }>;
  };
  tried.steps.implement = { taskId: `${id}-implement-2`, branch, tries: [{ taskId: `${id}-implement`, cause: 'nudge' }] } as never;
  signedOff(`${id}-implement-2`, repo);
  write(path.join(root, 'runs', `${id}.json`), JSON.stringify(tried, null, 2));
  git(repo, 'checkout', '-q', branch);
  write(path.join(repo, 'src/memo.ts'), 'export const memo = 2;\n');
  git(repo, 'commit', '-q', '-am', 'the second try');
  git(repo, 'checkout', '-q', 'main');
  await aPass();
  assert.equal(
    (await listedOf(id)).toDecide?.kind,
    'result',
    'a try of a finished step commits to the branch: the answer kept against the work the run filed is read again off the pass',
  );

  const ahead = 'wf/r-memo-ahead/implement';
  branchOff(repo, ahead, 'src/ahead.ts', 'export const ahead = 2;\n');
  signedOff('r-memo-ahead-implement', repo);
  writeRun({
    id: 'r-memo-ahead',
    repo,
    baseRef: base,
    workflow: PLAIN,
    steps: { implement: { taskId: 'r-memo-ahead-implement', branch: ahead } },
  });
  assert.equal((await listedOf('r-memo-ahead')).toDecide, null, 'a run the last pass did not read decides nothing yet');
  await aPass();
  for (const poll of [1, 2]) {
    const before = gitCount();
    assert.equal((await listedOf('r-memo-ahead')).toDecide?.kind, 'result', `poll ${poll} says the branch is there to decide`);
    assert.equal(gitCount(), before, `poll ${poll} asks no git: the next pass reads it again`);
  }
});

test('nothing to decide, and no `git` asked, for a run still running, one still going at a step that waits on you, and one called off', async () => {
  const branch = 'wf/r-running/implement';
  branchOff(repo, branch, 'src/d.ts', 'export const d = 4;\n');
  running('r-running-implement', repo);
  writeRun({ id: 'r-running', repo, baseRef: base, workflow: PLAIN, steps: { implement: { taskId: 'r-running-implement', branch } } });

  writeRun({
    id: 'r-off',
    repo,
    baseRef: base,
    workflow: PLAIN,
    steps: { implement: { taskId: 'r-plain-implement', branch: 'wf/r-plain/implement' } },
  });
  fs.writeFileSync(path.join(root, 'runs', 'r-off.cancelled'), at);

  const before = gitCount();
  const running1 = await detailOf('r-running');
  assert.deepEqual([running1.status, running1.toDecide], ['running', null]);
  const off = await detailOf('r-off');
  assert.deepEqual([off.status, off.toDecide], ['cancelled', null]);
  assert.equal(gitCount(), before, 'a run still going, and one called off, are not at their result: git is asked nothing');

  const ahead = 'wf/r-ahead/implement';
  branchOff(repo, ahead, 'src/e.ts', 'export const e = 5;\n');
  signedOff('r-ahead-implement', repo);
  writeRun({ id: 'r-ahead', repo, baseRef: base, workflow: PLAIN, steps: { implement: { taskId: 'r-ahead-implement', branch: ahead } } });
  await aPass();
  assert.equal((await detailOf('r-ahead')).toDecide?.kind, 'result');
  assert.ok(gitCount() > before, "a pass reads a finished run's branch out of git, through the same PATH: the count counts");
});

test("at an ending's gate, the decision says each run in flight on the base its branch collides with, and in which files, in one trial merge for each; a branch left to git reads none", async () => {
  const own = aRepo();
  const runOn = (id: string, file: string, text: string, done: boolean, workflow = ENDING) => {
    const branch = `wf/${id}/implement`;
    branchOff(own.repo, branch, file, text);
    (done ? signedOff : running)(`${id}-implement`, own.repo);
    const steps = { implement: { taskId: `${id}-implement`, branch }, ...(workflow === ENDING ? { ship: { taskId: null } } : {}) };
    writeRun({ id, repo: own.repo, baseRef: own.base, workflow, steps });
  };
  runOn('r-gate', 'src/c.ts', 'export const c = 1;\n', true);
  runOn('r-flight', 'src/c.ts', 'export const c = 2;\n', false);
  runOn('r-apart', 'src/f.ts', 'export const f = 6;\n', false);

  const read = gitCount();
  const { collisions, standings } = await decidableOf('r-gate');
  const trials = fs
    .readFileSync(gitCalls, 'utf8')
    .split('\n')
    .filter(Boolean)
    .slice(read)
    .filter((call) => call.startsWith('merge-tree'));
  assert.ok(collisions, 'an ending at its gate carries its collisions');
  assert.deepEqual([...collisions.inFlight].sort(), ['r-apart', 'r-flight']);
  assert.deepEqual(
    collisions.colliding.map((c) => [c.run, c.branch, c.said]),
    [['r-flight', 'wf/r-flight/implement', "conflicts with r-flight's wf/r-flight/implement in 1 file: src/c.ts"]],
  );
  assert.equal(collisions.said, 'collides with 1 of the 2 runs in flight on main: r-flight');
  assert.equal(collisions.semantic, null);
  assert.deepEqual(
    standings.map((s) => s.merge),
    [{ clean: true, said: 'merges cleanly onto main' }],
    "the branch's merge onto the base is the collisions' own trial",
  );
  assert.equal(
    trials.length,
    3,
    `one trial onto the base and one onto each run in flight, the merge check not asked again: ${trials.join('\n')}`,
  );

  runOn('r-handed', 'src/g.ts', 'export const g = 7;\n', true, PLAIN);
  assert.equal((await decidableOf('r-handed')).collisions, null, 'a branch handed to a person to merge is at no ending');
});
