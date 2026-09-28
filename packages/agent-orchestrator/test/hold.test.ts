/**
 * `wf hold`: a person's word that a run files nothing more until other runs ship — over a store and repositories of its own, with git for
 * real. A file of its own, since `WF_ROOT` is read once, as the package loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from 'agent-runtime';
import type { TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-hold-');
process.env.WF_ROOT = ROOT;
const {
  accept,
  advance,
  approve,
  decide,
  forget,
  hold,
  holdAdvice,
  holdRefusal,
  holdWord,
  holdsOf,
  prune,
  readRun,
  retry,
  round,
  say,
  start,
  unhold,
} = await import('../src/runner.ts');
const { main } = await import('../src/cli.ts');

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const holdFileOf = (id: string) => path.join(ROOT, 'runs', `${id}.hold`);

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
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  return dir;
};

/** Two steps, `implement` at its gate and `review` after it. */
const gated = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'gated-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\ngate: true\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\n---\nreview it\n');
  return dir;
};

/** Two steps, `implement` and `review` after it. */
const twoSteps = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'two-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\n---\nreview it\n');
  return dir;
};

/** A loop: `implement`, then `review`, which may send it back once. */
const looping = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'loop-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  fs.writeFileSync(
    path.join(dir, 'review.md'),
    '---\nafter: implement\noutput: review.schema.json\nloop: implement\nrounds: 1\n---\nreview it\n',
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
  const e = {
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
  } as unknown as Engine;
  const settle = (id: string, phase: TaskPhase, closeout?: unknown) => tasks.set(id, { phase, closeout });
  return { e, filings, settle };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** A run of `oneStep` in `repo`, its step filed, `fix.ts` committed on its branch and signed off: merged into main with `merged`. */
const aDone = async (b: ReturnType<typeof board>, repo: string, { merged = false } = {}) => {
  const run = start({ brief: 'add a flag', repo, workflowDir: oneStep() });
  await advance(b.e, readRun(run.id));
  const wt = readRun(run.id).steps.implement.workspace!;
  fs.writeFileSync(path.join(wt, `fix-${run.id}.ts`), 'export const fixed = true;\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', 'add fix');
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(run.id));
  if (merged) git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', `wf/${run.id}/implement`);
  return run;
};

/** A run of `oneStep` in `repo`, its step filed and still running. */
const aRunning = async (b: ReturnType<typeof board>, repo: string) => {
  const run = start({ brief: 'still going', repo, workflowDir: oneStep() });
  await advance(b.e, readRun(run.id));
  return run;
};

/** `wf <verb>`, through the CLI, as a person types it: the lines it printed, and the error it ended with, if it did. */
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
  assert.ok(error, `wf ${argv.join(' ')} was not refused`);
  assert.equal(error.exitCode, 2, error.message);
  assert.match(error.message, pattern);
};

const VERBS = /wf (approve|retry|round|accept) /;

test('holdWord and holdAdvice say what holds a run and what is left to a person, and never that it waits on you', () => {
  const run = { id: 'r-1', branch: 'main' } as Parameters<typeof holdAdvice>[0];
  assert.equal(holdWord([{ run: 'a-1' }]), 'held until a-1 ships');
  assert.equal(holdWord([{ run: 'a-1' }, { run: 'b-2', cancelledAt: 'then' }]), 'held until a-1 and b-2 (cancelled) ship');
  assert.equal(holdWord([{ run: 'a-1', shipped: true }]), 'held until a-1 ships — it has shipped, and the next tick lifts the hold');
  assert.equal(holdWord([]), 'held, on a hold that names no run');
  assert.equal(
    holdAdvice(run, [{ run: 'a-1' }]),
    'nothing of r-1 is filed, and nothing is asked of you, until wf decide says a-1 has shipped; to go on before then: wf hold r-1 --off',
  );
  assert.equal(
    holdAdvice(run, [{ run: 'a-1', missing: true }]),
    'the store has no run a-1 — yours to resolve: wf hold r-1 --off, or wf cancel r-1',
  );
  assert.equal(holdAdvice(run, []), "the hold on r-1 names no run, so no run's shipping lifts it — yours to lift: wf hold r-1 --off");
  for (const w of [[{ run: 'a-1' }], [{ run: 'a-1', missing: true as const }], [{ run: 'a-1', shipped: true as const }], []]) {
    assert.doesNotMatch(`${holdWord(w)} ${holdAdvice(run, w)}`, /waiting on you/);
  }
  // Every run named has shipped only when every one has: one not shipped is the whole of what holds it.
  const hold = { at: 't', until: ['a-1', 'b-2'] };
  const held = { ...run, hold } as Parameters<typeof holdsOf>[0];
  assert.deepEqual(
    holdsOf(held, (id) => ({ record: { id } as never, shipped: id === 'a-1' })),
    [{ run: 'b-2' }],
  );
  assert.deepEqual(
    holdsOf(held, (id) => ({ record: { id } as never, shipped: true })),
    [
      { run: 'a-1', shipped: true },
      { run: 'b-2', shipped: true },
    ],
  );
});

test("REFUSED at shipped defaults: wf hold with neither --until nor --off, with both, a flag it does not take, --until with no run, and an id that is not a run's", async (t) => {
  const b = board();
  await refused(t, b.e, /^wf hold needs the runs to wait on, or --off/, 'hold', 'r-x');
  await refused(t, b.e, /^wf hold takes --until or --off, not both/, 'hold', 'r-x', '--until', 'a', '--off');
  await refused(t, b.e, /^wf hold does not take --after/, 'hold', 'r-x', '--after', 'a');
  await refused(t, b.e, /^--until takes the run to wait on/, 'hold', 'r-x', '--until');
  await refused(t, b.e, /^--until takes the run to wait on/, 'hold', 'r-x', '--until', '--off');
  await refused(t, b.e, /^wf hold takes the run first/, 'hold', '--until', 'a');
  await refused(t, b.e, /wf hold writes its file under WF_ROOT by id/, 'hold', '../x', '--until', 'a');
  await refused(
    t,
    b.e,
    /^--until "\.\.\/a" is not a run's id, and wf hold writes its file under WF_ROOT by id .* as in wf hold r-x --until add-a-flag-x1y2\.$/,
    'hold',
    'r-x',
    '--until',
    '../a',
  );
  // A run named by one of its files is fixed on --until, with the run to hold kept.
  await refused(
    t,
    b.e,
    /^--until "a-1\.json" is not a run's id: \.json is on the name of one of its files under runs\/, not on the run's\. Give the id wf ls prints: wf hold r-x --until a-1\.$/,
    'hold',
    'r-x',
    '--until',
    'a-1.json',
  );
  await refused(
    t,
    b.e,
    /^"r-x\.hold" is not a run's id: .* Give the id wf ls prints: wf hold r-x\.$/,
    'hold',
    'r-x.hold',
    '--until',
    'a-1',
  );
  await refused(t, b.e, /^no such run: r-nope\. wf hold takes a run by its id/, 'hold', 'r-nope', '--until', 'a');
  await refused(t, b.e, /^no such run: r-nope\. wf hold takes a run by its id/, 'hold', 'r-nope', '--off');
  // --until= is the same flag, and holds: nothing is refused of it here but the run it names.
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
  // And what is left holds: the one run that may still ship.
  assert.equal((await typed(t, b.e, 'hold', id, '--until', other.id)).error, undefined);
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
  const child = start({ brief: 'after a', repo, workflowDir: oneStep(), after: [a.id] });
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
  // a → c → d → a: c waits on d, which waits on a.
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
  // Pure, with the store in the opposite order: the circle is found whichever run is read first.
  const others = [readRun(d.id), readRun(c.id), readRun(child.id)];
  assert.match(
    holdRefusal(readRun(a.id), [c.id], () => ({ record: readRun(c.id), shipped: false }), others) ?? '',
    /each would wait on the other for ever/,
  );
});

test('a held run files nothing — the next step, nor on a hold written between the read and the filing — and goes on on the pass that reads every run it names shipped', async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const run = start({ brief: 'waits for the target', repo, workflowDir: oneStep() });
  const { printed } = await typed(t, b.e, 'hold', run.id, '--until', target.id);
  assert.equal(
    printed,
    `${run.id}  held until ${target.id} ships — nothing more of it is filed, and nothing is asked of you, until then; the next tick lifts the hold`,
  );
  await advance(b.e, readRun(run.id));
  const quiet = await advance(b.e, readRun(run.id));
  assert.ok(!b.filings.includes(`${run.id}-implement`), 'nothing filed while held');
  assert.equal(quiet.feed.run.note, `held until ${target.id} ships`, 'the feed says the hold, and not that the run waits on you');
  const ls = (await typed(t, b.e, 'ls', run.id)).printed;
  assert.match(ls, new RegExp(`→ held until ${target.id} ships  —  wf hold ${run.id} --off lifts it`));
  const screen = (await typed(t, b.e, 'decide', run.id)).printed;
  assert.match(
    screen,
    new RegExp(
      `\n  held until ${target.id} ships\n  nothing of ${run.id} is filed, and nothing is asked of you, until wf decide says ${target.id} has shipped`,
    ),
  );

  // The pass's own check at the filing: a run read before the hold was put is not filed on that read.
  const other = start({ brief: 'read before its hold', repo, workflowDir: oneStep() });
  const stale = readRun(other.id);
  fs.writeFileSync(holdFileOf(other.id), JSON.stringify({ at: 'by hand', until: [target.id] }));
  await advance(b.e, stale);
  assert.ok(!b.filings.includes(`${other.id}-implement`), 'the file on disk holds, whatever the run read said');

  // The target ships: its work committed, signed off, handed off, and merged.
  const wt = readRun(target.id).steps.implement.workspace!;
  fs.writeFileSync(path.join(wt, 'target.ts'), 'export const t = 1;\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', 'target');
  b.settle(`${target.id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(target.id));
  // Signed off and not merged has not shipped: the hold stands.
  await advance(b.e, readRun(run.id));
  assert.ok(fs.existsSync(holdFileOf(run.id)) && !b.filings.includes(`${run.id}-implement`));
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', `wf/${target.id}/implement`);
  const lifted = await advance(b.e, readRun(run.id));
  assert.ok(lifted.notes.includes(`the hold is lifted: ${target.id} has shipped`), lifted.notes.join('\n'));
  assert.ok(!fs.existsSync(holdFileOf(run.id)), 'the hold file is gone');
  assert.ok(b.filings.includes(`${run.id}-implement`), 'and the run went on on the same pass');
  assert.equal(readRun(run.id).hold, undefined);
});

test('REFUSED while held: an approval, a retry, a round and an acceptance — and wf ls, wf decide and decide offer none of them, but say the hold; the question comes back once it lifts', async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);

  // A step at its gate.
  const atGate = start({ brief: 'at its gate', repo, workflowDir: gated() });
  await advance(b.e, readRun(atGate.id));
  b.settle(`${atGate.id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(atGate.id));
  assert.match((await typed(t, b.e, 'ls', atGate.id)).printed, /waiting on you: approve implement/, 'the gate is asked before');
  assert.equal((await typed(t, b.e, 'hold', atGate.id, '--until', target.id)).error, undefined);
  const held = `${atGate.id} is held until ${target.id} ships (wf hold, at `;
  await assert.rejects(
    approve(b.e, atGate.id, 'implement'),
    (err: Error & { exitCode?: number }) =>
      err.message.startsWith(held) &&
      err.exitCode === 2 &&
      err.message.includes(`an approval would release work the hold keeps back`) &&
      err.message.endsWith(`wf hold ${atGate.id} --off.`),
  );
  await assert.rejects(
    retry(b.e, atGate.id, 'implement', { mode: 'nudge', message: 'change it' }),
    (err: Error) => err.message.startsWith(held) && err.message.includes('a retry would release'),
  );
  const ls = (await typed(t, b.e, 'ls', atGate.id)).printed;
  assert.doesNotMatch(ls, /waiting on you/, ls);
  assert.doesNotMatch(ls, VERBS, ls);
  assert.match(ls, new RegExp(`held until ${target.id} ships; its approval is asked once the hold lifts`));
  assert.match(ls, new RegExp(`→ held until ${target.id} ships`));
  const screen = (await typed(t, b.e, 'decide', atGate.id)).printed;
  assert.doesNotMatch(screen, /waiting on you|AWAITING APPROVAL/, screen);
  assert.doesNotMatch(screen, VERBS, screen);
  const d = await decide(b.e, atGate.id);
  assert.deepEqual([d.retrying, d.rounding, d.offers, d.answering], [[], [], [], {}]);
  // The gate stays on the record, said with no verb: asked once the hold lifts.
  assert.deepEqual(d.gates, { implement: `awaiting approval:  held until ${target.id} ships; its approval is asked once the hold lifts` });
  assert.deepEqual(d.holding, [{ run: target.id }]);
  // A pass files nothing on an approval written by hand beside the hold.
  const approvals = path.join(ROOT, 'runs', `${atGate.id}.approvals`);
  fs.mkdirSync(approvals, { recursive: true });
  fs.writeFileSync(path.join(approvals, 'implement'), JSON.stringify({ at: new Date().toISOString(), step: 'implement' }));
  await advance(b.e, readRun(atGate.id));
  assert.ok(!b.filings.includes(`${atGate.id}-review`), 'nothing filed');
  fs.rmSync(approvals, { recursive: true });
  // Lifted by hand: the gate is asked again, as it stood.
  assert.equal(
    (await typed(t, b.e, 'hold', atGate.id, '--off')).printed,
    `${atGate.id}  hold lifted — the next tick goes on, and what its steps ask is asked`,
  );
  assert.match((await typed(t, b.e, 'ls', atGate.id)).printed, /waiting on you: approve implement/);
  assert.match((await typed(t, b.e, 'decide', atGate.id)).printed, new RegExp(`wf approve ${atGate.id} implement`));

  // A loop out of rounds: once more and enough are each refused while held.
  const loop = start({ brief: 'a loop', repo, workflowDir: looping() });
  await advance(b.e, readRun(loop.id));
  b.settle(`${loop.id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(loop.id));
  b.settle(`${loop.id}-review`, 'succeeded', { ...SIGNED, again: true });
  await advance(b.e, readRun(loop.id));
  const roundTwo = readRun(loop.id);
  const implement2 = roundTwo.steps.implement.taskId!;
  b.settle(implement2, 'succeeded', SIGNED);
  await advance(b.e, readRun(loop.id));
  const review2 = readRun(loop.id).steps.review.taskId!;
  b.settle(review2, 'succeeded', { ...SIGNED, again: true });
  await advance(b.e, readRun(loop.id));
  const before = (await typed(t, b.e, 'decide', loop.id)).printed;
  assert.match(before, /ROUNDS EXHAUSTED, waiting on you/, before);
  assert.equal((await typed(t, b.e, 'hold', loop.id, '--until', target.id)).error, undefined);
  await assert.rejects(
    round(b.e, loop.id, 'review'),
    (err: Error) => err.message.startsWith(`${loop.id} is held until ${target.id} ships`) && err.message.includes('a round would release'),
  );
  await assert.rejects(
    accept(b.e, loop.id, 'review', 'as it stands'),
    (err: Error) =>
      err.message.startsWith(`${loop.id} is held until ${target.id} ships`) && err.message.includes('an acceptance would release'),
  );
  const loopScreen = (await typed(t, b.e, 'decide', loop.id)).printed;
  assert.doesNotMatch(loopScreen, /waiting on you|ROUNDS EXHAUSTED/, loopScreen);
  assert.doesNotMatch(loopScreen, VERBS, loopScreen);
  const loopLs = (await typed(t, b.e, 'ls', loop.id)).printed;
  assert.doesNotMatch(loopLs, /waiting on you/, loopLs);
  assert.doesNotMatch(loopLs, VERBS, loopLs);
  assert.equal(unhold(loop.id).run.id, loop.id);
  assert.match((await typed(t, b.e, 'decide', loop.id)).printed, /ROUNDS EXHAUSTED, waiting on you/);
});

test("a blocked step's question stays on its record while the run is held, asked of nobody, and is asked again once the hold lifts", async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const run = start({ brief: 'asks a question', repo, workflowDir: twoSteps() });
  await advance(b.e, readRun(run.id));
  b.settle(`${run.id}-implement`, 'succeeded', { ...SIGNED, outcome: 'blocked', needs: 'which colour?' });
  await advance(b.e, readRun(run.id));
  assert.match((await typed(t, b.e, 'ls', run.id)).printed, /waiting on you: implement/);
  await hold(b.e, run.id, [target.id]);
  const ls = (await typed(t, b.e, 'ls', run.id)).printed;
  assert.doesNotMatch(ls, /waiting on you/, ls);
  assert.doesNotMatch(ls, VERBS, ls);
  const screen = (await typed(t, b.e, 'decide', run.id)).printed;
  assert.doesNotMatch(screen, /waiting on you|BLOCKED/, screen);
  assert.doesNotMatch(screen, VERBS, screen);
  assert.equal((await decide(b.e, run.id)).decision.kind, 'running');
  assert.equal(readRun(run.id).steps.implement.taskId, `${run.id}-implement`, 'the step and its closeout are untouched');
  // A try written by hand beside the hold is no try due: nothing is filed, and what the blocked step stops is still read as stopped.
  const asks = path.join(ROOT, 'runs', `${run.id}.asks`);
  fs.mkdirSync(asks, { recursive: true });
  fs.writeFileSync(path.join(asks, 'retry-implement-2'), JSON.stringify({ mode: 'nudge' }));
  const filings = [...b.filings];
  const pass = await advance(b.e, readRun(run.id));
  assert.deepEqual([pass.blocked, pass.tried, b.filings], [['review'], [], filings]);
  assert.doesNotMatch((await typed(t, b.e, 'ls', run.id)).printed, /asked|files it/);
  fs.rmSync(asks, { recursive: true });
  unhold(run.id);
  assert.match((await typed(t, b.e, 'ls', run.id)).printed, /waiting on you: implement/);
  assert.match((await typed(t, b.e, 'decide', run.id)).printed, /which colour\?/);
});

test('REFUSED at shipped defaults: wf rm of a run another holds on names the hold to lift; wf rm of a held run takes its hold with it', async (t) => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const run = start({ brief: 'waits for the target', repo, workflowDir: oneStep() });
  await hold(b.e, run.id, [target.id]);
  assert.equal((await typed(t, b.e, 'cancel', target.id)).error, undefined);
  b.settle(`${target.id}-implement`, 'stopped');
  const refusedRm = await forget(b.e, target.id, {});
  assert.equal(refusedRm.kind, 'refused');
  assert.match(
    refusedRm.refusal ?? '',
    new RegExp(
      `^${run.id} is held until it ships: forgotten, its hold would wait on no such run for ever\\. Lift the hold: wf hold ${run.id} --off\\.$`,
    ),
  );
  // The held run, told why it will never go on, and how to let it go.
  const ls = (await typed(t, b.e, 'ls', run.id)).printed;
  assert.match(
    ls,
    new RegExp(
      `→ held until ${target.id} \\(cancelled\\) ships: ${target.id} was cancelled at .* — yours to resolve: wf hold ${run.id} --off, or wf cancel ${run.id}`,
    ),
  );
  assert.equal((await typed(t, b.e, 'cancel', run.id)).error, undefined);
  assert.equal((await forget(b.e, run.id, {})).kind, 'forgotten');
  assert.ok(!fs.existsSync(holdFileOf(run.id)), 'the hold went with the run');
  assert.equal((await forget(b.e, target.id, {})).kind, 'forgotten');
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
  assert.equal((await prune(b.e, pruned.id, { yes: true, unmerged: true })).kind, 'pruned');
  await refused(
    t,
    b.e,
    new RegExp(`^${pruned.id} was pruned at .*: nothing of it is filed again, so there is nothing to hold\\.$`),
    'hold',
    pruned.id,
    '--until',
    target.id,
  );

  const folder = start({ brief: 'a note', repo: fs.mkdtempSync(path.join(ROOT, 'plain-')), workflowDir: folderTeam() });
  await refused(
    t,
    b.e,
    new RegExp(`^${folder.id}'s team works in folders \\(workspace: folder\\)`),
    'hold',
    folder.id,
    '--until',
    target.id,
  );
  await refused(
    t,
    b.e,
    new RegExp(`^--until ${folder.id}: ${folder.id} is a folder run \\(workspace: folder\\), which never ships onto a branch`),
    'hold',
    id,
    '--until',
    folder.id,
  );

  const inPlace = start({ brief: 'on main itself', repo, workflowDir: oneStep(), isolate: false });
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
  const onRelease = start({ brief: 'onto release', repo, workflowDir: oneStep() });
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

  // Finished and never merged, then its worktree and branch deleted: git finds its work nowhere.
  const dropped = await aDone(b, repo);
  git(repo, 'worktree', 'remove', '--force', readRun(dropped.id).steps.implement.workspace!);
  git(repo, 'branch', '-q', '-D', `wf/${dropped.id}/implement`);
  await refused(
    t,
    b.e,
    new RegExp(`^--until ${dropped.id}: wf/${dropped.id}/implement is gone, and git cannot find it on main, so ${id} would wait for ever`),
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

  // The tick read hold A; a person lifted it and put hold B before the tick's lift: B names what the tick never read, and stays.
  const run = start({ brief: 'held twice', repo, workflowDir: oneStep() });
  await hold(b.e, run.id, [target.id]);
  const stale = readRun(run.id);
  unhold(run.id);
  await hold(b.e, run.id, [other.id]);
  const second = fs.readFileSync(holdFileOf(run.id), 'utf8');
  assert.notEqual(JSON.parse(second).at, stale.hold!.at, 'two holds, told apart by when they were put');
  const wt = readRun(target.id).steps.implement.workspace!;
  fs.writeFileSync(path.join(wt, 'target.ts'), 'export const t = 1;\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', 'target');
  b.settle(`${target.id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(target.id));
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', `wf/${target.id}/implement`);
  const pass = await advance(b.e, stale);
  assert.ok(!pass.notes.some((n) => n.startsWith('the hold is lifted')), pass.notes.join('\n'));
  assert.equal(fs.readFileSync(holdFileOf(run.id), 'utf8'), second, 'hold B stands as it was put');
  assert.ok(!b.filings.includes(`${run.id}-implement`), 'and nothing is filed under it');

  // --off read hold B; another hold was put in the moment before the removal: --off is refused, and that hold stands.
  const put = { at: '2099-01-01T00:00:00.000Z', until: [other.id] };
  const read = fs.readFileSync;
  let reads = 0;
  t.mock.method(fs, 'readFileSync', function (this: unknown, ...args: Parameters<typeof fs.readFileSync>) {
    if (args[0] === holdFileOf(run.id) && ++reads === 2) fs.writeFileSync(holdFileOf(run.id), JSON.stringify(put));
    return read.apply(this, args);
  });
  assert.throws(
    () => unhold(run.id),
    (err: Error & { exitCode?: number }) =>
      err.exitCode === 2 &&
      err.message === `${run.id}'s hold changed as it was lifted: read it again (wf ls ${run.id}), then lift it: wf hold ${run.id} --off.`,
  );
  t.mock.restoreAll();
  assert.deepEqual(JSON.parse(fs.readFileSync(holdFileOf(run.id), 'utf8')), put);

  // Two people hold one run at once: the second's exclusive write finds the first's file, is refused as already held, and writes nothing.
  const race = await aRunning(b, repo);
  const first = { at: '2099-01-02T00:00:00.000Z', until: [other.id] };
  const write = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', function (this: unknown, ...args: Parameters<typeof fs.writeFileSync>) {
    if (args[0] === holdFileOf(race.id) && !fs.existsSync(holdFileOf(race.id))) write.call(fs, holdFileOf(race.id), JSON.stringify(first));
    return write.apply(this, args);
  });
  await assert.rejects(
    hold(b.e, race.id, [other.id]),
    (err: Error & { exitCode?: number }) =>
      err.exitCode === 2 &&
      err.message.startsWith(`${race.id} is already held until ${other.id} ships (wf hold, at ${first.at}). A hold is put once, whole`),
  );
  t.mock.restoreAll();
  assert.deepEqual(JSON.parse(fs.readFileSync(holdFileOf(race.id), 'utf8')), first, 'the first hold, whole');
});

test('wf decide on a held run that also waits --after a run says both, and that --off lifts only the hold', async (t) => {
  const b = board();
  const repo = aRepo();
  const parent = await aRunning(b, repo);
  const target = await aRunning(b, repo);
  const child = start({ brief: 'after the parent', repo, workflowDir: oneStep(), after: [parent.id] });
  await hold(b.e, child.id, [target.id]);
  const screen = (await typed(t, b.e, 'decide', child.id)).printed;
  assert.match(screen, new RegExp(`\n  waiting on ${parent.id}`), screen);
  assert.match(
    screen,
    new RegExp(`\n  held until ${target.id} ships as well — wf hold ${child.id} --off lifts the hold, and not the wait above$`),
    screen,
  );
  assert.doesNotMatch(screen, VERBS, screen);
  // And a run named that never ships: how to let it go, on the same screen.
  assert.equal((await typed(t, b.e, 'cancel', target.id)).error, undefined);
  assert.match(
    (await typed(t, b.e, 'decide', child.id)).printed,
    new RegExp(
      `held until ${target.id} \\(cancelled\\) ships as well — ${target.id} was cancelled at .* — yours to resolve: wf hold ${child.id} --off, or wf cancel ${child.id}$`,
    ),
  );
});

test('REFUSED while held or pruned: wf say to a step that has settled offers no wf retry, which either refuses', async () => {
  const b = board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const done = await aDone(b, repo);
  // A step that signed off blocked: settled, and the run not finished, so it may be held.
  const run = await aRunning(b, repo);
  b.settle(`${run.id}-implement`, 'succeeded', { ...SIGNED, outcome: 'blocked', needs: 'a word' });
  await advance(b.e, readRun(run.id));
  await assert.rejects(say(b.e, run.id, 'implement', 'hello'), (err: Error) => /: wf retry /.test(err.message), 'offered before the hold');
  await hold(b.e, run.id, [target.id]);
  await assert.rejects(
    say(b.e, run.id, 'implement', 'hello'),
    (err: Error & { exitCode?: number }) =>
      err.exitCode === 2 &&
      err.message.endsWith(
        `no try is filed while ${run.id} is held until ${target.id} ships: say them once the hold lifts, or lift it first: wf hold ${run.id} --off.`,
      ) &&
      !VERBS.test(err.message),
  );
  unhold(run.id);
  assert.equal((await prune(b.e, done.id, { yes: true, unmerged: true })).kind, 'pruned');
  await assert.rejects(
    say(b.e, done.id, 'implement', 'hello'),
    (err: Error) => /Nor is it tried again: .* was pruned at /.test(err.message) && !VERBS.test(err.message),
  );
});
