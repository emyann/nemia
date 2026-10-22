/**
 * `nemia hold`: a person's word that a run files nothing more until other runs ship — over a store and repositories of its own, with git
 * for real. A file of its own, since `WF_ROOT` is read once, as the package loads. `--until=<run>` is the same flag as `--until <run>`:
 * nothing is refused of it but the run it names.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine, EngineService } from '../src/runtime-client.ts';
import type { Refusal } from '../src/refusal/refusal.ts';
import type { Holding } from '../src/wait/wait.verb.ts';
import type { Effect as EffectOf } from 'effect/Effect';
import type { TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { decideScreen } from './screens.ts';
import { promised } from './promised.ts';
import { Effect } from 'effect';
import { runGiven, runOver } from './placed.ts';
import type { PlaceService } from '../src/place/place.store.ts';

const ROOT = scratch('wf-hold-');
process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const {
  acceptRun,
  advanceRun,
  BY_CAP,
  approveRun,
  decideRun,
  forgetRun,
  hold,
  holdAdvice,
  holdRefusal,
  holdWord,
  holdsOf,
  prune,
  retryRun,
  roundRun,
  sayRun,
  startRun,
  unhold,
  WHY_CAP,
  runWith: runEngine,
  gitPlaceLayer,
} = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { listRuns, readRun } = await import('../src/record/record.store.ts');
const { LINE_NAME } = await import('../src/run.ts');
const { passStanding } = await import('../src/standing/standing.verb.ts');
/** A pass's read of where every run's branches stand, written to `standing.json` as the tick writes it: what `nemia ls` reads. */
const aPass = (e: Engine) => runWith(e, passStanding(listRuns()));
const { main } = await import('../src/cli/main.ts');

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const holdFileOf = (id: string) => path.join(ROOT, 'runs', `${id}.hold`);

/**
 * The hold on `id` made one that code older than `nemia hold --by` wrote: its file without `by`, which every screen says as the plain
 * `held until <run> ships`.
 */
const asOlder = (id: string): void => {
  const { by, ...older } = JSON.parse(fs.readFileSync(holdFileOf(id), 'utf8')) as { by?: string };
  assert.equal(by, os.userInfo().username, `a hold put with no --by is put by the OS user`);
  fs.writeFileSync(holdFileOf(id), JSON.stringify(older, null, 2));
};

/** A repository with one commit. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'README.md'), 'readme\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
};

/** A workflow of one step, `implement`. */
const oneStep = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
};

/** Two steps, `implement` at its gate and `review` after it. */
const gated = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'gated-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\ngate: true\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};

/** Two steps, `implement` and `review` after it. */
const twoSteps = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'two-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};

/** Four steps: `a` and `b`, each with a check, `d` with none, and `c` after `d`. */
const twoChecks = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'checks-'));
  fs.writeFileSync(path.join(dir, 'a.md'), '---\nplace: git\ncheck: npm test\n---\ndo a\n');
  fs.writeFileSync(path.join(dir, 'b.md'), '---\nplace: git\ncheck: npm test\n---\ndo b\n');
  fs.writeFileSync(path.join(dir, 'd.md'), '---\nplace: git\n---\ndo d\n');
  fs.writeFileSync(path.join(dir, 'c.md'), '---\nafter: d\nplace: git\n---\ndo c\n');
  return dir;
};

/** A loop: `implement`, then `review`, which may send it back once. */
const looping = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'loop-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  fs.writeFileSync(
    path.join(dir, 'review.md'),
    '---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\nrounds: 1\n---\nreview it\n',
  );
  fs.writeFileSync(
    path.join(dir, 'review.schema.json'),
    JSON.stringify({ type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false }),
  );
  return dir;
};

/** Just enough engine: each task's phase, and its closeout on its one attempt once it has one. */
const board = () => {
  const tasks = new Map<string, { phase: TaskPhase; closeout?: unknown }>();
  const filings: string[] = [];
  const e = promised({
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        state: {
          brief: t ? 'filed' : '',
          settled,
          stopRequested: false,
          said: [],
          attempts:
            !t || t.phase === 'pending'
              ? []
              : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: null, usage: null }],
        },
      };
    },
    file: async (spec: { id: string }) => {
      filings.push(spec.id);
      tasks.set(spec.id, { phase: 'pending' });
      return spec.id;
    },
    stop: async () => {},
    forget: async (ids: string[]) => ({
      forgotten: true,
      tasks: ids.map((taskId) => ({ taskId, journalBytes: 0, feedLines: 0, sessions: [] })),
    }),
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown) => tasks.set(id, { phase, closeout });
  return { e, filings, settle };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** A run of `oneStep` in `repo`, its step filed, `fix.ts` committed on its branch and signed off: merged into main with `merged`. */
const aDone = async (b: ReturnType<typeof board>, repo: string, { merged = false } = {}) => {
  const run = await runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: oneStep() }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const wt = readRun(run.id).steps.implement.workspace!;
  fs.writeFileSync(path.join(wt, `fix-${run.id}.ts`), 'export const fixed = true;\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', 'add fix');
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  if (merged) git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', readRun(run.id).steps.implement.branch!);
  return run;
};

/** A run of `oneStep` in `repo`, its step filed and still running. */
const aRunning = async (b: ReturnType<typeof board>, repo: string) => {
  const run = await runPlaced(startRun({ brief: 'still going', repo, workflowDir: oneStep() }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  return run;
};

/** `nemia <verb>`, through the CLI, as a person types it: the lines it printed, and the error it ended with, if it did. */
const typed = async (t: TestContext, e: Engine, ...argv: string[]) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => {
    printed.push(a.join(' '));
  });
  try {
    await main(argv, e);
    return { printed: printed.join('\n'), error: undefined };
  } catch (err) {
    return { printed: printed.join('\n'), error: err as Error & { exitCode?: number } };
  } finally {
    log.mock.restore();
  }
};

/** A refusal through the CLI: exit 2, and a message that `pattern` matches. */
const refused = async (t: TestContext, e: Engine, pattern: RegExp, ...argv: string[]) => {
  const { error } = await typed(t, e, ...argv);
  assert.ok(error, `nemia ${argv.join(' ')} was not refused`);
  assert.equal(error.exitCode, 2, error.message);
  assert.match(error.message, pattern);
};

const VERBS = /nemia (approve|retry|round|accept) /;

test('holdWord and holdAdvice say what holds a run and what is left to a person, and never that it waits on you', () => {
  const run = { id: 'r-1', branch: 'main' } as Parameters<typeof holdAdvice>[0];
  assert.equal(holdWord([{ run: 'a-1' }]), 'held until a-1 ships');
  assert.equal(holdWord([{ run: 'a-1' }, { run: 'b-2', cancelledAt: 'then' }]), 'held until a-1 and b-2 (cancelled) ship');
  assert.equal(holdWord([{ run: 'a-1', shipped: true }]), 'held until a-1 ships — it has shipped, and the next tick lifts the hold');
  assert.equal(holdWord([]), 'held, on a hold that names no run');
  assert.equal(
    holdAdvice(run, [{ run: 'a-1' }]),
    'nothing of r-1 is filed, and nothing is asked of you, until nemia decide says a-1 has shipped; to go on before then: nemia hold r-1 --off',
  );
  assert.equal(
    holdAdvice(run, [{ run: 'a-1', missing: true }]),
    'the store has no run a-1 — yours to resolve: nemia hold r-1 --off, or nemia cancel r-1',
  );
  assert.equal(holdAdvice(run, []), "the hold on r-1 names no run, so no run's shipping lifts it — yours to lift: nemia hold r-1 --off");
  for (const w of [[{ run: 'a-1' }], [{ run: 'a-1', missing: true as const }], [{ run: 'a-1', shipped: true as const }], []]) {
    assert.doesNotMatch(`${holdWord(w)} ${holdAdvice(run, w)}`, /waiting on you/);
  }
  const hold = { at: 't', until: ['a-1', 'b-2'] };
  const held = { ...run, hold } as Parameters<typeof holdsOf>[0];
  assert.deepEqual(
    holdsOf(held, (id) => ({ record: { id } as never, shipped: id === 'a-1' })),
    [{ run: 'b-2' }],
    'every run named has shipped only when every one has: one not shipped is the whole of what holds it',
  );
  assert.deepEqual(
    holdsOf(held, (id) => ({ record: { id } as never, shipped: true })),
    [
      { run: 'a-1', shipped: true },
      { run: 'b-2', shipped: true },
    ],
  );
});

test("REFUSED at shipped defaults: nemia hold with neither --until nor --off, with both, a flag it does not take, --until with no run, and an id that is not a run's", async (t) => {
  const b = board();
  await refused(t, b.e, /^nemia hold needs the runs to wait on, or --off/, 'hold', 'r-x');
  await refused(t, b.e, /^nemia hold takes --until or --off, not both/, 'hold', 'r-x', '--until', 'a', '--off');
  await refused(t, b.e, /^nemia hold does not take --after/, 'hold', 'r-x', '--after', 'a');
  await refused(t, b.e, /^--until takes the run to wait on/, 'hold', 'r-x', '--until');
  await refused(t, b.e, /^--until takes the run to wait on/, 'hold', 'r-x', '--until', '--off');
  await refused(t, b.e, /^nemia hold takes the run first/, 'hold', '--until', 'a');
  await refused(t, b.e, /nemia hold writes its file under WF_ROOT by id/, 'hold', '../x', '--until', 'a');
  await refused(
    t,
    b.e,
    /^--until "\.\.\/a" is not a run's id, and nemia hold writes its file under WF_ROOT by id .* as in nemia hold r-x --until add-a-flag-x1y2\.$/,
    'hold',
    'r-x',
    '--until',
    '../a',
  );
  await refused(
    t,
    b.e,
    /^--until "a-1\.json" is not a run's id: \.json is on the name of one of its files under runs\/, not on the run's\. Give the id nemia ls prints: nemia hold r-x --until a-1\.$/,
    'hold',
    'r-x',
    '--until',
    'a-1.json',
  );
  await refused(
    t,
    b.e,
    /^"r-x\.hold" is not a run's id: .* Give the id nemia ls prints: nemia hold r-x\.$/,
    'hold',
    'r-x.hold',
    '--until',
    'a-1',
  );
  await refused(t, b.e, /^no such run: r-nope\. nemia hold takes a run by its id/, 'hold', 'r-nope', '--until', 'a');
  await refused(t, b.e, /^no such run: r-nope\. nemia hold takes a run by its id/, 'hold', 'r-nope', '--off');
  await refused(t, b.e, /^no such run: r-nope/, 'hold', 'r-nope', '--until=a');
  const runs = path.join(ROOT, 'runs');
  assert.deepEqual(fs.existsSync(runs) ? fs.readdirSync(runs).filter((f) => f.endsWith('.hold')) : [], [], 'nothing written');
});

test('REFUSED at shipped defaults: a hold on a run named that the store has not, on the run itself, on one named twice, one already shipped, one cancelled and one of another repository', async (t) => {
  const b = board();
  const repo = aRepo();
  const run = await aRunning(b, repo);
  const id = run.id;
  await refused(t, b.e, new RegExp(`^--until r-nope: the store has no run r-nope`), 'hold', id, '--until', 'r-nope');
  await refused(t, b.e, new RegExp(`^--until ${id}: that is ${id} itself`), 'hold', id, '--until', id);
  const other = await aRunning(b, repo);
  await refused(t, b.e, new RegExp(`^--until ${other.id} is given twice`), 'hold', id, '--until', other.id, '--until', other.id);
  const shipped = await aDone(b, repo, { merged: true });
  await refused(
    t,
    b.e,
    new RegExp(`^--until ${shipped.id}: ${shipped.id} has already shipped onto main, so there is nothing to wait for`),
    'hold',
    id,
    '--until',
    shipped.id,
  );
  const called = await aRunning(b, repo);
  assert.equal((await typed(t, b.e, 'cancel', called.id)).error, undefined);
  await refused(t, b.e, new RegExp(`^--until ${called.id}: ${called.id} was cancelled`), 'hold', id, '--until', called.id);
  const elsewhere = await aRunning(b, aRepo());
  await refused(t, b.e, new RegExp(`^--until ${elsewhere.id}: .*another repository`), 'hold', id, '--until', elsewhere.id);
  assert.ok(!fs.existsSync(holdFileOf(id)), 'nothing written');
  assert.equal(
    (await typed(t, b.e, 'hold', id, '--until', other.id)).error,
    undefined,
    'what is left holds: the one run that may still ship',
  );
  assert.deepEqual(readRun(id).hold?.until, [other.id]);
});

test('REFUSED at shipped defaults: a hold on a run already held, cancelled, shipped or succeeded — and --off of a run nobody holds', async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const run = await aRunning(b, repo);
  await refused(t, b.e, new RegExp(`^${run.id} is not held, so there is no hold to lift`), 'hold', run.id, '--off');
  assert.equal((await typed(t, b.e, 'hold', run.id, '--until', target.id)).error, undefined);
  const first = fs.readFileSync(holdFileOf(run.id), 'utf8');
  await refused(t, b.e, /A hold is put once, whole: lift it/, 'hold', run.id, '--until', target.id);
  assert.equal(fs.readFileSync(holdFileOf(run.id), 'utf8'), first, 'the first hold stands as it was');

  const called = await aRunning(b, repo);
  assert.equal((await typed(t, b.e, 'cancel', called.id)).error, undefined);
  await refused(t, b.e, new RegExp(`^${called.id} was cancelled at .*nothing to hold`), 'hold', called.id, '--until', target.id);
  const shipped = await aDone(b, repo, { merged: true });
  await refused(t, b.e, new RegExp(`^${shipped.id} has shipped: nothing of it is left to file`), 'hold', shipped.id, '--until', target.id);
  const done = await aDone(b, repo);
  await refused(
    t,
    b.e,
    new RegExp(`^${done.id} has succeeded: nothing of it is left to file.*merge its branch once ${target.id} has shipped`),
    'hold',
    done.id,
    '--until',
    target.id,
  );
  for (const r of [called, shipped, done]) assert.ok(!fs.existsSync(holdFileOf(r.id)));
});

test('REFUSED at shipped defaults: a hold that closes a circle — on a run started --after this one, and on a run that already holds on it, however far round', async (t) => {
  const b = board();
  const repo = aRepo();
  const a = await aRunning(b, repo);
  const child = await runPlaced(startRun({ brief: 'after a', repo, workflowDir: oneStep(), after: [a.id] }));
  await refused(
    t,
    b.e,
    new RegExp(`^--until ${child.id}: ${child.id} already waits on ${a.id} to ship \\(${child.id} --after ${a.id}\\)`),
    'hold',
    a.id,
    '--until',
    child.id,
  );

  const c = await aRunning(b, repo);
  const d = await aRunning(b, repo);
  assert.equal((await typed(t, b.e, 'hold', c.id, '--until', d.id)).error, undefined);
  assert.equal((await typed(t, b.e, 'hold', d.id, '--until', a.id)).error, undefined);
  await refused(
    t,
    b.e,
    new RegExp(`^--until ${c.id}: ${c.id} already waits on ${a.id} to ship \\(${c.id} held until ${d.id}, ${d.id} held until ${a.id}\\)`),
    'hold',
    a.id,
    '--until',
    c.id,
  );
  assert.ok(!fs.existsSync(holdFileOf(a.id)));
  const others = [readRun(d.id), readRun(c.id), readRun(child.id)];
  assert.match(
    holdRefusal(readRun(a.id), [c.id], () => ({ record: readRun(c.id), shipped: false }), others) ?? '',
    /each would wait on the other for ever/,
    'pure, with the store in the opposite order: the circle is found whichever run is read first',
  );
});

test('a held run files nothing — the next step, nor on a hold written between the read and the filing — and goes on on the pass that reads every run it names shipped', async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const run = await runPlaced(startRun({ brief: 'waits for the target', repo, workflowDir: oneStep() }));
  const { printed } = await typed(t, b.e, 'hold', run.id, '--until', target.id);
  assert.equal(
    printed,
    `${run.id}  held until ${target.id} ships (by ${os.userInfo().username}) — nothing more of it is filed, and nothing is asked of you, until then; the next tick lifts the hold`,
  );
  asOlder(run.id);
  await runWith(b.e, advanceRun(readRun(run.id)));
  const quiet = await runWith(b.e, advanceRun(readRun(run.id)));
  assert.ok(!b.filings.includes(`${run.id}-implement`), 'nothing filed while held');
  assert.equal(quiet.feed.run.note, `held until ${target.id} ships`, 'the feed says the hold, and not that the run waits on you');
  await aPass(b.e);
  const ls = (await typed(t, b.e, 'ls', run.id)).printed;
  assert.match(ls, new RegExp(`→ held until ${target.id} ships  —  nemia hold ${run.id} --off lifts it`));
  const screen = (await typed(t, b.e, 'decide', run.id)).printed;
  assert.match(
    screen,
    new RegExp(
      `\n  held until ${target.id} ships\n  nothing of ${run.id} is filed, and nothing is asked of you, until nemia decide says ${target.id} has shipped`,
    ),
  );

  const other = await runPlaced(startRun({ brief: 'read before its hold', repo, workflowDir: oneStep() }));
  const stale = readRun(other.id);
  fs.writeFileSync(holdFileOf(other.id), JSON.stringify({ at: 'by hand', until: [target.id] }));
  await runWith(b.e, advanceRun(stale));
  assert.ok(
    !b.filings.includes(`${other.id}-implement`),
    "the pass's own check at the filing: a run read before the hold was put is not filed on that read, since the file on disk holds",
  );

  const wt = readRun(target.id).steps.implement.workspace!;
  fs.writeFileSync(path.join(wt, 'target.ts'), 'export const t = 1;\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', 'target');
  b.settle(`${target.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(target.id)));
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.ok(
    fs.existsSync(holdFileOf(run.id)) && !b.filings.includes(`${run.id}-implement`),
    'signed off and not merged has not shipped: the hold stands',
  );
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', readRun(target.id).steps.implement.branch!);
  const lifted = await runWith(b.e, advanceRun(readRun(run.id)));
  assert.ok(lifted.notes.includes(`the hold is lifted: ${target.id} has shipped`), lifted.notes.join('\n'));
  assert.ok(!fs.existsSync(holdFileOf(run.id)), 'the hold file is gone');
  assert.ok(b.filings.includes(`${run.id}-implement`), 'and the run went on on the same pass');
  assert.equal(readRun(run.id).hold, undefined);
});

test('a hold a pass reads while it files its checks stops the rest of that pass, though it is lifted the instant after: the other check and the ready step are filed on the next pass', async (t: TestContext) => {
  const b = board();
  const repo = aRepo();
  const other = await aRunning(b, repo);
  const run = await runPlaced(startRun({ brief: 'two checks and a step after', repo, workflowDir: twoChecks() }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const id = run.id;
  assert.deepEqual(
    [`${id}-a`, `${id}-b`, `${id}-d`].filter((task) => b.filings.includes(task)),
    [`${id}-a`, `${id}-b`, `${id}-d`],
    `the first pass files the roots: ${b.filings.join(', ')}`,
  );
  assert.ok(!b.filings.includes(`${id}-c`), 'c waits on d');
  for (const step of ['a', 'b', 'd']) b.settle(`${id}-${step}`, 'succeeded', SIGNED);

  const hold = holdFileOf(id);
  const file = b.e.file.bind(b.e);
  let held = false;
  t.mock.method(b.e, 'file', (spec: Parameters<Engine['file']>[0]) => {
    if (!held && spec.id?.endsWith('-check')) {
      held = true;
      fs.writeFileSync(hold, JSON.stringify({ at: 'by hand', until: [other.id] }));
    }
    return file(spec);
  });
  const exists = fs.existsSync;
  let lifted = false;
  t.mock.method(fs, 'existsSync', (p: fs.PathLike) => {
    const there = exists(p);
    if (p === hold && there && !lifted) {
      lifted = true;
      fs.rmSync(hold);
    }
    return there;
  });
  await runWith(b.e, advanceRun(readRun(id)));
  t.mock.restoreAll();

  const checks = [`${id}-a-check`, `${id}-b-check`];
  assert.ok(held && lifted, 'the pass filed a check, then read the hold, which was lifted as it was read');
  assert.equal(checks.filter((task) => b.filings.includes(task)).length, 1, `one check filed, and not the other: ${b.filings.join(', ')}`);
  assert.ok(!fs.existsSync(hold) && readRun(id).hold === undefined, 'nothing holds the run once the pass has read the hold');
  assert.ok(
    !b.filings.includes(`${id}-c`),
    'the ready step c is not filed: the pass read the hold in its checks, and its refusal holds for every phase after, though the store reads clear',
  );

  await runWith(b.e, advanceRun(readRun(id)));
  assert.deepEqual(
    [...checks, `${id}-c`].filter((task) => b.filings.includes(task)),
    [...checks, `${id}-c`],
    'the next pass files the other check and c: the refusal lasted one pass',
  );
});

test('REFUSED while held: an approval, a retry, a round and an acceptance — and nemia ls, nemia decide and decide offer none of them, but say the hold; the question comes back once it lifts', async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);

  const atGate = await runPlaced(startRun({ brief: 'at its gate', repo, workflowDir: gated() }));
  await runWith(b.e, advanceRun(readRun(atGate.id)));
  b.settle(`${atGate.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(atGate.id)));
  assert.match((await typed(t, b.e, 'ls', atGate.id)).printed, /waiting on you: approve implement/, 'the gate is asked before');
  assert.equal((await typed(t, b.e, 'hold', atGate.id, '--until', target.id)).error, undefined);
  asOlder(atGate.id);
  const held = `${atGate.id} is held until ${target.id} ships (nemia hold, at `;
  await assert.rejects(
    runWith(b.e, approveRun(atGate.id, 'implement')),
    (err: Error & { exitCode?: number }) =>
      err.message.startsWith(held) &&
      err.exitCode === 2 &&
      err.message.includes(`an approval would release work the hold keeps back`) &&
      err.message.endsWith(`nemia hold ${atGate.id} --off.`),
  );
  await assert.rejects(
    runWith(b.e, retryRun(atGate.id, 'implement', { mode: 'nudge', message: 'change it' })),
    (err: Error) => err.message.startsWith(held) && err.message.includes('a retry would release'),
  );
  await aPass(b.e);
  const ls = (await typed(t, b.e, 'ls', atGate.id)).printed;
  assert.doesNotMatch(ls, /waiting on you/, ls);
  assert.doesNotMatch(ls, VERBS, ls);
  assert.match(ls, new RegExp(`held until ${target.id} ships; its approval is asked once the hold lifts`));
  assert.match(ls, new RegExp(`→ held until ${target.id} ships`));
  const screen = (await typed(t, b.e, 'decide', atGate.id)).printed;
  assert.doesNotMatch(screen, /waiting on you|AWAITING APPROVAL/, screen);
  assert.doesNotMatch(screen, VERBS, screen);
  const d = await runWith(b.e, decideRun(atGate.id));
  assert.deepEqual([d.retrying, d.rounding, d.offers, d.answering], [[], [], [], {}]);
  assert.deepEqual(
    d.gates,
    { implement: `awaiting approval:  held until ${target.id} ships; its approval is asked once the hold lifts` },
    'the gate stays on the record, said with no verb',
  );
  assert.deepEqual(d.holding, [{ run: target.id }]);
  const approvals = path.join(ROOT, 'runs', `${atGate.id}.approvals`);
  fs.mkdirSync(approvals, { recursive: true });
  fs.writeFileSync(path.join(approvals, 'implement'), JSON.stringify({ at: new Date().toISOString(), step: 'implement' }));
  await runWith(b.e, advanceRun(readRun(atGate.id)));
  assert.ok(!b.filings.includes(`${atGate.id}-review`), 'a pass files nothing on an approval written by hand beside the hold');
  fs.rmSync(approvals, { recursive: true });
  assert.equal(
    (await typed(t, b.e, 'hold', atGate.id, '--off')).printed,
    `${atGate.id}  hold lifted — the next tick goes on, and what its steps ask is asked`,
  );
  assert.match(
    (await typed(t, b.e, 'ls', atGate.id)).printed,
    /waiting on you: approve implement/,
    'lifted by hand, the gate is asked again, as it stood',
  );
  assert.match((await typed(t, b.e, 'decide', atGate.id)).printed, new RegExp(`nemia approve ${atGate.id} implement`));

  const loop = await runPlaced(startRun({ brief: 'a loop', repo, workflowDir: looping() }));
  await runWith(b.e, advanceRun(readRun(loop.id)));
  b.settle(`${loop.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(loop.id)));
  b.settle(`${loop.id}-review`, 'succeeded', { ...SIGNED, again: true });
  await runWith(b.e, advanceRun(readRun(loop.id)));
  const roundTwo = readRun(loop.id);
  const implement2 = roundTwo.steps.implement.taskId!;
  b.settle(implement2, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(loop.id)));
  const review2 = readRun(loop.id).steps.review.taskId!;
  b.settle(review2, 'succeeded', { ...SIGNED, again: true });
  await runWith(b.e, advanceRun(readRun(loop.id)));
  const before = (await typed(t, b.e, 'decide', loop.id)).printed;
  assert.match(before, /ROUNDS EXHAUSTED, waiting on you/, before);
  assert.equal((await typed(t, b.e, 'hold', loop.id, '--until', target.id)).error, undefined);
  await assert.rejects(
    runWith(b.e, roundRun(loop.id, 'review')),
    (err: Error) => err.message.startsWith(`${loop.id} is held until ${target.id} ships`) && err.message.includes('a round would release'),
    'a loop out of rounds: once more is refused while held',
  );
  await assert.rejects(
    runWith(b.e, acceptRun(loop.id, 'review', 'as it stands')),
    (err: Error) =>
      err.message.startsWith(`${loop.id} is held until ${target.id} ships`) && err.message.includes('an acceptance would release'),
    'and so is enough',
  );
  const loopScreen = (await typed(t, b.e, 'decide', loop.id)).printed;
  assert.doesNotMatch(loopScreen, /waiting on you|ROUNDS EXHAUSTED/, loopScreen);
  assert.doesNotMatch(loopScreen, VERBS, loopScreen);
  const loopLs = (await typed(t, b.e, 'ls', loop.id)).printed;
  assert.doesNotMatch(loopLs, /waiting on you/, loopLs);
  assert.doesNotMatch(loopLs, VERBS, loopLs);
  assert.equal((await runWith(b.e, unhold(loop.id))).run.id, loop.id);
  assert.match((await typed(t, b.e, 'decide', loop.id)).printed, /ROUNDS EXHAUSTED, waiting on you/);
});

test("a blocked step's question stays on its record while the run is held, asked of nobody, and is asked again once the hold lifts", async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const run = await runPlaced(startRun({ brief: 'asks a question', repo, workflowDir: twoSteps() }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, 'succeeded', { ...SIGNED, outcome: 'blocked', needs: 'which colour?' });
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.match((await typed(t, b.e, 'ls', run.id)).printed, /waiting on you: implement/);
  await runWith(b.e, hold(run.id, [target.id]));
  const ls = (await typed(t, b.e, 'ls', run.id)).printed;
  assert.doesNotMatch(ls, /waiting on you/, ls);
  assert.doesNotMatch(ls, VERBS, ls);
  const screen = (await typed(t, b.e, 'decide', run.id)).printed;
  assert.doesNotMatch(screen, /waiting on you|BLOCKED/, screen);
  assert.doesNotMatch(screen, VERBS, screen);
  assert.equal((await runWith(b.e, decideRun(run.id))).decision.kind, 'running');
  assert.equal(readRun(run.id).steps.implement.taskId, `${run.id}-implement`, 'the step and its closeout are untouched');
  const asks = path.join(ROOT, 'runs', `${run.id}.asks`);
  fs.mkdirSync(asks, { recursive: true });
  fs.writeFileSync(path.join(asks, 'retry-implement-2'), JSON.stringify({ mode: 'nudge' }));
  const filings = [...b.filings];
  const pass = await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(
    [pass.blocked, pass.tried, b.filings],
    [['review'], [], filings],
    'a try written by hand beside the hold is no try due: nothing is filed, and what the blocked step stops is still read as stopped',
  );
  assert.doesNotMatch((await typed(t, b.e, 'ls', run.id)).printed, /asked|files it/);
  fs.rmSync(asks, { recursive: true });
  await runWith(b.e, unhold(run.id));
  assert.match((await typed(t, b.e, 'ls', run.id)).printed, /waiting on you: implement/);
  assert.match((await typed(t, b.e, 'decide', run.id)).printed, /which colour\?/);
});

test('REFUSED at shipped defaults: nemia rm of a run another holds on names the hold to lift; nemia rm of a held run takes its hold with it', async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const run = await runPlaced(startRun({ brief: 'waits for the target', repo, workflowDir: oneStep() }));
  await runWith(b.e, hold(run.id, [target.id]));
  asOlder(run.id);
  assert.equal((await typed(t, b.e, 'cancel', target.id)).error, undefined);
  b.settle(`${target.id}-implement`, 'stopped');
  const refusedRm = await runWith(b.e, forgetRun(target.id, {}));
  assert.equal(refusedRm.kind, 'refused');
  assert.match(
    refusedRm.refusal ?? '',
    new RegExp(
      `^${run.id} is held until it ships: forgotten, its hold would wait on no such run for ever\\. Lift the hold: nemia hold ${run.id} --off\\.$`,
    ),
  );
  const ls = (await typed(t, b.e, 'ls', run.id)).printed;
  assert.match(
    ls,
    new RegExp(
      `→ held until ${target.id} \\(cancelled\\) ships: ${target.id} was cancelled at .* — yours to resolve: nemia hold ${run.id} --off, or nemia cancel ${run.id}`,
    ),
    'the held run is told why it will never go on, and how to let it go',
  );
  assert.equal((await typed(t, b.e, 'cancel', run.id)).error, undefined);
  assert.equal((await runWith(b.e, forgetRun(run.id, {}))).kind, 'forgotten');
  assert.ok(!fs.existsSync(holdFileOf(run.id)), 'the hold went with the run');
  assert.equal((await runWith(b.e, forgetRun(target.id, {}))).kind, 'forgotten');
});

/** A team whose one step works in a folder the run makes, with no repository. */
const folderTeam = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'team-'));
  fs.writeFileSync(path.join(dir, 'write.md'), '---\nworkspace: folder\npermissionMode: dontAsk\nallow: Edit(**)\n---\nwrite the note\n');
  return dir;
};

test('REFUSED at shipped defaults: a hold on a pruned run and on a folder run, and --until a folder run, a run started --no-worktree, one on another base branch, and one whose result branch is gone', async (t) => {
  const b = board();
  const repo = aRepo();
  const run = await aRunning(b, repo);
  const id = run.id;
  const target = await aRunning(b, repo);

  const pruned = await aDone(b, repo);
  assert.equal((await runWith(b.e, prune(pruned.id, { yes: true, unmerged: true }))).kind, 'pruned');
  await refused(
    t,
    b.e,
    new RegExp(`^${pruned.id} was pruned at .*: nothing of it is filed again, so there is nothing to hold\\.$`),
    'hold',
    pruned.id,
    '--until',
    target.id,
  );

  const folder = await runPlaced(startRun({ brief: 'a note', repo: fs.mkdtempSync(path.join(ROOT, 'plain-')), workflowDir: folderTeam() }));
  await refused(t, b.e, new RegExp(`^${folder.id}'s team works in folders \\(place: folder\\)`), 'hold', folder.id, '--until', target.id);
  await refused(
    t,
    b.e,
    new RegExp(`^--until ${folder.id}: ${folder.id} is a folder run \\(place: folder\\), which never ships onto a branch`),
    'hold',
    id,
    '--until',
    folder.id,
  );

  const inPlace = await runPlaced(startRun({ brief: 'on main itself', repo, workflowDir: oneStep(), isolate: false }));
  await refused(
    t,
    b.e,
    new RegExp(`^--until ${inPlace.id}: ${inPlace.id} worked on main itself \\(--no-worktree\\), so it has no result branch to ship`),
    'hold',
    id,
    '--until',
    inPlace.id,
  );

  git(repo, 'checkout', '-q', '-b', 'release');
  const onRelease = await runPlaced(startRun({ brief: 'onto release', repo, workflowDir: oneStep() }));
  git(repo, 'checkout', '-q', 'main');
  await refused(
    t,
    b.e,
    new RegExp(
      `^--until ${onRelease.id}: ${onRelease.id} ships onto release, and ${id} onto main, so ${id} would wait on a branch it never meets`,
    ),
    'hold',
    id,
    '--until',
    onRelease.id,
  );

  const dropped = await aDone(b, repo);
  git(repo, 'worktree', 'remove', '--force', readRun(dropped.id).steps.implement.workspace!);
  git(repo, 'branch', '-q', '-D', `wf/${dropped.id}/${LINE_NAME}`);
  await refused(
    t,
    b.e,
    new RegExp(
      `^--until ${dropped.id}: wf/${dropped.id}/${LINE_NAME} is gone, and git cannot find it on main, so ${id} would wait for ever`,
    ),
    'hold',
    id,
    '--until',
    dropped.id,
  );

  for (const r of [pruned, folder, run]) assert.ok(!fs.existsSync(holdFileOf(r.id)), `no hold written on ${r.id}`);
});

test('REFUSED at shipped defaults: a hold put again while the tick or --off lifts one is left standing, and a hold put first by another wins whole', async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const other = await aRunning(b, repo);

  const run = await runPlaced(startRun({ brief: 'held twice', repo, workflowDir: oneStep() }));
  await runWith(b.e, hold(run.id, [target.id]));
  const stale = readRun(run.id);
  await runWith(b.e, unhold(run.id));
  await runWith(b.e, hold(run.id, [other.id]));
  const second = fs.readFileSync(holdFileOf(run.id), 'utf8');
  assert.notEqual(JSON.parse(second).at, stale.hold!.at, 'two holds, told apart by when they were put');
  const wt = readRun(target.id).steps.implement.workspace!;
  fs.writeFileSync(path.join(wt, 'target.ts'), 'export const t = 1;\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', 'target');
  b.settle(`${target.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(target.id)));
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', readRun(target.id).steps.implement.branch!);
  const pass = await runWith(b.e, advanceRun(stale));
  assert.ok(
    !pass.notes.some((n) => n.startsWith('the hold is lifted')),
    `the tick read hold A, and a person lifted it and put hold B before the tick's lift: B names what the tick never read\n${pass.notes.join('\n')}`,
  );
  assert.equal(fs.readFileSync(holdFileOf(run.id), 'utf8'), second, 'hold B stands as it was put');
  assert.ok(!b.filings.includes(`${run.id}-implement`), 'and nothing is filed under it');

  const put = { at: '2099-01-01T00:00:00.000Z', until: [other.id] };
  const read = fs.readFileSync;
  let reads = 0;
  t.mock.method(fs, 'readFileSync', function (this: unknown, ...args: Parameters<typeof fs.readFileSync>) {
    if (args[0] === holdFileOf(run.id) && ++reads === 2) fs.writeFileSync(holdFileOf(run.id), JSON.stringify(put));
    return read.apply(this, args);
  });
  await assert.rejects(
    runWith(b.e, unhold(run.id)),
    (err: Error & { exitCode?: number }) =>
      err.exitCode === 2 &&
      err.message ===
        `${run.id}'s hold changed as it was lifted: read it again (nemia ls ${run.id}), then lift it: nemia hold ${run.id} --off.`,
  );
  t.mock.restoreAll();
  assert.deepEqual(
    JSON.parse(fs.readFileSync(holdFileOf(run.id), 'utf8')),
    put,
    '--off read hold B, and another hold was put in the moment before the removal: --off is refused, and that hold stands',
  );

  const race = await aRunning(b, repo);
  const first = { at: '2099-01-02T00:00:00.000Z', until: [other.id] };
  const write = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', function (this: unknown, ...args: Parameters<typeof fs.writeFileSync>) {
    if (args[0] === holdFileOf(race.id) && !fs.existsSync(holdFileOf(race.id))) write.call(fs, holdFileOf(race.id), JSON.stringify(first));
    return write.apply(this, args);
  });
  await assert.rejects(
    runWith(b.e, hold(race.id, [other.id])),
    (err: Error & { exitCode?: number }) =>
      err.exitCode === 2 &&
      err.message.startsWith(`${race.id} is already held until ${other.id} ships (nemia hold, at ${first.at}). A hold is put once, whole`),
  );
  t.mock.restoreAll();
  assert.deepEqual(
    JSON.parse(fs.readFileSync(holdFileOf(race.id), 'utf8')),
    first,
    "the first hold, whole: when two people hold one run at once, the second's exclusive write finds the first's file, is refused as " +
      'already held, and writes nothing',
  );
});

test('REFUSED while held or pruned: nemia say to a step that has settled offers no nemia retry, which either refuses', async () => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const done = await aDone(b, repo);
  const run = await aRunning(b, repo);
  b.settle(`${run.id}-implement`, 'succeeded', { ...SIGNED, outcome: 'blocked', needs: 'a word' });
  await runWith(b.e, advanceRun(readRun(run.id)));
  await assert.rejects(
    runWith(b.e, sayRun(run.id, 'implement', 'hello')),
    (err: Error) => /: nemia retry /.test(err.message),
    'offered before the hold on a step that signed off blocked: settled, and the run not finished, so it may be held',
  );
  await runWith(b.e, hold(run.id, [target.id]));
  await assert.rejects(
    runWith(b.e, sayRun(run.id, 'implement', 'hello')),
    (err: Error & { exitCode?: number }) =>
      err.exitCode === 2 &&
      err.message.endsWith(
        `no try is filed while ${run.id} is held until ${target.id} ships: say them once the hold lifts, or lift it first: nemia hold ${run.id} --off.`,
      ) &&
      !VERBS.test(err.message),
  );
  await runWith(b.e, unhold(run.id));
  assert.equal((await runWith(b.e, prune(done.id, { yes: true, unmerged: true }))).kind, 'pruned');
  await assert.rejects(
    runWith(b.e, sayRun(done.id, 'implement', 'hello')),
    (err: Error) => /Nor is it tried again: .* was pruned at /.test(err.message) && !VERBS.test(err.message),
  );
});

test('the whole screen of a run held by a person while its step runs, of one waiting --after another, alone and with a hold beside, and of one held until a run that was cancelled', async (t) => {
  const b = board();
  const repo = aRepo();
  const parent = await aRunning(b, repo);
  const target = await aRunning(b, repo);
  const ids = { '<parent>': parent.id, '<target>': target.id, '<root>': ROOT };

  const going = await aRunning(b, repo);
  await runWith(b.e, hold(going.id, [target.id]));
  asOlder(going.id);
  assert.deepEqual(await decideScreen(t, b.e, [going.id], { ...ids, '<id>': going.id }), [
    '<id>  still going',
    '',
    '  held until <target> ships',
    '  still running: implement',
    '  nothing of <id> is filed, and nothing is asked of you, until nemia decide says <target> has shipped; to go on before then: nemia hold <id> --off',
  ]);

  const child = await runPlaced(startRun({ brief: 'after the parent', repo, workflowDir: oneStep(), after: [parent.id] }));
  assert.deepEqual(await decideScreen(t, b.e, [child.id], { ...ids, '<id>': child.id }), [
    '<id>  after the parent',
    '',
    '  waiting on <parent>',
    '  nothing of <id> is filed until nemia decide says <parent> has shipped onto main; nothing to decide yet',
  ]);
  await runWith(b.e, hold(child.id, [target.id]));
  asOlder(child.id);
  assert.deepEqual(await decideScreen(t, b.e, [child.id], { ...ids, '<id>': child.id }), [
    '<id>  after the parent',
    '',
    '  waiting on <parent>',
    '  nothing of <id> is filed until nemia decide says <parent> has shipped onto main; nothing to decide yet',
    '  held until <target> ships as well — nemia hold <id> --off lifts the hold, and not the wait above',
  ]);

  assert.equal((await typed(t, b.e, 'cancel', target.id)).error, undefined);
  const at = readRun(target.id).cancelledAt!;
  assert.deepEqual(await decideScreen(t, b.e, [child.id], { ...ids, '<id>': child.id, '<at>': at }), [
    '<id>  after the parent',
    '',
    '  waiting on <parent>',
    '  nothing of <id> is filed until nemia decide says <parent> has shipped onto main; nothing to decide yet',
    '  held until <target> (cancelled) ships as well — <target> was cancelled at <at>, and a cancelled run never ships — yours to resolve: nemia hold <id> --off, or nemia cancel <id>',
  ]);
  assert.deepEqual(await decideScreen(t, b.e, [target.id], { ...ids, '<at>': at }), [
    '<target>  still going',
    '',
    '  cancelled at <at> — nothing to decide',
  ]);
});

/** A loop run on `b` whose review asked for another round on the last one its `rounds:` allows. */
async function outOfRounds(b: ReturnType<typeof board>) {
  const loop = await runPlaced(startRun({ brief: 'a loop', repo: aRepo(), workflowDir: looping() }));
  await runWith(b.e, advanceRun(readRun(loop.id)));
  b.settle(`${loop.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(loop.id)));
  b.settle(`${loop.id}-review`, 'succeeded', { ...SIGNED, again: true });
  await runWith(b.e, advanceRun(readRun(loop.id)));
  b.settle(readRun(loop.id).steps.implement.taskId!, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(loop.id)));
  b.settle(readRun(loop.id).steps.review.taskId!, 'succeeded', { ...SIGNED, again: true });
  await runWith(b.e, advanceRun(readRun(loop.id)));
  return loop;
}

test('the whole screen of a loop out of rounds, and of the round a person asks for', async (t) => {
  const b = board();
  const loop = await outOfRounds(b);
  assert.deepEqual(await decideScreen(t, b.e, [loop.id], { '<id>': loop.id, '<repo>': readRun(loop.id).repo!, '<root>': ROOT }), [
    '<id>  a loop',
    '',
    '  UNVERIFIED: implement  — no check: declared; only its own word says it worked',
    '  ROUNDS EXHAUSTED, waiting on you: review  — asked for another round on the last one rounds: allows; its findings are below',
    '',
    '  once more, on the next tick:',
    '    review: it asked for round 2, and `rounds: 1` are spent. Its findings are below. Once more — implement continued, then a new review:  nemia round <id> review',
    '    review: enough — go on with what is there; its findings stay on the record, and the run ends with them on the record:  nemia accept <id> review --message "<why>"',
    '',
    '  touched  wf/<id>/run',
    '    nothing — the branch changed no file against the base',
    '  lesson  nothing written where the next agent reads',
    '',
    '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
    '  none',
    '',
    '  implement',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed not known  settled before it spawned  used not measured',
    '    did it',
    '',
    '  review',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed not known  settled before it spawned  used not measured',
    '    did it',
    '    again: true',
    '',
    '  cost  run not measured',
    '  timeline  run  queued —  ran —  wall not known',
    '',
    '  wf/<id>/run',
    '',
    '  branch    wf/<id>/run is on main',
    '',
    '  ship it   git -C <repo> merge --no-ff wf/<id>/run',
    '  drop it   git -C <repo> branch -D wf/<id>/run',
  ]);
  await runWith(b.e, roundRun(loop.id, 'review'));
  assert.deepEqual(await decideScreen(t, b.e, [loop.id], { '<id>': loop.id, '<root>': ROOT }), [
    '<id>  a loop',
    '',
    '  still running: review',
    '  review: round 2 asked (nemia round) — the next tick files implement',
    '  nothing to decide yet',
  ]);
});

test('the whole screen of a loop a person accepted as it stands', async (t) => {
  const b = board();
  const loop = await outOfRounds(b);
  const wt = readRun(loop.id).steps.implement.workspace!;
  fs.writeFileSync(path.join(wt, 'loop.ts'), 'export const looped = true;\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', 'add loop.ts');
  await runWith(b.e, acceptRun(loop.id, 'review', 'as it stands'));
  const asks = path.join(ROOT, 'runs', `${loop.id}.asks`);
  const [accepted] = fs.readdirSync(asks).filter((f) => f.startsWith('accept-review-'));
  const file = path.join(asks, accepted);
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), at: '2026-09-17T08:00:00.000Z' }));
  await runWith(b.e, advanceRun(readRun(loop.id)));
  assert.deepEqual(await decideScreen(t, b.e, [loop.id], { '<id>': loop.id, '<repo>': readRun(loop.id).repo!, '<root>': ROOT }), [
    '<id>  a loop',
    '',
    '  UNVERIFIED: implement, review  — no check: declared; only its own word says it worked',
    '',
    '  touched  wf/<id>/run',
    '    (root)  1 file   +1 −0',
    '  lesson  nothing written where the next agent reads',
    '',
    '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
    '  none',
    '',
    '  implement',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed not known  settled before it spawned  used not measured',
    '    did it',
    '',
    '  review',
    '    accepted  accepted as it stands 08:00Z, its findings open — "as it stands"',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed not known  settled before it spawned  used not measured',
    '    did it',
    '    again: true',
    '',
    '  cost  run not measured',
    '  timeline  run  queued —  ran —  wall not known',
    '',
    '  wf/<id>/run  — 1 file: +1 −0',
    '',
    '  branch    wf/<id>/run is ahead of main by 1 commit',
    '',
    '  ship it   git -C <repo> merge --no-ff wf/<id>/run',
    '  drop it   git -C <repo> branch -D wf/<id>/run',
  ]);
});

/** `text` as a pattern that matches it and nothing else inside a line. */
const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test("holdWord says the person's why and who put the hold after `ships`, before any suffix; with neither it is the plain line", async () => {
  const { heldLater } = await import('../src/round/round.ts');
  const said = { why: 'merge conflicts', by: 'operator' };
  assert.equal(holdWord([{ run: 'a-1' }], said), 'held until a-1 ships (why: merge conflicts; by operator)');
  assert.equal(holdWord([{ run: 'a-1' }], { why: 'x' }), 'held until a-1 ships (why: x)');
  assert.equal(holdWord([{ run: 'a-1' }], { by: 'operator' }), 'held until a-1 ships (by operator)', 'a hold with no why says who put it');
  assert.equal(holdWord([{ run: 'a-1' }], {}), 'held until a-1 ships', 'a file older code wrote, with no by, is the plain line');
  assert.equal(holdWord([{ run: 'a-1' }]), 'held until a-1 ships');
  assert.equal(
    holdWord([{ run: 'a-1', shipped: true }], said),
    'held until a-1 ships (why: merge conflicts; by operator) — it has shipped, and the next tick lifts the hold',
  );
  assert.equal(holdWord([{ run: 'a-1' }, { run: 'b-2' }], said), 'held until a-1 and b-2 ship (why: merge conflicts; by operator)');
  assert.equal(holdWord([], said), 'held, on a hold that names no run (why: merge conflicts; by operator)');
  assert.equal(
    heldLater({ at: 't', until: ['a-1'], why: 'w', by: 'b' }, 'its approval'),
    'held until a-1 ships (why: w; by b); its approval is asked once the hold lifts',
  );
  assert.equal(heldLater({ at: 't', until: ['a-1'] }, 'its approval'), 'held until a-1 ships; its approval is asked once the hold lifts');
});

test("nemia hold writes the person's why, one line, and who they are into the hold's file — by default the OS user — and says them back", async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const said = await runPlaced(startRun({ brief: 'held with words', repo, workflowDir: oneStep() }));
  const { printed, error } = await typed(t, b.e, 'hold', said.id, '--until', target.id, '--why', '  two\n words ', '--by', 'operator');
  assert.equal(error, undefined);
  assert.deepEqual((({ why, by }) => ({ why, by }))(JSON.parse(fs.readFileSync(holdFileOf(said.id), 'utf8')) as Record<string, unknown>), {
    why: 'two words',
    by: 'operator',
  });
  assert.equal(
    printed,
    `${said.id}  held until ${target.id} ships (why: two words; by operator) — nothing more of it is filed, and nothing is asked of you, until then; the next tick lifts the hold`,
  );
  const plain = await runPlaced(startRun({ brief: 'held with none', repo, workflowDir: oneStep() }));
  assert.equal((await typed(t, b.e, 'hold', plain.id, '--until=' + target.id, '--why=it waits')).error, undefined);
  assert.equal(readRun(plain.id).hold?.why, 'it waits', '--why=<words> is --why <words>');
  assert.equal((await typed(t, b.e, 'hold', plain.id, '--off')).error, undefined);
  assert.equal((await typed(t, b.e, 'hold', plain.id, '--until', target.id)).error, undefined);
  const file = JSON.parse(fs.readFileSync(holdFileOf(plain.id), 'utf8')) as Record<string, unknown>;
  assert.deepEqual(Object.keys(file), ['at', 'until', 'by'], 'a hold put with no --why writes no why');
  assert.equal(file.by, os.userInfo().username, 'nor --by: it is put by the OS user');

  const nameless = await runPlaced(startRun({ brief: 'held by a user the system cannot name', repo, workflowDir: oneStep() }));
  t.mock.method(os, 'userInfo', () => {
    throw new Error('ENOENT: no such file or directory, uv_os_get_passwd');
  });
  assert.equal((await typed(t, b.e, 'hold', nameless.id, '--until', target.id, '--why', 'w')).error, undefined);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(holdFileOf(nameless.id), 'utf8')) as object), ['at', 'until', 'why']);
});

test("a hold's file written by hand is read as it is: a why or a by that is no words is left out, and a long why is one line within its cap", async () => {
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'held by hand', repo, workflowDir: oneStep() }));
  for (const bad of [7, null, '', ' \n\t ', ['x'], { a: 1 }]) {
    fs.writeFileSync(holdFileOf(run.id), JSON.stringify({ at: 't', until: ['a-1'], why: bad, by: bad }));
    const read = readRun(run.id).hold!;
    assert.ok(!('why' in read) && !('by' in read), `why and by of ${JSON.stringify(bad)} read as none: ${JSON.stringify(read)}`);
    assert.equal(holdWord([{ run: 'a-1' }], read), 'held until a-1 ships');
  }
  const long = `${'many words\n'.repeat(30)}end`;
  fs.writeFileSync(holdFileOf(run.id), JSON.stringify({ at: 't', until: ['a-1'], why: long, by: `  op\nerator ${'x'.repeat(100)}` }));
  const read = readRun(run.id).hold!;
  assert.ok(read.why!.length <= WHY_CAP && read.why!.endsWith('…') && !/\s\s|\n/.test(read.why!), read.why);
  assert.ok(read.by!.length <= BY_CAP && read.by!.startsWith('op erator x') && read.by!.endsWith('…'), read.by);
  fs.writeFileSync(holdFileOf(run.id), JSON.stringify({ at: 't', until: ['a-1'] }));
  assert.deepEqual(readRun(run.id).hold, { at: 't', until: ['a-1'] }, 'a file with no why and no by, as older code wrote it');
  fs.rmSync(holdFileOf(run.id));
});

test('REFUSED at shipped defaults: --why and --by with no value, given twice, with --off, blank, or over their caps — and no hold is written', async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const run = await runPlaced(startRun({ brief: 'not held', repo, workflowDir: oneStep() }));
  const u = ['hold', run.id, '--until', target.id];
  await refused(t, b.e, /^--why takes the words for why the run is held: nemia hold <runId>/, ...u, '--why');
  await refused(t, b.e, /^--why takes the words for why the run is held/, ...u, '--why', '--by', 'x');
  await refused(t, b.e, /^--by takes who puts the hold, by a name: nemia hold <runId>/, ...u, '--by');
  await refused(t, b.e, /^nemia hold takes --why once: a hold says one why/, ...u, '--why', 'a', '--why', 'b');
  await refused(t, b.e, /^nemia hold takes --by once: a hold says one by/, ...u, '--by', 'a', '--by=b');
  await refused(t, b.e, /^nemia hold --off lifts the hold whole, and takes no --why or --by/, 'hold', run.id, '--off', '--why', 'w');
  await refused(t, b.e, /^nemia hold --off lifts the hold whole, and takes no --why or --by/, 'hold', run.id, '--by', 'x', '--off');
  await refused(t, b.e, /^--why takes the words for why the run is held, and was given only blanks: give it words/, ...u, '--why', ' \n ');
  await refused(t, b.e, /^--by takes who puts the hold, by a name, and was given only blanks/, ...u, '--by=');
  await refused(
    t,
    b.e,
    new RegExp(`^--why takes at most ${WHY_CAP} characters, and was given ${WHY_CAP + 1}: say it shorter`),
    ...u,
    '--why',
    'w'.repeat(WHY_CAP + 1),
  );
  await refused(
    t,
    b.e,
    new RegExp(`^--by takes at most ${BY_CAP} characters, and was given ${BY_CAP + 1}: say it shorter`),
    ...u,
    '--by',
    'b'.repeat(BY_CAP + 1),
  );
  assert.ok(!fs.existsSync(holdFileOf(run.id)), 'no refused hold is written');
  assert.equal((await typed(t, b.e, ...u, '--why', 'w'.repeat(WHY_CAP), '--by', 'b'.repeat(BY_CAP))).error, undefined, 'at the caps, held');
});

test('REFUSED at shipped defaults: a hold on a run already held with words names the fix that puts them back, quoted for a shell', async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const run = await runPlaced(startRun({ brief: 'held once', repo, workflowDir: oneStep() }));
  assert.equal((await typed(t, b.e, 'hold', run.id, '--until', target.id, '--why', "it's blocked", '--by', 'operator')).error, undefined);
  await refused(
    t,
    b.e,
    new RegExp(`${literal(`then nemia hold ${run.id} --until ${target.id} --why 'it'\\''s blocked'.`)}$`),
    'hold',
    run.id,
    '--until',
    target.id,
  );
  const plain = await runPlaced(startRun({ brief: 'held once, with no words', repo, workflowDir: oneStep() }));
  assert.equal((await typed(t, b.e, 'hold', plain.id, '--until', target.id)).error, undefined);
  await refused(
    t,
    b.e,
    new RegExp(`${literal(`then nemia hold ${plain.id} --until ${target.id}.`)}$`),
    'hold',
    plain.id,
    '--until',
    target.id,
  );
});

test("nemia ls, nemia decide and the feed say a hold's why and who put it beside held until, on the run's row and at the gate it holds back; a hold older code wrote says the plain line", async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const words = `held until ${target.id} ships (why: merge conflicts in five files; by operator)`;
  const why = ['--why', 'merge conflicts in five files', '--by', 'operator'];

  const atGate = await runPlaced(startRun({ brief: 'at its gate', repo, workflowDir: gated() }));
  await runWith(b.e, advanceRun(readRun(atGate.id)));
  b.settle(`${atGate.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(atGate.id)));
  const olderGate = await runPlaced(startRun({ brief: 'at its gate, held by older code', repo, workflowDir: gated() }));
  await runWith(b.e, advanceRun(readRun(olderGate.id)));
  b.settle(`${olderGate.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(olderGate.id)));
  assert.equal((await typed(t, b.e, 'hold', atGate.id, '--until', target.id, ...why)).error, undefined);
  assert.equal((await typed(t, b.e, 'hold', olderGate.id, '--until', target.id)).error, undefined);
  asOlder(olderGate.id);

  await aPass(b.e);
  const ls = (await typed(t, b.e, 'ls', atGate.id)).printed;
  assert.match(ls, new RegExp(`→ ${literal(words)}  —  nemia hold ${atGate.id} --off lifts it`), ls);
  assert.match(ls, new RegExp(`${literal(words)}; its approval is asked once the hold lifts`), ls);
  const olderLs = (await typed(t, b.e, 'ls', olderGate.id)).printed;
  assert.match(olderLs, new RegExp(`→ held until ${target.id} ships  —  nemia hold ${olderGate.id} --off lifts it`), olderLs);
  assert.match(olderLs, new RegExp(`held until ${target.id} ships; its approval is asked once the hold lifts`), olderLs);

  const screen = (await typed(t, b.e, 'decide', atGate.id)).printed;
  assert.match(screen, new RegExp(`\n  ${literal(words)}\n`), screen);
  assert.deepEqual((await runWith(b.e, decideRun(atGate.id))).gates, {
    implement: `awaiting approval:  ${words}; its approval is asked once the hold lifts`,
  });
  assert.match((await typed(t, b.e, 'decide', olderGate.id)).printed, new RegExp(`\n  held until ${target.id} ships\n`));

  const parent = await aRunning(b, repo);
  const child = await runPlaced(startRun({ brief: 'after the parent', repo, workflowDir: oneStep(), after: [parent.id] }));
  assert.equal((await typed(t, b.e, 'hold', child.id, '--until', target.id, ...why)).error, undefined);
  assert.match(
    (await typed(t, b.e, 'decide', child.id)).printed,
    new RegExp(`\n  ${literal(words)} as well — nemia hold ${child.id} --off lifts the hold, and not the wait above$`),
  );

  const quiet = await runPlaced(startRun({ brief: 'held before it files', repo, workflowDir: oneStep() }));
  assert.equal((await typed(t, b.e, 'hold', quiet.id, '--until', target.id, ...why)).error, undefined);
  assert.equal((await runWith(b.e, advanceRun(readRun(quiet.id)))).feed.run.note, words, "the feed's note says the words");
  const olderQuiet = await runPlaced(startRun({ brief: 'held before it files, by older code', repo, workflowDir: oneStep() }));
  assert.equal((await typed(t, b.e, 'hold', olderQuiet.id, '--until', target.id)).error, undefined);
  asOlder(olderQuiet.id);
  assert.equal((await runWith(b.e, advanceRun(readRun(olderQuiet.id)))).feed.run.note, `held until ${target.id} ships`);
});

/**
 * `nemia hold`'s and `--off`'s programs say in their type what they need and what they refuse. Nothing calls this: the typecheck reads
 * its lines, and an `@ts-expect-error` over code that stops erring is the failure.
 */
function _holdProgramTypes() {
  void (hold('x', []) satisfies EffectOf<Holding, Refusal, EngineService | PlaceService>);
  // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
  void (hold('x', []) satisfies EffectOf<Holding, never, EngineService>);
  void (unhold('x') satisfies EffectOf<Holding, Refusal>);
  // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
  void (unhold('x') satisfies EffectOf<Holding>);
  // @ts-expect-error -- hold requires EngineService, and runPromise takes no requirement
  void Effect.runPromise(hold('x', []));
}

test("REFUSED as a typed failure: each refusal of `hold` and `unhold` is its program's failure, recovered by its tag in the words `runWith` rejects with", async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const called = await aRunning(b, repo);
  assert.equal((await typed(t, b.e, 'cancel', called.id)).error, undefined);
  const already = await aRunning(b, repo);
  await runWith(b.e, hold(already.id, [target.id]));
  const free = await aRunning(b, repo);
  const recovered = (program: EffectOf<Holding, Refusal, EngineService | PlaceService>, tag: Refusal['_tag']) =>
    runWith(
      b.e,
      program.pipe(
        Effect.map(() => 'answered'),
        Effect.catchTag(tag, (r) => Effect.succeed(r.message)),
      ),
    );
  const refusals: Array<[string, () => EffectOf<Holding, Refusal, EngineService | PlaceService>, Refusal['_tag']]> = [
    ['hold of no id', () => hold('Not An Id', [target.id]), 'Invalid'],
    ['hold --until no id', () => hold(free.id, ['Not An Id']), 'Invalid'],
    ['hold of a run not there', () => hold('r-nope', [target.id]), 'Missing'],
    ['hold of a cancelled run', () => hold(called.id, [target.id]), 'Conflict'],
    ['hold of a run already held', () => hold(already.id, [target.id]), 'Conflict'],
    ['--off of no id', () => unhold('Not An Id'), 'Invalid'],
    ['--off of a run not there', () => unhold('r-nope'), 'Missing'],
    ['--off of a run nobody holds', () => unhold(free.id), 'Conflict'],
  ];
  const before = fs.readFileSync(holdFileOf(already.id), 'utf8');
  for (const [what, program, tag] of refusals) {
    const err = await runWith(b.e, program()).then(
      () => assert.fail(`${what}: refused`),
      (x: unknown) => x,
    );
    assert.ok(err instanceof Error && (err as Refusal)._tag === tag, `${what}: a ${tag}, not ${String(err)}`);
    assert.equal(await recovered(program(), tag), err.message, what);
  }
  for (const r of [called, free]) assert.ok(!fs.existsSync(holdFileOf(r.id)), `no hold written on ${r.id}`);
  assert.equal(fs.readFileSync(holdFileOf(already.id), 'utf8'), before, 'the first hold stands as it was');
});

test('a defect is no refusal: `hold` and `unhold` die of what the engine or the filesystem throws, which no `Effect.catch` recovers, and `runWith` rejects with it as it was thrown', async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const run = await aRunning(b, repo);
  const caught = <A, R>(program: EffectOf<A, Refusal, R>) => program.pipe(Effect.catch(() => Effect.succeed('caught')));

  const boom = new Error('journal');
  const broken = { ...b.e, view: () => Effect.die(boom) };
  await assert.rejects(runWith(broken, caught(hold(run.id, [target.id]))), (err) => err === boom);
  await assert.rejects(runWith(broken, hold(run.id, [target.id])), (err) => err === boom);
  assert.ok(!fs.existsSync(holdFileOf(run.id)), 'no hold written');

  await runWith(b.e, hold(run.id, [target.id]));
  const denied = Object.assign(new Error(`EACCES: permission denied, unlink '${holdFileOf(run.id)}'`), { code: 'EACCES' });
  const rm = fs.rmSync;
  t.mock.method(fs, 'rmSync', function (this: unknown, ...args: Parameters<typeof fs.rmSync>) {
    if (args[0] === holdFileOf(run.id)) throw denied;
    return rm.apply(this, args);
  });
  await assert.rejects(Effect.runPromise(caught(unhold(run.id))), (err) => err === denied);
  await assert.rejects(runWith(b.e, unhold(run.id)), (err) => err === denied);
  t.mock.restoreAll();
  assert.ok(fs.existsSync(holdFileOf(run.id)), 'the hold stands');
});
