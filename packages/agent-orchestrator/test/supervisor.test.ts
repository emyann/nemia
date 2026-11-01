/**
 * A step that never ends, shaped as a supervisor's — one step, `workspace: base`, `slot: none`, `remote: true`, a window of its own, no
 * check — run on disk against a board a test settles. What such a step watches is every other run: it asks by signing off `blocked`, and
 * acts on the answer. The package does two things for it: a step answered many times over, each answer a try of the same session, which
 * is here; and a run the cap on runs in flight (`WF_MAX_RUNS`) neither holds nor counts, which is the cap's story in
 * `queue-store.test.ts`. `WF_ROOT` is read as the module loads, so it is set before the import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { TaskSpec } from 'agent-runtime';
import type { TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { promised } from './promised.ts';
import { Effect } from 'effect';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-supervisor-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, list, retryRun, startRun, runWith: runEngine } = await import('../src/runner.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { readRun } = await import('../src/record/record.store.ts');

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  return repo;
};

/** A folder of steps written from their frontmatter and a one-line body. */
const folderOf = (steps: Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  for (const [name, front] of Object.entries(steps))
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\nplace: git\n${front}\n---\n${name} it\n`);
  return dir;
};

/** A watcher's workflow: its one step in the repository's own checkout, outside the cap on runs, bridged, on a window of its own. */
const FOLDER = folderOf({
  supervise: 'workspace: base\nslot: none\nharness: claude\ncontext: 200k\nremote: true\npermissionMode: dontAsk',
});

/**
 * An engine board a test settles by hand, as the story's stage: what each task was filed with, every filing, and each task's own session
 * (`native-<id>`). A settled task carries the closeout it is given. `list` views the tasks it is handed that were filed, each a read;
 * `reads` is every `view` the caller asked for, in order: what a pass costs the engine.
 */
const board = () => {
  type Filed = TaskSpec & { id: string };
  const tasks = new Map<string, { spec: Filed; phase: TaskPhase; closeout?: unknown; exitCode?: number; costUsd?: number }>();
  const filings: string[] = [];
  const stopped: string[] = [];
  const reads: string[] = [];
  const e = promised({
    view: async (id: string) => {
      const t = tasks.get(id);
      reads.push(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '',
          closeoutSchema: t?.spec.closeoutSchema,
          settled,
          stopRequested: false,
          said: [],
          attempts:
            !t || t.phase === 'pending'
              ? []
              : [
                  {
                    n: 1,
                    ended: null,
                    endedAt: settled ? '2026-09-17T00:00:00.000Z' : null,
                    nativeId: `native-${id}`,
                    closeout: t.closeout,
                    exitCode: t.exitCode ?? null,
                    usage: t.costUsd === undefined ? null : { costUsd: t.costUsd },
                  },
                ],
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
    logs: async () => '(no output yet)',
    feed: async () => ({ entries: [], cursor: 0 }),
    tick: async () => ({ tasks: 0, actions: [], running: {}, views: [] }),
    admit: async () => [],
    list: async (ids?: readonly string[]) => ({
      views: await Promise.all((ids ?? [...tasks.keys()]).filter((id) => tasks.has(id)).map((id) => Effect.runPromise(e.view(id)))),
      unreadable: [],
    }),
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, exitCode?: number, costUsd?: number) =>
    Object.assign(tasks.get(id)!, { phase, closeout, exitCode, costUsd });
  return { e, tasks, filings, stopped, reads, settle };
};

test('a step answered five times over keeps working: each answer a try of the same session, told what was said, on the window it was started with, and nothing capping the count', async () => {
  const repo = aRepo();
  const { e, tasks, filings, settle } = board();
  const run = await runPlaced(startRun({ brief: 'supervise this repository', repo, workflowDir: FOLDER }));

  await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(filings, [`${run.id}-supervise`], "filed once, in the repository's own checkout");
  assert.equal(tasks.get(`${run.id}-supervise`)!.spec.cwd, repo);
  assert.equal(tasks.get(`${run.id}-supervise`)!.spec.config?.claude?.remoteControl, true, 'bridged, as `remote: true` says');
  assert.equal(tasks.get(`${run.id}-supervise`)!.spec.config?.contextTokens, 200_000, 'capped, as `context: 200k` says');

  for (let n = 1; n <= 5; n++) {
    const taskId = n === 1 ? `${run.id}-supervise` : `${run.id}-supervise-try${n}`;
    settle(taskId, 'succeeded', {
      outcome: 'blocked',
      summary: `round ${n}: a run is ready to decide`,
      artifacts: [],
      needs: `Merge r-${n}, or hold it?`,
    });
    const quiet = await runWith(e, advanceRun(readRun(run.id)));
    assert.deepEqual(
      [quiet.filed, quiet.tried],
      [[], []],
      `answer ${n}: the pass that reads the question files nothing until a person answers`,
    );
    assert.deepEqual((await runWith(e, list(e, readRun(run.id)))).waitingOnYou, ['supervise'], `answer ${n}: it waits on you`);

    await runWith(e, retryRun(run.id, 'supervise', { mode: 'continue', message: `yes, merge r-${n}` }));
    const filed = await runWith(e, advanceRun(readRun(run.id)));
    const next = `${run.id}-supervise-try${n + 1}`;
    assert.deepEqual(filed.tried, ['supervise'], `answer ${n} files try ${n + 1}`);
    assert.ok(tasks.has(next), `try ${n + 1} is on the board: ${filings.join(', ')}`);
    assert.match(tasks.get(next)!.spec.brief, new RegExp(`## Your answer[\\s\\S]*yes, merge r-${n}`), `try ${n + 1} is told answer ${n}`);
    assert.equal(tasks.get(next)!.spec.resumeFrom, `native-${taskId}`, `try ${n + 1} continues try ${n}'s session`);
    assert.equal(
      tasks.get(next)!.spec.config?.contextTokens,
      200_000,
      `try ${n + 1} continues on the same window: Claude Code's copy of a resumed session keeps only the flags it is given`,
    );
  }
  assert.equal(readRun(run.id).steps.supervise?.tries?.length, 5, 'five tries behind the one it is on, and the sixth running');
  assert.equal(filings.length, 6);
});

test('a pass over a step answered again and again reads what it is working on, not every try it has left behind — and with a cap in force it reads them all', async () => {
  const repo = aRepo();
  const { e, reads, settle } = board();
  const run = await runPlaced(startRun({ brief: 'supervise this repository', repo, workflowDir: FOLDER }));
  await runWith(e, advanceRun(readRun(run.id)));

  const passReads = async (): Promise<string[]> => {
    reads.length = 0;
    await runWith(e, advanceRun(readRun(run.id)));
    return [...reads];
  };
  const answer = async (n: number) => {
    const taskId = n === 1 ? `${run.id}-supervise` : `${run.id}-supervise-try${n}`;
    settle(taskId, 'succeeded', { outcome: 'blocked', summary: `round ${n}`, artifacts: [], needs: 'Merge it?' });
    await runWith(e, advanceRun(readRun(run.id)));
    await runWith(e, retryRun(run.id, 'supervise', { mode: 'continue', message: `yes (${n})` }));
    await runWith(e, advanceRun(readRun(run.id)));
  };

  await answer(1);
  const early = await passReads();
  for (let n = 2; n <= 6; n++) await answer(n);
  assert.equal(readRun(run.id).steps.supervise?.tries?.length, 6, 'six answered tries behind the one it is on');
  const later = await passReads();
  assert.deepEqual(later, [`${run.id}-supervise-try7`], 'the try it is on, and nothing else');
  assert.equal(later.length, early.length, 'a pass costs the same at six answers as at one: it does not grow with them');

  const capped = await runPlaced(
    startRun({ brief: 'do the work', repo, workflowDir: folderOf({ implement: 'harness: claude\nbudget: 1' }), isolate: false }),
  );
  await runWith(e, advanceRun(readRun(capped.id)));
  settle(`${capped.id}-implement`, 'failed', undefined, undefined, 0.6);
  await runWith(e, advanceRun(readRun(capped.id)));
  await runWith(e, retryRun(capped.id, 'implement', { mode: 'fresh' }));
  await runWith(e, advanceRun(readRun(capped.id)));
  settle(`${capped.id}-implement-try2`, 'failed', undefined, undefined, 0.6);
  reads.length = 0;
  await runWith(e, advanceRun(readRun(capped.id)));
  assert.ok(
    reads.includes(`${capped.id}-implement`),
    `try 1 is read while a cap is in force, the one thing those tries are read for, what they cost together: ${reads.join(', ')}`,
  );
  const held = await runWith(e, list(e, readRun(capped.id)));
  assert.deepEqual(
    held.steps.map((st) => st.status),
    ['over budget $1.20 of $1'],
    'the two tries counted together against the cap',
  );
});
