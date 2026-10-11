/**
 * What one pass asks of the engine (`advance`), pinned: every call it makes, in order, with the task it names, and the meter's count of
 * calls in each phase it touches (`meteredEngine`, `metered`) — on a step filed fresh, a check, a ready step after it, a try, a round, a
 * cancelled run, an ending, and a try and a round due on one pass. A pass that asks the engine once more, or once less, reads more
 * journals, files what it did not or files in another order, fails here, whatever else it still gets right. With them, the processes a
 * pass over a repository run starts for its place's verbs, each counted once, in the `place` phase (`passStanding`, `advancePass`).
 *
 * `WF_ROOT` is set before the runner is imported: the module reads it as it loads. `WF_VERIFY_REST=1` judges in full every run a pass
 * answers from its memo of runs at rest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Run, TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { promised } from './promised.ts';
import { Effect } from 'effect';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-pass-calls-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, approveRun, cancelRun, startRun, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');
const { metered } = await import('../src/meter/tally.store.ts');
const { meteredEngine } = await import('../src/meter/meter.verb.ts');
const { passStanding } = await import('../src/standing/standing.verb.ts');
const { passRead } = await import('../src/cap/cap.verb.ts');
const { advancePass } = await import('../src/tick/advance.verb.ts');

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const LOOPING = {
  type: 'object',
  properties: { findings: { type: 'array' }, again: { type: 'boolean' } },
  required: ['findings', 'again'],
  additionalProperties: false,
};

/** A repository with one commit on main. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/** A workflow folder of the steps given, each `name` with its frontmatter lines. */
const folder = (steps: Record<string, string>, extra: Record<string, string> = {}): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  for (const [name, keys] of Object.entries(steps))
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\nplace: git\n${keys ? `${keys}\n` : ''}---\n${name} it\n`);
  for (const [name, text] of Object.entries(extra)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
};

/** `nemia start` over a fresh repository, the steps working in its checkout unless `isolate`, each then in a worktree of its own. */
const started = async (dir: string, isolate = false): Promise<Run> =>
  await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: dir, isolate }));

/**
 * An engine board a test settles by hand, which writes down each call made of it — its verb and the task it names — in order (`calls`).
 * A task filed is pending until settled; a settled one carries its closeout and its exit code on its one attempt, and its own session.
 */
const board = () => {
  const tasks = new Map<string, { spec: { id: string; brief: string }; phase: TaskPhase; closeout?: unknown; exitCode?: number }>();
  const calls: string[] = [];
  const e = promised({
    view: async (id: string) => {
      calls.push(`view ${id}`);
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '',
          settled,
          stopRequested: false,
          said: [],
          attempts:
            !t || t.phase === 'pending'
              ? []
              : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: t.exitCode ?? null, usage: null }],
        },
      };
    },
    file: async (spec: { id: string; brief: string }) => {
      calls.push(`file ${spec.id}`);
      tasks.set(spec.id, { spec, phase: 'pending' });
      return spec.id;
    },
    stop: async (id: string) => {
      calls.push(`stop ${id}`);
    },
    close: async (id: string) => {
      calls.push(`close ${id}`);
    },
    answer: async (id: string) => {
      calls.push(`answer ${id}`);
    },
    logs: async (id: string) => {
      calls.push(`logs ${id}`);
      return '(no output yet)';
    },
    output: async (id: string, stream: string) => {
      calls.push(`output ${id} ${stream}`);
      return '';
    },
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, exitCode?: number) =>
    Object.assign(tasks.get(id)!, { phase, closeout, exitCode });
  return { e, calls, settle };
};

/**
 * One pass over the run, metered as `tick` meters it: the engine's calls it made, in order, each with the run's id cut to `R`, and the
 * meter's count of calls in the phases a pass asks the engine in: `journals`, a read, and `act`, which is also every pass's hand-off and
 * its asks consumed (`consumeAsks`), each step's workspace cut, and the record written (`rewriteRun`).
 */
const pass = async (b: ReturnType<typeof board>, id: string) => {
  b.calls.length = 0;
  const { value, tallies } = await metered(() => runWith(meteredEngine(b.e), advanceRun(readRun(id))));
  assert.ok(tallies, 'the pass was metered');
  return {
    advanced: value,
    calls: b.calls.map((c) => c.replaceAll(id, 'R')),
    counted: { journals: tallies.kinds.journals.calls, act: tallies.kinds.act.calls },
  };
};

test('a fresh step is filed with no look first; the step after it waits, unasked', async () => {
  const run = await started(folder({ implement: '', review: 'after: implement' }));
  const b = board();
  const p = await pass(b, run.id);
  assert.deepEqual(p.advanced.filed, ['implement']);
  assert.deepEqual(p.calls, ['file R-implement']);
  assert.deepEqual(p.counted, { journals: 0, act: 5 }, 'the hand-off, the cut of its workspace, its filing, the write and the asks');

  const again = await pass(b, run.id);
  assert.deepEqual(again.calls, ['view R-implement'], 'a pass over a step in flight reads its task, and files nothing');
  assert.deepEqual(again.counted, { journals: 1, act: 2 }, 'the hand-off and the asks, with nothing written');
});

test("a signed step's check is looked for, then filed; once it passes, the ready step after it is filed", async () => {
  const run = await started(folder({ implement: 'check: npm test', review: 'after: implement' }));
  const b = board();
  await pass(b, run.id);
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);

  const checking = await pass(b, run.id);
  assert.deepEqual(checking.advanced.checked, ['implement']);
  assert.deepEqual(checking.calls, ['view R-implement', 'view R-implement-check', 'view R-implement-check', 'file R-implement-check']);
  assert.deepEqual(checking.counted, { journals: 3, act: 4 }, 'the hand-off, the filing, the write and the asks');

  b.settle(`${run.id}-implement-check`, 'succeeded', undefined, 0);
  const ready = await pass(b, run.id);
  assert.deepEqual(ready.advanced.filed, ['review']);
  assert.deepEqual(
    ready.calls,
    ['view R-implement', 'view R-implement-check', 'output R-implement-check stdout', 'output R-implement-check stderr', 'file R-review'],
    "the check's streams are read once each, for what the step after it is told the check said, its verdict off the view the pass read",
  );
  assert.deepEqual(ready.counted, { journals: 4, act: 5 }, "the two views, and the check's two streams");
});

test('a try its check refused is looked for, then filed, under its own id', async () => {
  const run = await started(folder({ implement: 'check: npm test\nretries: 1', review: 'after: implement' }));
  const b = board();
  await pass(b, run.id);
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await pass(b, run.id);
  b.settle(`${run.id}-implement-check`, 'failed', undefined, 1);

  const tried = await pass(b, run.id);
  assert.deepEqual(tried.advanced.tried, ['implement']);
  assert.deepEqual(tried.calls, [
    'view R-implement',
    'view R-implement-check',
    'view R-implement-try2',
    'view R-implement-try2',
    'output R-implement-check stdout',
    'output R-implement-check stderr',
    'file R-implement-try2',
  ]);
  assert.deepEqual(tried.counted, { journals: 6, act: 4 }, 'the check it refused read for its brief');
});

test('a round the looping step asked for is looked for, then filed, under its target’s next try', async () => {
  const run = await started(
    folder(
      { implement: '', review: 'after: implement\noutput: review.schema.json\nloop: implement' },
      { 'review.schema.json': JSON.stringify(LOOPING) },
    ),
  );
  const b = board();
  await pass(b, run.id);
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await pass(b, run.id);
  b.settle(`${run.id}-review`, 'succeeded', { ...SIGNED, findings: [], again: true });

  const looped = await pass(b, run.id);
  assert.deepEqual(looped.advanced.looped, ['review']);
  assert.deepEqual(looped.calls, [
    'view R-implement',
    'view R-review',
    'view R-implement-try2',
    'view R-implement-try2',
    'file R-implement-try2',
  ]);
  assert.deepEqual(looped.counted, { journals: 4, act: 4 });
});

test('a try and a round due on one pass: the try is filed first, then the round, each looked for before', async () => {
  const run = await started(
    folder(
      {
        implement: '',
        review: 'after: implement\noutput: review.schema.json\nloop: implement',
        docs: 'check: npm test\nretries: 1',
      },
      { 'review.schema.json': JSON.stringify(LOOPING) },
    ),
    true,
  );
  const b = board();
  await pass(b, run.id);
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  b.settle(`${run.id}-docs`, 'succeeded', SIGNED);
  await pass(b, run.id);
  b.settle(`${run.id}-review`, 'succeeded', { ...SIGNED, findings: [], again: true });
  b.settle(`${run.id}-docs-check`, 'failed', undefined, 1);

  const both = await pass(b, run.id);
  assert.deepEqual([both.advanced.tried, both.advanced.looped], [['docs'], ['review']]);
  assert.deepEqual(
    both.calls,
    [
      'view R-docs',
      'view R-docs-check',
      'view R-implement',
      'view R-review',
      'view R-implement-try2',
      'view R-docs-try2',
      'view R-docs-try2',
      'output R-docs-check stdout',
      'output R-docs-check stderr',
      'file R-docs-try2',
      'view R-implement-try2',
      'file R-implement-try2',
    ],
    "the pass's reads, then the try looked for and filed, then the round",
  );
  assert.deepEqual(both.counted, { journals: 10, act: 5 });
});

test("a cancelled run's task in flight is stopped by the pass, and nothing more is filed", async () => {
  const run = await started(folder({ implement: '', review: 'after: implement' }));
  const b = board();
  await pass(b, run.id);
  b.settle(`${run.id}-implement`, 'running');
  await runWith(b.e, cancelRun(run.id));

  const stopped = await pass(b, run.id);
  assert.deepEqual(stopped.advanced.filed, []);
  assert.deepEqual(stopped.calls, ['view R-implement', 'stop R-implement']);
  assert.deepEqual(stopped.counted, { journals: 1, act: 3 });
});

test('an approved ending is filed in the checkout, once the pass has read afresh who holds it', async () => {
  const run = await started(folder({ implement: '', ship: 'after: implement\nworkspace: main\ngate: true' }), true);
  const b = board();
  await pass(b, run.id);
  fs.writeFileSync(path.join(readRun(run.id).steps.implement.workspace!, 'flag.ts'), 'export const flag = true;\n');
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  const gated = await pass(b, run.id);
  assert.deepEqual(gated.advanced.filed, [], 'the gate holds it');
  assert.deepEqual(gated.calls, ['view R-implement']);
  assert.deepEqual(gated.counted, { journals: 1, act: 3 }, 'the hand-off of what implement left, written, and the asks');

  await runWith(b.e, approveRun(run.id, 'ship', 'Merge it.'));
  const shipped = await pass(b, run.id);
  assert.deepEqual(shipped.advanced.filed, ['ship']);
  assert.deepEqual(
    shipped.calls,
    ['view R-implement', 'view R-implement', 'file R-ship'],
    "the pass's read, the checkout's claim read afresh (`checkoutHold`), and the filing",
  );
  assert.deepEqual(shipped.counted, { journals: 2, act: 5 });
});

test("each question a pass asks its place is one call of its place phase, and each git process the place starts for it is counted once there, no other process started: the standing, a worktree's make, a hand-off", async (t) => {
  const run = await started(folder({ implement: '', ship: 'after: implement\nworkspace: main\ngate: true' }), true);
  const b = board();
  const bin = fs.mkdtempSync(path.join(ROOT, 'bin-'));
  const ran = path.join(bin, 'ran');
  const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho git >> '${ran}'\nexec '${real}' "$@"\n`, { mode: 0o755 });
  const was = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${was ?? ''}`;
  t.after(() => {
    process.env.PATH = was;
  });
  const gitRan = (): number => (fs.existsSync(ran) ? fs.readFileSync(ran, 'utf8').split('\n').filter(Boolean).length : 0);
  const placed = async () => {
    const e = meteredEngine(b.e);
    const program = Effect.gen(function* () {
      const runs = [readRun(run.id)];
      const read = passRead(e, runs, process.env, yield* passStanding(runs));
      return (yield* advancePass(e, runs[0], undefined, read)).advanced;
    });
    const before = gitRan();
    const { value, tallies } = await metered(() => runWith(e, program));
    const all = Object.values(tallies!.kinds).reduce((n, k) => n + k.spawned, 0);
    return { advanced: value, calls: tallies!.kinds.place.calls, spawned: tallies!.kinds.place.spawned, all, git: gitRan() - before };
  };

  const filed = await placed();
  assert.deepEqual(filed.advanced.filed, ['implement']);
  assert.equal(filed.calls, 2, "two questions: the standing, and the make of implement's worktree");
  assert.ok(filed.git >= 2, `each of them ran git: ${filed.git}`);
  assert.deepEqual(
    [filed.spawned, filed.all],
    [filed.git, filed.git],
    'every git process is counted once, in the place phase, and nothing else is',
  );

  fs.writeFileSync(path.join(readRun(run.id).steps.implement.workspace!, 'flag.ts'), 'export const flag = true;\n');
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  const handed = await placed();
  assert.equal(readRun(run.id).steps.implement.handedOff, `${run.id}-implement`, 'implement was handed off on this pass');
  assert.equal(
    handed.calls,
    3,
    'three questions: the standing, the hand-off of what implement left, and the heads read again since the hand-off moved its branch',
  );
  assert.deepEqual([handed.spawned, handed.all], [handed.git, handed.git]);
});
