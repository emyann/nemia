/**
 * `main`, the verbs' table: the help for a verb it does not know and for one given too little, and the lines of the verbs no other test
 * reads — `nemia cancel`, `nemia show`, `nemia logs` and `nemia accept` — over a store and a repository of their own, on the test place.
 *
 * The root test below types `factory servers default`, and the factory is `default` on purpose. A `factory servers` read is two reads:
 * the factory's own existence (`factoryThere`), and its record. The record is read under the root the handler is given (`rootGiven`,
 * which is what that test pins); the existence check returns early for `DEFAULT_FACTORY` and otherwise calls `readFactories()`, whose
 * `factoriesDir()` still reads the module-level root `factory.store.ts` pinned as it loaded. So any other name would fail there and not
 * at the read — `factory.store.ts` is unconverted, carries the most lines of `test/global-roots.baseline.ts` and is the next card's
 * work, the baseline only shrinking. `default` is the one name where the two roots cannot differ, so it isolates the read.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { TaskPhase } from '../run.ts';
import { scratch } from '../../test/scratch.ts';
import { promised } from '../../test/promised.ts';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-main-');
process.env.WF_ROOT = ROOT;
const stand = eachTest(testPlace);
const { advanceRun, CLI, TABLE, startRun, runWith: runEngine } = await import('../runner.ts');
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { readRun } = await import('../record/record.store.ts');
const { aliased, main, VERBS } = await import('./main.ts');
const { HELP, WF_HINT } = await import('./flags.ts');
const { offLine } = await import('../demand/demand.ts');

type Engine = NonNullable<Parameters<typeof main>[1]>;

/** A repository with one commit. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  fs.writeFileSync(path.join(repo, 'README.md'), 'readme\n');
  stand().world.repository(repo, { 'README.md': 'readme\n' });
  return repo;
};

/** A workflow of one step, `implement`. */
const oneStep = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
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

/** Just enough engine: each task's phase, its closeout on its one attempt once it has one, and its logs. */
const board = () => {
  const tasks = new Map<string, { phase: TaskPhase; closeout?: unknown }>();
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
      tasks.set(spec.id, { phase: 'pending' });
      return spec.id;
    },
    stop: async () => {},
    logs: async (id: string) => `the output of ${id}`,
    mcpState: async () => ({ read: false as const, why: 'no harness is run in this test, so no state is read' }),
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown) => tasks.set(id, { phase, closeout });
  return { e, settle };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** `nemia <verb>`, through the CLI, as a person types it: each line it printed on stdout, and on stderr. */
const typed = async (t: TestContext, e: Engine, ...argv: string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => out.push(a.join(' ')));
  const error = t.mock.method(console, 'error', (...a: unknown[]) => err.push(a.join(' ')));
  try {
    await main(argv, e, undefined, stand().place);
  } finally {
    log.mock.restore();
    error.mock.restore();
  }
  return { out, err };
};

test('wf, the alias, writes its one hint line on stderr before the help, and nothing of it on stdout', async (t: TestContext) => {
  const out: string[] = [];
  const err: string[] = [];
  t.mock.method(process.stderr, 'write', (chunk: string) => err.push(chunk) > 0);
  t.mock.method(console, 'log', (...a: unknown[]) => out.push(a.join(' ')));
  await aliased([]);
  assert.deepEqual(err, [`${WF_HINT}\n`]);
  assert.deepEqual(out, [HELP]);
  assert.match(WF_HINT, new RegExp(`\\b${CLI} <args>`), 'the hint names what to type next');
});

test('nemia auto, a renamed group, runs as nemia policy, with one hint line on stderr naming it, and stdout the same', async (t) => {
  const { e } = board();
  const hints: string[] = [];
  t.mock.method(process.stderr, 'write', (chunk: string) => hints.push(chunk) > 0);
  const now = await typed(t, e, 'policy', 'nemia');
  assert.deepEqual(hints, [], 'the new name gives no hint');
  const was = await typed(t, e, 'auto', 'nemia');
  assert.deepEqual(was.out, now.out, 'the former name prints what the new one prints');
  assert.equal(hints.length, 1, 'one hint line');
  assert.match(hints[0], new RegExp(`\`${CLI} policy nemia\``), 'the hint names what to type now');
});

test('a read is run against the root the process names when it is typed, not one a module pinned as it loaded', async (t) => {
  const { e } = board();
  const other = scratch('wf-main-other-');
  const file = path.join(other, 'factories', 'default', 'servers.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ servers: { github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/' } } })}\n`);
  const was = process.env.WF_ROOT;
  try {
    process.env.WF_ROOT = other;
    const { out } = await typed(t, e, 'factory', 'servers', 'default');
    assert.ok(
      out.some((line) => line.includes('https://api.githubcopilot.com/mcp/')),
      `the record under the root the process names is the one read, by servers.store.ts's required home: ${JSON.stringify(out)}`,
    );
    process.env.WF_ROOT = was;
    const back = await typed(t, e, 'factory', 'servers', 'default');
    assert.ok(
      back.out.some((line) => line.includes('no server recorded')),
      `and this root records none, so the read follows the root rather than a module's: ${JSON.stringify(back.out)}`,
    );
  } finally {
    process.env.WF_ROOT = was;
  }
});

test('the verbs the help names are the verbs main runs, and no other', () => {
  const lines = [...HELP.matchAll(new RegExp(`^ {2}${CLI} (.+)$`, 'gm'))].map((m) => m[1]);
  const served = TABLE.filter((c) => c.only?.side !== 'api').map((c) => c.name);
  const names = [...VERBS.keys(), ...served];
  const first = (words: string) => words.split(' ')[0];
  assert.deepEqual([...new Set(lines.map(first))].sort(), [...new Set(names.map(first))].sort());
  assert.deepEqual(
    names.filter((name) => !lines.some((line) => line === name || line.startsWith(`${name} `))),
    [],
    'each name of two words opens a line of the help',
  );
});

test('the help, once and alone, for no verb, a verb it does not know, and a name every object has', async (t) => {
  const { e } = board();
  const help = (await typed(t, e)).out;
  assert.equal(help.length, 1);
  assert.match(help[0], /^nemia — run a workflow of agent steps\n/);
  for (const verb of ['nope', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])
    assert.deepEqual(await typed(t, e, verb), { out: help, err: [] }, `nemia ${verb}`);
});

test('the help, once and alone, for a verb given too little to act on', async (t) => {
  const { e } = board();
  const help = (await typed(t, e)).out;
  for (const argv of [
    ['start'],
    ['start', '--repo'],
    ['plan'],
    ['plan', '--repo'],
    ['cancel'],
    ['rm'],
    ['decide'],
    ['retry', 'r-1'],
    ['retry', 'r-1', '--fresh'],
    ['approve', 'r-1'],
    ['round'],
    ['round', '--budget'],
    ['accept'],
    ['say', 'r-1'],
    ['show'],
    ['show', '--help'],
    ['logs', 'r-1'],
    ['agents', 'card'],
    ['agents', 'card', '--repo'],
  ])
    assert.deepEqual(await typed(t, e, ...argv), { out: help, err: [] }, `nemia ${argv.join(' ')}`);
});

test('nemia cancel: a run with a step in flight, the same run again, and a run already finished', async (t) => {
  const b = board();
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'still going', repo, workflowDir: oneStep() }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(await typed(t, b.e, 'cancel', run.id), {
    out: [`${run.id}  cancelled`, `   asked to stop: implement  (the engine stops it on its next tick)`],
    err: [offLine(ROOT)],
  });
  const at = readRun(run.id).cancelledAt;
  assert.deepEqual(await typed(t, b.e, 'cancel', run.id), {
    out: [`${run.id}  already cancelled at ${at}`, `   asked to stop: implement  (the engine stops it on its next tick)`],
    err: [offLine(ROOT)],
  });

  const done = await runPlaced(startRun({ brief: 'done', repo, workflowDir: oneStep() }));
  await runWith(b.e, advanceRun(readRun(done.id)));
  b.settle(`${done.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(done.id)));
  assert.deepEqual(await typed(t, b.e, 'cancel', done.id), {
    out: [`${done.id}  already succeeded — nothing to stop`],
    err: [offLine(ROOT)],
  });
});

test('nemia cancel of a run with nothing filed yet says so, a line more', async (t) => {
  const b = board();
  const run = await runPlaced(startRun({ brief: 'not filed', repo: aRepo(), workflowDir: oneStep() }));
  assert.deepEqual(await typed(t, b.e, 'cancel', run.id), {
    out: [`${run.id}  cancelled`, `   nothing was in flight — no further steps will be filed`],
    err: [offLine(ROOT)],
  });
});

test("REFUSED at shipped defaults: nemia cancel given a word after the run's id, and nothing is cancelled", async (t) => {
  const b = board();
  const run = await runPlaced(startRun({ brief: 'not cancelled', repo: aRepo(), workflowDir: oneStep() }));
  for (const extra of ['extra', '--now'])
    await assert.rejects(typed(t, b.e, 'cancel', run.id, extra), (err: Error & { exitCode?: number }) => {
      assert.equal(err.message, `nemia cancel takes one run's id: not ${extra}.`);
      assert.equal(err.exitCode, 2);
      return true;
    });
  assert.equal(readRun(run.id).cancelledAt, undefined, 'nothing cancelled');
});

test('nemia show prints the record as JSON, the brief and each step body cut short', async (t) => {
  const b = board();
  const brief = `${'a long brief, '.repeat(12)}and more`;
  const run = await runPlaced(startRun({ brief, repo: aRepo(), workflowDir: oneStep() }));
  const { out, err } = await typed(t, b.e, 'show', run.id);
  assert.deepEqual(err, []);
  assert.equal(out.length, 1);
  const record = readRun(run.id);
  const workflow = record.workflow?.map(({ body, ...keys }) => ({ ...keys, body: `${body.slice(0, 60)}…` }));
  assert.equal(out[0], JSON.stringify({ ...record, brief: `${brief.slice(0, 120)}…`, workflow }, null, 2));
  assert.equal((JSON.parse(out[0]) as { workflow: { body: string }[] }).workflow[0].body, 'implement it…');
});

test('nemia logs: a step that has not run, and the output of one that has, from the engine', async (t) => {
  const b = board();
  const run = await runPlaced(startRun({ brief: 'go', repo: aRepo(), workflowDir: oneStep() }));
  assert.deepEqual(await typed(t, b.e, 'logs', run.id, 'implement'), { out: ['implement has not run yet'], err: [] });
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(await typed(t, b.e, 'logs', run.id, 'implement'), { out: [`the output of ${run.id}-implement`], err: [] });
  assert.deepEqual(
    await typed(t, b.e, 'logs', run.id, 'deploy'),
    { out: ['deploy has not run yet'], err: [] },
    'a step the run lacks has not run, exit 0',
  );
});

test('REFUSED at shipped defaults: nemia show and nemia logs given a flag where a run or a step stands, in their words whole', async (t) => {
  const b = board();
  for (const [argv, said] of [
    [['show', '--x'], "nemia show takes one run's id: not --x."],
    [['logs', '--x', 'implement'], "nemia logs takes one run's id and one step's name: not --x."],
    [['logs', 'r-1', '--x'], "nemia logs takes one run's id and one step's name: not --x."],
  ] as const)
    await assert.rejects(typed(t, b.e, ...argv), (err: Error & { exitCode?: number }) => {
      assert.equal(err.message, said, `nemia ${argv.join(' ')}`);
      assert.equal(err.exitCode, 2);
      return true;
    });
});

test('nemia accept of a loop out of rounds: what it accepted, and the file it wrote', async (t) => {
  const b = board();
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
  const { out, err } = await typed(t, b.e, 'accept', loop.id, '--message', 'as it stands');
  assert.deepEqual(err, [offLine(ROOT)]);
  assert.equal(out.length, 2, out.join('\n'));
  assert.match(
    out[0],
    new RegExp(`^${loop.id}  accepted: try 1 of review as it stands, its findings open — nothing waits on it: its run can be decided$`),
  );
  assert.match(out[1], /^ {3}\/.+/);
  assert.ok(fs.existsSync(out[1].trim()), out[1]);
});
