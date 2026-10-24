/**
 * A task whose journal holds an entry no runtime wrote costs the runs that read it, never the list: `GET /api/runs` answers every other
 * run as it would, and the run whose task does not read off its record, saying why in the runtime's words (`unjudged` in runs.ts) — as the
 * tick leaves such a run where it is and counts it in flight. So does a run waiting on it, whose parent's task is read to see if it
 * shipped. A run's own page refuses in those words, and the cap on runs in flight counts both, unjudged, as the tick counts them. A pass
 * has read where the runs' branches stand (`passStanding`), which the list reads off `standing.json`.
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
import type { Ceilings } from '../factory/ceilings.ts';
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

/** A branch off main with one commit of work on it, merged into main: the run it is the result of has shipped. */
function shipped(branch: string) {
  git(repo, 'checkout', '-q', '-b', branch);
  write(path.join(repo, `${branch.replaceAll('/', '-')}.txt`), branch);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', `the work of ${branch}`);
  git(repo, 'checkout', '-q', 'main');
  git(repo, 'merge', '-q', '--no-ff', '-m', `merge ${branch}`, branch);
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

shipped('wf/r-good/implement');
signedOff('r-good-implement');
writeRun('r-good', { implement: { taskId: 'r-good-implement', branch: 'wf/r-good/implement' } }, { factory: 'pipao' });

shipped('wf/r-bad/implement');
signedOff('r-bad-implement');
fs.appendFileSync(journal('r-bad-implement'), jsonl([MISWRITTEN]));
writeRun('r-bad', { implement: { taskId: 'r-bad-implement', branch: 'wf/r-bad/implement' } }, { factory: 'pipao' });

writeRun('r-child', {}, { after: ['r-bad'] });
writeRun('r-sibling', {}, { after: ['r-good'] });
await runWith(engine(), passStanding(runStore.runs.list()));

test('a run whose task journal holds an entry no runtime wrote is answered off its record on the list, refused on its page in those words, and counted in flight', async (t) => {
  const s = story(t);
  await s.test(
    'GET /api/runs answers every run while one task journal holds an entry no runtime wrote, and says of the runs that read it why',
    async () => {
      const res = await app.request('/api/runs');
      assert.equal(res.status, 200, await res.clone().text());
      const runs = new Map(((await res.json()) as RunSummary[]).map((run) => [run.id, run]));
      assert.deepEqual([...runs.keys()].sort(), ['r-bad', 'r-child', 'r-good', 'r-sibling']);

      const good = runs.get('r-good')!;
      assert.equal(good.status, 'succeeded');
      assert.equal(good.unreadable, null);
      assert.equal(runs.get('r-sibling')!.unreadable, null, 'a run waiting on a run whose tasks read is judged as ever');
      assert.equal(good.factory, 'pipao', 'judged, a run names the factory its record names');
      assert.equal(runs.get('r-sibling')!.factory, null, 'and a record that names none is the default factory, null');

      const bad = runs.get('r-bad')!;
      const said = `${journal('r-bad-implement')}), entry 6 is a \`measured\` event, and its \`usage.responses\` is "three", where the runtime writes number.`;
      assert.ok(
        bad.unreadable?.startsWith(
          `r-bad's record reads, but the journal of its task r-bad-implement does not: r-bad-implement's journal (${said}`,
        ),
        bad.unreadable ?? 'null',
      );
      assert.ok(bad.unreadable?.includes('the tick does not advance it, until that journal reads again'), bad.unreadable ?? 'null');
      assert.equal(bad.brief, 'The brief of r-bad', 'what its record says');
      assert.equal(bad.factory, 'pipao', 'its factory among it');
      assert.deepEqual(
        bad.steps.map((s) => [s.name, s.taskId, s.status]),
        [['implement', 'r-bad-implement', 'unreadable']],
      );
      assert.equal(bad.status, 'running', 'counted in flight, as the tick counts it');
      assert.equal(bad.moving, true);
      assert.deepEqual([bad.atWork, bad.tokens], [null, null], 'nothing judged: no time at work and no tokens, which are not 0');
      assert.deepEqual(bad.waitingOnYou, []);

      const child = runs.get('r-child')!;
      assert.ok(
        child.unreadable?.startsWith(
          `r-child's record reads, but the journal of a task of a run it waits on does not: r-bad-implement's journal (`,
        ),
        child.unreadable ?? 'null',
      );
      assert.deepEqual(child.after, ['r-bad']);
    },
  );
  await s.test(
    "a run a task of which does not read has its page refused in the list's words, and every other run answered in full",
    async () => {
      const list = new Map(((await (await app.request('/api/runs')).json()) as RunSummary[]).map((run) => [run.id, run]));
      for (const id of ['r-bad', 'r-child']) {
        const res = await app.request(`/api/runs/${id}`);
        const body = (await res.json()) as { error?: string };
        assert.equal(res.status, 502, JSON.stringify(body));
        assert.equal(body.error, list.get(id)!.unreadable, `${id}'s page and the list say one thing`);
      }
      for (const id of ['r-good', 'r-sibling']) {
        const res = await app.request(`/api/runs/${id}`);
        assert.equal(res.status, 200, await res.clone().text());
      }
    },
  );
  await s.test(
    'GET /api/ceilings answers while a task journal does not read, and counts the runs that read it in flight, as the tick does',
    async () => {
      const was = process.env.WF_MAX_RUNS;
      process.env.WF_MAX_RUNS = '4';
      try {
        const res = await app.request('/api/ceilings');
        assert.equal(res.status, 200, await res.clone().text());
        const ceilings = (await res.json()) as Ceilings;
        assert.equal(ceilings.cap, 4);
        assert.deepEqual([...(ceilings.inFlight ?? [])].sort(), ['r-bad', 'r-child']);
      } finally {
        if (was === undefined) delete process.env.WF_MAX_RUNS;
        else process.env.WF_MAX_RUNS = was;
      }
    },
  );
});
