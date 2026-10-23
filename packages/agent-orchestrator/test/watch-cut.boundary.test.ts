/**
 * A real `nemia watch`, in a process of its own, surviving a feed cut under it: truncated, deleted or replaced, it says each cut once on
 * stderr and delivers the transition after it. A boundary, since it spawns the CLI's `main` as a person runs it — the long-lived watch
 * with the store's liveness beside it (`watching`, its lease read off the daemon), which never returns: it is stopped at the end as a
 * person stops it, by ^C, and killed should an assertion fail first.
 *
 * The same cuts read in-process, with the watch's cursor file, are `test/run-feed.test.ts`'s; the watch's races with the file
 * `src/feed/feed.test.ts`'s. The runs' transitions are written by the tick on the stage (`story.ts`): the child reads only the feed.
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads; `WF_VERIFY_REST=1` judges in full every run a pass answers
 * from its memo of runs at rest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { Run } from '../src/record/record.ts';
import { nodeChild } from './child.ts';
import { scratch } from './scratch.ts';
import { staged } from './story.ts';
import { names } from './assessed.ts';

const ROOT = scratch('wf-watch-cut-');
const RUNS = path.join(ROOT, 'runs');
const FEED = path.join(ROOT, 'feed.jsonl');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const { approveRun, startRun, tickRun, runWith } = await import('../src/runner.ts');
const { main } = await import('../src/cli/main.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const stage = staged({ runWith, main, engineOf });

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** One pass of the tick over the whole store, on the stage's engine given a pass of its own that does nothing. */
const tick = () => {
  const b = stage.board();
  Object.assign(b.e, { tick: () => Effect.succeed({ tasks: 0, actions: [], running: {}, views: [] }), tallied: undefined });
  return stage.runWith(b.e, tickRun());
};

const size = (): number => fs.statSync(FEED, { throwIfNoEntry: false })?.size ?? 0;

/** A run of `plan → implement`, whose plan waits at its gate for a person, in a repository of its own on the test place. */
const started = (brief: string): Promise<Run> => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'plan.md'), '---\nplace: git\ngate: true\n---\nplan it\n');
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nafter: plan\nplace: git\n---\nimplement it\n');
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  return stage.runPlaced(startRun({ brief, repo, workflowDir: dir, isolate: false }));
};

test('`nemia watch` survives a feed cut under it: truncated, deleted or replaced, it says so once and delivers the next transition', async () => {
  fs.mkdirSync(RUNS, { recursive: true });
  const run = await started('the cut');
  await tick();
  const from = size();
  const cli = new URL('../src/cli/main.ts', import.meta.url).href;
  const w = nodeChild(`const { main } = await import(${JSON.stringify(cli)}); await main(['watch', '${from}'], {});`, {
    ...process.env,
    WF_ROOT: ROOT,
  });
  const cuts = () =>
    w
      .err()
      .split('\n')
      .filter((l) => l.includes('under this watch'));
  try {
    await w.until(
      () => w.out().includes(`watching from ${from}`),
      'a real `nemia watch`, in a process killed at the end since it never returns, its engine never asked anything, starts',
    );

    fs.truncateSync(FEED, 0);
    await w.until(() => cuts().length >= 1, 'truncated to nothing: the truncation is said');
    assert.equal(cuts().length, 1, 'the truncation is said once');
    names(cuts()[0], 'nemia watch:', 'truncated under this watch', `at cursor ${from}`, 'is 0 bytes now', 'from its start');
    stage.board().settle(`${run.id}-plan`, 'succeeded', SIGNED);
    await tick();
    await tick();
    await w.until(
      () => /\splan\s+awaiting approval/.test(w.out()),
      'the watch reads the feed the tick writes again from its start: the gate reached after the cut is delivered',
    );

    const before = w.out().length;
    fs.rmSync(FEED);
    await w.until(() => cuts().length >= 2, 'deleted: the same, the deletion is said');
    assert.equal(cuts().length, 2, 'the deletion is said once');
    names(cuts()[1], 'deleted under this watch');
    await stage.runWith(stage.board().e, approveRun(run.id, 'plan'));
    for (let i = 0; i < 2; i++) await tick();
    await w.until(() => /\splan\s+(?!awaiting)/.test(w.out().slice(before)), 'the approval after the deletion is delivered');

    const at = w.out().length;
    const next = `${FEED}.next`;
    fs.writeFileSync(
      next,
      `${fs.readFileSync(FEED, 'utf8')}${JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-new', word: 'running' })}\n`,
    );
    fs.renameSync(next, FEED);
    await w.until(
      () => cuts().length >= 3 && w.out().slice(at).includes('r-new'),
      'replaced by another file of the same bytes and more: its inode tells, not its size; the replacement is said on stderr and read',
    );
    assert.equal(cuts().length, 3, 'the replacement is said once');
    names(cuts()[2], 'replaced under this watch');

    const quiet = w.err();
    fs.appendFileSync(FEED, `${JSON.stringify({ at: '2026-09-22T10:00:01.000Z', run: 'r-last', word: 'running' })}\n`);
    await w.until(() => w.out().includes('r-last'), 'each cut said once: every beat after reads on, and the line after is delivered');
    assert.equal(w.err(), quiet, 'nothing more said, and no `past the end`, ever');
    assert.doesNotMatch(w.err(), /past the end|falls inside a line/);

    w.child.kill('SIGINT');
    assert.equal((await w.closed).code, 130, 'it never returns: ^C stops it, its scope closed, at 128 + SIGINT');
  } finally {
    if (w.child.exitCode === null && w.child.signalCode === null) w.child.kill();
  }
});
