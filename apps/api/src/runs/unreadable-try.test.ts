/**
 * A journal that does not read is a check's, or an earlier try's, and not the step's own session's: the list marks the step whose check or
 * try it is `unreadable`, not the word its session's view would give; and the decision `nemia decide` shows (`GET
 * /api/runs/:runId/decision`) is refused as the run's page is, a 502 in the list's words — for a run waiting on such a run too — while a
 * run whose tasks read is answered. A pass has read where the runs' branches stand (`passStanding`), which the list reads off
 * `standing.json`.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, the harness's fake `claude` (test/harness.ts) first on PATH.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import { story } from '../../test/checkpoints.ts';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../app.ts';
import { engine, passStanding, runStore, type RunSummary } from 'agent-orchestrator';
import { runWith } from '../../test/shipped-place.ts';

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

const repo = fs.mkdtempSync(path.join(root, 'repo-'));
git(repo, 'init', '-q', '-b', 'main');
write(path.join(repo, 'README.md'), '# app\n');
git(repo, 'add', '-A');
git(repo, 'commit', '-q', '-m', 'base');
const base = git(repo, 'rev-parse', 'HEAD').trim();

/** A branch off main with one commit of work on it, merged into main when the run it is the result of has `shipped`. */
function worked(branch: string, shipped = false) {
  git(repo, 'checkout', '-q', '-b', branch);
  write(path.join(repo, `${branch.replaceAll('/', '-')}.txt`), branch);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', `the work of ${branch}`);
  git(repo, 'checkout', '-q', 'main');
  if (shipped) git(repo, 'merge', '-q', '--no-ff', '-m', `merge ${branch}`, branch);
}

const at = '2026-09-28T09:00:00.000Z';
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');
const journal = (taskId: string) => path.join(root, 'engine', 'tasks', `${taskId}.jsonl`);
const signedOff = (taskId: string) =>
  write(
    journal(taskId),
    jsonl([
      { kind: 'filed', at, brief: 'Do it.', cwd: repo, maxAttempts: 1, harness: 'codex' },
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
/** A `measured` line whose usage no runtime wrote, as a person's or another program's edit leaves one. */
const MISWRITTEN = { kind: 'measured', at, attempt: 1, usage: { responses: 'three' } };
const spoil = (taskId: string) => fs.appendFileSync(journal(taskId), jsonl([MISWRITTEN]));

const PLAIN = [{ name: 'implement', after: [], body: 'Implement it.', harness: 'codex' }];

function writeRun(id: string, steps: Record<string, object>, more: object = {}) {
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo,
      baseRef: base,
      workspace: repo,
      branch: 'main',
      isolate: true,
      brief: `The brief of ${id}`,
      createdAt: at,
      workflowDir: path.join(root, 'no-such-workflow'),
      workflow: PLAIN,
      steps,
      ...more,
    }),
  );
}

worked('wf/r-good/implement');
signedOff('r-good-implement');
writeRun('r-good', { implement: { taskId: 'r-good-implement', branch: 'wf/r-good/implement' } });

worked('wf/r-check/implement', true);
signedOff('r-check-implement');
signedOff('r-check-implement-check');
spoil('r-check-implement-check');
writeRun('r-check', {
  implement: { taskId: 'r-check-implement', branch: 'wf/r-check/implement', check: { taskId: 'r-check-implement-check' } },
});

worked('wf/r-try/implement');
signedOff('r-try-implement');
spoil('r-try-implement');
signedOff('r-try-implement-2');
writeRun('r-try', {
  implement: { taskId: 'r-try-implement-2', branch: 'wf/r-try/implement', tries: [{ taskId: 'r-try-implement', then: 'retries' }] },
});

writeRun('r-child', {}, { after: ['r-check'] });
await runWith(engine(), passStanding(runStore.runs.list()));

const listed = async (): Promise<Map<string, RunSummary>> => {
  const res = await app.request('/api/runs');
  assert.equal(res.status, 200, await res.clone().text());
  return new Map(((await res.json()) as RunSummary[]).map((run) => [run.id, run]));
};

test("a check's or an earlier try's journal that does not read marks its step unreadable on the list, and refuses the run's decision as its page", async (t) => {
  const s = story(t);
  await s.test(
    "the list marks unreadable the step whose check's journal, or an earlier try's, does not read, and names that task",
    async () => {
      const runs = await listed();
      assert.equal(runs.get('r-good')!.unreadable, null);
      assert.notEqual(runs.get('r-good')!.steps[0].status, 'unreadable');
      for (const [id, task] of [
        ['r-check', 'r-check-implement-check'],
        ['r-try', 'r-try-implement'],
      ]) {
        const run = runs.get(id)!;
        assert.ok(
          run.unreadable?.startsWith(`${id}'s record reads, but the journal of its task ${task} does not: ${task}'s journal (`),
          run.unreadable ?? 'null',
        );
        assert.ok(run.unreadable?.includes('So the board does not judge the run'), run.unreadable ?? 'null');
        assert.deepEqual(
          run.steps.map((s) => [s.name, s.status]),
          [['implement', 'unreadable']],
          `${id}'s step is the one whose task does not read, though its session's own journal does`,
        );
      }
    },
  );
  await s.test(
    "the decision `nemia decide` shows is refused as the run's page is, in the list's words, and answered for a run whose tasks read",
    async () => {
      const runs = await listed();
      const child = runs.get('r-child')!.unreadable;
      assert.ok(
        child?.startsWith(
          `r-child's record reads, but the journal of a task of a run it waits on does not: r-check-implement-check's journal (`,
        ),
        child ?? 'null',
      );
      for (const id of ['r-check', 'r-try', 'r-child']) {
        const res = await app.request(`/api/runs/${id}/decision`);
        const body = (await res.json()) as { error?: string };
        assert.equal(res.status, 502, JSON.stringify(body));
        assert.ok(runs.get(id)!.unreadable, `${id} is unreadable on the list`);
        assert.equal(body.error, runs.get(id)!.unreadable, `${id}'s decision and the list say one thing`);
        const page = await app.request(`/api/runs/${id}`);
        assert.equal(page.status, 502);
        assert.equal(((await page.json()) as { error?: string }).error, body.error, `${id}'s decision and its page say one thing`);
      }
      const good = await app.request('/api/runs/r-good/decision');
      assert.equal(good.status, 200, await good.clone().text());
    },
  );
});
